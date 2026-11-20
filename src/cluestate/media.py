"""Multimodal media storage and grounded transcript-first extraction (Images, PDFs, DOCX, Text)."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import mimetypes
import secrets
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Optional

import litellm

from .config import get_settings

logger = logging.getLogger("cluestate.media")

IMAGE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
}

PDF_MIME_TYPES = {"application/pdf"}

DOCX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

TEXT_MIME_TYPES = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "message/rfc822",
}

ALLOWED_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".eml": "message/rfc822",
}


class MediaError(Exception):
    """Raised on unsupported file types, oversized uploads, or transcription failures."""


def normalize_mime_type(filename: str, content_type: Optional[str]) -> str:
    """Resolve and validate a canonical MIME type from header + file extension."""
    ext = Path(filename or "").suffix.lower()
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if ct == "image/jpg":
        ct = "image/jpeg"

    if ct in IMAGE_MIME_TYPES | PDF_MIME_TYPES | DOCX_MIME_TYPES | TEXT_MIME_TYPES:
        return ct
    if ext in ALLOWED_EXTENSIONS:
        return ALLOWED_EXTENSIONS[ext]

    guessed, _ = mimetypes.guess_type(filename or "")
    if guessed and guessed.lower() in IMAGE_MIME_TYPES | PDF_MIME_TYPES | DOCX_MIME_TYPES | TEXT_MIME_TYPES:
        return guessed.lower()

    raise MediaError(
        f"Unsupported file type '{content_type or ext or 'unknown'}'. "
        "Supported: PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT, MD, CSV, JSON."
    )


def get_upload_root() -> Path:
    root = Path(get_settings().upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_upload_bytes(
    workspace_id: int,
    filename: str,
    mime_type: str,
    raw_bytes: bytes,
) -> tuple[str, Optional[str]]:
    """
    Validate size, compute SHA-256, and persist file to `{UPLOAD_DIR}/ws_{workspace_id}/...`
    when `store_uploaded_media=True`.

    Returns: (sha256_hex, relative_storage_path_or_none)
    """
    settings = get_settings()
    max_bytes = max(1, settings.max_upload_size_mb) * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise MediaError(
            f"File '{filename}' exceeds maximum allowed size of {settings.max_upload_size_mb} MB."
        )
    if len(raw_bytes) == 0:
        raise MediaError(f"File '{filename}' is empty.")

    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    if not settings.store_uploaded_media:
        return sha256, None

    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = mimetypes.guess_extension(mime_type) or ".bin"
        if ext == ".jpe":
            ext = ".jpg"

    root = get_upload_root()
    ws_dir = (root / f"ws_{workspace_id}").resolve()
    if not ws_dir.is_relative_to(root):
        raise MediaError("Invalid workspace storage path")
    ws_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{secrets.token_hex(12)}{ext}"
    target = (ws_dir / stored_name).resolve()
    if not target.is_relative_to(ws_dir):
        raise MediaError("Invalid storage file path")

    target.write_bytes(raw_bytes)
    rel_path = f"ws_{workspace_id}/{stored_name}"
    return sha256, rel_path


def resolve_upload_path(storage_path: Optional[str]) -> Optional[Path]:
    """Safely resolve a stored relative path inside UPLOAD_DIR."""
    if not storage_path:
        return None
    root = get_upload_root()
    try:
        target = (root / storage_path).resolve()
        if target.is_relative_to(root) and target.is_file():
            return target
    except (ValueError, OSError):
        return None
    return None


def delete_upload_file(storage_path: Optional[str]) -> None:
    """Safely remove a persisted media file if it exists."""
    target = resolve_upload_path(storage_path)
    if target:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass


# ──────────────────────────────────────────────
# Grounded Transcript-First Extraction
# ──────────────────────────────────────────────

async def transcribe_image_bytes(
    raw_bytes: bytes,
    mime_type: str,
    filename: str = "image",
) -> str:
    """
    Transcribe an image/screenshot/GIF into faithful verbatim text + objective visual context
    via LiteLLM vision models so downstream extraction maintains `[char_start:char_end]` provenance.
    """
    settings = get_settings()
    model = settings.resolved_vision_model
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    data_uri = f"data:{mime_type};base64,{b64}"

    prompt = (
        "Transcribe ALL visible text from this image verbatim (including forms, handwriting, "
        "screenshots, chat messages, labels, dates, medical/allergy notes, and numbers). "
        "Preserve speaker labels, checkboxes (checked vs unchecked), and table rows faithfully. "
        "If there are important non-text visual details, summarize them briefly under [Visual Notes]. "
        "Do NOT invent, infer, or guess anything not visible in the image."
    )

    try:
        resp = await litellm.acompletion(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            max_tokens=2000,
        )
        content = resp.choices[0].message.content
        if isinstance(content, list):
            parts = [p.get("text", "") for p in content if isinstance(p, dict)]
            text = "\n".join(parts).strip()
        else:
            text = (content or "").strip()
        if not text:
            raise MediaError(f"Vision model returned empty transcription for '{filename}'.")
        return text
    except MediaError:
        raise
    except Exception as exc:
        logger.error(f"Vision transcription failed for '{filename}': {exc}")
        raise MediaError(f"Vision transcription failed for '{filename}': {exc}") from exc


def extract_docx_text(raw_bytes: bytes) -> str:
    """Extract paragraph text from a .docx archive using Python stdlib (zero extra dependencies)."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
            xml_bytes = zf.read("word/document.xml")
        root = ET.fromstring(xml_bytes)
        paragraphs: list[str] = []
        for p in root.iter():
            if p.tag.endswith("}p"):
                texts = [t.text for t in p.iter() if t.tag.endswith("}t") and t.text]
                if texts:
                    paragraphs.append("".join(texts))
        return "\n".join(paragraphs).strip()
    except Exception as exc:
        raise MediaError(f"Failed to read DOCX document: {exc}") from exc


async def extract_pdf_text(raw_bytes: bytes, filename: str = "document.pdf") -> str:
    """
    Extract page-by-page text from a PDF using pypdf.
    If a page has little/no selectable text (scanned PDF) and embeds raster images,
    automatically fall back to Vision transcription for up to 5 scanned images.
    """
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(raw_bytes))
    except Exception as exc:
        raise MediaError(f"Failed to parse PDF '{filename}': {exc}") from exc

    page_blocks: list[str] = []
    vision_scans_used = 0
    max_vision_scans = 5

    for idx, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""

        if len(text) >= 20:
            page_blocks.append(f"[Page {idx}]\n{text}")
            continue

        # Scanned PDF page fallback: transcribe embedded raster images if present
        scanned_parts: list[str] = []
        if vision_scans_used < max_vision_scans:
            try:
                images = list(getattr(page, "images", []) or [])
            except Exception:
                images = []
            for img in images:
                if vision_scans_used >= max_vision_scans:
                    break
                img_bytes = getattr(img, "data", None)
                img_name = getattr(img, "name", f"page_{idx}.png")
                if not img_bytes:
                    continue
                try:
                    img_mime = normalize_mime_type(img_name, None)
                    if img_mime in IMAGE_MIME_TYPES:
                        vision_scans_used += 1
                        ocr_text = await transcribe_image_bytes(
                            img_bytes, img_mime, f"{filename}#page{idx}"
                        )
                        scanned_parts.append(ocr_text)
                except Exception as exc:
                    logger.warning(f"Scanned PDF image transcription skipped on page {idx}: {exc}")

        if scanned_parts:
            page_blocks.append(f"[Page {idx} — Scanned]\n" + "\n".join(scanned_parts))
        elif text:
            page_blocks.append(f"[Page {idx}]\n{text}")

    combined = "\n\n".join(page_blocks).strip()
    if not combined:
        raise MediaError(
            f"PDF '{filename}' contained no extractable text or readable scan images."
        )
    return combined


async def extract_text_from_file(
    raw_bytes: bytes,
    mime_type: str,
    filename: str,
) -> str:
    """Dispatch file bytes to the appropriate grounded text/vision transcriber."""
    if mime_type in IMAGE_MIME_TYPES:
        return await transcribe_image_bytes(raw_bytes, mime_type, filename)
    if mime_type in PDF_MIME_TYPES:
        return await extract_pdf_text(raw_bytes, filename)
    if mime_type in DOCX_MIME_TYPES:
        text = extract_docx_text(raw_bytes)
        if not text:
            raise MediaError(f"DOCX '{filename}' contained no readable text.")
        return text
    if mime_type in TEXT_MIME_TYPES:
        try:
            return raw_bytes.decode("utf-8", errors="replace").strip()
        except Exception as exc:
            raise MediaError(f"Failed to decode text file '{filename}': {exc}") from exc
    raise MediaError(f"Unsupported MIME type: {mime_type}")


def compose_episode_content(
    user_text: str,
    attachment_transcripts: list[tuple[str, str]],
) -> str:
    """
    Combine optional user notes/text with labelled verbatim attachment transcripts
    into one grounded `Episode.content` string.
    """
    sections: list[str] = []
    if user_text and user_text.strip():
        sections.append(user_text.strip())
    for filename, transcript in attachment_transcripts:
        if transcript and transcript.strip():
            sections.append(f"[ATTACHMENT: {filename}]\n{transcript.strip()}")
    return "\n\n".join(sections).strip()

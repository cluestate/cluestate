# ClueState — Complete AI Agent & Developer Integration Guide

> **For AI Coding Agents (Cursor, Claude Code, Antigravity, Windsurf, Devin):**
> Give this document to any coding agent so it can integrate ClueState to its full potential in one pass — including typed memory schemas, multimodal uploads (photos, screenshots, GIFs, PDFs, DOCX), sync & async durable ingestion, adversarial critic auditing, state-filtered profile queries, and MCP.

---

## 1. Core Mental Model

ClueState separates **probabilistic LLM extraction** from **deterministic, relational entity state** (PostgreSQL or SQLite — zero vector database required).

```text
Workspace (Isolated Tenant — 1 API Key = 1 Workspace)
 ├── extraction_policy (discovery_mode: strict|guided|open, judge_mode: off|smart|always)
 ├── Topics / Memory Tags (typed contracts: boolean, enum, list, number, date, text)
 └── Entities (customers, patients, accounts — unique per workspace + external_id)
      ├── Episodes (raw text or verbatim transcripts of images/PDFs/DOCX + SHA-256 hash)
      │    ├── EpisodeAttachments (persisted PNG/JPG/WEBP/GIF/PDF/DOCX/TXT files)
      │    └── IngestJobs (durable DB-backed async queue & automatic retry state)
      └── Memories (atomic facts, typed structured_value, status, judge_note, valid_from/valid_to)
           └── Evidence (verbatim quote + programmatically verified [char_start:char_end] offsets)
```

**Always use `external_id`** (your app's existing `user_id`, `patient_id`, or `account_id`) so you never need to maintain a separate ID mapping table.

---

## 2. Authentication & Base URL

- **ClueState Cloud (default in SDKs):** `https://app.cluestate.com` (managed at [cluestate.com](https://cluestate.com))
- **Self-Hosted:** `http://localhost:8000` (or your Coolify/Docker domain)
- **API Prefix:** All REST endpoints live under `/api` (e.g., `https://app.cluestate.com/api/ingest`).

### Authentication Modes
1. **App / Agent Integration (Recommended):**
   - Header: `Authorization: Bearer cs_live_YOUR_WORKSPACE_KEY`
   - Scoped strictly to **1 Workspace** — no extra workspace header needed.
   - Data-plane keys can ingest, query, manage entities/memories/topics, and inspect jobs, but are blocked (`403`) from minting/revoking API keys or managing workspace members.
2. **Browser / Admin User Session (JWT):**
   - Header: `Authorization: Bearer <jwt>` + optional `X-Workspace-Id: <workspace_id>` to switch between workspaces dynamically.

---

## 3. Fast Integration (Python, TypeScript, REST)

### Python (`pip install cluestate-sdk`)

```python
from cluestate import ClueState  # or AsyncClueState

# Defaults to ClueState Cloud; pass base_url="http://localhost:8000" for self-hosting
cs = ClueState(api_key="cs_live_YOUR_KEY")

# 1. Define typed Memory Tags (idempotent setup at app startup or via UI)
cs.topics.create(
    name="known_allergies",
    label="Known Allergies",
    data_type="list",                   # boolean | enum | list | number | date | text
    cardinality="multiple",             # single | multiple
    update_policy="review",             # replace | append | review
    enum_values=["penicillin", "peanuts", "latex", "shellfish"],
    allow_custom_values=True,           # allow unlisted allergies while standardizing known ones
    allow_inferred=False,               # explicit statements ONLY
    extraction_instructions="Extract only explicitly stated allergies. Never infer from diet.",
    applies_to_entity_types=["person"],
)

# 2. Ingest text (sync default, or mode="async" / queue_on_error=True)
res = cs.ingest(
    external_id="patient_409",
    entity_name="Clara Lindqvist",
    source_type="clinical_note",
    idempotency_key="visit_2026_11_20",
    occurred_at="2026-11-20T14:30:00Z",
    content="Patient states she is strictly vegan and allergic to penicillin.",
    queue_on_error=True,  # auto-queues retry job if LLM provider has transient outage
)

# 3. Read compiled deterministic state + LLM prompt block
intel = cs.get_intel("patient_409")
print(intel.state)             # {'is_vegan': True, 'known_allergies': ['penicillin']}
print(intel.formatted_prompt)  # Drop directly into your AI agent's system prompt

# 4. Segment / query profiles by compiled state
vegans = cs.entities.list(where=["is_vegan=true", "known_allergies=penicillin"])
```

### TypeScript / JavaScript (`npm install @cluestate/sdk`)

```typescript
import { ClueState } from "@cluestate/sdk";

const cs = new ClueState({ apiKey: process.env.CLUESTATE_API_KEY! });

await cs.ingest({
  externalId: "account_sarah_j",
  entityName: "Sarah Jenkins",
  sourceType: "call_transcript",
  idempotencyKey: "call_9912",
  content: "Approved annual software budget is $60,000. Primary stack is PostgreSQL.",
  mode: "sync",         // or "async" for non-blocking 202 queue
  queueOnError: true,   // auto-fallback to retry queue on transient LLM error
});

const intel = await cs.getIntel("account_sarah_j");
// intel.state            -> { annual_budget: 60000, tech_stack: ["PostgreSQL"] }
// intel.formatted_prompt -> ready-to-inject system prompt block

const highValue = await cs.entities.list({
  where: ["annual_budget>=25000", "tech_stack=PostgreSQL"],
});
```

---

## 4. Complete REST API Reference

### A. Ingestion (Sync, Async Queue, Dry-Run, Multimodal Files)

| Method & Path | Purpose | Key Parameters / Notes |
| :--- | :--- | :--- |
| `POST /api/ingest` | Ingest text interaction | JSON: `external_id` (or `entity_id`), `entity_name`, `content`, `source_type`, `source_record_id`, `idempotency_key`, `occurred_at`, `source_description`, `auto_create_entity` (`true`), `dry_run` (`false`), `mode` (`"sync"` default \| `"async"` -> `202`), `queue_on_error` (`false`). |
| `POST /api/ingest/upload` | Ingest photos, screenshots, GIFs, PDFs, DOCX, TXT/MD/CSV + optional text | `multipart/form-data`: `files` (1+ files), `content` (optional text/caption), `external_id` or `entity_id`, `entity_name`, `source_type`, `source_description`, `idempotency_key`, `mode` (`"async"` default -> `202`, or `"sync"`), `dry_run`. |
| `GET /api/ingest/jobs` | List workspace async queue jobs | Query: `status` (`queued` \| `processing` \| `completed` \| `failed`), `limit`. |
| `GET /api/ingest/jobs/{job_id}` | Poll async job status & summary | Returns `status`, `attempts`, `max_attempts`, `next_run_at`, `last_error`, `result_summary`. |
| `POST /api/ingest/jobs/{job_id}/retry` | Immediately retry a failed/delayed job | Resets attempts and re-queues immediately. |

#### Multimodal Upload Example (cURL — Photo, Screenshot, GIF, or PDF)
```bash
curl -X POST https://app.cluestate.com/api/ingest/upload \
  -H "Authorization: Bearer cs_live_YOUR_KEY" \
  -F "external_id=patient_409" \
  -F "entity_name=Clara Lindqvist" \
  -F "source_type=intake_form" \
  -F "mode=async" \
  -F "content=Scanned intake sheet from reception desk" \
  -F "files=@/path/to/intake_form.pdf" \
  -F "files=@/path/to/allergy_card.jpg"
```
**How Multimodal Grounding Works:**
1. Original files are persisted to `UPLOAD_DIR` (when `STORE_UPLOADED_MEDIA=true`) with SHA-256 hashes.
2. Images (`PNG`, `JPEG`, `WEBP`, `GIF`) and scanned PDF pages are transcribed verbatim via Vision LLM (`VISION_MODEL` or `LLM_MODEL`); native PDFs (`pypdf`), `DOCX`, and `TXT/MD/CSV/JSON` are extracted deterministically.
3. The verbatim transcript is saved into `Episode.content`, and standard ClueState extraction + Smart Critic + `[char_start:char_end]` span verification run over it.
4. Persisted attachments can be previewed/downloaded securely via `GET /api/episodes/{episode_id}/attachments/{attachment_id}`.

---

### B. Profiles / Entities & Structured State Querying

| Method & Path | Purpose | Key Parameters / Notes |
| :--- | :--- | :--- |
| `GET /api/entities` | List & filter profiles | `search`, `limit`, `offset`, repeatable `where` filters (`where=is_vegan:true`, `where=annual_budget>=25000`, `where=known_allergies=penicillin`, `where=status!=churned`). Supports `=`, `:`, `!=`, `>`, `>=`, `<`, `<=` with AND semantics. Returns `state` dict on each profile. |
| `POST /api/entities` | Create profile manually | JSON: `external_id`, `name`, `entity_type` (`person`\|`organization`\|`product`\|`location`\|`custom`), `meta`. |
| `GET /api/entities/{entity_id}` | Full profile ledger | Returns `EntityDetail` with `state` and all active/confirmed `memories` + hydrated `evidence` & `episode_attachments`. |
| `GET /api/entities/{entity_id}/episodes` | Chronological source episodes | Includes attached media metadata (`attachments`). |
| `DELETE /api/entities/{entity_id}` | Hard delete profile | Transactionally deletes memories, evidence, episodes, persisted attachment files, and ingest jobs. |

---

### C. Compiled Intelligence (`intel.state` & `formatted_prompt`)

| Method & Path | Purpose |
| :--- | :--- |
| `GET /api/intel/by-external-id/{external_id}` | **Primary agent read endpoint.** Returns `{ state, formatted_prompt, memories, total_memories, total_episodes }`. |
| `GET /api/entities/{entity_id}/intel` | Same as above by internal `entity_id`. |

---

### D. Memories, Global Review Queue & Provenance

| Method & Path | Purpose | Key Parameters / Notes |
| :--- | :--- | :--- |
| `GET /api/memories` | Global workspace ledger & Review Queue | Query: `status` (`pending_review`, `active`, `confirmed`, `rejected`, `superseded`), `topic_id` (`0` = open discoveries), `entity_id`, `search`, `limit`, `offset`. |
| `GET /api/entities/{entity_id}/memories` | Entity-scoped memories | `status`, `topic_id`, `include_all`. |
| `PATCH /api/memories/{memory_id}` | Confirm, reject, or edit claim | JSON: `status`, `confidence`, `claim`, `value`, `topic_id`. |
| `DELETE /api/memories/{memory_id}` | Forget a memory | Also cleans up orphaned source episodes. |
| `DELETE /api/episodes/{episode_id}` | Delete an episode & its media | Removes attachments on disk and memories backed solely by this episode. |
| `GET /api/episodes/{episode_id}/attachments/{attachment_id}` | Download/preview persisted file | Authenticated, workspace-scoped `FileResponse`. |

---

### E. Programmable Memory Schema (`Topics`) & Workspace Extraction Policy

| Method & Path | Purpose |
| :--- | :--- |
| `GET /api/topics` | List Memory Tags (`active_only=true\|false`). |
| `POST /api/topics` | Create a typed Memory Tag (`name`, `label`, `description`, `extraction_instructions`, `examples`, `data_type`, `cardinality`, `update_policy`, `ttl_days`, `enum_values`, `allow_custom_values`, `allow_inferred`, `min_confidence`, `constraints`, `applies_to_entity_types`). |
| `PUT /api/topics/{topic_id}` | Update tag contract (increments `schema_version`). |
| `DELETE /api/topics/{topic_id}` | Soft-deactivate tag (`is_active=false`). |
| `GET /api/workspaces/current` | Inspect active workspace metadata & `extraction_policy`. |
| `PUT /api/workspaces/current/policy` | Update `discovery_mode` (`strict`\|`guided`\|`open`), `discovery_instructions`, `discovery_review_policy` (`active`\|`pending_review`), `discovery_allow_inferred`, `judge_mode` (`off`\|`smart`\|`always`), `judge_model`. |
| `POST /api/workspaces/current/seed-demo` | Load zero-LLM sample workspace (`{"preset": "clinical"}` or `{"preset": "saas"}`). |

---

### F. Multi-Workspace Teams, Invites, Source Types & Stats

- **Workspaces & RBAC (JWT session):** `GET/POST /api/workspaces` (supports `clone_schema_from_workspace_id`), `PATCH /api/workspaces/{id}`, `GET/POST/PATCH/DELETE /api/workspaces/{id}/members` (`owner | admin | member | viewer`).
- **Zero-SMTP Single-Use Invites:** `GET/POST/DELETE /api/workspaces/{id}/invites` → share `https://your-host/?invite=<token>` → `GET /api/auth/invites/{token}` & `POST /api/auth/invites/{token}/accept`.
- **API Keys (JWT session):** `GET/POST/DELETE /api/auth/api-keys`.
- **Source Categories:** `GET/POST/DELETE /api/source-types` (unregistered `source_type` slugs are also auto-registered on ingest).
- **Dashboard & Usage Telemetry:** `GET /api/stats` (metrics, status counts, `queue_counts`, monthly `usage`, and authenticated `system_info`).

---

## 5. Model Context Protocol (MCP) Integration

Connect Claude Desktop, Cursor, Windsurf, or MCP-native agent frameworks:

```json
{
  "mcpServers": {
    "cluestate": {
      "command": "cluestate",
      "args": ["mcp"],
      "env": {
        "CLUESTATE_API_URL": "https://app.cluestate.com",
        "CLUESTATE_API_KEY": "cs_live_YOUR_KEY"
      }
    }
  }
}
```

Exposed MCP tools: `cluestate_ingest`, `cluestate_get_intel`, `cluestate_list_memories`, `cluestate_search_entities`, `cluestate_forget`, and resource `cluestate://entities/{external_id}`.

---

## 6. Best Practices for Production Agents

1. **Always pass `idempotency_key` and `occurred_at`** on webhooks, ticket syncs, and historical backfills so retries never duplicate facts and old records never clobber newer truth.
2. **Use `mode="async"` for webhooks and multimodal uploads** (or `queue_on_error=True` on sync calls) so LLM provider outages (`429`/timeout) are automatically retried with exponential backoff (`15s → 60s → 5m → 15m`) with zero data loss.
3. **Keep `judge_mode="smart"` enabled** for clinical, financial, or multi-speaker transcripts to block negations (*"not vegan"*) and speaker mix-ups before they touch state.
4. **Use `dry_run=True` during prompt/schema iteration** to inspect extracted claims, character spans, and Critic verdicts without mutating real profiles.
5. **Use `intel.state` for deterministic backend logic** (`if intel.state.get("is_vegan"): ...`) and `intel.formatted_prompt` for LLM system prompts.
6. **Coolify / Docker Persistent Media Storage:** Mount a persistent volume at `/app/uploads` and set `UPLOAD_DIR=/app/uploads` and `STORE_UPLOADED_MEDIA=true` so uploaded photos, screenshots, and PDFs survive container redeploys.

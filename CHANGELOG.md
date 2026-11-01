# Changelog

All notable changes to this project are documented in this file.

## [0.1.1] - 2026-10-31

### Security
- **Fixed SPA Catch-All Path Traversal:** Enforced `Path(static_dir).resolve()` and `target.is_relative_to(static_root)` in `src/cluestate/main.py` so URL-encoded or `--path-as-is` relative paths cannot read files outside the static directory.
- **Public Signup Control (`ALLOW_SIGNUP`):** Restricted `/api/auth/signup` to initial first-account setup by default (`ALLOW_SIGNUP=false`).
- **Default Bind Host & Persistent Secret Key:** Changed default `HOST` outside Docker to `127.0.0.1`, persisted auto-generated `SECRET_KEY` to `.cluestate_secret` (`0600`) across restarts, increased PBKDF2 password hashing to `600,000` iterations, and removed model/database disclosure from unauthenticated `/api/health`.
- **Sensitive Topic Default Policy:** Topics matching sensitive categories (`allergy`, `health`, `medical`, `budget`, `security`, `compliance`) now default to the `review` update policy unless explicitly overridden.
- **Complete Forget & Episode Deletion:** Deleting a memory (`DELETE /api/memories/{id}` or `cluestate_forget`) now removes any source `Episode` orphaned by the deletion, and added `DELETE /api/episodes/{id}`.

## [0.1.0] - 2026-10-31

### Added
- **Multi-Tenant Platform & Auth:** Added `User`, `Workspace`, and `ApiKey` (`cs_live_...`) models, `/api/auth/*` endpoints, and UI Login / Sign Up / API Key management.
- **Explicit Topic Semantics:** Added `cardinality` (`single` vs. `multiple`), `update_policy` (`replace`, `append`, `review`), `temporal`, and `schema_version` to `Topic`.
- **State Resolution Operations:** Added `add`, `support`, `supersede`, `update`, `contradict`, and `abstain` operations to `engine.py` with typed value coercion (`structured_value`).
- **Programmatic Evidence Verification:** Added exact and normalized substring verification with `[char_start, char_end]` offsets and SHA-256 content hashes on `Evidence` and `Episode`.
- **Episode Provenance & Idempotency:** Added `occurred_at`, `source_record_id`, and `idempotency_key` support to `/api/ingest`.
- **Official SDKs:** Added Python SDK (`ClueState` & `AsyncClueState` in `cluestate` and `sdks/python`) and TypeScript/JavaScript SDK (`@cluestate/sdk` in `sdks/typescript`).
- **MCP Server:** Full local and remote (`CLUESTATE_API_URL`) support across all 5 MCP tools.


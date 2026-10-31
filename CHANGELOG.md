# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-10-31

### Added
- **Multi-Tenant Platform & Auth:** Added `User`, `Workspace`, and `ApiKey` (`cs_live_...`) models, `/api/auth/*` endpoints, and UI Login / Sign Up / API Key management.
- **Explicit Topic Semantics:** Added `cardinality` (`single` vs. `multiple`), `update_policy` (`replace`, `append`, `review`), `temporal`, and `schema_version` to `Topic`.
- **State Resolution Operations:** Added `add`, `support`, `supersede`, `update`, `contradict`, and `abstain` operations to `engine.py` with typed value coercion (`structured_value`).
- **Programmatic Evidence Verification:** Added exact and normalized substring verification with `[char_start, char_end]` offsets and SHA-256 content hashes on `Evidence` and `Episode`.
- **Episode Provenance & Idempotency:** Added `occurred_at`, `source_record_id`, and `idempotency_key` support to `/api/ingest`.
- **Official SDKs:** Added Python SDK (`ClueState` & `AsyncClueState` in `cluestate` and `sdks/python`) and TypeScript/JavaScript SDK (`@cluestate/sdk` in `sdks/typescript`).
- **MCP Server:** Full local and remote (`CLUESTATE_API_URL`) support across all 5 MCP tools.


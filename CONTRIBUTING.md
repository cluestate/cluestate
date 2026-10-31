# Contributing to ClueState

Thank you for your interest in contributing to ClueState.

## Repository Structure

```
cluestate/
├── src/cluestate/         # FastAPI backend, state resolution engine, CLI, MCP server, and Python client
│   ├── api/               # REST API route handlers (auth, entities, topics, ingest, memories, stats)
│   ├── static/            # Compiled React platform UI assets
│   ├── client.py          # Official Python SDK (ClueState & AsyncClueState)
│   ├── engine.py          # LLM extraction, quote verification, and state transition engine
│   ├── models.py          # SQLModel database tables and enums
│   ├── schemas.py         # Pydantic request/response schemas
│   └── security.py        # PBKDF2 password hashing, JWT tokens, and API key verification
├── admin/                 # React + TypeScript + Vite platform UI
├── sdks/
│   ├── python/            # Standalone lightweight Python SDK (cluestate-sdk)
│   └── typescript/        # Official zero-dependency TypeScript/JS SDK (@cluestate/sdk)
├── docs/                  # Architecture and SDK documentation
├── examples/              # Runnable Python and TypeScript examples
└── tests/                 # Async pytest test suite
```

## Local Development Setup

### 1. Backend & Tests

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
pip install -e ".[postgres,dev]"

# Run the test suite
pytest -v
```

### 2. Platform UI (`admin/`)

```bash
cd admin
npm install
npm run dev    # Starts Vite dev server on http://localhost:5173 proxying /api to :8000
npm run build  # Compiles production assets into ../src/cluestate/static
```

### 3. TypeScript SDK (`sdks/typescript/`)

```bash
cd sdks/typescript
npm install
npm run build
```

## Engineering Guidelines

1. **Evidence & Schema Integrity First:** Any change to extraction or state resolution in `engine.py` must preserve verbatim quote verification (`verify_evidence_excerpt`) and respect topic `cardinality` (`single` vs. `multiple`) and `update_policy` (`replace`, `append`, `review`).
2. **Multi-Tenancy Isolation:** All database queries in API endpoints must filter by `workspace.id`.
3. **Tests:** Include unit or integration tests in `tests/` for new endpoints, schema rules, or SDK methods.


# ClueState

**Deterministic, evidence-backed state and memory layer for AI agents and customer applications.**

Separate probabilistic LLM extraction from durable database state. Turn unstructured conversations, support tickets, and product events into schema-enforced, character-verified facts in PostgreSQL or SQLite—no vector database required.

[**Website (`cluestate.com`)**](https://cluestate.com) · [**Architecture**](docs/architecture.md) · [**Python SDK**](docs/python-sdk.md) · [**TypeScript SDK**](docs/typescript-sdk.md) · [**MCP Server**](#model-context-protocol-mcp-server)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/version-v0.1.1-green.svg)](CHANGELOG.md)
[![Python](https://img.shields.io/badge/python-3.11+-3776AB.svg)](docs/python-sdk.md)
[![TypeScript](https://img.shields.io/badge/typescript-zero--dependency-3178C6.svg)](docs/typescript-sdk.md)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](docker-compose.yml)

---

## Why ClueState?

Vector databases (RAG) and rolling text summaries break down when user or customer facts evolve over time.

When a customer raises their annual budget from `$10,000` to `$25,000`, migrates from MySQL to PostgreSQL, or states a hard compliance requirement, vector search pulls stale chunks alongside current ones, and LLM summaries lose the exact source quote. Worse, your backend code cannot run deterministic SQL or typed business logic against a paragraph of prose.

**ClueState keeps extraction probabilistic and state deterministic:**

| Capability | Vector RAG | Rolling Summaries | ClueState |
| :--- | :--- | :--- | :--- |
| **State updates & contradictions** | Retrieves old + new chunks together | Overwrites or muddles nuance | Enforced per-topic `replace` / `append` / `review` |
| **Typed schemas & validation** | Unstructured text chunks | Unformatted prose | Enforced `number`, `enum`, `boolean`, `list`, `text` |
| **Citation integrity** | Whole chunk heuristics | Lost in summarization | Verified `[char_start, char_end]` offsets + SHA-256 |
| **Out-of-order imports** | No temporal state resolution | Corrupted by late backfills | Chronological `occurred_at` validity intervals |
| **Storage & queryability** | Requires vector store | Prompt-only context | Standard PostgreSQL or SQLite + `formatted_prompt` |

---

## Quickstart (Under 60 Seconds)

### 1. Start the Engine

```bash
pip install cluestate
cp .env.example .env   # Set OPENAI_API_KEY (or Anthropic / Gemini / Ollama)
cluestate serve
```

Or launch API + PostgreSQL + Web UI with Docker Compose:

```bash
git clone https://github.com/cluestate/cluestate.git && cd cluestate
cp .env.example .env   # Set OPENAI_API_KEY, POSTGRES_PASSWORD, SECRET_KEY
docker compose up -d --build
```

Open `http://localhost:8000` (local) to create your workspace account and mint a `cs_live_...` API key.

### 2. Define Schema, Ingest & Query

```python
from cluestate import ClueState

cs = ClueState(api_key="cs_live_YOUR_API_KEY", base_url="http://localhost:8000")

# 1. Define a typed state contract
cs.topics.create(
    name="annual_budget",
    description="Approved annual software spend in USD",
    data_type="number",
    cardinality="single",    # only one active value at a time
    update_policy="replace", # newer verified facts supersede older ones
)

# 2. Ingest an interaction with idempotency and event time
res = cs.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    source_type="support_ticket",
    source_record_id="ticket_8841",
    idempotency_key="evt_ticket_8841",
    occurred_at="2026-10-31T14:20:00Z",
    content="We migrated our primary database from MySQL to PostgreSQL. Approved Q4 software budget is $25,000.",
)

# 3. Query structured state + prompt-ready summary
intel = cs.get_intel("cust_402")
print(intel.formatted_prompt)
```

<details>
<summary>TypeScript SDK &amp; cURL examples</summary>

```typescript
import { ClueState } from "@cluestate/sdk";

const cs = new ClueState({
  apiKey: process.env.CLUESTATE_API_KEY!,
  baseUrl: "http://localhost:8000",
});

await cs.ingest({
  externalId: "cust_402",
  entityName: "Marcus Vance",
  sourceType: "support_ticket",
  sourceRecordId: "ticket_8841",
  idempotencyKey: "evt_ticket_8841",
  occurredAt: "2026-10-31T14:20:00Z",
  content: "We migrated our primary database from MySQL to PostgreSQL. Approved Q4 software budget is $25,000.",
});

const intel = await cs.getIntel("cust_402");
console.log(intel.formatted_prompt);
```

```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "cust_402",
    "entity_name": "Marcus Vance",
    "source_type": "support_ticket",
    "source_record_id": "ticket_8841",
    "idempotency_key": "evt_ticket_8841",
    "occurred_at": "2026-10-31T14:20:00Z",
    "content": "We migrated our primary database from MySQL to PostgreSQL. Approved Q4 software budget is $25,000."
  }'

curl http://localhost:8000/api/intel/by-external-id/cust_402 \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"
```

</details>

### 3. Verified Response Payload

Every extracted claim includes typed `structured_value` coercion and programmatically verified byte/character spans against the original source text:

```json
{
  "episode_id": 14,
  "entity_id": 1,
  "memories_extracted": 2,
  "memories_updated": 1,
  "memories_new": 1,
  "idempotent_replay": false,
  "memories": [
    {
      "id": 31,
      "topic_name": "tech_stack",
      "claim": "Uses PostgreSQL as primary database after migrating from MySQL",
      "value": "PostgreSQL",
      "structured_value": ["PostgreSQL"],
      "claim_type": "explicit",
      "confidence": 0.95,
      "status": "active",
      "evidence": [
        {
          "episode_id": 14,
          "excerpt": "We migrated our primary database from MySQL to PostgreSQL.",
          "is_verified": true,
          "char_start": 0,
          "char_end": 58
        }
      ]
    },
    {
      "id": 32,
      "topic_name": "annual_budget",
      "claim": "Approved Q4 software budget is $25,000",
      "value": "25000",
      "structured_value": 25000,
      "claim_type": "explicit",
      "confidence": 0.95,
      "status": "active",
      "evidence": [
        {
          "episode_id": 14,
          "excerpt": "Approved Q4 software budget is $25,000.",
          "is_verified": true,
          "char_start": 59,
          "char_end": 98
        }
      ]
    }
  ]
}
```

---

## Core Architecture & Guarantees

ClueState models entities as **Workspace → Topic → Entity → Episode → Memory → Evidence**. See [docs/architecture.md](docs/architecture.md) for the complete specification.

1. **Strict Schema Enforcement (`Topic`)**
   - Define `data_type` (`text`, `number`, `boolean`, `enum`, `list`), `cardinality` (`single` vs. `multiple`), and `update_policy` (`replace`, `append`, `review`).
   - Sensitive topic categories (`allergy`, `health`, `medical`, `budget`, `security`, `compliance`) default to the `review` policy unless explicitly overridden.
   - Values violating a topic's type or `enum_values` contract are quarantined to `pending_review` instead of corrupting active state.
2. **Programmatic Provenance (`Evidence`)**
   - Separates source verification from LLM confidence. Every excerpt is programmatically matched against `Episode.content` with exact `[char_start, char_end]` offsets and SHA-256 `content_hash`.
   - Unverified paraphrases have confidence capped below `conflict_threshold` so hallucinations cannot supersede verified state.
3. **Event-Time State Resolution (`occurred_at`)**
   - Evaluates extraction operations (`add`, `support`, `supersede`, `update`, `contradict`, `abstain`) against `valid_from` / `valid_to` intervals.
   - Late-arriving historical backfills (`event_time < existing.valid_from`) are recorded directly as historical (`superseded`) without overwriting newer facts.
4. **Relational Storage & Multi-Tenant Security**
   - Runs natively on **SQLite** or **PostgreSQL** with Alembic migrations (`cluestate migrate`).
   - Enforces tenant isolation per `workspace_id`, ships a dark-mode review UI, and separates browser JWT sessions from SHA-256-hashed data-plane keys (`cs_live_...`) that return `403 Forbidden` on key-admin endpoints.
   - Deleting a memory (`cluestate_forget` / `DELETE /api/memories/{id}`) also cleans up orphaned source episodes.

---

## Official SDKs

### Python ([`docs/python-sdk.md`](docs/python-sdk.md) · [`examples/python_quickstart.py`](examples/python_quickstart.py))

Provides sync (`ClueState`) and async (`AsyncClueState`) clients backed by Pydantic v2 types:

```bash
pip install cluestate-sdk   # Lightweight client (httpx + pydantic only)
# or: pip install cluestate # Full platform distribution
```

```python
from cluestate_sdk import AsyncClueState

async with AsyncClueState(api_key="cs_live_...") as cs:
    await cs.ingest(external_id="cust_402", content="Requires EU database hosting.", source_type="conversation")
    intel = await cs.get_intel("cust_402")
```

### TypeScript / JavaScript ([`docs/typescript-sdk.md`](docs/typescript-sdk.md) · [`examples/typescript_quickstart.ts`](examples/typescript_quickstart.ts))

Zero runtime dependencies. Built on standard `fetch` for Node.js 18+, Bun, Deno, Cloudflare Workers, and Vercel Edge:

```bash
npm install @cluestate/sdk
```

```typescript
import { ClueState } from "@cluestate/sdk";

const cs = new ClueState({ apiKey: process.env.CLUESTATE_API_KEY! });
const intel = await cs.getIntel("cust_402");
```

---

## Model Context Protocol (MCP) Server

Give Claude Desktop, Cursor, Windsurf, or multi-agent systems shared, evidence-backed customer state over `stdio`, `sse`, or `streamable-http`—pointed either at a local DB or a remote ClueState instance (`https://app.cluestate.com` or self-hosted).

```json
{
  "mcpServers": {
    "cluestate": {
      "command": "cluestate",
      "args": ["mcp"],
      "env": {
        "CLUESTATE_API_URL": "http://localhost:8000",
        "CLUESTATE_API_KEY": "cs_live_your_key_here"
      }
    }
  }
}
```

| Tool / Resource | Type | Purpose |
| :--- | :---: | :--- |
| `cluestate_ingest` | Tool | Ingest interaction text and extract verified, resolved claims |
| `cluestate_get_intel` | Tool | Retrieve formatted structured state for an entity by `external_id` |
| `cluestate_list_memories` | Tool | Inspect claims with confidence, status, and verbatim quotes |
| `cluestate_search_entities` | Tool | Search tracked entities by name or `external_id` |
| `cluestate_forget` | Tool | Permanently delete a claim, its evidence, and orphaned episodes |
| `cluestate://entities/{external_id}` | Resource | Direct entity state context resource |

---

## Self-Hosting, CLI & Configuration

### Local Development (API + React Admin UI)

Requires Python 3.11+ and Node.js 20+:

```bash
git clone https://github.com/cluestate/cluestate.git && cd cluestate

cd admin && npm install && npm run build && cd ..
python -m venv .venv && source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
pip install -e ".[postgres,dev]"

cp .env.example .env
cluestate serve
```

- **Platform UI:** `http://127.0.0.1:8000`
- **Swagger / OpenAPI Docs:** `http://127.0.0.1:8000/docs`
- **Health Check:** `http://127.0.0.1:8000/api/health`

### CLI Reference

| Command | Description |
| :--- | :--- |
| `cluestate serve` | Start the FastAPI server (`--host`, `--port`, `--reload`) |
| `cluestate init` | Initialize or migrate the database to the latest schema |
| `cluestate migrate` | Run Alembic migrations up to `head` |
| `cluestate check` | Verify database URL, LLM key configuration, and auth mode |
| `cluestate mcp` | Start the MCP server (`--transport stdio \| sse \| streamable-http`) |

### Environment Variables

ClueState uses [LiteLLM](https://docs.litellm.ai/) (OpenAI, Anthropic, Gemini, Mistral, Ollama):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LLM_MODEL` | `openai/gpt-4o-mini` | LiteLLM model identifier (e.g., `anthropic/...`, `gemini/...`, `ollama/...`) |
| `OPENAI_API_KEY` | — | Provider key (or `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./cluestate.db` | Async SQLAlchemy URL (`postgresql+psycopg://...` for Postgres) |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Server bind address and port |
| `SECRET_KEY` | *(persisted to `.cluestate_secret`)* | Signing secret for HMAC-SHA256 JWT sessions |
| `ALLOW_SIGNUP` | `false` | Restricts public signups after initial workspace setup |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (`*` or comma-separated URLs) |

---

## Documentation & Community

- **Homepage & Cloud:** [cluestate.com](https://cluestate.com)
- **System Architecture:** [docs/architecture.md](docs/architecture.md)
- **Python SDK Reference:** [docs/python-sdk.md](docs/python-sdk.md)
- **TypeScript SDK Reference:** [docs/typescript-sdk.md](docs/typescript-sdk.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · **Security:** [SECURITY.md](SECURITY.md) · **Changelog:** [CHANGELOG.md](CHANGELOG.md)

If ClueState helps you ship more reliable AI agents or customer software, **please consider starring the repository** to support open-source development.

## License

Apache 2.0 — see [LICENSE](LICENSE).

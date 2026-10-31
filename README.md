# ClueState

**Customer Intelligence Infrastructure**

Understand every customer beyond the data. Turn fragmented customer interactions, transactions, and conversations into a continuously updated, evidence-backed customer state.

Give your customer service teams, personalization engines, and AI agents the structured context they need.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](docker-compose.yml)

---

## Overview

Organizations define what they want to know about their customers using typed **State Schemas** (`Topic`). ClueState ingests structured and unstructured interactions (`Episode`), extracts atomic claims (`Memory`), verifies source quotations (`Evidence`), and maintains the resulting entity state over time.

- **Structured Customer State:** Define typed schemas (`text`, `number`, `boolean`, `enum`, `list`) with explicit cardinality (`single` vs. `multiple`) and update policies (`replace`, `append`, `review`).
- **Evidence & Provenance:** Every claim links to its source episode with programmatically verified character offsets (`char_start`, `char_end`), source record IDs, interaction timestamps (`occurred_at`), and SHA-256 content hashes.
- **Explicit State Transitions:** Rather than blindly overwriting by category, ClueState distinguishes between coexisting attributes (`add`), supporting evidence (`support`), and superseding outdated facts (`supersede`).
- **Multi-Tenant Platform & UI:** Includes workspace isolation, user authentication, scoped API keys (`cs_live_...`), and a built-in dark-mode management UI (`app.cluestate.com` or self-hosted).

---

## Business Applications

- **Customer Service:** Give support teams and workflows immediate access to a customer's reported issues, account tier, communication preferences, and prior resolutions—backed by source quotes.
- **Personalization:** Enrich customer profiles with brand affinities, sizing, price sensitivity, and behavioral patterns without overwriting coexisting preferences.
- **AI Agents:** Provide deterministic, structured entity state in system prompts or via the Model Context Protocol (MCP) instead of relying solely on raw transcript retrieval.

---

## How State Maintenance Works

### 1. Define Topic Schemas

Topics act as an enforced schema contract rather than a loose prompt hint:

| Property | Purpose | Example (`annual_budget`) | Example (`brand_preferences`) |
|:---|:---|:---|:---|
| `data_type` | Enforces and coerces value types | `number` | `list` |
| `cardinality` | Whether an entity has one or many active values | `single` | `multiple` |
| `update_policy` | How new claims interact with existing state | `replace` | `append` |

When a customer with existing preferences for *Nike* and *Adidas* running shoes mentions buying *Salomon* trail shoes, `cardinality: multiple` (`update_policy: append`) ensures all three preferences coexist. When the same customer updates their annual budget from `$10,000` to `$15,000`, `cardinality: single` (`update_policy: replace`) marks the `$10,000` claim as `superseded` and promotes `$15,000` as the active state.

### 2. Ingest an Interaction

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
    "content": "We migrated our primary database from MySQL to PostgreSQL last month. Our approved software budget for Q4 is $25,000, and we prefer technical updates via Slack."
  }'
```

### 3. Extracted & Verified Output

ClueState validates extracted values against your topic schemas and verifies that every `excerpt` exists in the source episode:

```json
{
  "episode_id": 14,
  "entity_id": 1,
  "memories_extracted": 3,
  "memories_updated": 1,
  "memories_new": 2,
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
          "excerpt": "We migrated our primary database from MySQL to PostgreSQL last month.",
          "is_verified": true,
          "char_start": 0,
          "char_end": 69
        }
      ]
    },
    {
      "id": 32,
      "topic_name": "budget",
      "claim": "Approved Q4 software budget is $25,000",
      "value": "25000",
      "structured_value": 25000,
      "claim_type": "explicit",
      "confidence": 0.95,
      "status": "active",
      "evidence": [
        {
          "episode_id": 14,
          "excerpt": "Our approved software budget for Q4 is $25,000",
          "is_verified": true,
          "char_start": 70,
          "char_end": 116
        }
      ]
    }
  ]
}
```

### 4. Query Customer State

```bash
curl http://localhost:8000/api/intel/by-external-id/cust_402 \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"
```

Returns both the structured `memories` array (for application logic, CRMs, and personalization) and a pre-formatted `formatted_prompt` block (for LLM context injection).

---

## Official SDKs (Python & TypeScript)

ClueState includes official typed SDKs for **Python** (sync & async) and **TypeScript / JavaScript** (zero-dependency, universal `fetch`).

### Python SDK ([Docs](docs/python-sdk.md) · [`sdks/python`](sdks/python))

```python
from cluestate import ClueState

client = ClueState(
    api_key="cs_live_YOUR_API_KEY",
    base_url="https://app.cluestate.com",
)

# 1. Ingest a customer interaction
client.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    content="We migrated our primary database to PostgreSQL and set our Q4 budget to $25,000.",
    source_type="support_ticket",
    idempotency_key="evt_ticket_8841",
)

# 2. Retrieve verified customer state
intel = client.get_intel(external_id="cust_402")
print(intel.formatted_prompt)
```

Also supports `AsyncClueState` for `asyncio` and FastAPI services. See the [Python SDK Reference](docs/python-sdk.md) and [`examples/python_quickstart.py`](examples/python_quickstart.py).

### TypeScript / JavaScript SDK ([Docs](docs/typescript-sdk.md) · [`sdks/typescript`](sdks/typescript))

```typescript
import { ClueState } from "@cluestate/sdk";

const cluestate = new ClueState({
  apiKey: process.env.CLUESTATE_API_KEY!,
  baseUrl: "https://app.cluestate.com",
});

// 1. Ingest an interaction
await cluestate.ingest({
  externalId: "cust_402",
  entityName: "Marcus Vance",
  content: "We migrated our primary database to PostgreSQL and set our Q4 budget to $25,000.",
  sourceType: "support_ticket",
  idempotencyKey: "evt_ticket_8841",
});

// 2. Retrieve verified customer state
const intel = await cluestate.getIntel({ externalId: "cust_402" });
console.log(intel.formatted_prompt);
```

See the [TypeScript SDK Reference](docs/typescript-sdk.md) and [`examples/typescript_quickstart.ts`](examples/typescript_quickstart.ts).

---

## Installation & Self-Hosting

### Option 1: Docker Compose (PostgreSQL + API + Platform UI)

```bash
git clone https://github.com/cluestate/cluestate.git
cd cluestate

cp .env.example .env
# Edit .env to set OPENAI_API_KEY, POSTGRES_PASSWORD, and SECRET_KEY

docker compose up -d --build
```

Open `http://localhost:8000` to create your workspace account and generate a `cs_live_...` API key.

### Option 2: Local Python Installation (SQLite or PostgreSQL)

Requires Python 3.11+ and Node.js 20+ (to build the frontend assets):

```bash
git clone https://github.com/cluestate/cluestate.git
cd cluestate

# 1. Build the React platform UI
cd admin && npm install && npm run build && cd ..

# 2. Install the Python package in a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
pip install -e ".[postgres,dev]"

# 3. Configure environment and start the server
cp .env.example .env
cluestate serve
```

- **Platform UI:** `http://localhost:8000`
- **OpenAPI / Swagger Docs:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/api/health`

---

## Authentication & Security

All `/api/*` endpoints (except `/api/health`, `/api/auth/signup`, and `/api/auth/login`) require authentication via the HTTP `Authorization` header:

```http
Authorization: Bearer cs_live_YOUR_WORKSPACE_API_KEY
```

1. **Workspace Accounts & JWTs:** Sign up in the web UI (`/api/auth/signup`) to create an isolated workspace. Interactive browser sessions authenticate with HMAC-SHA256 signed JWTs.
2. **Scoped API Keys (`cs_live_...`):** Generate and revoke per-workspace API keys in the **API & Settings** tab. Keys are stored as SHA-256 hashes in the database.
3. **Static Master Key (Optional):** For single-tenant CLI automation, you can set `API_KEY` in `.env` to authenticate against the default workspace.

---

## Model Context Protocol (MCP) Server

ClueState includes an MCP server that works either directly against a local database or against a remote ClueState API instance (`https://app.cluestate.com` or self-hosted).

```json
{
  "mcpServers": {
    "cluestate": {
      "command": "cluestate",
      "args": ["mcp"],
      "env": {
        "CLUESTATE_API_URL": "https://app.cluestate.com",
        "CLUESTATE_API_KEY": "cs_live_your_key_here"
      }
    }
  }
}
```

| Tool / Resource | Type | Description |
|:---|:---:|:---|
| `cluestate_ingest` | Tool | Ingest an interaction and extract claims with verified evidence |
| `cluestate_get_intel` | Tool | Retrieve the structured customer state summary for an entity |
| `cluestate_list_memories` | Tool | List claims for an entity with confidence, status, and verified quotes |
| `cluestate_search_entities` | Tool | Search entities by name or external ID |
| `cluestate_forget` | Tool | Delete a specific claim and its linked evidence by ID |
| `cluestate://entities/{external_id}` | Resource | Entity state context resource |

---

## Configuration

ClueState uses [LiteLLM](https://docs.litellm.ai/) and supports OpenAI, Anthropic, Google Gemini, or local Ollama models via environment variables:

| Variable | Default | Description |
|:---|:---|:---|
| `LLM_MODEL` | `openai/gpt-4o-mini` | LiteLLM model identifier |
| `OPENAI_API_KEY` | — | API key for OpenAI (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./cluestate.db` | Async SQLAlchemy database URL |
| `SECRET_KEY` | *(auto-generated)* | Secret key for signing JWT session tokens |
| `CORS_ORIGINS` | `https://app.cluestate.com,...` | Comma-separated allowed CORS origins |

---

## Documentation & Community

- **[System Architecture & State Resolution Engine](docs/architecture.md)** — Deep dive into topic schemas, cardinality, evidence verification, and workspace isolation.
- **[Python SDK Documentation](docs/python-sdk.md)** — Sync (`ClueState`) and async (`AsyncClueState`) client reference.
- **[TypeScript / JS SDK Documentation](docs/typescript-sdk.md)** — `@cluestate/sdk` client reference for Node.js, Bun, Deno, and Edge runtimes.
- **[Contributing Guide](CONTRIBUTING.md)** — Development setup, testing, and pull request workflow.
- **[Security Policy](SECURITY.md)** — Vulnerability reporting and security architecture.
- **[Changelog](CHANGELOG.md)** — Release history.

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

<div align="center">

# ClueState

### Your customers already told you. ClueState remembers.

**Open-source, deterministic, evidence-backed state & memory infrastructure for AI agents and modern applications.**

Turn unstructured conversations, support tickets, clinical notes, and app events into **typed, schema-enforced, quote-verified profiles** in PostgreSQL or SQLite — **no vector database required.**

[**Start on ClueState Cloud (`cluestate.com`)**](https://cluestate.com) · [**Quickstart (60s)**](#quickstart-under-60-seconds) · [**Architecture**](docs/architecture.md) · [**Python SDK**](docs/python-sdk.md) · [**TypeScript SDK**](docs/typescript-sdk.md) · [**MCP Server**](#model-context-protocol-mcp-server)

[![ClueState Cloud](https://img.shields.io/badge/cloud-fully%20hosted%20at%20cluestate.com-3D2CE0.svg)](https://cluestate.com)
[![License](https://img.shields.io/badge/license-Apache%202.0-12151C.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.1-187D70.svg)](CHANGELOG.md)
[![Python](https://img.shields.io/badge/python-3.11+-3776AB.svg)](docs/python-sdk.md)
[![TypeScript](https://img.shields.io/badge/typescript-zero--dependency-3178C6.svg)](docs/typescript-sdk.md)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](docker-compose.yml)

</div>

> **Want everything ready out of the box?** Use [**ClueState Cloud (`cluestate.com`)**](https://cluestate.com) — our fully hosted, managed platform with PostgreSQL, LLM extraction, Admin Console, multi-workspace teams, and instant `cs_live_...` API keys pre-configured. Self-host anytime with Apache 2.0.

---

## The 10-Second Mental Model

Feed ClueState raw text from any channel. Get back **compiled, deterministic JSON state** for your code, **prompt-ready context** for your AI agents, and **character-verified source quotes** for audits and humans.

```text
INPUT (Support Call / Clinical Note / Email)
───────────────────────────────────────────────────────────────────────────────
"We migrated from MySQL to PostgreSQL last month. Approved Q4 budget is $25,000,
 and please keep all notifications on SMS — never phone calls."
```

```json
// OUTPUT — intel.state (Deterministic, typed, ready for app logic & SQL)
{
  "tech_stack": ["PostgreSQL"],
  "annual_budget": 25000,
  "preferred_contact_method": "sms"
}
```

Every single value is backed by exact character offsets (`[char_start:char_end]`) and a SHA-256 content hash pointing straight to the sentence where the user said it.

---

## Why ClueState?

Vector databases (RAG) and rolling LLM summaries break down the moment facts **change over time** or **matter operationally**.

When a customer upgrades their budget from `$10k` to `$25k`, switches databases, or discloses a penicillin allergy:
- **Vector RAG** retrieves *both* the outdated and current chunks together and leaves the LLM guessing.
- **Rolling Summaries** silently drop nuance, hallucinate inferences, and lose the original verbatim quote.
- **Neither** gives your backend clean, typed fields (`boolean`, `number`, `date`, `enum`, `list`) you can branch on in code.

**ClueState separates probabilistic LLM extraction from deterministic database state:**

| Capability | Vector RAG | Rolling Summaries | **ClueState** |
| :--- | :--- | :--- | :--- |
| **Contradictions & updates** | Pulls stale + new chunks together | Overwrites or muddles nuance | Enforced per-tag `replace`, `append`, or `review` |
| **Typed state (`intel.state`)** | Unstructured text chunks | Prose paragraphs | Compiled `boolean`, `number`, `date`, `enum`, `list`, `text` |
| **Extraction guardrails** | None | Prompt-only best effort | Per-tag instructions, `allow_inferred=False`, strict/guided/open modes |
| **Citation & audit integrity** | Chunk-level heuristics | Lost in summarization | Programmatically verified `[char_start, char_end]` + SHA-256 |
| **High-stakes human review** | Not supported | Not supported | Built-in Review Queue for medical, legal, financial, or custom tags |
| **Out-of-order backfills** | Breaks temporal truth | Corrupted by old imports | Chronological `occurred_at` event-time validity intervals |
| **Infrastructure** | Requires vector DB + sync | Prompt-only context | Standard **PostgreSQL** or **SQLite** + Web Console + MCP |

---

## Super Easy to Integrate (2 API Calls)

Most teams integrate ClueState in under **5 minutes**. You only need two calls: **`ingest`** when something happens, and **`get_intel`** when your app or AI agent needs to know the user.

### Python (`pip install cluestate-sdk`)

```python
from cluestate import ClueState

# Connects to ClueState Cloud by default (pass base_url="http://localhost:8000" if self-hosting)
cs = ClueState(api_key="cs_live_YOUR_API_KEY")

# 1. Ingest any conversation, ticket, email, or note
cs.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    source_type="support_ticket",
    content="We migrated from MySQL to PostgreSQL. Approved Q4 software budget is $25,000.",
)

# 2. Read deterministic state for code + formatted block for LLM prompts
intel = cs.get_intel("cust_402")

print(intel.state)             # {'tech_stack': ['PostgreSQL'], 'annual_budget': 25000}
print(intel.formatted_prompt)  # Clean, sourced context ready to inject into any system prompt
```

### TypeScript / JavaScript (`npm install @cluestate/sdk`)

Zero runtime dependencies — works in Node.js 18+, Bun, Deno, Cloudflare Workers, and Vercel Edge:

```typescript
import { ClueState } from "@cluestate/sdk";

// Connects to ClueState Cloud by default (pass baseUrl: "http://localhost:8000" if self-hosting)
const cs = new ClueState({ apiKey: process.env.CLUESTATE_API_KEY! });

await cs.ingest({
  externalId: "cust_402",
  entityName: "Marcus Vance",
  sourceType: "support_ticket",
  content: "We migrated from MySQL to PostgreSQL. Approved Q4 software budget is $25,000.",
});

const intel = await cs.getIntel("cust_402");
console.log(intel.state);            // { tech_stack: ["PostgreSQL"], annual_budget: 25000 }
console.log(intel.formatted_prompt); // Drop straight into OpenAI / Anthropic / Vercel AI SDK
```

<details>
<summary><strong>REST API (cURL / any language)</strong></summary>

```bash
# 1. Ingest (pass "dry_run": true to simulate without writing to the database)
curl -X POST http://localhost:8000/api/ingest \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "cust_402",
    "entity_name": "Marcus Vance",
    "source_type": "support_ticket",
    "idempotency_key": "evt_ticket_8841",
    "occurred_at": "2026-10-31T14:20:00Z",
    "content": "We migrated from MySQL to PostgreSQL. Approved Q4 software budget is $25,000."
  }'

# 2. Retrieve compiled state & prompt block
curl http://localhost:8000/api/intel/by-external-id/cust_402 \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"
```

</details>

---

## Quickstart (Under 60 Seconds)

### Option A — ClueState Cloud (Fully Hosted, Zero Setup)

Skip servers, databases, and LLM key management — start immediately at **[cluestate.com](https://cluestate.com)**:
1. Sign up and create your workspace in seconds.
2. Pick a starter schema pack (Clinical, Enterprise SaaS, or VIP Concierge) or define your own tags.
3. Copy your `cs_live_...` API key — both the Python and TypeScript SDKs point to ClueState Cloud automatically with zero extra config.

### Option B — Self-Host Locally (One Command, SQLite)

```bash
pip install cluestate
cp .env.example .env   # Add OPENAI_API_KEY (or Anthropic / Gemini / Mistral / Ollama)
cluestate serve
```

### Option C — Self-Host with Docker Compose (PostgreSQL + Web UI)

```bash
git clone https://github.com/cluestate/cluestate.git && cd cluestate
cp .env.example .env   # Set OPENAI_API_KEY, POSTGRES_PASSWORD, SECRET_KEY
docker compose up -d --build
```

Open **`http://localhost:8000`** to create your local workspace and mint a scoped `cs_live_...` API key.

> **Deploying on Coolify, Railway, Render, or Fly.io?** ClueState ships with a production `Dockerfile`, automatic Alembic migrations on boot, and a `/api/health` readiness endpoint.

---

## What Makes ClueState Special

### 1. Programmable Memory Schema & Extraction Policy
Don't let an LLM dump messy key-value guesses into your database. Define exact **Memory Tags** via the Web UI or SDK:

```python
cs.topics.create(
    name="known_allergies",
    label="Known Allergies",
    data_type="list",                   # boolean | enum | list | number | date | text
    cardinality="multiple",
    update_policy="review",             # Route changes to human Review Queue
    enum_values=["penicillin", "peanuts", "latex", "shellfish"],
    allow_custom_values=True,           # Allow unlisted allergies while standardizing known ones
    allow_inferred=False,               # Explicit statements ONLY — never guess an allergy
    extraction_instructions="Extract only explicitly stated drug or food allergies.",
    applies_to_entity_types=["person"],
)
```

Control how much discretion the agent has at the **workspace level**:
- **`strict`** — Only store facts matching your defined Memory Tags; deterministically drop everything else.
- **`guided`** *(recommended)* — Extract your typed schema tags *plus* high-signal open discoveries governed by your custom focus/exclusion instructions.
- **`open`** — Capture general durable facts freely with optional human-review routing.

### 2. Programmatically Verified Provenance
Every extracted claim is checked against the raw `Episode.content` to compute exact `[char_start, char_end]` offsets and a SHA-256 hash. Unverified paraphrases have their confidence capped below the conflict threshold so **an LLM hallucination can never overwrite a verified fact.**

<details>
<summary><strong>Inspect a verified API response payload</strong></summary>

```json
{
  "episode_id": 14,
  "entity_id": 1,
  "memories_extracted": 2,
  "memories_updated": 1,
  "memories_new": 1,
  "idempotent_replay": false,
  "dry_run": false,
  "state": {
    "tech_stack": ["PostgreSQL"],
    "annual_budget": 25000
  },
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
          "excerpt": "We migrated from MySQL to PostgreSQL.",
          "is_verified": true,
          "char_start": 0,
          "char_end": 37
        }
      ]
    }
  ]
}
```

</details>

### 3. Event-Time Resolution & Expiration (TTL)
- **Out-of-order imports:** Pass `occurred_at` when backfilling historical tickets or notes. Late-arriving older records (`event_time < existing.valid_from`) are preserved in the audit trail as historical (`superseded`) instead of clobbering newer truth.
- **Idempotent ingestion:** Pass `idempotency_key` so retries and webhooks never duplicate memories.
- **Auto-expiring facts:** Configure `ttl_days` on temporary states (e.g., active promotions, short-term blockers, travel windows).

### 4. Clean Operational Console Built for Both Engineers & Domain Teams
ClueState ships with an embedded React console designed for developers, business operators, and clinical/compliance staff:
- **Live Profile Ledgers:** Inspect compiled deterministic state alongside 3px color-coded Signal Strips (Teal = verified, Red = needs review, Ultramarine = active).
- **Click-to-Highlight Provenance Inspector:** Click any fact to jump directly to the highlighted verbatim quote inside the original source document.
- **Global Review Queue:** Approve, confirm, or reject high-stakes claims across your entire workspace in one view.
- **Interactive Extraction Bench (`dry_run`):** Test schema instructions and inspect character-span highlighting before persisting a single row.
- **Multi-Workspace Isolation & Zero-SMTP Team Invites:** Separate clinics, clients, or environments into isolated workspaces (`1 API key = 1 workspace`), manage RBAC roles (`owner`, `admin`, `member`, `viewer`), clone schemas across workspaces, and onboard teammates via copyable single-use invite links — no email server required.

---

## Built For High-Trust Use Cases

- **Healthcare & Clinics:** Track patient allergies, dietary restrictions (`is_vegan`), chronic conditions, and contact preferences with `allow_inferred=False` and mandatory human review before facts enter active state.
- **B2B SaaS & Customer Success:** Maintain a single live account ledger across discovery calls, Slack, and support tickets — budget, tech stack, renewal dates, and executive sponsors.
- **Hospitality, Retail & Concierge:** Remember suite preferences, sensory/allergy rules, brand affinities, and milestone dates across POS, mobile apps, and support.
- **Multi-Agent & AI Copilots:** Share one verified, up-to-date user profile across LangGraph, CrewAI, OpenAI Agents, Claude Desktop, and custom backends.

---

## Model Context Protocol (MCP) Server

Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible agent directly to your local or remote ClueState workspace over `stdio`, `sse`, or `streamable-http`:

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
| `cluestate_get_intel` | Tool | Retrieve compiled state and prompt context for an entity by `external_id` |
| `cluestate_list_memories` | Tool | Inspect claims with confidence, status, and verbatim quotes |
| `cluestate_search_entities` | Tool | Search tracked profiles by name or `external_id` |
| `cluestate_forget` | Tool | Permanently delete a claim, its evidence, and orphaned episodes |
| `cluestate://entities/{external_id}` | Resource | Direct entity state context resource |

---

## LLM Providers, CLI & Configuration

ClueState uses [LiteLLM](https://docs.litellm.ai/), so you can bring **OpenAI, Anthropic, Google Gemini, Mistral, Azure, or local Ollama** without vendor lock-in.

### CLI Commands

| Command | Description |
| :--- | :--- |
| `cluestate serve` | Start the FastAPI server + embedded Admin Console (`--host`, `--port`, `--reload`) |
| `cluestate init` | Initialize or migrate the database to the latest schema |
| `cluestate migrate` | Run Alembic migrations up to `head` |
| `cluestate check` | Verify database connectivity, LLM key configuration, and auth mode |
| `cluestate mcp` | Start the MCP server (`--transport stdio \| sse \| streamable-http`) |

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LLM_MODEL` | `openai/gpt-4o-mini` | Any LiteLLM model ID (`anthropic/...`, `gemini/...`, `ollama/...`) |
| `OPENAI_API_KEY` | — | Provider key (or `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./cluestate.db` | Async SQLAlchemy URL (`postgresql+psycopg://...` for PostgreSQL) |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Server bind address and port |
| `SECRET_KEY` | *(auto-persisted to `.cluestate_secret`)* | Signing secret for HMAC-SHA256 JWT sessions |
| `ALLOW_SIGNUP` | `false` | Set `true` to allow open self-registration (single-use invite links work regardless) |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (`*` or comma-separated list) |

### Local Development (API + React Admin Console)

Requires Python 3.11+ and Node.js 20+:

```bash
git clone https://github.com/cluestate/cluestate.git && cd cluestate

cd admin && npm install && npm run build && cd ..
python -m venv .venv && source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
pip install -e ".[postgres,dev]"

cp .env.example .env
cluestate serve
```

- **Admin Console:** `http://127.0.0.1:8000`
- **Swagger / OpenAPI:** `http://127.0.0.1:8000/docs`
- **Health Check:** `http://127.0.0.1:8000/api/health`

---

## Documentation & Community

- **Homepage & Cloud:** [cluestate.com](https://cluestate.com)
- **System Architecture:** [docs/architecture.md](docs/architecture.md)
- **Python SDK Reference:** [docs/python-sdk.md](docs/python-sdk.md)
- **TypeScript SDK Reference:** [docs/typescript-sdk.md](docs/typescript-sdk.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · **Security:** [SECURITY.md](SECURITY.md) · **Changelog:** [CHANGELOG.md](CHANGELOG.md)

If ClueState helps you build more reliable AI agents or customer software, **please star the repository** — it helps other developers discover the project!

## License

Apache 2.0 — see [LICENSE](LICENSE).

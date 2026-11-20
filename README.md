<div align="center">

# ClueState

### Your customers already told you. ClueState remembers.

**Open-source, deterministic, evidence-backed state & memory infrastructure for AI agents and modern applications.**

Turn unstructured conversations, support tickets, **photos, screenshots, PDFs, DOCX**, and app events into **typed, schema-enforced, quote-verified profiles** in PostgreSQL or SQLite — **no vector database or Redis required.**

[**Start on ClueState Cloud (`cluestate.com`)**](https://cluestate.com) · [**Quickstart (60s)**](#quickstart-under-60-seconds) · [**AI Agent Integration Guide**](docs/AGENT_GUIDE.md) · [**Architecture**](docs/architecture.md) · [**Python SDK**](docs/python-sdk.md) · [**TypeScript SDK**](docs/typescript-sdk.md) · [**MCP Server**](#model-context-protocol-mcp-server)

[![ClueState Cloud](https://img.shields.io/badge/cloud-fully%20hosted%20at%20cluestate.com-3D2CE0.svg)](https://cluestate.com)
[![License](https://img.shields.io/badge/license-Apache%202.0-12151C.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.1-187D70.svg)](CHANGELOG.md)
[![Python](https://img.shields.io/badge/python-3.11+-3776AB.svg)](docs/python-sdk.md)
[![TypeScript](https://img.shields.io/badge/typescript-zero--dependency-3178C6.svg)](docs/typescript-sdk.md)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](docker-compose.yml)

</div>

> **Want everything ready out of the box?** Use [**ClueState Cloud (`cluestate.com`)**](https://cluestate.com) — our fully hosted, managed platform with PostgreSQL, persistent media storage, LLM extraction, Adversarial Critic verification, Admin Console, multi-workspace teams, and instant `cs_live_...` API keys pre-configured. Self-host anytime under Apache 2.0.
>
> **Building with an AI coding agent (Cursor, Claude Code, Antigravity, Windsurf)?** Hand it [**`docs/AGENT_GUIDE.md`**](docs/AGENT_GUIDE.md) — a complete single-file integration manual covering every API endpoint, schema contract, multimodal upload, async queue job, and SDK pattern.

---

## The 10-Second Mental Model

Feed ClueState raw text — or upload a **photo of a handwritten intake form, a chat screenshot, a GIF, a PDF lab report, or a DOCX contract**. Get back **compiled, deterministic JSON state** for your code, **prompt-ready context** for your AI agents, and **character-verified source quotes + original media** for audits and humans.

```text
INPUT (Support Call / Clinical Note / Photo / Screenshot / PDF)
───────────────────────────────────────────────────────────────────────────────
"We migrated from MySQL to PostgreSQL last month. Approved Q4 budget is $25,000,
 and please keep all notifications on SMS — never phone calls."
```

```json
// OUTPUT — intel.state (Deterministic, typed, queryable via ?where=...)
{
  "tech_stack": ["PostgreSQL"],
  "annual_budget": 25000,
  "preferred_contact_method": "sms"
}
```

Every single value is backed by exact character offsets (`[char_start:char_end]`), a SHA-256 content hash, and (for uploaded media) the original image or PDF side-by-side in the Provenance Inspector.

---

## Why ClueState?

Vector databases (RAG) and rolling LLM summaries break down the moment facts **change over time** or **matter operationally**.

When a customer upgrades their budget from `$10k` to `$25k`, switches databases, or discloses a penicillin allergy on a photographed intake form:
- **Vector RAG** retrieves *both* outdated and current chunks together and leaves the LLM guessing.
- **Rolling Summaries** silently drop nuance, hallucinate inferences, and lose the original verbatim quote.
- **Neither** gives your backend typed fields (`boolean`, `number`, `date`, `enum`, `list`), state-filtered queries (`?where=known_allergies=penicillin`), or a human Review Queue.

**ClueState separates probabilistic LLM extraction from deterministic database state:**

| Capability | Vector RAG / Memory Stores | Rolling Summaries | **ClueState** |
| :--- | :--- | :--- | :--- |
| **Contradictions & updates** | Pulls stale + new chunks together | Overwrites or muddles nuance | Enforced per-tag `replace`, `append`, or `review` |
| **Typed state (`intel.state`)** | Unstructured text strings | Prose paragraphs | Compiled `boolean`, `number`, `date`, `enum`, `list`, `text` |
| **State-filtered querying** | Approximate vector similarity | Not supported | Exact `GET /api/entities?where=is_vegan=true&where=annual_budget>=25000` |
| **Multimodal (Images & PDFs)** | Opaque vector embedding | Lost after summary | **Transcript-first** (`PNG/JPG/WEBP/GIF/PDF/DOCX`) + original media side-by-side |
| **Negation & speaker guardrails** | None | Prompt-only best effort | Built-in **Smart Adversarial Critic** (`off \| smart \| always`) + `judge_note` |
| **Citation & audit integrity** | Chunk heuristics | Lost in summarization | Programmatically verified `[char_start, char_end]` + SHA-256 |
| **Resilience & retries** | Caller handles failures | Caller handles failures | Built-in **DB-backed async queue** with exponential-backoff retries (Zero Redis) |
| **Infrastructure** | Vector DB + sync pipeline | Prompt-only context | Single container: **PostgreSQL or SQLite** + Web Console + MCP |

---

## Super Easy to Integrate (2 API Calls)

Most teams integrate ClueState in under **5 minutes**. You only need two calls: **`ingest`** when something happens, and **`get_intel`** when your app or AI agent needs to know the user.

### Python (`pip install cluestate-sdk`)

```python
from cluestate import ClueState

# Connects to ClueState Cloud by default (pass base_url="http://localhost:8000" if self-hosting)
cs = ClueState(api_key="cs_live_YOUR_API_KEY")

# 1. Ingest any conversation, ticket, email, or note (sync default, or mode="async")
cs.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    source_type="support_ticket",
    content="We migrated from MySQL to PostgreSQL. Approved Q4 software budget is $25,000.",
    queue_on_error=True,  # Auto-queues retry job if LLM provider has a transient outage
)

# 2. Read deterministic state for code + formatted block for LLM prompts
intel = cs.get_intel("cust_402")
print(intel.state)             # {'tech_stack': ['PostgreSQL'], 'annual_budget': 25000}
print(intel.formatted_prompt)  # Clean, sourced context ready to inject into any system prompt

# 3. Query / segment profiles directly by compiled state
enterprise = cs.entities.list(where=["annual_budget>=25000", "tech_stack=PostgreSQL"])
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
  queueOnError: true,
});

const intel = await cs.getIntel("cust_402");
console.log(intel.state);            // { tech_stack: ["PostgreSQL"], annual_budget: 25000 }
console.log(intel.formatted_prompt); // Drop straight into OpenAI / Anthropic / Vercel AI SDK
```

<details>
<summary><strong>REST API — Text, Async Queue, and Photo / Screenshot / PDF Upload (cURL)</strong></summary>

```bash
# 1. Text Ingest (default mode="sync"; use "mode": "async" for instant 202 queue, or "dry_run": true to simulate)
curl -X POST https://app.cluestate.com/api/ingest \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "cust_402",
    "entity_name": "Marcus Vance",
    "source_type": "support_ticket",
    "idempotency_key": "evt_ticket_8841",
    "content": "We migrated from MySQL to PostgreSQL. Approved Q4 software budget is $25,000."
  }'

# 2. Multimodal Upload (PNG, JPG, WEBP, GIF, native/scanned PDF, DOCX, TXT/MD/CSV — defaults to async 202 queue)
curl -X POST https://app.cluestate.com/api/ingest/upload \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY" \
  -F "external_id=patient_409" \
  -F "entity_name=Clara Lindqvist" \
  -F "source_type=intake_form" \
  -F "content=Intake scan from clinic front desk" \
  -F "files=@intake_form.pdf" \
  -F "files=@allergy_card.jpg"

# 3. Poll async job status (or inspect / retry failed jobs in the Admin Console)
curl https://app.cluestate.com/api/ingest/jobs/1 \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"

# 4. Query profiles by compiled state
curl "https://app.cluestate.com/api/entities?where=annual_budget>=25000&where=tech_stack=PostgreSQL" \
  -H "Authorization: Bearer cs_live_YOUR_API_KEY"
```

</details>

---

## Quickstart (Under 60 Seconds)

### Option A — ClueState Cloud (Fully Hosted, Zero Setup)

Skip servers, databases, and LLM key management — start immediately at **[cluestate.com](https://cluestate.com)**:
1. Sign up and create your workspace in seconds (or click **Load Clinical Demo** / **Load SaaS Demo** to explore verified ledgers immediately).
2. Pick a starter schema pack or define your own typed tags.
3. Copy your `cs_live_...` API key — both the Python and TypeScript SDKs point to ClueState Cloud automatically with zero extra config.

### Option B — Self-Host Locally (One Command, SQLite)

```bash
pip install cluestate
cp .env.example .env   # Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or MISTRAL_API_KEY (auto-detected!)
cluestate serve
```

### Option C — Self-Host with Docker Compose / Coolify (PostgreSQL + Persistent Media)

```bash
git clone https://github.com/cluestate/cluestate.git && cd cluestate
cp .env.example .env   # Set OPENAI_API_KEY, POSTGRES_PASSWORD, SECRET_KEY
docker compose up -d --build
```

Open **`http://localhost:8000`** to create your workspace and mint a scoped `cs_live_...` API key.

> **Deploying on Coolify, Railway, Render, or Fly.io?** ClueState ships with a production `Dockerfile`, automatic Alembic migrations on boot, crash-safe async job recovery, and `/api/health`. For persistent photo/PDF storage on Coolify, attach a Persistent Storage volume at `/app/uploads` and set `UPLOAD_DIR=/app/uploads`.

---

## What Makes ClueState Special

### 1. Grounded Multimodal Ingestion (Photos, Screenshots, GIFs, PDFs & DOCX)
Upload `PNG`, `JPEG`, `WEBP`, `GIF`, **native or scanned `PDF`**, `DOCX`, `TXT`, `MD`, `CSV`, or `JSON` alongside text. ClueState runs a **transcript-first grounded pipeline**:
1. Persists the original media to `UPLOAD_DIR` (toggleable via `STORE_UPLOADED_MEDIA=true`) with SHA-256 verification.
2. Transcribes images & scanned PDF pages verbatim via LiteLLM Vision (`VISION_MODEL`), or extracts text cleanly from native PDFs/DOCX.
3. Runs the standard ClueState extraction + Critic + `[char_start:char_end]` span verification over the transcript — and renders the **original image or PDF right inside the Provenance Inspector** next to the highlighted quote.

### 2. Durable DB-Backed Async Queue & Auto-Retries (Zero Redis)
- Default `POST /api/ingest` stays **synchronous** (`mode="sync"`) for simplicity and `dry_run` testing.
- Pass `mode="async"` (default on `/api/ingest/upload`) to persist the raw Episode and return **`202 Accepted`** in **< 30ms**, or pass `queue_on_error=True` on sync calls so transient LLM timeouts/429s never lose data.
- Powered by a native SQLite/PostgreSQL `ingest_jobs` table + in-process `asyncio` worker with exponential backoff (`15s → 60s → 5m → 15m`), automatic recovery on Coolify restarts, and 1-click **Retry** in the Admin Console.

### 3. Smart Adversarial Critic / Judge (`off | smart | always`)
Eliminates the #1 trust killer in AI memory systems — **negations** (*"I'm NOT vegan"*) and **speaker mix-ups** (doctor/agent asking a question vs. patient/customer answering):
- In **`smart` mode (default)**, skips extra LLM calls on clean verbatim additions and automatically escalates contradictions, `review`-policy tags, inferred claims, unverified quotes, and multi-speaker dialogues.
- Supports asymmetric model pairing (`LLM_MODEL` for fast extraction + optional `JUDGE_MODEL` for high-precision audits) and attaches a concise `judge_note` explaining every flagged or rejected claim.

### 4. Programmable Memory Schema & State-Filtered Profiles (`?where=...`)
Define typed Memory Tags (`boolean`, `enum` with optional `allow_custom_values`, `list`, `number` with min/max/units, `date`, `text`), per-tag `extraction_instructions`, `allow_inferred=False` explicit-only guardrails, `ttl_days` expiration, and workspace discretion modes (`strict | guided | open`):

```python
cs.topics.create(
    name="known_allergies",
    label="Known Allergies",
    data_type="list",
    cardinality="multiple",
    update_policy="review",
    enum_values=["penicillin", "peanuts", "latex", "shellfish"],
    allow_custom_values=True,
    allow_inferred=False,
    extraction_instructions="Extract only explicitly stated drug or food allergies.",
    applies_to_entity_types=["person"],
)
```

Then filter profiles directly in the API or Profiles Directory UI:
```text
GET /api/entities?where=is_vegan=true&where=known_allergies=penicillin
```

### 5. Operational Console Built for Both Engineers & High-Trust Domain Teams
- **Signal Strips & Obsidian Profile Anchors:** Clean borderless UI with 3px status strips (Teal = verified, Red = safety/review, Ultramarine = active).
- **Click-to-Highlight Provenance Plane:** Inspect original uploaded photos/PDFs, verbatim quotes, `[char_start:char_end]` offsets, and Critic `judge_note` diagnostics.
- **Global Review Queue & Dry-Run Extraction Bench:** Approve/reject sensitive facts across the workspace, simulate extractions before persisting, and load a **1-click Clinical or SaaS Demo** on empty workspaces.
- **Multi-Workspace RBAC & Zero-SMTP Invites:** `1 API key = 1 workspace`, roles (`owner`, `admin`, `member`, `viewer`), schema cloning, and copyable single-use invite links.

---

## Model Context Protocol (MCP) Server

Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible agent directly to ClueState over `stdio`, `sse`, or `streamable-http`:

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

---

## LLM Providers, Evals, CLI & Environment Variables

ClueState uses [LiteLLM](https://docs.litellm.ai/) (OpenAI, Anthropic, Google Gemini, Mistral, Azure, or local Ollama) and **auto-detects your default model** from whichever provider API key you supply.

### CLI Commands & Evaluation Benchmark

| Command | Description |
| :--- | :--- |
| `cluestate serve` | Start the FastAPI server, async queue worker, and Admin Console |
| `cluestate init` / `cluestate migrate` | Initialize or run Alembic database migrations to `head` |
| `cluestate check` | Verify database connectivity, resolved LLM/Judge models, and auth mode |
| `cluestate mcp` | Start the MCP server (`--transport stdio \| sse \| streamable-http`) |
| `python evals/run_evals.py --mode deterministic` | Run zero-cost deterministic gate, provenance & judge-escalation eval suite (`--mode live` for real LLM benchmarks) |

### Key Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LLM_MODEL` | `openai/gpt-4o-mini` *(auto-detected)* | Any LiteLLM model ID (`anthropic/...`, `gemini/...`, `ollama/...`) |
| `JUDGE_MODEL` | *(falls back to `LLM_MODEL`)* | Optional stronger model for escalated Critic/Judge audits |
| `VISION_MODEL` | *(falls back to `LLM_MODEL`)* | Optional vision model for photos, screenshots, GIFs, and scanned PDFs |
| `DATABASE_URL` | `sqlite+aiosqlite:///./cluestate.db` | Async SQLAlchemy URL (`postgresql+psycopg://...` for PostgreSQL) |
| `UPLOAD_DIR` / `STORE_UPLOADED_MEDIA` | `./uploads` / `true` | Persistent directory for uploaded media (mount `/app/uploads` in Coolify) |
| `RATE_LIMIT_INGEST_PER_MIN` | `0` *(unlimited)* | Optional per-workspace ingestion rate limit for hosted deployments |
| `MAX_INGESTS_PER_WORKSPACE_MONTH` | `0` *(unlimited)* | Optional monthly workspace ingestion cap for hosted deployments |
| `ALLOW_SIGNUP` | `false` | Set `true` for open registration (single-use invite links always work) |

---

## Documentation & Community

- **Fully Hosted Cloud:** [cluestate.com](https://cluestate.com)
- **AI Agent Master Integration Guide:** [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md)
- **System Architecture:** [docs/architecture.md](docs/architecture.md)
- **Python SDK Reference:** [docs/python-sdk.md](docs/python-sdk.md)
- **TypeScript SDK Reference:** [docs/typescript-sdk.md](docs/typescript-sdk.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) · **Security:** [SECURITY.md](SECURITY.md) · **Changelog:** [CHANGELOG.md](CHANGELOG.md)

If ClueState helps you build more reliable AI agents or customer software, **please star the repository** — it helps other developers discover the project!

## License

Apache 2.0 — see [LICENSE](LICENSE).

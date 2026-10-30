# 🔍 ClueState

### The Audited Entity Memory & Intelligence Engine for AI Agents

**Stop dumping chat history into vector databases and praying for the right cosine similarity.**  
ClueState extracts structured, atomic facts about your entities (customers, users, patients, organizations) with **verifiable source evidence quotes**, **calibrated confidence scores**, and **automatic contradiction resolution**.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](docker-compose.yml)
[![Admin UI](https://img.shields.io/badge/admin%20ui-built--in-6366f1.svg)](#-built-in-admin-dashboard)
[![MCP Server](https://img.shields.io/badge/MCP%20Server-supported-9333ea.svg)](#-model-context-protocol-mcp-server)

---

> 🚀 **ClueState Cloud (Hosted API)**: Want zero-maintenance infrastructure, global low latency, managed backups, and fine-tuned extraction models?  
> [👉 Join the ClueState Cloud Waitlist](https://cluestate.com) *(Coming Soon)*  
>
> 💻 **Self-Hosted Open Source**: 100% free, Apache 2.0 licensed, includes the full React Admin UI, runs on PostgreSQL or SQLite with no external vector DB required.

---

## ⚡ Why ClueState? (vs. Mem0 & Vector Databases)

Most AI memory frameworks (like Mem0 or raw LangChain memory) rely on **Vector Similarity Search (RAG)**. While vector databases are great for semantic document search, **they break down when managing entity facts**:

| Problem with Vector Memory (Mem0 / RAG) | How ClueState Solves It |
|:---|:---|
| ❌ **Contradictions & Outdated Facts**<br>If a user said *"I use AWS"* in May and *"We migrated to GCP"* in October, vector search matches **both**. The LLM gets confused or quotes stale facts. | ✅ **Active Belief Tracking**<br>New claims automatically **supersede** conflicting older claims (`status: superseded`). Your AI always sees the current source of truth. |
| ❌ **Zero Verifiability / Black Box**<br>When the agent recalls *"Customer has a budget of $50k"*, there's no citation proving who said it or when. | ✅ **Audit Evidence Quotes**<br>Every fact stores the exact excerpt from the source conversation, email, or transcript. Zero hallucination ambiguity. |
| ❌ **Retrieval Jitter**<br>A slightly rephrased user prompt returns different top-$k$ vectors. Key customer preferences randomly vanish from context. | ✅ **Deterministic Prompt Synthesis**<br>`/api/intel/by-external-id/{id}` produces a clean, structured Markdown block grouped by topic categories. 100% consistent. |
| ❌ **Vector Infrastructure Tax**<br>Requires maintaining an external vector cluster (Qdrant, Pinecone, Chroma), embedding pipelines, and chunking logic. | ✅ **Zero Vector DB Overhead**<br>Runs on standard SQLite or PostgreSQL. No vector database, no embedding dimension headaches. |
| ❌ **Dashboard Behind a Paywall**<br>Mem0 and others lock their web UI and management analytics behind paid cloud subscriptions. | ✅ **Built-in React Admin Dashboard**<br>Ships with an off-the-shelf dark-mode React UI served directly on port `8000`. Test, confirm, reject, and inspect facts visually. |

---

## 💡 Quick Example

### 1. Ingest an unstructured conversation or email
```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "cust_902",
    "entity_name": "Elena Rostova",
    "content": "Elena mentioned she is allergic to peanuts and tree nuts. She requested a high-floor corner room for her anniversary on Nov 15th, and prefers oat milk for espresso.",
    "source_type": "conversation"
  }'
```

**What ClueState does:**
1. Records the interaction as an **Episode** (raw audit trail).
2. Uses structured LLM extraction to pull **atomic factual claims**.
3. Calibrates a **confidence score** and attaches the **exact quote excerpt**.
4. Checks for conflicts against existing memories and supersedes obsolete data.

```json
{
  "memories_extracted": 3,
  "memories": [
    {
      "claim": "Elena Rostova has a severe peanut and tree nut allergy",
      "confidence": 0.98,
      "topic_name": "allergies",
      "status": "active"
    },
    {
      "claim": "Prefers oat milk for espresso",
      "confidence": 0.92,
      "topic_name": "preferences"
    },
    {
      "claim": "Requested high-floor corner room for anniversary on November 15th",
      "confidence": 0.95,
      "topic_name": "room_preferences"
    }
  ]
}
```

### 2. Inject deterministic intelligence into your AI agent prompt
```bash
curl http://localhost:8000/api/intel/by-external-id/cust_902
```

Returns a pre-compiled, ready-to-paste prompt block:
```markdown
=== KNOWN INFORMATION: Elena Rostova ===
Entity type: person
Based on 1 interaction(s), 3 known fact(s).

## Allergies
- Elena Rostova has a severe peanut and tree nut allergy ✓

## Room Preferences
- Requested high-floor corner room for anniversary on November 15th (95% confidence)

## Preferences
- Prefers oat milk for espresso (92% confidence)
```

Now prepend this block directly to your agent's system prompt. **Zero vector query guesswork. Zero contradictory facts.**

---

## 🖥️ Built-in Admin Dashboard

ClueState is a ready-to-use product. When you start the engine, open **`http://localhost:8000`** in your browser to access the complete dark-mode dashboard:

- 📊 **Intelligence Dashboard** — Real-time entity counters, active memories, episode volume, and topic distributions.
- 👤 **Entity Knowledge Profiles** — Inspect atomic claims with confidence progress meters, source quotes, and 1-click status actions (**Confirm**, **Reject**, **Delete**).
- 🕒 **Episode Timelines** — Chronological audit trail of raw emails, chats, transcripts, and notes that led to extracted memories.
- 🏷️ **Topic Schemas & Bundles** — Custom categories or 1-click domain bundles for **SaaS Sales**, **E-Commerce**, and **Hospitality**.
- 🧪 **Extraction Lab & Playground** — Live workbench to paste dialogue or choose scenario presets and watch the LLM extract facts and resolve conflicts.
- ⚡ **AI Prompt Intel & Code Generator** — Copy formatted system prompt blocks for your LLMs, or copy production client code in Python, TypeScript, PHP, and cURL.

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

Get the API + PostgreSQL + compiled React Admin UI running in 30 seconds:

```bash
git clone https://github.com/cluestate/cluestate.git
cd cluestate

# Set your LLM API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

docker compose up
```

Open:
- **Admin Dashboard**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Option 2: pip install (Python 3.11+)

```bash
pip install cluestate
```

Create a `.env` file:
```env
LLM_MODEL=openai/gpt-4o-mini
OPENAI_API_KEY=sk-your-key-here
```

Start the engine:
```bash
cluestate serve
```

---

## 🔌 Model Context Protocol (MCP) Server

ClueState includes a built-in MCP server for **Claude Desktop**, **Cursor**, **Zed**, and autonomous AI agents. Your AI assistants can now automatically extract and recall audited entity facts across sessions.

### 1. Claude Desktop Setup

Add to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cluestate": {
      "command": "cluestate",
      "args": ["mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

> ☁️ **Connecting to ClueState Cloud or Remote Server?**  
> Simply set `CLUESTATE_API_URL` to route requests to your hosted instance:
> ```json
> {
>   "mcpServers": {
>     "cluestate": {
>       "command": "cluestate",
>       "args": ["mcp"],
>       "env": {
>         "CLUESTATE_API_URL": "https://api.cluestate.com",
>         "CLUESTATE_API_KEY": "cs_live_your_key_here"
>       }
>     }
>   }
> }
> ```

### 2. Available MCP Tools & Resources

| Tool / Resource | Type | Description |
|:---|:---:|:---|
| `cluestate_ingest` | Tool | Ingest dialogue or notes → extract atomic claims with evidence quotes and conflict resolution |
| `cluestate_get_intel` | Tool | Retrieve structured Markdown prompt intelligence block for an entity |
| `cluestate_list_memories` | Tool | List claims with confidence scores, topic tags, and source excerpts |
| `cluestate_search_entities` | Tool | Search tracked entities by name or external ID |
| `cluestate_forget` | Tool | Delete or reject an obsolete or requested-to-forget claim |
| `cluestate://entities/{external_id}` | Resource | Direct entity intelligence prompt template |

---

## 🎯 Direct Use Cases Where ClueState Dominates

### 1. B2B Sales & CRM Enrichment (HubSpot / Salesforce / Close)
AI SDRs and Account Executives need exact facts: *"Budget: $60k"*, *"Renewal: Q4"*, *"Competitor: Snowflake"*, *"Decision Maker: David Vance"*.  
Vector search regularly misses these or retrieves old meeting notes from 2023. ClueState extracts clean attributes into typed topics (`#budget`, `#pain_points`, `#tech_stack`, `#decision_makers`) with source timestamps.

### 2. VIP Hospitality, Concierge & Healthcare
Zero tolerance for hallucinations or missed dietary/medical requirements. If a guest says they are vegan or diabetic, you cannot rely on a vector cosine distance > 0.8. ClueState guarantees that all active, confirmed memories are rendered deterministically into the agent's context.

### 3. Customer Support with Human-in-the-Loop
When an AI support agent makes a mistake due to a faulty memory, support managers open the ClueState Admin Dashboard, view the memory card, inspect the evidence quote, and click **"Reject"** with one click. No database scripts or vector re-indexing required.

---

## 🛠️ Client Integration Examples

### Python
```python
import httpx

client = httpx.Client(base_url="http://localhost:8000/api")

# 1. Ingest an interaction
resp = client.post("/ingest", json={
    "external_id": "user_42",
    "entity_name": "Alex Mercer",
    "content": "Alex mentioned he upgraded to the Enterprise plan and uses Kubernetes on AWS.",
    "source_type": "conversation",
})
print("Extracted claims:", resp.json()["memories"])

# 2. Retrieve formatted intelligence block for your LLM prompt
intel = client.get("/intel/by-external-id/user_42").json()
system_prompt = f"You are an AI assistant helping Alex.\n\n{intel['formatted_prompt']}"
```

### TypeScript / Node.js
```typescript
const API_URL = "http://localhost:8000/api";

// 1. Ingest dialogue
const ingestRes = await fetch(`${API_URL}/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    external_id: "user_42",
    entity_name: "Alex Mercer",
    content: "Customer requested all weekly notifications via SMS instead of email.",
    source_type: "support_ticket",
  }),
});
const { memories } = await ingestRes.json();

// 2. Fetch formatted prompt intelligence
const intelRes = await fetch(`${API_URL}/intel/by-external-id/user_42`);
const { formatted_prompt } = await intelRes.json();
console.log("LLM System Prompt:\n", formatted_prompt);
```

### PHP / Laravel
```php
<?php
$apiUrl = 'http://localhost:8000/api';

// Ingest customer interaction
$ch = curl_init("$apiUrl/ingest");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'external_id' => 'user_42',
    'entity_name' => 'Alex Mercer',
    'content' => 'Customer loves dark mode and asked for Portuguese language support.',
    'source_type' => 'email'
]));
$response = json_decode(curl_exec($ch), true);
curl_close($ch);

// Retrieve structured intelligence
$intel = json_decode(file_get_contents("$apiUrl/intel/by-external-id/user_42"), true);
$systemPrompt = $intel['formatted_prompt'];
```

---

## ⚙️ Configuration & LLM Providers

ClueState uses [LiteLLM](https://docs.litellm.ai/) under the hood — switch between 100+ providers simply by changing the `LLM_MODEL` environment variable:

```env
# OpenAI (Default)
LLM_MODEL=openai/gpt-4o-mini
OPENAI_API_KEY=sk-...

# Anthropic Claude
LLM_MODEL=anthropic/claude-3-5-sonnet-20241022
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
LLM_MODEL=gemini/gemini-2.0-flash
GEMINI_API_KEY=...

# Local & Private (Ollama / vLLM)
LLM_MODEL=ollama/llama3
```

### Database Storage Options

- **Zero-config SQLite (Default)**:
  `DATABASE_URL=sqlite+aiosqlite:///./cluestate.db`
- **Production PostgreSQL**:
  `DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/cluestate`

---

## ☁️ Hosted Cloud vs. Self-Hosted

| Feature | **Self-Hosted (Open Source)** | **ClueState Cloud (Hosted)** |
|:---|:---:|:---:|
| **License** | Apache 2.0 (Free forever) | Commercial SaaS |
| **Admin Dashboard** | Included | Included + Team Permissions |
| **Storage** | Your SQLite / PostgreSQL | Managed High-Availability DB |
| **LLM Key** | Bring your own API key | Included managed extractors or BYOK |
| **Webhooks & CDC** | — | Real-time memory change webhooks |
| **Automated Backups** | Self-managed | Point-in-time recovery |
| **SLA & Support** | Community | 99.9% uptime SLA + Dedicated support |

👉 **[Sign up for early access to ClueState Cloud](https://cluestate.com)**

---

## 🤝 Contributing & Community

Contributions are welcome! Please check out the [issues](https://github.com/cluestate/cluestate/issues) and submit a Pull Request.

If ClueState helps your project, please consider giving it a ⭐ on GitHub — it helps the project grow!

---

## 📄 License

Apache 2.0 — Use it anywhere, commercially or not.

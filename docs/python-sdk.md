# Python SDK Documentation

ClueState provides both synchronous (`ClueState`) and asynchronous (`AsyncClueState`) Python clients with full Pydantic v2 type safety.

## Installation

### Option A: Lightweight Client (`cluestate-sdk`)

Depends only on `httpx` and `pydantic` (ideal for thin microservices, AI workers, or serverless functions):

```bash
pip install "git+https://github.com/cluestate/cluestate.git#subdirectory=sdks/python"
# Or from a local checkout: pip install ./sdks/python
```

Import from `cluestate_sdk`:

```python
from cluestate_sdk import ClueState, AsyncClueState, ClueStateError
```

### Option B: Full Platform Package (`cluestate`)

If you already have the full ClueState engine package installed, the client is exported directly from `cluestate`:

```bash
pip install "git+https://github.com/cluestate/cluestate.git"
```

```python
from cluestate import ClueState, AsyncClueState, ClueStateError
```

---

## Configuration

The client reads `CLUESTATE_API_KEY` and `CLUESTATE_API_URL` from environment variables by default, or accepts them explicitly:

```python
from cluestate_sdk import ClueState

cs = ClueState(
    api_key="cs_live_YOUR_WORKSPACE_KEY",
    base_url="http://localhost:8000",  # or your deployed ClueState URL
    timeout=60.0,
)
```

---

## Core Workflows

### 1. Defining State Schemas (`cs.topics`)

Define typed attributes so ClueState validates extracted values and applies the right cardinality rules:

```python
# Single-valued attribute: new claims supersede older ones
cs.topics.create(
    name="annual_budget",
    description="Approved annual software spend in USD",
    data_type="number",
    cardinality="single",
    update_policy="replace",
)

# Multi-valued attribute: new claims coexist alongside existing ones
cs.topics.create(
    name="brand_preferences",
    description="Preferred footwear and apparel brands",
    data_type="list",
    cardinality="multiple",
    update_policy="append",
)
```

### 2. Ingesting Customer Interactions (`cs.ingest`)

Pass an `idempotency_key` (such as a webhook ID or ticket ID) to guarantee safe retries without duplicate episodes:

```python
from datetime import datetime, timezone

response = cs.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    content="I run in Nike Pegasus road shoes and recently started buying Salomon trail shoes. My annual gear budget is $1,500.",
    source_type="conversation",
    source_record_id="chat_9921",
    idempotency_key="evt_chat_9921",
    occurred_at=datetime.now(timezone.utc),
)

print(f"Extracted {response.memories_extracted} claims (new={response.memories_new}, updated={response.memories_updated})")
for mem in response.memories:
    print(f"- [{mem.topic_name}] {mem.claim} | value={mem.structured_value}")
    for ev in mem.evidence:
        print(f"  Verified={ev.is_verified} [{ev.char_start}:{ev.char_end}]: \"{ev.excerpt}\"")
```

### 3. Retrieving Customer State (`cs.get_intel`)

Retrieve both structured claims (for application logic or CRM sync) and a formatted markdown block (for LLM system prompts):

```python
intel = cs.get_intel("cust_402")

# Structured list of active/confirmed Memory objects
for mem in intel.memories:
    print(mem.topic_name, mem.structured_value, mem.confidence)

# Formatted text block for LLM prompts
print(intel.formatted_prompt)
```

### 4. Managing Entities & Memories

```python
# Search entities
entities = cs.entities.list(search="Marcus", limit=20)

# List memories for an entity
memories = cs.memories.list(entity_id=intel.entity_id, status="active")

# Confirm or reject a specific claim (Human-in-the-loop)
cs.memories.confirm(memory_id=memories[0].id)
cs.memories.reject(memory_id=memories[1].id)

# Delete an entity and all associated episodes, memories, and evidence
cs.entities.delete(entity_id=intel.entity_id)
```

---

## Asynchronous Usage (`AsyncClueState`)

For `asyncio`, FastAPI, or async agent pipelines:

```python
import asyncio
from cluestate import AsyncClueState

async def handle_customer_message(external_id: str, message: str) -> str:
    async with AsyncClueState() as cs:
        await cs.ingest(
            external_id=external_id,
            content=message,
            source_type="conversation",
        )
        intel = await cs.get_intel(external_id)
        return intel.formatted_prompt

asyncio.run(handle_customer_message("cust_402", "We need SOC2 compliance before Q4."))
```

---

## Error Handling

All API errors raise `ClueStateError` with the HTTP status code and response body:

```python
from cluestate import ClueState, ClueStateError

cs = ClueState()
try:
    intel = cs.get_intel("non_existent_customer")
except ClueStateError as err:
    print(f"Status: {err.status_code}, Detail: {err.message}")
```


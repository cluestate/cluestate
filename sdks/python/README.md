# ClueState Python SDK

Lightweight, typed Python client (sync & async) for [ClueState](https://cluestate.com).

## Installation

```bash
# Lightweight client-only package (depends only on httpx and pydantic)
pip install ./sdks/python

# Or if you have the full ClueState engine installed:
pip install .
```

## Quick Start

```python
from cluestate_sdk import ClueState

cs = ClueState(
    api_key="cs_live_YOUR_API_KEY",
    base_url="https://app.cluestate.com",
)

# 1. Define a schema topic
cs.topics.create(
    name="annual_budget",
    description="Approved annual software budget",
    data_type="number",
    cardinality="single",
    update_policy="replace",
)

# 2. Ingest an interaction
result = cs.ingest(
    external_id="cust_402",
    entity_name="Marcus Vance",
    content="Our approved software budget for Q4 is $25,000.",
    source_type="support_ticket",
    idempotency_key="evt_ticket_8841",
)

for mem in result.memories:
    print(f"[{mem.topic_name}] {mem.claim} (value={mem.structured_value})")

# 3. Retrieve compiled customer state
intel = cs.get_intel("cust_402")
print(intel.formatted_prompt)
```

## Async Client (`AsyncClueState`)

```python
import asyncio
from cluestate_sdk import AsyncClueState

async def main():
    async with AsyncClueState(api_key="cs_live_YOUR_API_KEY") as cs:
        intel = await cs.get_intel("cust_402")
        print(intel.formatted_prompt)

asyncio.run(main())
```


# @cluestate/sdk

Official zero-dependency TypeScript & JavaScript SDK for [ClueState](https://cluestate.com). Runs in Node.js 18+, Bun, Deno, Cloudflare Workers, Vercel Edge, and browsers.

## Installation

```bash
npm install @cluestate/sdk
```

## Quick Start

```typescript
import { ClueState } from '@cluestate/sdk';

const cs = new ClueState({
  apiKey: process.env.CLUESTATE_API_KEY, // cs_live_...
  baseUrl: 'https://app.cluestate.com',
});

// 1. Define a schema topic
await cs.topics.create({
  name: 'annual_budget',
  description: 'Approved annual software budget',
  dataType: 'number',
  cardinality: 'single',
  updatePolicy: 'replace',
});

// 2. Ingest an interaction
const result = await cs.ingest({
  externalId: 'cust_402',
  entityName: 'Marcus Vance',
  content: 'Our approved software budget for Q4 is $25,000.',
  sourceType: 'support_ticket',
  idempotencyKey: 'evt_ticket_8841',
});

console.log('Extracted claims:', result.memories);

// 3. Retrieve compiled customer state
const intel = await cs.getIntel('cust_402');
console.log(intel.formatted_prompt);
```


# TypeScript & JavaScript SDK Documentation

`@cluestate/sdk` is a zero-dependency TypeScript client built on standard `fetch`. It works across Node.js 18+, Bun, Deno, Cloudflare Workers, Vercel Edge Functions, and browsers.

## Installation

```bash
npm install @cluestate/sdk
```

---

## Configuration

```typescript
import { ClueState } from '@cluestate/sdk';

const cs = new ClueState({
  apiKey: process.env.CLUESTATE_API_KEY, // cs_live_...
  baseUrl: 'https://app.cluestate.com',  // or http://localhost:8000 for self-hosted
  timeoutMs: 60_000,
});
```

---

## Core Workflows

### 1. Defining State Schemas (`cs.topics`)

```typescript
// Single-valued attribute: newer claims replace older ones
await cs.topics.create({
  name: 'annual_budget',
  description: 'Approved annual software budget in USD',
  dataType: 'number',
  cardinality: 'single',
  updatePolicy: 'replace',
});

// Multi-valued attribute: claims coexist unless explicitly contradicted
await cs.topics.create({
  name: 'tech_stack',
  description: 'Databases, cloud providers, and frameworks used by the customer',
  dataType: 'list',
  cardinality: 'multiple',
  updatePolicy: 'append',
});
```

### 2. Ingesting Customer Interactions (`cs.ingest`)

`sourceType` can be any core default (`'conversation'`, `'note'`, `'interaction'`, `'custom'`) or any domain-specific slug (e.g. `'reflection'` in a productivity app, `'support_ticket'` in a CRM). Unregistered source categories are automatically registered in the workspace catalog.

```typescript
const result = await cs.ingest({
  externalId: 'cust_402',
  entityName: 'Marcus Vance',
  content: 'We migrated from MySQL to PostgreSQL on AWS and have a Q4 budget of $25,000.',
  sourceType: 'reflection', // or any custom category
  sourceRecordId: 'ticket_8841',
  idempotencyKey: 'evt_ticket_8841',
  occurredAt: new Date(),
});

for (const mem of result.memories) {
  console.log(`[${mem.topic_name}] ${mem.claim} (value=${JSON.stringify(mem.structured_value)})`);
  for (const ev of mem.evidence) {
    console.log(`  Verified=${ev.is_verified} [${ev.char_start}:${ev.char_end}]: "${ev.excerpt}"`);
  }
}
```

### 3. Retrieving Customer State (`cs.getIntel`)

```typescript
const intel = await cs.getIntel('cust_402');

// Use structured memories in your application or personalization logic
const budgetClaim = intel.memories.find((m) => m.topic_name === 'annual_budget');
console.log('Verified budget:', budgetClaim?.structured_value);

// Or inject formatted_prompt into an LLM call
console.log(intel.formatted_prompt);
```

### 4. Managing Entities & Memories

```typescript
// List & search entities
const entities = await cs.entities.list({ search: 'Marcus', limit: 20 });

// List claims for an entity
const memories = await cs.memories.list({
  entityId: intel.entity_id,
  status: 'active',
});

// Confirm or reject a claim
await cs.memories.confirm(memories[0].id);

// Delete an entity and all associated state
await cs.entities.delete(intel.entity_id);
```

---

## Error Handling

```typescript
import { ClueState, ClueStateError } from '@cluestate/sdk';

try {
  await cs.getIntel('unknown_id');
} catch (err) {
  if (err instanceof ClueStateError) {
    console.error(`HTTP ${err.statusCode}: ${err.message}`);
  }
}
```


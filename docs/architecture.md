# ClueState Architecture & State Resolution

ClueState is designed to maintain structured, auditable customer state across interactions rather than acting as an unstructured vector store.

---

## 1. Data Model & Multi-Tenancy

Every record is isolated within a **Workspace** (`workspace_id`):

```
Workspace (Tenant)
 ├── ApiKey (cs_live_... hashed with SHA-256)
 ├── Topic (State Schema: data_type, cardinality, update_policy, enum_values)
 └── Entity (Customer, User, Organization — unique per workspace + external_id)
      ├── Episode (Raw interaction, occurred_at, source_record_id, idempotency_key, content_hash)
      └── Memory (Atomic claim, structured_value, claim_type, status, valid_from, valid_to)
           └── Evidence (Verbatim excerpt, is_verified, char_start, char_end, content_hash)
```

---

## 2. Explicit Topic Semantics & State Resolution

A common failure mode in naive memory systems is treating all claims under a category identically—either appending contradictory facts indefinitely or overwriting coexisting facts.

ClueState resolves this by combining **Topic Schema Rules** with **Explicit State Operations**:

### Topic Cardinality & Update Policies

| Cardinality | Update Policy | Behavior | Typical Use Cases |
|:---|:---|:---|:---|
| `single` | `replace` | Only one active claim per entity. A newer valid claim with sufficient confidence supersedes the prior claim (`status = superseded`, `valid_to = occurred_at`). | `annual_budget`, `account_tier`, `preferred_channel`, `delivery_address` |
| `multiple` | `append` | Multiple active claims coexist under the same topic. Supersedure only occurs when a valid existing `target_memory_id` in the same entity/workspace is explicitly targeted; ambiguous conflicts are routed to `pending_review`. | `brand_preferences`, `tech_stack`, `pain_points`, `dietary_preferences` |
| `single` / `multiple` | `review` | Existing active or human-confirmed claims are preserved untouched; candidate updates or conflicts are stored with `status = pending_review` for operator approval. | Regulated, financial, or high-stakes customer attributes |

### Schema Enforcement Contract

Topics act as an enforced schema contract rather than a soft confidence hint:
- `number` parses US (`$25,000.50`), European (`1.250,50` / `4,5`), currency-prefixed, and `k`/`m` values into numeric `structured_value`.
- `enum` enforces membership against `enum_values` (case-insensitive, normalized to canonical enum casing).
- `boolean` normalizes boolean literals into JSON `true`/`false`.
- **Quarantine on Violation:** If an extracted value violates its topic's `data_type` or `enum_values`, ClueState stores it with `status = pending_review` so source evidence is preserved for inspection while preventing invalid values from entering `active` state or overwriting valid claims.

### Event-Time vs. Ingestion-Time Reconciliation

Integrations frequently ingest historical CRM tickets or batch transcripts out of chronological order. ClueState distinguishes:
- **Event time (`Episode.occurred_at`):** When the customer interaction actually happened.
- **Ingestion time (`Episode.created_at`):** When ClueState processed the interaction.
- **Validity interval (`Memory.valid_from` / `Memory.valid_to`):** When the claim applied.

If a delayed integration imports an interaction from October 10 after ClueState has already recorded a state update from October 20 (`event_time < existing.valid_from`), ClueState **preserves the October 20 active claim** and records the October 10 claim directly as historical (`status = superseded`, `valid_from = Oct 10`, `valid_to = Oct 20`, `superseded_by_id = active_memory.id`).

### State Operations

During extraction, the engine evaluates existing active memories (with their IDs) and proposes one of six operations:
- `add`: Introduces a new claim that coexists with current state (or updates a `single` topic).
- `support`: Re-confirms an existing memory (`target_memory_id`), attaching a deduplicated `Evidence` record without arbitrary confidence inflation.
- `update` / `supersede` / `contradict`: Targets an outdated memory (`target_memory_id`) for temporal replacement or review according to the topic's policy.
- `abstain`: Skips ambiguous or hypothetical statements.

---

## 3. Source Evidence Integrity vs. Claim Confidence

ClueState separates **verbatim source verification** from **model-estimated claim confidence**:

1. **Source Integrity (`Evidence.is_verified`):** Programmatically checks whether `Evidence.excerpt` exists in `Episode.content` (exact match, case-insensitive match, or whitespace-normalized span lookup) and records exact character offsets `[char_start, char_end]` alongside the episode's SHA-256 `content_hash`. Note that `is_verified = true` proves the quote genuinely exists in the source interaction; semantic interpretation quality is represented separately by `Memory.confidence` and `Memory.claim_type` (`explicit`, `inferred`, `observed`).
2. **Unverified Safeguard:** If an excerpt cannot be located in the source text, `Evidence.is_verified` is set to `false` and the claim's confidence is capped below `conflict_threshold`, preventing unverified paraphrases from superseding established facts.

---

## 4. Privilege Separation & Workspace Isolation

- **Tenant Isolation:** Every `Entity`, `Topic`, `Episode`, and `Memory` is scoped to `workspace_id`. Two workspaces can track entities with identical `external_id` values with strict isolation.
- **Privilege Separation:**
  - **User Session JWTs (`get_current_user`):** Required for user account actions and creating, listing, or revoking workspace API keys (`/api/auth/api-keys`).
  - **Workspace API Keys (`cs_live_...`, `get_current_workspace`):** Stored as SHA-256 hashes; authorized for data-plane operations (ingestion, entity/memory/topic CRUD, and intelligence retrieval) within their workspace, and explicitly blocked (`403 Forbidden`) from minting or revoking API keys.


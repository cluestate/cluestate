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
| `single` | `replace` | Only one active claim per entity. A new claim with sufficient confidence supersedes the prior claim (`status = superseded`, `valid_to = occurred_at`). | `annual_budget`, `account_tier`, `sizing`, `decision_maker` |
| `multiple` | `append` | Multiple active claims coexist under the same topic unless an existing memory is explicitly targeted with `supersede` or `contradict`. | `brand_preferences`, `tech_stack`, `pain_points`, `past_issues` |
| `single` / `multiple` | `review` | Human-confirmed claims (`status = confirmed`) are never automatically overwritten; new conflicting claims are recorded alongside for review. | Regulated or high-stakes customer attributes |

### State Operations

During extraction, the engine evaluates existing active memories (with their IDs) and proposes one of six operations:
- `add`: Introduces a new claim that coexists with current state.
- `support`: Re-confirms an existing memory (`target_memory_id`), attaching the new `Evidence` record to the existing `Memory` and incrementing confidence.
- `update` / `supersede` / `contradict`: Marks the targeted outdated memory as `superseded` (`superseded_by_id = new_memory.id`) and activates the new claim.
- `abstain`: Skips ambiguous or hypothetical statements.

---

## 3. Programmatic Evidence Verification

LLMs occasionally paraphrase when asked for source quotes. ClueState does not blindly trust LLM-returned excerpts:

1. **Exact Match:** Searches `Episode.content` for the exact substring and records `[char_start, char_end]`.
2. **Normalized Match:** If punctuation or whitespace differs slightly, performs a case-insensitive, whitespace-normalized regex span lookup against `Episode.content`.
3. **Unverified Penalty:** If the excerpt cannot be located in the source text, `Evidence.is_verified` is set to `false` and the claim's confidence score is capped below the conflict threshold so an unverified claim cannot supersede an established fact.


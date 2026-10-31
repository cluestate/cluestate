"""ClueState Python SDK Quickstart Example."""

import os
from cluestate import ClueState

API_KEY = os.getenv("CLUESTATE_API_KEY", "cs_live_replace_me")
BASE_URL = os.getenv("CLUESTATE_API_URL", "http://localhost:8000")


def main() -> None:
    with ClueState(api_key=API_KEY, base_url=BASE_URL) as cs:
        # 1. Define Topic Schemas (idempotent if already created)
        existing_topics = {t.name for t in cs.topics.list(active_only=False)}

        if "brand_preferences" not in existing_topics:
            cs.topics.create(
                name="brand_preferences",
                description="Preferred athletic footwear and apparel brands",
                data_type="list",
                cardinality="multiple",
                update_policy="append",
            )

        if "gear_budget" not in existing_topics:
            cs.topics.create(
                name="gear_budget",
                description="Annual athletic gear budget in USD",
                data_type="number",
                cardinality="single",
                update_policy="replace",
            )

        # 2. First Interaction: Customer states initial preferences and budget
        print("Ingesting Episode 1...")
        ep1 = cs.ingest(
            external_id="runner_marcus",
            entity_name="Marcus Vance",
            content="I run marathons in Nike Alphafly and use Adidas Boston for daily training. My annual gear budget is $800.",
            source_type="conversation",
            idempotency_key="demo_ep_001",
        )
        print(f"Episode 1 extracted {ep1.memories_extracted} claims.")

        # 3. Second Interaction: Customer adds a trail shoe brand (coexists) and increases budget (supersedes)
        print("Ingesting Episode 2...")
        ep2 = cs.ingest(
            external_id="runner_marcus",
            entity_name="Marcus Vance",
            content="I started buying Salomon shoes for mountain trails and increased my annual gear budget to $1,200.",
            source_type="conversation",
            idempotency_key="demo_ep_002",
        )
        print(
            f"Episode 2 extracted {ep2.memories_extracted} claims "
            f"(new={ep2.memories_new}, updated={ep2.memories_updated}).\n"
        )

        # 4. Inspect Compiled Customer State
        intel = cs.get_intel("runner_marcus")
        print(intel.formatted_prompt)


if __name__ == "__main__":
    main()


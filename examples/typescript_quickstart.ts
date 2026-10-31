import { ClueState } from '../sdks/typescript/src';

const apiKey = process.env.CLUESTATE_API_KEY ?? 'cs_live_replace_me';
const baseUrl = process.env.CLUESTATE_API_URL ?? 'http://localhost:8000';

async function main() {
  const cs = new ClueState({ apiKey, baseUrl });

  // 1. Define Topic Schemas
  const existingTopics = new Set((await cs.topics.list(false)).map((t) => t.name));

  if (!existingTopics.has('tech_stack')) {
    await cs.topics.create({
      name: 'tech_stack',
      description: 'Databases, cloud providers, and infrastructure tools used',
      dataType: 'list',
      cardinality: 'multiple',
      updatePolicy: 'append',
    });
  }

  if (!existingTopics.has('annual_budget')) {
    await cs.topics.create({
      name: 'annual_budget',
      description: 'Approved annual software budget in USD',
      dataType: 'number',
      cardinality: 'single',
      updatePolicy: 'replace',
    });
  }

  // 2. Ingest Interaction
  const res = await cs.ingest({
    externalId: 'acme_corp_01',
    entityName: 'Acme Engineering',
    content:
      'We run PostgreSQL and Redis on AWS, and our approved Q4 infrastructure budget is $40,000.',
    sourceType: 'support_ticket',
    idempotencyKey: 'ts_demo_001',
  });

  console.log(`Extracted ${res.memories_extracted} claims:`);
  for (const m of res.memories) {
    console.log(`- [${m.topic_name}] ${m.claim} (value=${JSON.stringify(m.structured_value)})`);
  }

  // 3. Fetch Customer State
  const intel = await cs.getIntel('acme_corp_01');
  console.log('\nCompiled Customer State:\n');
  console.log(intel.formatted_prompt);
}

main().catch(console.error);


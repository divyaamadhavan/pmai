import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface KnowledgeEntry {
  id: string;
  content: string;
  source: string;
  date: string;
  type: string;
}

export interface RecalledEntry {
  entryId: string;
  excerpt: string;
  source: string;
  relevanceExplanation: string;
}

export interface KnowledgeRecallInput {
  taskDescription: string;
  knowledgeEntries: KnowledgeEntry[];
}

interface LLMRecallResult {
  relevantEntries: RecalledEntry[];
}

export async function recallKnowledge(
  input: KnowledgeRecallInput
): Promise<RecalledEntry[]> {
  const scrubbedTask = scrubPII(input.taskDescription);

  const scrubbedEntries = input.knowledgeEntries.map((entry) => ({
    id: entry.id,
    content: scrubPII(entry.content),
    source: entry.source,
    date: entry.date,
    type: entry.type,
  }));

  const system = prompts['SK-20']();

  const userContent = [
    `## Task Description\n${scrubbedTask}`,
    `## Knowledge Base (${scrubbedEntries.length} entries)\n${JSON.stringify(scrubbedEntries, null, 2)}`,
    'Identify and rank the most relevant knowledge base entries for this task.',
  ].join('\n\n');

  const result = await structured<LLMRecallResult>({
    system,
    messages: [{ role: 'user', content: userContent }],
    schemaName: 'knowledge_recall_result',
    schema: {
      type: 'object',
      properties: {
        relevantEntries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entryId: { type: 'string' },
              excerpt: {
                type: 'string',
                description: 'Most relevant excerpt from the entry',
              },
              source: { type: 'string' },
              relevanceExplanation: {
                type: 'string',
                description: 'Why this entry is relevant to the task',
              },
            },
            required: ['entryId', 'excerpt', 'source', 'relevanceExplanation'],
          },
        },
      },
      required: ['relevantEntries'],
    },
  });

  return result.relevantEntries;
}

import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, FeedbackTheme } from './types.js';

export interface PrioritisationInput {
  itemsWithLinkages: Array<RoadmapItem & { linkedThemes: FeedbackTheme[] }>;
  businessScores?: Record<string, number>;
}

export interface PrioritisationScore {
  itemId: string;
  evidenceScore: number; // 0-100
  rank: number;
  breakdown: Record<string, number>;
}

interface LLMScoringResult {
  scores: PrioritisationScore[];
}

export async function scoreItems(
  input: PrioritisationInput
): Promise<PrioritisationScore[]> {
  const scrubbedItems = input.itemsWithLinkages.map((item) => ({
    id: item.id,
    title: scrubPII(item.title),
    description: scrubPII(item.description),
    linkedThemes: item.linkedThemes.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.count,
      severity: t.severity,
      trend: t.trend,
    })),
    businessScore: input.businessScores?.[item.id],
  }));

  const system = prompts['SK-13']();

  const userContent = [
    `Roadmap items to score:\n${JSON.stringify(scrubbedItems, null, 2)}`,
    'Score each item and provide a ranked list.',
  ].join('\n\n');

  const result = await structured<LLMScoringResult>({
    system,
    messages: [{ role: 'user', content: userContent }],
    schemaName: 'prioritisation_scoring_result',
    schema: {
      type: 'object',
      properties: {
        scores: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              evidenceScore: { type: 'number', minimum: 0, maximum: 100 },
              rank: { type: 'number' },
              breakdown: {
                type: 'object',
                additionalProperties: { type: 'number' },
              },
            },
            required: ['itemId', 'evidenceScore', 'rank', 'breakdown'],
          },
        },
      },
      required: ['scores'],
    },
  });

  return result.scores;
}

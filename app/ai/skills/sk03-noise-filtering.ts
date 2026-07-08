import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackItem } from './types.js';

export type NoiseReason = 'spam' | 'test_entry' | 'out_of_scope' | 'insufficient_detail';

export interface NoiseFilteringInput {
  feedbackItems: FeedbackItem[];
  productScope: string;
}

export interface NoiseFilteringOutput {
  actionable: FeedbackItem[];
  noise: Array<FeedbackItem & { reason: NoiseReason }>;
}

interface LLMClassification {
  classifications: Array<{
    id: string;
    category: 'actionable' | 'noise';
    noiseReason?: NoiseReason;
  }>;
}

export async function filterNoise(
  input: NoiseFilteringInput
): Promise<NoiseFilteringOutput> {
  const scrubbedItems = input.feedbackItems.map((item) => ({
    ...item,
    text: scrubPII(item.text),
  }));

  const system = prompts['SK-03']({ productScope: scrubPII(input.productScope) });

  const result = await structured<LLMClassification>({
    system,
    messages: [
      {
        role: 'user',
        content: `Classify each of the following ${scrubbedItems.length} feedback items as actionable or noise:\n\n${JSON.stringify(
          scrubbedItems.map((f) => ({ id: f.id, text: f.text, channel: f.channel })),
          null,
          2
        )}`,
      },
    ],
    schemaName: 'noise_filter_result',
    schema: {
      type: 'object',
      properties: {
        classifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              category: { type: 'string', enum: ['actionable', 'noise'] },
              noiseReason: {
                type: 'string',
                enum: [
                  'spam',
                  'test_entry',
                  'out_of_scope',
                  'insufficient_detail',
                ],
              },
            },
            required: ['id', 'category'],
          },
        },
      },
      required: ['classifications'],
    },
  });

  const idToItem = new Map(input.feedbackItems.map((f) => [f.id, f]));
  const actionable: FeedbackItem[] = [];
  const noise: Array<FeedbackItem & { reason: NoiseReason }> = [];

  for (const cls of result.classifications) {
    const item = idToItem.get(cls.id);
    if (!item) continue;

    if (cls.category === 'actionable') {
      actionable.push(item);
    } else if (cls.noiseReason) {
      noise.push({ ...item, reason: cls.noiseReason });
    } else {
      // Default noise reason if not specified
      noise.push({ ...item, reason: 'insufficient_detail' });
    }
  }

  // Any items not classified default to actionable (safe fallback)
  const classifiedIds = new Set(result.classifications.map((c) => c.id));
  for (const item of input.feedbackItems) {
    if (!classifiedIds.has(item.id)) {
      actionable.push(item);
    }
  }

  return { actionable, noise };
}

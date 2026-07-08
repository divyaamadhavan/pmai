import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackItem, FeedbackTheme } from './types.js';

export interface ThemeDetectionInput {
  feedbackItems: FeedbackItem[];
  priorThemes?: FeedbackTheme[];
  filters?: {
    channel?: string;
    fromDate?: string;
    toDate?: string;
  };
}

interface LLMThemeResult {
  themes: Array<{
    id: string;
    name: string;
    description: string;
    count: number;
    quotes: string[];
    severity: 'Low' | 'Medium' | 'High';
    trend: 'Growing' | 'Stable' | 'Declining';
  }>;
}

export async function detectThemes(
  input: ThemeDetectionInput
): Promise<FeedbackTheme[]> {
  let items = input.feedbackItems;

  if (input.filters?.channel) {
    items = items.filter((f) => f.channel === input.filters?.channel);
  }
  if (input.filters?.fromDate) {
    const from = new Date(input.filters.fromDate).getTime();
    items = items.filter((f) => new Date(f.timestamp).getTime() >= from);
  }
  if (input.filters?.toDate) {
    const to = new Date(input.filters.toDate).getTime();
    items = items.filter((f) => new Date(f.timestamp).getTime() <= to);
  }

  const scrubbedItems = items.map((item) => ({
    id: item.id,
    text: scrubPII(item.text),
    channel: item.channel,
    timestamp: item.timestamp,
  }));

  const system = prompts['SK-02']({
    itemCount: scrubbedItems.length,
    hasPriorThemes: (input.priorThemes?.length ?? 0) > 0,
  });

  const userParts: string[] = [
    `Feedback items (${scrubbedItems.length}):\n${JSON.stringify(scrubbedItems, null, 2)}`,
  ];

  if (input.priorThemes && input.priorThemes.length > 0) {
    userParts.push(
      `\nPrior themes to update or extend:\n${JSON.stringify(input.priorThemes, null, 2)}`
    );
  }

  const result = await structured<LLMThemeResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'theme_detection_result',
    schema: {
      type: 'object',
      properties: {
        themes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              count: { type: 'number' },
              quotes: { type: 'array', items: { type: 'string' } },
              severity: { type: 'string', enum: ['Low', 'Medium', 'High'] },
              trend: {
                type: 'string',
                enum: ['Growing', 'Stable', 'Declining'],
              },
            },
            required: [
              'id',
              'name',
              'description',
              'count',
              'quotes',
              'severity',
              'trend',
            ],
          },
        },
      },
      required: ['themes'],
    },
  });

  return result.themes;
}

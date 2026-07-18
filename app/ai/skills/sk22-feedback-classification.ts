import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackItem } from './types.js';

export type FeedbackCategory =
  | 'Bug'
  | 'Feature Request'
  | 'Performance'
  | 'UX/Usability'
  | 'Pricing'
  | 'Documentation'
  | 'Integration'
  | 'Security'
  | 'Other';

export type FeedbackPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ClassifiedFeedback {
  id: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  impactScore: number;        // 0–100
  urgencyScore: number;       // 0–100
  compositeScore: number;     // weighted composite 0–100
  tags: string[];
  oneLineSummary: string;
  reasoning: string;
}

export interface FeedbackClassificationOutput {
  classified: ClassifiedFeedback[];
  categoryBreakdown: Record<FeedbackCategory, number>;
  avgCompositeScore: number;
}

interface LLMClassificationResult {
  classified: ClassifiedFeedback[];
  categoryBreakdown: Record<string, number>;
  avgCompositeScore: number;
}

export async function classifyAndScoreFeedback(
  feedbackItems: FeedbackItem[]
): Promise<FeedbackClassificationOutput> {
  const scrubbedItems = feedbackItems.map((item) => ({
    id: item.id,
    text: scrubPII(item.text),
    channel: item.channel,
    timestamp: item.timestamp,
  }));

  const system = prompts['SK-22']();

  const result = await structured<LLMClassificationResult>({
    system,
    messages: [
      {
        role: 'user',
        content: `Classify and score the following ${scrubbedItems.length} feedback items:\n\n${JSON.stringify(scrubbedItems, null, 2)}`,
      },
    ],
    schemaName: 'feedback_classification_result',
    schema: {
      type: 'object',
      properties: {
        classified: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              category: {
                type: 'string',
                enum: ['Bug', 'Feature Request', 'Performance', 'UX/Usability', 'Pricing', 'Documentation', 'Integration', 'Security', 'Other'],
              },
              priority: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
              impactScore: { type: 'number', minimum: 0, maximum: 100 },
              urgencyScore: { type: 'number', minimum: 0, maximum: 100 },
              compositeScore: { type: 'number', minimum: 0, maximum: 100 },
              tags: { type: 'array', items: { type: 'string' } },
              oneLineSummary: { type: 'string' },
              reasoning: { type: 'string' },
            },
            required: ['id', 'category', 'priority', 'impactScore', 'urgencyScore', 'compositeScore', 'tags', 'oneLineSummary', 'reasoning'],
          },
        },
        categoryBreakdown: { type: 'object', additionalProperties: { type: 'number' } },
        avgCompositeScore: { type: 'number' },
      },
      required: ['classified', 'categoryBreakdown', 'avgCompositeScore'],
    },
  });

  return result as FeedbackClassificationOutput;
}

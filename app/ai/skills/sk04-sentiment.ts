import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackItem } from './types.js';

export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative';

export interface SentimentResult {
  id: string;
  sentiment: SentimentLabel;
  confidence: number;
}

export interface SentimentOutput {
  perItem: SentimentResult[];
  aggregate: Record<SentimentLabel, number>; // percentages
}

interface LLMSentimentResult {
  perItem: Array<{
    id: string;
    sentiment: SentimentLabel;
    confidence: number;
  }>;
  aggregate: {
    Positive: number;
    Neutral: number;
    Negative: number;
  };
}

export async function classifySentiment(
  feedbackItems: FeedbackItem[]
): Promise<SentimentOutput> {
  const scrubbedItems = feedbackItems.map((item) => ({
    id: item.id,
    text: scrubPII(item.text),
    channel: item.channel,
  }));

  const system = prompts['SK-04']();

  const result = await structured<LLMSentimentResult>({
    system,
    messages: [
      {
        role: 'user',
        content: `Classify the sentiment of each of the following ${scrubbedItems.length} feedback items:\n\n${JSON.stringify(scrubbedItems, null, 2)}`,
      },
    ],
    schemaName: 'sentiment_result',
    schema: {
      type: 'object',
      properties: {
        perItem: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              sentiment: {
                type: 'string',
                enum: ['Positive', 'Neutral', 'Negative'],
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['id', 'sentiment', 'confidence'],
          },
        },
        aggregate: {
          type: 'object',
          properties: {
            Positive: { type: 'number' },
            Neutral: { type: 'number' },
            Negative: { type: 'number' },
          },
          required: ['Positive', 'Neutral', 'Negative'],
        },
      },
      required: ['perItem', 'aggregate'],
    },
  });

  return result;
}

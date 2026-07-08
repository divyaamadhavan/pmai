import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackItem } from './types.js';

export interface DeduplicationInput {
  feedbackItems: FeedbackItem[];
}

export interface DeduplicationOutput {
  canonicalSet: FeedbackItem[];
  clusterMap: Record<string, string[]>; // canonical ID → merged IDs
  confidenceScores: Record<string, number>;
}

interface LLMDeduplicationResult {
  canonicalIds: string[];
  clusterMap: Record<string, string[]>;
  confidenceScores: Record<string, number>;
}

export async function deduplicateFeedback(
  input: DeduplicationInput
): Promise<DeduplicationOutput> {
  const scrubbedItems = input.feedbackItems.map((item) => ({
    ...item,
    text: scrubPII(item.text),
  }));

  const feedbackJson = JSON.stringify(
    scrubbedItems.map((f) => ({ id: f.id, text: f.text, channel: f.channel })),
    null,
    2
  );

  const system = prompts['SK-01']({ feedbackCount: scrubbedItems.length });

  const result = await structured<LLMDeduplicationResult>({
    system,
    messages: [
      {
        role: 'user',
        content: `Please deduplicate the following ${scrubbedItems.length} feedback items:\n\n${feedbackJson}`,
      },
    ],
    schemaName: 'deduplication_result',
    schema: {
      type: 'object',
      properties: {
        canonicalIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of the canonical (representative) items to keep',
        },
        clusterMap: {
          type: 'object',
          description:
            'Maps each canonical ID to an array of merged duplicate IDs (including the canonical ID itself)',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        confidenceScores: {
          type: 'object',
          description: 'Confidence score (0-1) for each canonical ID cluster',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['canonicalIds', 'clusterMap', 'confidenceScores'],
    },
  });

  const idToItem = new Map(input.feedbackItems.map((f) => [f.id, f]));
  const canonicalSet = result.canonicalIds
    .map((id) => idToItem.get(id))
    .filter((item): item is FeedbackItem => item !== undefined);

  return {
    canonicalSet,
    clusterMap: result.clusterMap,
    confidenceScores: result.confidenceScores,
  };
}

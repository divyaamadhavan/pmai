import { filterNoise } from '../skills/sk03-noise-filtering.js';
import { deduplicateFeedback } from '../skills/sk01-deduplication.js';
import { classifyAndScoreFeedback } from '../skills/sk22-feedback-classification.js';
import type { FeedbackItem } from '../skills/types.js';
import type { FeedbackClassificationOutput } from '../skills/sk22-feedback-classification.js';

export interface FeedbackMonitorParams {
  rawFeedback: FeedbackItem[];
  productScope: string;
  onProgress?: (step: string) => void;
}

export interface FeedbackMonitorOutput {
  totalReceived: number;
  totalActionable: number;
  classification: FeedbackClassificationOutput;
  criticalItems: string[];   // IDs of Critical priority items
  highItems: string[];       // IDs of High priority items
}

export async function runFeedbackMonitorAgent(
  params: FeedbackMonitorParams
): Promise<FeedbackMonitorOutput> {
  const { onProgress } = params;

  // Step 1: Filter noise
  onProgress?.('Filtering noise from incoming feedback...');
  const { actionable } = await filterNoise({
    feedbackItems: params.rawFeedback,
    productScope: params.productScope,
  });

  // Step 2: Deduplicate
  onProgress?.('Deduplicating feedback...');
  const { canonicalSet } = await deduplicateFeedback({ feedbackItems: actionable });

  // Step 3: SK-22 — Classify and score every item
  onProgress?.('Classifying and scoring feedback...');
  const classification = await classifyAndScoreFeedback(canonicalSet);

  const criticalItems = classification.classified
    .filter((c) => c.priority === 'Critical')
    .map((c) => c.id);

  const highItems = classification.classified
    .filter((c) => c.priority === 'High')
    .map((c) => c.id);

  onProgress?.('Feedback monitoring complete.');

  return {
    totalReceived: params.rawFeedback.length,
    totalActionable: canonicalSet.length,
    classification,
    criticalItems,
    highItems,
  };
}

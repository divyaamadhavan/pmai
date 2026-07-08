import { filterNoise } from '../skills/sk03-noise-filtering.js';
import { deduplicateFeedback } from '../skills/sk01-deduplication.js';
import { classifySentiment } from '../skills/sk04-sentiment.js';
import { detectThemes } from '../skills/sk02-theme-detection.js';
import { mapOpportunities } from '../skills/sk09-opportunity-mapping.js';
import type { FeedbackItem, FeedbackTheme, Opportunity } from '../skills/types.js';

export interface FeedbackAgentParams {
  rawFeedback: FeedbackItem[];
  productScope: string;
  priorThemes?: FeedbackTheme[];
  businessGoals?: string[];
  onProgress?: (step: string) => void;
}

export interface FeedbackAgentOutput {
  filteredFeedback: FeedbackItem[];
  canonicalSet: FeedbackItem[];
  themes: FeedbackTheme[];
  opportunities: Opportunity[];
  sentimentBreakdown: Record<string, number>;
}

export async function runFeedbackAgent(
  params: FeedbackAgentParams
): Promise<FeedbackAgentOutput> {
  const { onProgress } = params;

  // Step 1: SK-03 — Noise Filtering
  onProgress?.('Filtering noise from feedback...');
  const { actionable: filteredFeedback } = await filterNoise({
    feedbackItems: params.rawFeedback,
    productScope: params.productScope,
  });

  // Step 2: SK-01 — Deduplication
  onProgress?.('Deduplicating feedback...');
  const { canonicalSet } = await deduplicateFeedback({
    feedbackItems: filteredFeedback,
  });

  // Step 3: SK-04 — Sentiment Classification
  onProgress?.('Classifying sentiment...');
  const { aggregate: sentimentBreakdown } = await classifySentiment(canonicalSet);

  // Step 4: SK-02 — Theme Detection
  onProgress?.('Detecting themes...');
  const themes = await detectThemes({
    feedbackItems: canonicalSet,
    priorThemes: params.priorThemes,
  });

  // Step 5: SK-09 — Opportunity Mapping
  onProgress?.('Mapping opportunities...');
  const { opportunities } = await mapOpportunities({
    themes,
    businessGoals: params.businessGoals,
  });

  onProgress?.('Feedback analysis complete.');

  return {
    filteredFeedback,
    canonicalSet,
    themes,
    opportunities,
    sentimentBreakdown,
  };
}

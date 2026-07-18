import { detectThemes } from '../skills/sk02-theme-detection.js';
import { analyzeCustomerGaps } from '../skills/sk25-customer-gap-analysis.js';
import type { FeedbackItem, FeedbackTheme, RoadmapItem } from '../skills/types.js';
import type { CustomerPulseOutput } from '../skills/sk25-customer-gap-analysis.js';

export interface CustomerPulseAgentParams {
  feedbackItems: FeedbackItem[];
  roadmapItems: RoadmapItem[];
  existingThemes?: FeedbackTheme[];
  onProgress?: (step: string) => void;
}

export interface CustomerPulseAgentOutput extends CustomerPulseOutput {
  themes: FeedbackTheme[];
  alertLevel: 'Critical' | 'Warning' | 'Healthy';
  nudge: string;   // one-line action nudge for the PM
}

export async function runCustomerPulseAgent(
  params: CustomerPulseAgentParams
): Promise<CustomerPulseAgentOutput> {
  const { onProgress } = params;

  // Step 1: Detect themes from feedback
  onProgress?.('Detecting customer feedback themes...');
  const themes = await detectThemes({
    feedbackItems: params.feedbackItems,
    priorThemes: params.existingThemes,
  });

  // Step 2: SK-25 — Gap analysis between themes and roadmap
  onProgress?.('Analysing gaps between customer needs and roadmap...');
  const pulseResult = await analyzeCustomerGaps(themes, params.roadmapItems);

  const alertLevel: 'Critical' | 'Warning' | 'Healthy' =
    pulseResult.criticalGapCount >= 3
      ? 'Critical'
      : pulseResult.coverageScore < 60
      ? 'Warning'
      : 'Healthy';

  const nudge =
    alertLevel === 'Critical'
      ? `${pulseResult.criticalGapCount} critical customer needs are unaddressed — add them to the roadmap now.`
      : alertLevel === 'Warning'
      ? `Coverage is ${pulseResult.coverageScore}% — review top gaps before the next planning cycle.`
      : `Customer coverage looks good at ${pulseResult.coverageScore}%. Keep monitoring for shifts.`;

  onProgress?.('Customer pulse analysis complete.');

  return {
    ...pulseResult,
    themes,
    alertLevel,
    nudge,
  };
}

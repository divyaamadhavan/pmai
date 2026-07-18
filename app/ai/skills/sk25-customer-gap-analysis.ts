import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackTheme, RoadmapItem } from './types.js';

export type GapSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type GapType = 'Unaddressed Need' | 'Partial Coverage' | 'Misaligned Priority' | 'Missing Feature';

export interface CustomerGap {
  id: string;
  title: string;
  gapType: GapType;
  severity: GapSeverity;
  feedbackThemeIds: string[];
  feedbackCount: number;
  relatedRoadmapItemIds: string[];
  coveragePercent: number;      // 0–100 how much of the need is covered
  description: string;
  recommendation: string;
  evidenceQuotes: string[];
}

export interface CustomerPulseOutput {
  gaps: CustomerGap[];
  coverageScore: number;          // 0–100 overall alignment score
  criticalGapCount: number;
  totalFeedbackUnaddressed: number;
  executiveSummary: string;
  topGaps: string[];              // top 3 gap titles for quick view
}

interface LLMCustomerPulseResult {
  gaps: CustomerGap[];
  coverageScore: number;
  criticalGapCount: number;
  totalFeedbackUnaddressed: number;
  executiveSummary: string;
  topGaps: string[];
}

export async function analyzeCustomerGaps(
  themes: FeedbackTheme[],
  roadmapItems: RoadmapItem[]
): Promise<CustomerPulseOutput> {
  const scrubbedThemes = themes.map((t) => ({
    ...t,
    description: scrubPII(t.description),
    quotes: t.quotes.map((q) => scrubPII(q)),
  }));

  const system = prompts['SK-25']();

  const result = await structured<LLMCustomerPulseResult>({
    system,
    messages: [
      {
        role: 'user',
        content: [
          `Analyse the gap between customer feedback themes and the current roadmap.`,
          `\n## Feedback Themes (${scrubbedThemes.length})\n${JSON.stringify(scrubbedThemes, null, 2)}`,
          `\n## Roadmap Items (${roadmapItems.length})\n${JSON.stringify(roadmapItems, null, 2)}`,
        ].join('\n'),
      },
    ],
    schemaName: 'customer_pulse_result',
    schema: {
      type: 'object',
      properties: {
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              gapType: { type: 'string', enum: ['Unaddressed Need', 'Partial Coverage', 'Misaligned Priority', 'Missing Feature'] },
              severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
              feedbackThemeIds: { type: 'array', items: { type: 'string' } },
              feedbackCount: { type: 'number' },
              relatedRoadmapItemIds: { type: 'array', items: { type: 'string' } },
              coveragePercent: { type: 'number', minimum: 0, maximum: 100 },
              description: { type: 'string' },
              recommendation: { type: 'string' },
              evidenceQuotes: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'title', 'gapType', 'severity', 'feedbackThemeIds', 'feedbackCount', 'relatedRoadmapItemIds', 'coveragePercent', 'description', 'recommendation', 'evidenceQuotes'],
          },
        },
        coverageScore: { type: 'number', minimum: 0, maximum: 100 },
        criticalGapCount: { type: 'number' },
        totalFeedbackUnaddressed: { type: 'number' },
        executiveSummary: { type: 'string' },
        topGaps: { type: 'array', items: { type: 'string' } },
      },
      required: ['gaps', 'coverageScore', 'criticalGapCount', 'totalFeedbackUnaddressed', 'executiveSummary', 'topGaps'],
    },
  });

  return result;
}

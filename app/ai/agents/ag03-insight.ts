import { mapOpportunities } from '../skills/sk09-opportunity-mapping.js';
import { summariseInsights } from '../skills/sk10-insight-summarisation.js';
import { formatInsightReport } from '../skills/sk11-insight-formatting.js';
import type { Opportunity, FeedbackTheme } from '../skills/types.js';

export type ExportFormat = 'PDF' | 'Markdown' | 'slides';

export interface InsightAgentParams {
  opportunities: Opportunity[];
  themes?: FeedbackTheme[];
  businessGoals?: string[];
  metrics: {
    volume: number;
    sentiment: Record<string, number>;
    trends: string[];
  };
  audience: string;
  exportFormat: ExportFormat;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface InsightAgentOutput {
  formattedReport: string;
}

export async function generateInsightReport(
  params: InsightAgentParams
): Promise<InsightAgentOutput> {
  let opportunities = params.opportunities;

  // SK-09: Re-map opportunities if themes are provided (optional enrichment step)
  if (params.themes && params.themes.length > 0 && opportunities.length === 0) {
    const mapped = await mapOpportunities({
      themes: params.themes,
      businessGoals: params.businessGoals,
    });
    opportunities = mapped.opportunities;
  }

  // SK-10: Stream insight narrative
  const chunks: string[] = [];
  const wrappedOnChunk = (text: string) => {
    chunks.push(text);
    params.onChunk(text);
  };

  const narrative = await summariseInsights({
    opportunities,
    metrics: params.metrics,
    audience: params.audience,
    onChunk: wrappedOnChunk,
    // Don't forward onDone yet — we still have formatting to do
  });

  params.onDone?.();

  // SK-11: Format the report
  const { formattedReport } = await formatInsightReport({
    narrative,
    format: params.exportFormat,
  });

  return { formattedReport };
}

import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { Opportunity } from './types.js';

export interface InsightSummarisationInput {
  opportunities: Opportunity[];
  metrics: {
    volume: number;
    sentiment: Record<string, number>;
    trends: string[];
  };
  audience: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export async function summariseInsights(
  input: InsightSummarisationInput
): Promise<string> {
  const scrubbedOpportunities = input.opportunities.map((opp) => ({
    ...opp,
    userProblem: scrubPII(opp.userProblem),
    quotes: opp.quotes.map((q) => scrubPII(q)),
  }));

  const scrubbedAudience = scrubPII(input.audience);
  const scrubbedTrends = input.metrics.trends.map((t) => scrubPII(t));

  const system = prompts['SK-10']({ audience: scrubbedAudience });

  const userContent = [
    `## Audience\n${scrubbedAudience}`,
    `## Opportunities\n${JSON.stringify(scrubbedOpportunities, null, 2)}`,
    `## Metrics\n- Total feedback volume: ${input.metrics.volume}\n- Sentiment breakdown: ${JSON.stringify(input.metrics.sentiment)}\n- Key trends:\n${scrubbedTrends.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`,
    'Write a compelling insight narrative synthesising the above data.',
  ].join('\n\n');

  const narrative = await stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 2048,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return narrative;
}

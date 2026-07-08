import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, FeedbackTheme } from './types.js';

export interface TradeoffInput {
  options: Array<{ item: RoadmapItem; linkedThemes: FeedbackTheme[] }>;
  criteria: string[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface TradeoffOutput {
  comparisonTable: string;
  conclusion: string;
}

export async function generateTradeoff(
  input: TradeoffInput
): Promise<TradeoffOutput> {
  const scrubbedOptions = input.options.map(({ item, linkedThemes }) => ({
    item: {
      id: item.id,
      title: scrubPII(item.title),
      description: scrubPII(item.description),
    },
    linkedThemes: linkedThemes.map((t) => ({
      name: t.name,
      count: t.count,
      severity: t.severity,
      trend: t.trend,
    })),
  }));

  const scrubbedCriteria = input.criteria.map((c) => scrubPII(c));

  const system = prompts['SK-15']();

  const userContent = [
    `## Options to Compare\n${JSON.stringify(scrubbedOptions, null, 2)}`,
    `## Evaluation Criteria\n${scrubbedCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
    'Produce a structured comparison table in Markdown followed by a conclusion paragraph.',
  ].join('\n\n');

  let fullText = '';
  let tableSection = '';
  let conclusionSection = '';

  const collected = await stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 2048,
    onChunk: (chunk) => {
      fullText += chunk;
      input.onChunk(chunk);
    },
    onDone: input.onDone,
  });

  // Split the response into table and conclusion
  const conclusionMarker = collected.toLowerCase().indexOf('conclusion');
  if (conclusionMarker !== -1) {
    tableSection = collected.slice(0, conclusionMarker).trim();
    conclusionSection = collected.slice(conclusionMarker).trim();
  } else {
    tableSection = collected;
    conclusionSection = '';
  }

  void fullText; // used via stream

  return {
    comparisonTable: tableSection,
    conclusion: conclusionSection,
  };
}

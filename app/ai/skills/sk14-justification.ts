import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, FeedbackTheme } from './types.js';

export interface JustificationInput {
  item: RoadmapItem;
  linkedThemes: FeedbackTheme[];
  strategicRationale: string;
  alternatives: string[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export async function generateJustification(
  input: JustificationInput
): Promise<string> {
  const scrubbedItem = {
    id: input.item.id,
    title: scrubPII(input.item.title),
    description: scrubPII(input.item.description),
  };

  const scrubbedThemes = input.linkedThemes.map((t) => ({
    name: t.name,
    description: scrubPII(t.description),
    count: t.count,
    severity: t.severity,
    quotes: t.quotes.map((q) => scrubPII(q)).slice(0, 2),
  }));

  const scrubbedRationale = scrubPII(input.strategicRationale);
  const scrubbedAlternatives = input.alternatives.map((a) => scrubPII(a));

  const system = prompts['SK-14']({ itemTitle: scrubbedItem.title });

  const userContent = [
    `## Roadmap Item\n${JSON.stringify(scrubbedItem, null, 2)}`,
    `## Supporting Evidence (${scrubbedThemes.length} themes)\n${JSON.stringify(scrubbedThemes, null, 2)}`,
    `## Strategic Rationale\n${scrubbedRationale}`,
    `## Alternatives Considered\n${scrubbedAlternatives.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    'Write a 1-3 paragraph stakeholder justification for this roadmap item.',
  ].join('\n\n');

  const justification = await stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1024,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return justification;
}

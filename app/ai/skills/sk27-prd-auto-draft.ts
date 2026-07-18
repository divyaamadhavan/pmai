import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { buildContext } from '../orchestration/contextBuilder.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, FeedbackTheme } from './types.js';

export interface PRDAutoDraftInput {
  roadmapItem: RoadmapItem;
  linkedThemes: FeedbackTheme[];
  productScope: string;
  orgTemplate?: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface PRDAutoDraftOutput {
  prd: string;
  roadmapItemId: string;
  title: string;
  generatedAt: string;
}

export async function autoDraftPRD(
  input: PRDAutoDraftInput
): Promise<PRDAutoDraftOutput> {
  const item = input.roadmapItem;
  const themes = input.linkedThemes;

  const scrubbedTitle = scrubPII(item.title);
  const scrubbedDescription = scrubPII(item.description);
  const scrubbedScope = scrubPII(input.productScope);

  const feedbackEvidence = themes.map((t) => ({
    theme: t.name,
    description: scrubPII(t.description),
    count: t.count,
    severity: t.severity,
    quotes: t.quotes.map((q) => scrubPII(q)).slice(0, 2),
  }));

  const userInput = [
    `## Roadmap Item\nTitle: ${scrubbedTitle}\nDescription: ${scrubbedDescription}`,
    `## Product Scope\n${scrubbedScope}`,
    feedbackEvidence.length > 0
      ? `## Supporting Feedback Evidence\n${feedbackEvidence.map((e, i) => `${i + 1}. **${e.theme}** (${e.count} mentions, ${e.severity} severity)\n   ${e.description}\n   Quotes: ${e.quotes.map((q) => `"${q}"`).join('; ')}`).join('\n\n')}`
      : '',
    'Generate a full PRD for this roadmap item. This draft will be reviewed and edited by the PM.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { system, messages } = buildContext({
    systemRole: prompts['SK-27']({
      itemTitle: scrubbedTitle,
      hasTemplate: Boolean(input.orgTemplate),
    }),
    orgTemplate: input.orgTemplate,
    feedbackThemes: feedbackEvidence.map((e) => e.theme),
    userInput,
  });

  const prd = await stream({
    system,
    messages,
    maxTokens: 8192,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return {
    prd,
    roadmapItemId: item.id,
    title: item.title,
    generatedAt: new Date().toISOString(),
  };
}

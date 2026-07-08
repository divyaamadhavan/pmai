import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, FeedbackTheme } from './types.js';

export interface FeatureThemeLinkageInput {
  roadmapItems: RoadmapItem[];
  themes: FeedbackTheme[];
}

export interface FeatureThemeLinkage {
  itemId: string;
  linkedThemeIds: string[];
  confidence: number;
  feedbackCount: number;
}

interface LLMLinkageResult {
  linkages: FeatureThemeLinkage[];
}

export async function linkFeaturesToThemes(
  input: FeatureThemeLinkageInput
): Promise<FeatureThemeLinkage[]> {
  const scrubbedItems = input.roadmapItems.map((item) => ({
    id: item.id,
    title: scrubPII(item.title),
    description: scrubPII(item.description),
  }));

  const scrubbedThemes = input.themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: scrubPII(theme.description),
    count: theme.count,
    severity: theme.severity,
  }));

  const system = prompts['SK-12']();

  const userContent = [
    `Roadmap Items:\n${JSON.stringify(scrubbedItems, null, 2)}`,
    `Feedback Themes:\n${JSON.stringify(scrubbedThemes, null, 2)}`,
    'For each roadmap item, identify which feedback themes it addresses.',
  ].join('\n\n');

  const result = await structured<LLMLinkageResult>({
    system,
    messages: [{ role: 'user', content: userContent }],
    schemaName: 'feature_theme_linkage_result',
    schema: {
      type: 'object',
      properties: {
        linkages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              linkedThemeIds: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              feedbackCount: { type: 'number' },
            },
            required: ['itemId', 'linkedThemeIds', 'confidence', 'feedbackCount'],
          },
        },
      },
      required: ['linkages'],
    },
  });

  return result.linkages;
}

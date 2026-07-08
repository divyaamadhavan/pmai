import { linkFeaturesToThemes } from '../skills/sk12-feature-theme-linkage.js';
import { scoreItems } from '../skills/sk13-prioritisation-scoring.js';
import { generateJustification as sk14GenerateJustification } from '../skills/sk14-justification.js';
import { generateTradeoff as sk15GenerateTradeoff } from '../skills/sk15-tradeoff.js';
import type { RoadmapItem, FeedbackTheme } from '../skills/types.js';

export interface PrioritisedRoadmapItem {
  itemId: string;
  evidenceScore: number;
  rank: number;
  breakdown: Record<string, number>;
  linkedThemeIds: string[];
  feedbackCount: number;
}

export async function prioritizeRoadmap(
  items: RoadmapItem[],
  themes: FeedbackTheme[],
  businessScores?: Record<string, number>
): Promise<PrioritisedRoadmapItem[]> {
  // SK-12: Link features to themes
  const linkages = await linkFeaturesToThemes({ roadmapItems: items, themes });

  // Enrich items with their linked themes
  const itemsWithLinkages = items.map((item) => {
    const linkage = linkages.find((l) => l.itemId === item.id);
    const linkedThemes = (linkage?.linkedThemeIds ?? [])
      .map((tid) => themes.find((t) => t.id === tid))
      .filter((t): t is FeedbackTheme => t !== undefined);
    return { ...item, linkedThemes };
  });

  // SK-13: Score and rank items
  const scores = await scoreItems({ itemsWithLinkages, businessScores });

  // Merge scores with linkage data
  return scores.map((score) => {
    const linkage = linkages.find((l) => l.itemId === score.itemId);
    return {
      ...score,
      linkedThemeIds: linkage?.linkedThemeIds ?? [],
      feedbackCount: linkage?.feedbackCount ?? 0,
    };
  });
}

export async function generateJustification(params: {
  item: RoadmapItem;
  themes: FeedbackTheme[];
  rationale: string;
  alternatives?: string[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}): Promise<void> {
  // SK-14: Generate stakeholder justification
  await sk14GenerateJustification({
    item: params.item,
    linkedThemes: params.themes,
    strategicRationale: params.rationale,
    alternatives: params.alternatives ?? [],
    onChunk: params.onChunk,
    onDone: params.onDone,
  });
}

export async function generateTradeoff(params: {
  options: RoadmapItem[];
  themes: FeedbackTheme[];
  criteria: string[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}): Promise<void> {
  // Link each option to themes for context
  const linkages = await linkFeaturesToThemes({
    roadmapItems: params.options,
    themes: params.themes,
  });

  const enrichedOptions = params.options.map((item) => {
    const linkage = linkages.find((l) => l.itemId === item.id);
    const linkedThemes = (linkage?.linkedThemeIds ?? [])
      .map((tid) => params.themes.find((t) => t.id === tid))
      .filter((t): t is FeedbackTheme => t !== undefined);
    return { item, linkedThemes };
  });

  // SK-15: Generate tradeoff comparison
  await sk15GenerateTradeoff({
    options: enrichedOptions,
    criteria: params.criteria,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });
}

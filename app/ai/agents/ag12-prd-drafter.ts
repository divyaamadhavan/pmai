import { autoDraftPRD } from '../skills/sk27-prd-auto-draft.js';
import { linkFeaturesToThemes } from '../skills/sk12-feature-theme-linkage.js';
import type { RoadmapItem, FeedbackTheme } from '../skills/types.js';
import type { PRDAutoDraftOutput } from '../skills/sk27-prd-auto-draft.js';

export interface PRDDrafterAgentParams {
  roadmapItem: RoadmapItem;
  allThemes: FeedbackTheme[];
  productScope: string;
  orgTemplate?: string;
  onChunk: (text: string) => void;
  onProgress?: (step: string) => void;
  onDone?: () => void;
}

export interface PRDDrafterAgentOutput extends PRDAutoDraftOutput {
  linkedThemeCount: number;
  linkedThemeNames: string[];
}

export async function runPRDDrafterAgent(
  params: PRDDrafterAgentParams
): Promise<PRDDrafterAgentOutput> {
  const { onProgress } = params;

  // Step 1: SK-12 — Link the roadmap item to relevant themes for evidence
  onProgress?.('Linking roadmap item to feedback themes...');
  const linkages = await linkFeaturesToThemes({
    roadmapItems: [params.roadmapItem],
    themes: params.allThemes,
  });

  const linkedThemeIds = linkages[0]?.linkedThemeIds ?? [];
  const linkedThemes = linkedThemeIds
    .map((tid) => params.allThemes.find((t) => t.id === tid))
    .filter((t): t is FeedbackTheme => t !== undefined);

  onProgress?.(`Found ${linkedThemes.length} linked theme(s). Drafting PRD...`);

  // Step 2: SK-27 — Auto-draft PRD with streaming
  const draft = await autoDraftPRD({
    roadmapItem: params.roadmapItem,
    linkedThemes,
    productScope: params.productScope,
    orgTemplate: params.orgTemplate,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });

  onProgress?.('PRD draft complete — ready for PM review.');

  return {
    ...draft,
    linkedThemeCount: linkedThemes.length,
    linkedThemeNames: linkedThemes.map((t) => t.name),
  };
}

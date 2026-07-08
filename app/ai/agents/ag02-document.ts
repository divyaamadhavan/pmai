import { recallKnowledge } from '../skills/sk20-knowledge-recall.js';
import { generatePRD as sk05GeneratePRD } from '../skills/sk05-prd-generation.js';
import { generateUserStories } from '../skills/sk06-user-story-generation.js';
import { generateAcceptanceCriteria } from '../skills/sk07-acceptance-criteria.js';
import { regenerateSection as sk08RegenerateSection } from '../skills/sk08-section-regeneration.js';
import type { FeedbackTheme } from '../skills/types.js';

export interface GeneratePRDParams {
  problemStatement: string;
  targetUser: string;
  goals: string[];
  feedbackThemes?: FeedbackTheme[];
  orgTemplate?: string;
  priorContext?: string;
  knowledgeEntries?: Array<{
    id: string;
    content: string;
    source: string;
    date: string;
    type: string;
  }>;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface RegenerateSectionParams {
  fullDocument: string;
  sectionName: string;
  revisionInstructions: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export async function generatePRD(params: GeneratePRDParams): Promise<void> {
  let contextSnippets: string[] = [];

  // SK-20: Recall relevant knowledge base context
  if (params.knowledgeEntries && params.knowledgeEntries.length > 0) {
    const recalled = await recallKnowledge({
      taskDescription: `Generate a PRD for: ${params.problemStatement}`,
      knowledgeEntries: params.knowledgeEntries,
    });
    contextSnippets = recalled.map((r) => r.excerpt);
  }

  const priorContextParts: string[] = [];
  if (params.priorContext) priorContextParts.push(params.priorContext);
  if (contextSnippets.length > 0) {
    priorContextParts.push(`Relevant knowledge:\n${contextSnippets.join('\n---\n')}`);
  }

  const themeNames = params.feedbackThemes?.map(
    (t) => `${t.name}: ${t.description} (${t.count} items, ${t.severity} severity)`
  );

  // SK-05: Stream PRD generation
  await sk05GeneratePRD({
    problemStatement: params.problemStatement,
    targetUser: params.targetUser,
    goals: params.goals,
    feedbackThemes: themeNames,
    orgTemplate: params.orgTemplate,
    priorContext: priorContextParts.join('\n\n') || undefined,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });

  // SK-06 and SK-07 are called by consumers after PRD is complete
  // They are available as standalone exports for post-PRD story/AC generation
}

/**
 * Generate user stories for a feature after PRD creation.
 * Called separately by consumers of the Document Agent.
 */
export async function generateStoriesAndCriteria(params: {
  featureDescription: string;
  persona: string;
  prdContext?: string;
}) {
  // SK-06: Generate user stories
  const { stories } = await generateUserStories({
    featureDescription: params.featureDescription,
    persona: params.persona,
    prdContext: params.prdContext,
  });

  // SK-07: Generate acceptance criteria for each story
  const storiesWithCriteria = await Promise.all(
    stories.map(async (story) => {
      const storyText = `As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}`;
      const { criteria } = await generateAcceptanceCriteria({
        story: storyText,
        context: params.prdContext,
      });
      return { story, criteria };
    })
  );

  return storiesWithCriteria;
}

export async function regenerateSection(
  params: RegenerateSectionParams
): Promise<void> {
  // SK-08: Regenerate a specific section
  await sk08RegenerateSection({
    fullDocument: params.fullDocument,
    sectionName: params.sectionName,
    revisionInstructions: params.revisionInstructions,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });
}

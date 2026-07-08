import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { buildContext } from '../orchestration/contextBuilder.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface PRDGenerationInput {
  problemStatement: string;
  targetUser: string;
  goals: string[];
  feedbackThemes?: string[];
  orgTemplate?: string;
  priorContext?: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface PRDGenerationOutput {
  prd: string;
}

export async function generatePRD(
  input: PRDGenerationInput
): Promise<PRDGenerationOutput> {
  const scrubbedProblem = scrubPII(input.problemStatement);
  const scrubbedUser = scrubPII(input.targetUser);
  const scrubbedGoals = input.goals.map((g) => scrubPII(g));
  const scrubbedThemes = input.feedbackThemes?.map((t) => scrubPII(t));

  const userInput = [
    `## Problem Statement\n${scrubbedProblem}`,
    `## Target User\n${scrubbedUser}`,
    `## Goals\n${scrubbedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`,
    scrubbedThemes && scrubbedThemes.length > 0
      ? `## Evidence from User Feedback\nThe following themes emerged from user feedback:\n${scrubbedThemes.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '',
    'Please generate a comprehensive PRD based on the above information.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { system, messages } = buildContext({
    systemRole: prompts['SK-05']({
      targetUser: scrubbedUser,
      hasTemplate: Boolean(input.orgTemplate),
    }),
    orgTemplate: input.orgTemplate,
    feedbackThemes: scrubbedThemes,
    userInput,
    priorDocumentState: input.priorContext ? scrubPII(input.priorContext) : undefined,
  });

  const prd = await stream({
    system,
    messages,
    maxTokens: 8192,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return { prd };
}

import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface SectionRegenerationInput {
  fullDocument: string;
  sectionName: string;
  revisionInstructions: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface SectionRegenerationOutput {
  revisedSection: string;
}

export async function regenerateSection(
  input: SectionRegenerationInput
): Promise<SectionRegenerationOutput> {
  const scrubbedDoc = scrubPII(input.fullDocument);
  const scrubbedInstructions = scrubPII(input.revisionInstructions);

  const system = prompts['SK-08']({ sectionName: input.sectionName });

  const userContent = [
    `## Full Document (for context)\n${scrubbedDoc}`,
    `## Section to Revise\n${input.sectionName}`,
    `## Revision Instructions\n${scrubbedInstructions}`,
    'Please output only the revised section content, starting from the section heading.',
  ].join('\n\n');

  const revisedSection = await stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 4096,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return { revisedSection };
}

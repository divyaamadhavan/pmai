import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';

export type CriteriaType = 'happy_path' | 'edge_case' | 'error_state';

export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
  type: CriteriaType;
}

export interface AcceptanceCriteriaInput {
  story: string;
  context?: string;
  constraints?: string[];
}

export interface AcceptanceCriteriaOutput {
  criteria: AcceptanceCriterion[];
}

interface LLMACResult {
  criteria: AcceptanceCriterion[];
}

export async function generateAcceptanceCriteria(
  input: AcceptanceCriteriaInput
): Promise<AcceptanceCriteriaOutput> {
  const scrubbedStory = scrubPII(input.story);
  const scrubbedContext = input.context ? scrubPII(input.context) : undefined;
  const scrubbedConstraints = input.constraints?.map((c) => scrubPII(c));

  const system = prompts['SK-07']();

  const userParts = [`User Story:\n${scrubbedStory}`];

  if (scrubbedContext) {
    userParts.push(`Context:\n${scrubbedContext}`);
  }

  if (scrubbedConstraints && scrubbedConstraints.length > 0) {
    userParts.push(
      `Constraints:\n${scrubbedConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    );
  }

  userParts.push(
    'Generate comprehensive acceptance criteria covering happy path, edge cases, and error states.'
  );

  const result = await structured<LLMACResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'acceptance_criteria_result',
    schema: {
      type: 'object',
      properties: {
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              given: { type: 'string' },
              when: { type: 'string' },
              then: { type: 'string' },
              type: {
                type: 'string',
                enum: ['happy_path', 'edge_case', 'error_state'],
              },
            },
            required: ['given', 'when', 'then', 'type'],
          },
        },
      },
      required: ['criteria'],
    },
  });

  return result;
}

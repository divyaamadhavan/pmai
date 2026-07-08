import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface UserStoryInput {
  featureDescription: string;
  persona: string;
  prdContext?: string;
}

export interface UserStory {
  asA: string;
  iWant: string;
  soThat: string;
}

export interface UserStoryOutput {
  stories: UserStory[];
}

interface LLMUserStoryResult {
  stories: UserStory[];
}

export async function generateUserStories(
  input: UserStoryInput
): Promise<UserStoryOutput> {
  const scrubbedFeature = scrubPII(input.featureDescription);
  const scrubbedPersona = scrubPII(input.persona);
  const scrubbedContext = input.prdContext ? scrubPII(input.prdContext) : undefined;

  const system = prompts['SK-06']({ persona: scrubbedPersona });

  const userParts = [
    `Feature Description:\n${scrubbedFeature}`,
    `Persona:\n${scrubbedPersona}`,
  ];

  if (scrubbedContext) {
    userParts.push(`PRD Context:\n${scrubbedContext}`);
  }

  userParts.push('Generate user stories for this feature.');

  const result = await structured<LLMUserStoryResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'user_story_result',
    schema: {
      type: 'object',
      properties: {
        stories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              asA: { type: 'string', description: 'The persona/role' },
              iWant: { type: 'string', description: 'The desired action or goal' },
              soThat: { type: 'string', description: 'The benefit or outcome' },
            },
            required: ['asA', 'iWant', 'soThat'],
          },
        },
      },
      required: ['stories'],
    },
  });

  return result;
}

import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { RoadmapItem, SprintTicket } from './types.js';

export interface TicketGenerationInput {
  roadmapItem: RoadmapItem;
  prdContext?: string;
  storyPointScale: number[];
  knownDependencies?: string[];
}

export interface TicketGenerationOutput {
  tickets: SprintTicket[];
}

interface LLMTicketResult {
  tickets: Array<{
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
    storyPoints: number;
    dependencies: string[];
  }>;
}

export async function generateTickets(
  input: TicketGenerationInput
): Promise<TicketGenerationOutput> {
  const scrubbedItem = {
    id: input.roadmapItem.id,
    title: scrubPII(input.roadmapItem.title),
    description: scrubPII(input.roadmapItem.description),
  };

  const scrubbedContext = input.prdContext ? scrubPII(input.prdContext) : undefined;
  const scrubbedDeps = input.knownDependencies?.map((d) => scrubPII(d));

  const system = prompts['SK-16']({ itemTitle: scrubbedItem.title });

  const userParts = [
    `## Roadmap Item\n${JSON.stringify(scrubbedItem, null, 2)}`,
    `## Story Point Scale\nAvailable estimates: ${input.storyPointScale.join(', ')}`,
  ];

  if (scrubbedContext) {
    userParts.push(`## PRD Context\n${scrubbedContext}`);
  }

  if (scrubbedDeps && scrubbedDeps.length > 0) {
    userParts.push(
      `## Known Dependencies\n${scrubbedDeps.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
    );
  }

  userParts.push('Break this roadmap item into sprint-ready tickets.');

  const result = await structured<LLMTicketResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'ticket_generation_result',
    schema: {
      type: 'object',
      properties: {
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              acceptanceCriteria: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    given: { type: 'string' },
                    when: { type: 'string' },
                    then: { type: 'string' },
                  },
                  required: ['given', 'when', 'then'],
                },
              },
              storyPoints: { type: 'number' },
              dependencies: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'id',
              'title',
              'description',
              'acceptanceCriteria',
              'storyPoints',
              'dependencies',
            ],
          },
        },
      },
      required: ['tickets'],
    },
  });

  return result;
}

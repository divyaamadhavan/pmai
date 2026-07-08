import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { SprintTicket } from './types.js';

export type GroomingStatus = 'READY' | 'MISSING_AC' | 'TOO_LARGE' | 'AMBIGUOUS';

export interface GroomingResult {
  ticketId: string;
  status: GroomingStatus;
  suggestion?: string;
}

export interface BacklogGroomingInput {
  tickets: Array<SprintTicket & { estimate?: number }>;
  storyPointCeiling: number;
}

interface LLMGroomingResult {
  results: GroomingResult[];
}

export async function groomBacklog(
  input: BacklogGroomingInput
): Promise<GroomingResult[]> {
  const scrubbedTickets = input.tickets.map((ticket) => ({
    id: ticket.id,
    title: scrubPII(ticket.title),
    description: scrubPII(ticket.description),
    acceptanceCriteria: ticket.acceptanceCriteria.map((ac) => ({
      given: scrubPII(ac.given),
      when: scrubPII(ac.when),
      then: scrubPII(ac.then),
    })),
    storyPoints: ticket.storyPoints,
    estimate: ticket.estimate,
    dependencies: ticket.dependencies,
  }));

  const system = prompts['SK-19']({ ceiling: input.storyPointCeiling });

  const userContent = [
    `Story Point Ceiling: ${input.storyPointCeiling}`,
    `Tickets to Groom (${scrubbedTickets.length}):\n${JSON.stringify(scrubbedTickets, null, 2)}`,
    'Assess each ticket for sprint readiness.',
  ].join('\n\n');

  const result = await structured<LLMGroomingResult>({
    system,
    messages: [{ role: 'user', content: userContent }],
    schemaName: 'backlog_grooming_result',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ticketId: { type: 'string' },
              status: {
                type: 'string',
                enum: ['READY', 'MISSING_AC', 'TOO_LARGE', 'AMBIGUOUS'],
              },
              suggestion: { type: 'string' },
            },
            required: ['ticketId', 'status'],
          },
        },
      },
      required: ['results'],
    },
  });

  return result.results;
}

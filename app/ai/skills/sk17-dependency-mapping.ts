import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { SprintTicket } from './types.js';

export interface DependencyMappingInput {
  tickets: SprintTicket[];
  backlogContext?: string[];
}

export interface DependencyNode {
  ticketId: string;
  dependsOn: string[];
  blocks: string[];
  externalDeps: string[];
  riskFlags: string[];
}

interface LLMDependencyResult {
  dependencyGraph: DependencyNode[];
}

export async function mapDependencies(
  input: DependencyMappingInput
): Promise<{ dependencyGraph: DependencyNode[] }> {
  const scrubbedTickets = input.tickets.map((ticket) => ({
    id: ticket.id,
    title: scrubPII(ticket.title),
    description: scrubPII(ticket.description),
    dependencies: ticket.dependencies,
    storyPoints: ticket.storyPoints,
  }));

  const scrubbedBacklog = input.backlogContext?.map((b) => scrubPII(b));

  const system = prompts['SK-17']();

  const userParts = [
    `Sprint Tickets:\n${JSON.stringify(scrubbedTickets, null, 2)}`,
  ];

  if (scrubbedBacklog && scrubbedBacklog.length > 0) {
    userParts.push(
      `Backlog Context (for external dependency identification):\n${scrubbedBacklog.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
    );
  }

  userParts.push(
    'Build a dependency graph for these tickets. Identify internal dependencies, blocking relationships, external dependencies, and risk flags.'
  );

  const result = await structured<LLMDependencyResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'dependency_mapping_result',
    schema: {
      type: 'object',
      properties: {
        dependencyGraph: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ticketId: { type: 'string' },
              dependsOn: { type: 'array', items: { type: 'string' } },
              blocks: { type: 'array', items: { type: 'string' } },
              externalDeps: { type: 'array', items: { type: 'string' } },
              riskFlags: { type: 'array', items: { type: 'string' } },
            },
            required: ['ticketId', 'dependsOn', 'blocks', 'externalDeps', 'riskFlags'],
          },
        },
      },
      required: ['dependencyGraph'],
    },
  });

  return result;
}

import { stream } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { SprintTicket } from './types.js';

export interface SprintBriefInput {
  tickets: SprintTicket[];
  sprintGoal: string;
  teamCapacity: number;
  retroNotes?: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export async function generateSprintBrief(
  input: SprintBriefInput
): Promise<string> {
  const scrubbedTickets = input.tickets.map((ticket) => ({
    id: ticket.id,
    title: scrubPII(ticket.title),
    description: scrubPII(ticket.description),
    storyPoints: ticket.storyPoints,
    dependencies: ticket.dependencies,
  }));

  const scrubbedGoal = scrubPII(input.sprintGoal);
  const scrubbedRetro = input.retroNotes ? scrubPII(input.retroNotes) : undefined;

  const totalPoints = scrubbedTickets.reduce((sum, t) => sum + t.storyPoints, 0);

  const system = prompts['SK-18']({
    sprintGoal: scrubbedGoal,
    capacity: input.teamCapacity,
  });

  const userParts = [
    `## Sprint Goal\n${scrubbedGoal}`,
    `## Team Capacity\n${input.teamCapacity} story points`,
    `## Committed Tickets (${scrubbedTickets.length} tickets, ${totalPoints} points)\n${JSON.stringify(scrubbedTickets, null, 2)}`,
  ];

  if (scrubbedRetro) {
    userParts.push(`## Retrospective Notes\n${scrubbedRetro}`);
  }

  userParts.push('Generate a comprehensive sprint brief in Markdown.');

  const brief = await stream({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    maxTokens: 2048,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  return brief;
}

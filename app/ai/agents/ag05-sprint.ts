import { generateTickets as sk16GenerateTickets } from '../skills/sk16-ticket-generation.js';
import { mapDependencies } from '../skills/sk17-dependency-mapping.js';
import { generateSprintBrief as sk18GenerateSprintBrief } from '../skills/sk18-sprint-brief.js';
import { groomBacklog as sk19GroomBacklog } from '../skills/sk19-backlog-grooming.js';
import type { RoadmapItem, SprintTicket } from '../skills/types.js';
import type { DependencyNode } from '../skills/sk17-dependency-mapping.js';
import type { GroomingResult } from '../skills/sk19-backlog-grooming.js';

export interface GenerateTicketsParams {
  roadmapItem: RoadmapItem;
  prdContext?: string;
  storyPointScale: number[];
  knownDependencies?: string[];
  backlogContext?: string[];
  onProgress?: (step: string) => void;
}

export interface GenerateTicketsOutput {
  tickets: SprintTicket[];
  dependencyGraph: DependencyNode[];
}

export async function generateTickets(
  params: GenerateTicketsParams
): Promise<GenerateTicketsOutput> {
  const { onProgress } = params;

  // SK-16: Generate tickets from roadmap item
  onProgress?.('Generating sprint tickets...');
  const { tickets } = await sk16GenerateTickets({
    roadmapItem: params.roadmapItem,
    prdContext: params.prdContext,
    storyPointScale: params.storyPointScale,
    knownDependencies: params.knownDependencies,
  });

  // SK-17: Map dependencies between tickets
  onProgress?.('Mapping ticket dependencies...');
  const { dependencyGraph } = await mapDependencies({
    tickets,
    backlogContext: params.backlogContext,
  });

  onProgress?.('Ticket generation complete.');

  return { tickets, dependencyGraph };
}

export async function generateSprintBrief(params: {
  tickets: SprintTicket[];
  sprintGoal: string;
  capacity: number;
  retroNotes?: string;
  onChunk: (text: string) => void;
  onDone?: () => void;
}): Promise<void> {
  // SK-18: Generate sprint brief
  await sk18GenerateSprintBrief({
    tickets: params.tickets,
    sprintGoal: params.sprintGoal,
    teamCapacity: params.capacity,
    retroNotes: params.retroNotes,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });
}

export async function groomBacklog(params: {
  tickets: SprintTicket[];
  ceiling: number;
}): Promise<GroomingResult[]> {
  // SK-19: Groom the backlog
  return await sk19GroomBacklog({
    tickets: params.tickets,
    storyPointCeiling: params.ceiling,
  });
}

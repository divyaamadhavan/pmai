import { checkSprintHygiene } from '../skills/sk26-sprint-hygiene.js';
import { groomBacklog } from '../skills/sk19-backlog-grooming.js';
import type { SprintTicket } from '../skills/types.js';
import type { SprintHygieneOutput } from '../skills/sk26-sprint-hygiene.js';

export interface SprintCoachAgentParams {
  tickets: Array<SprintTicket & { daysInGrooming?: number; owner?: string }>;
  sprintGoal: string;
  storyPointCeiling: number;
  onProgress?: (step: string) => void;
}

export interface SprintCoachAgentOutput {
  hygiene: SprintHygieneOutput;
  groomingFlags: Array<{ ticketId: string; status: string; suggestion?: string }>;
  sprintReadinessScore: number;   // 0–100 composite of hygiene + grooming
  readyForSprint: string[];
  needsWork: string[];
  coachSummary: string;
}

export async function runSprintCoachAgent(
  params: SprintCoachAgentParams
): Promise<SprintCoachAgentOutput> {
  const { onProgress } = params;

  // Step 1: SK-26 — Hygiene check
  onProgress?.('Checking sprint ticket hygiene...');
  const hygiene = await checkSprintHygiene({
    tickets: params.tickets,
    sprintGoal: params.sprintGoal,
  });

  // Step 2: SK-19 — Grooming readiness check
  onProgress?.('Assessing backlog grooming readiness...');
  const groomingFlags = await groomBacklog({
    tickets: params.tickets,
    storyPointCeiling: params.storyPointCeiling,
  });

  const readyForSprint = groomingFlags
    .filter((g) => g.status === 'READY')
    .map((g) => g.ticketId);

  const needsWork = groomingFlags
    .filter((g) => g.status !== 'READY')
    .map((g) => g.ticketId);

  const sprintReadinessScore = Math.round(
    (hygiene.sprintHealthScore + (readyForSprint.length / Math.max(params.tickets.length, 1)) * 100) / 2
  );

  const coachSummary = [
    `Sprint health score: ${hygiene.sprintHealthScore}/100.`,
    hygiene.blockerCount > 0 ? `${hygiene.blockerCount} blocker(s) must be resolved before sprint start.` : null,
    needsWork.length > 0 ? `${needsWork.length} ticket(s) need grooming work.` : null,
    hygiene.coachingNotes.slice(0, 2).join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  onProgress?.('Sprint coaching complete.');

  return {
    hygiene,
    groomingFlags,
    sprintReadinessScore,
    readyForSprint,
    needsWork,
    coachSummary,
  };
}

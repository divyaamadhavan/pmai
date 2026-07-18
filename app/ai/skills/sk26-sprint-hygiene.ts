import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { SprintTicket } from './types.js';

export type HygieneIssueType =
  | 'Missing AC'
  | 'Weak AC'
  | 'Too Large'
  | 'No Story Points'
  | 'Long in Grooming'
  | 'Missing Description'
  | 'Circular Dependency'
  | 'No Owner'
  | 'Stale';

export type HygieneSeverity = 'Blocker' | 'Warning' | 'Suggestion';

export interface HygieneIssue {
  type: HygieneIssueType;
  severity: HygieneSeverity;
  detail: string;
  fix: string;
}

export interface TicketHygieneResult {
  ticketId: string;
  title: string;
  isHealthy: boolean;
  issues: HygieneIssue[];
  hygieneScore: number;   // 0–100
}

export interface SprintHygieneOutput {
  ticketResults: TicketHygieneResult[];
  sprintHealthScore: number;     // 0–100
  blockerCount: number;
  warningCount: number;
  readyCount: number;
  coachingNotes: string[];       // sprint-level observations for the PM
  topFixActions: string[];
}

export interface SprintHygieneInput {
  tickets: Array<SprintTicket & { daysInGrooming?: number; owner?: string }>;
  sprintGoal: string;
}

interface LLMSprintHygieneResult {
  ticketResults: TicketHygieneResult[];
  sprintHealthScore: number;
  blockerCount: number;
  warningCount: number;
  readyCount: number;
  coachingNotes: string[];
  topFixActions: string[];
}

export async function checkSprintHygiene(
  input: SprintHygieneInput
): Promise<SprintHygieneOutput> {
  const scrubbedTickets = input.tickets.map((t) => ({
    id: t.id,
    title: scrubPII(t.title),
    description: scrubPII(t.description),
    acceptanceCriteria: t.acceptanceCriteria.map((ac) => ({
      given: scrubPII(ac.given),
      when: scrubPII(ac.when),
      then: scrubPII(ac.then),
    })),
    storyPoints: t.storyPoints,
    dependencies: t.dependencies,
    daysInGrooming: t.daysInGrooming,
    owner: t.owner,
  }));

  const system = prompts['SK-26']({ sprintGoal: scrubPII(input.sprintGoal) });

  const result = await structured<LLMSprintHygieneResult>({
    system,
    messages: [
      {
        role: 'user',
        content: `Review sprint hygiene for the following ${scrubbedTickets.length} tickets:\n\n${JSON.stringify(scrubbedTickets, null, 2)}\n\nSprint Goal: ${scrubPII(input.sprintGoal)}`,
      },
    ],
    schemaName: 'sprint_hygiene_result',
    schema: {
      type: 'object',
      properties: {
        ticketResults: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ticketId: { type: 'string' },
              title: { type: 'string' },
              isHealthy: { type: 'boolean' },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['Missing AC', 'Weak AC', 'Too Large', 'No Story Points', 'Long in Grooming', 'Missing Description', 'Circular Dependency', 'No Owner', 'Stale'] },
                    severity: { type: 'string', enum: ['Blocker', 'Warning', 'Suggestion'] },
                    detail: { type: 'string' },
                    fix: { type: 'string' },
                  },
                  required: ['type', 'severity', 'detail', 'fix'],
                },
              },
              hygieneScore: { type: 'number', minimum: 0, maximum: 100 },
            },
            required: ['ticketId', 'title', 'isHealthy', 'issues', 'hygieneScore'],
          },
        },
        sprintHealthScore: { type: 'number', minimum: 0, maximum: 100 },
        blockerCount: { type: 'number' },
        warningCount: { type: 'number' },
        readyCount: { type: 'number' },
        coachingNotes: { type: 'array', items: { type: 'string' } },
        topFixActions: { type: 'array', items: { type: 'string' } },
      },
      required: ['ticketResults', 'sprintHealthScore', 'blockerCount', 'warningCount', 'readyCount', 'coachingNotes', 'topFixActions'],
    },
  });

  return result;
}

import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { ClassifiedFeedback } from './sk22-feedback-classification.js';

export type TriageDecision = 'Move to Backlog' | 'Monitor' | 'Reject' | 'Escalate';
export type StakeholderRole = 'Engineering Head' | 'PM' | 'Business';

export interface StakeholderVote {
  role: StakeholderRole;
  recommendation: TriageDecision;
  rationale: string;
  concerns: string[];
}

export interface TriageResult {
  feedbackId: string;
  feedbackSummary: string;
  stakeholderVotes: StakeholderVote[];
  finalDecision: TriageDecision;
  consensusRationale: string;
  dissent: string | null;
  actionItems: string[];
}

export interface TriageOutput {
  results: TriageResult[];
  movedToBacklog: number;
  monitored: number;
  rejected: number;
  escalated: number;
}

interface LLMTriageOutput {
  results: TriageResult[];
  movedToBacklog: number;
  monitored: number;
  rejected: number;
  escalated: number;
}

export async function triageFeedback(
  classifiedFeedback: ClassifiedFeedback[],
  productScope: string
): Promise<TriageOutput> {
  const scrubbedItems = classifiedFeedback.map((item) => ({
    ...item,
    oneLineSummary: scrubPII(item.oneLineSummary),
    reasoning: scrubPII(item.reasoning),
  }));

  const system = prompts['SK-23']({ productScope: scrubPII(productScope) });

  const result = await structured<LLMTriageOutput>({
    system,
    messages: [
      {
        role: 'user',
        content: `Perform triage on the following ${scrubbedItems.length} classified feedback items from the perspectives of Engineering Head, PM, and Business:\n\n${JSON.stringify(scrubbedItems, null, 2)}`,
      },
    ],
    schemaName: 'triage_result',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              feedbackId: { type: 'string' },
              feedbackSummary: { type: 'string' },
              stakeholderVotes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['Engineering Head', 'PM', 'Business'] },
                    recommendation: { type: 'string', enum: ['Move to Backlog', 'Monitor', 'Reject', 'Escalate'] },
                    rationale: { type: 'string' },
                    concerns: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['role', 'recommendation', 'rationale', 'concerns'],
                },
              },
              finalDecision: { type: 'string', enum: ['Move to Backlog', 'Monitor', 'Reject', 'Escalate'] },
              consensusRationale: { type: 'string' },
              dissent: { type: ['string', 'null'] },
              actionItems: { type: 'array', items: { type: 'string' } },
            },
            required: ['feedbackId', 'feedbackSummary', 'stakeholderVotes', 'finalDecision', 'consensusRationale', 'dissent', 'actionItems'],
          },
        },
        movedToBacklog: { type: 'number' },
        monitored: { type: 'number' },
        rejected: { type: 'number' },
        escalated: { type: 'number' },
      },
      required: ['results', 'movedToBacklog', 'monitored', 'rejected', 'escalated'],
    },
  });

  return result;
}

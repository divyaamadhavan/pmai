import { classifyAndScoreFeedback } from '../skills/sk22-feedback-classification.js';
import { triageFeedback } from '../skills/sk23-triage-decision.js';
import type { FeedbackItem } from '../skills/types.js';
import type { TriageOutput } from '../skills/sk23-triage-decision.js';

export interface TriageAgentParams {
  feedbackItems: FeedbackItem[];
  productScope: string;
  onProgress?: (step: string) => void;
}

export interface TriageAgentOutput extends TriageOutput {
  backlogCandidates: string[];   // feedbackIds ready for backlog
  escalations: string[];         // feedbackIds needing immediate attention
}

export async function runTriageAgent(
  params: TriageAgentParams
): Promise<TriageAgentOutput> {
  const { onProgress } = params;

  // Step 1: Classify feedback first so triage has rich context
  onProgress?.('Classifying feedback for triage context...');
  const classification = await classifyAndScoreFeedback(params.feedbackItems);

  // Step 2: SK-23 — Multi-stakeholder triage decision
  onProgress?.('Running multi-stakeholder triage (Engineering Head, PM, Business)...');
  const triageResult = await triageFeedback(classification.classified, params.productScope);

  const backlogCandidates = triageResult.results
    .filter((r) => r.finalDecision === 'Move to Backlog')
    .map((r) => r.feedbackId);

  const escalations = triageResult.results
    .filter((r) => r.finalDecision === 'Escalate')
    .map((r) => r.feedbackId);

  onProgress?.('Triage complete. Decisions ready for review.');

  return {
    ...triageResult,
    backlogCandidates,
    escalations,
  };
}

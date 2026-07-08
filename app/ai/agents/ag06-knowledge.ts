import { recallKnowledge } from '../skills/sk20-knowledge-recall.js';
import { answerOnboardingQuestion } from '../skills/sk21-onboarding-qa.js';
import type { KnowledgeEntry, RecalledEntry } from '../skills/sk20-knowledge-recall.js';
import type { OnboardingKnowledgeEntry } from '../skills/sk21-onboarding-qa.js';

export async function recallContext(
  taskDescription: string,
  knowledgeEntries: KnowledgeEntry[]
): Promise<RecalledEntry[]> {
  // SK-20: Recall relevant knowledge for the task
  return await recallKnowledge({ taskDescription, knowledgeEntries });
}

export async function answerOnboardingQuestionAgent(params: {
  question: string;
  productArea: string;
  knowledgeEntries: OnboardingKnowledgeEntry[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}): Promise<void> {
  // SK-21: Answer PM onboarding question using knowledge base
  await answerOnboardingQuestion({
    question: params.question,
    productArea: params.productArea,
    knowledgeEntries: params.knowledgeEntries,
    onChunk: params.onChunk,
    onDone: params.onDone,
  });
}

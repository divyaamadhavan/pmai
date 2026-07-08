import { stream } from '../orchestration/llmGateway.js';
import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface OnboardingKnowledgeEntry {
  content: string;
  source: string;
  date: string;
}

export interface OnboardingQAInput {
  question: string;
  productArea: string;
  knowledgeEntries: OnboardingKnowledgeEntry[];
  onChunk: (text: string) => void;
  onDone?: () => void;
}

export interface OnboardingQAOutput {
  answer: string;
  citations: Array<{ source: string; date: string }>;
  followUpQuestions: string[];
}

interface CitationsAndFollowUps {
  citations: Array<{ source: string; date: string }>;
  followUpQuestions: string[];
}

export async function answerOnboardingQuestion(
  input: OnboardingQAInput
): Promise<OnboardingQAOutput> {
  const scrubbedQuestion = scrubPII(input.question);
  const scrubbedArea = scrubPII(input.productArea);

  const scrubbedEntries = input.knowledgeEntries.map((entry) => ({
    content: scrubPII(entry.content),
    source: entry.source,
    date: entry.date,
  }));

  const system = prompts['SK-21']({ productArea: scrubbedArea });

  const knowledgeBlock = scrubbedEntries
    .map(
      (e, i) =>
        `[${i + 1}] Source: ${e.source} (${e.date})\n${e.content}`
    )
    .join('\n\n');

  const userContent = [
    `## Knowledge Base\n${knowledgeBlock}`,
    `## Question\n${scrubbedQuestion}`,
    'Please answer the question based on the knowledge base above. Cite your sources by number.',
  ].join('\n\n');

  // Stream the answer
  const answer = await stream({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 2048,
    onChunk: input.onChunk,
    onDone: input.onDone,
  });

  // Extract structured citations and follow-up questions
  const citationResult = await structured<CitationsAndFollowUps>({
    system: 'You extract citations and follow-up questions from a Q&A answer.',
    messages: [
      {
        role: 'user',
        content: `Extract the citations and suggest follow-up questions from this answer:\n\n${answer}\n\nAvailable sources:\n${scrubbedEntries.map((e) => `- ${e.source} (${e.date})`).join('\n')}`,
      },
    ],
    schemaName: 'citations_and_followups',
    schema: {
      type: 'object',
      properties: {
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              date: { type: 'string' },
            },
            required: ['source', 'date'],
          },
        },
        followUpQuestions: {
          type: 'array',
          items: { type: 'string' },
          description: '2-3 follow-up questions the PM might want to explore',
        },
      },
      required: ['citations', 'followUpQuestions'],
    },
  });

  return {
    answer,
    citations: citationResult.citations,
    followUpQuestions: citationResult.followUpQuestions,
  };
}

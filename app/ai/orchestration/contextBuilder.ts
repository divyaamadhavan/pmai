import Anthropic from '@anthropic-ai/sdk';

export interface ContextInput {
  systemRole: string;
  orgTemplate?: string;
  knowledgeBaseExcerpts?: Array<{
    content: string;
    source: string;
    relevance: string;
  }>;
  userInput: string;
  priorDocumentState?: string;
  feedbackThemes?: string[];
}

export function buildContext(input: ContextInput): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [input.systemRole];

  if (input.orgTemplate) {
    systemParts.push(
      `\n## Organisation Template\nFollow this template structure for all generated documents:\n${input.orgTemplate}`
    );
  }

  if (input.knowledgeBaseExcerpts && input.knowledgeBaseExcerpts.length > 0) {
    const excerptLines = input.knowledgeBaseExcerpts
      .map(
        (e, i) =>
          `[${i + 1}] Source: ${e.source} (Relevance: ${e.relevance})\n${e.content}`
      )
      .join('\n\n');
    systemParts.push(`\n## Relevant Knowledge Base Excerpts\n${excerptLines}`);
  }

  if (input.feedbackThemes && input.feedbackThemes.length > 0) {
    const themeList = input.feedbackThemes
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n');
    systemParts.push(`\n## Current Feedback Themes\n${themeList}`);
  }

  const system = systemParts.join('\n');

  const userContent: string[] = [];

  if (input.priorDocumentState) {
    userContent.push(
      `## Prior Document State\n${input.priorDocumentState}\n\n---\n`
    );
  }

  userContent.push(input.userInput);

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userContent.join('\n'),
    },
  ];

  return { system, messages };
}

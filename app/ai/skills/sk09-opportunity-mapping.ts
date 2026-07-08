import { structured } from '../orchestration/llmGateway.js';
import { scrubPII } from '../orchestration/piiScrubber.js';
import { prompts } from '../orchestration/promptEngine.js';
import type { FeedbackTheme, Opportunity } from './types.js';

export interface OpportunityMappingInput {
  themes: FeedbackTheme[];
  businessGoals?: string[];
}

interface LLMOpportunityResult {
  opportunities: Array<{
    id: string;
    name: string;
    userProblem: string;
    feedbackCount: number;
    quotes: string[];
    frequency: string;
    severity: string;
  }>;
}

export async function mapOpportunities(
  input: OpportunityMappingInput
): Promise<{ opportunities: Opportunity[] }> {
  const scrubbedThemes = input.themes.map((theme) => ({
    ...theme,
    description: scrubPII(theme.description),
    quotes: theme.quotes.map((q) => scrubPII(q)),
  }));

  const scrubbedGoals = input.businessGoals?.map((g) => scrubPII(g));

  const system = prompts['SK-09']();

  const userParts = [
    `Feedback Themes (${scrubbedThemes.length}):\n${JSON.stringify(scrubbedThemes, null, 2)}`,
  ];

  if (scrubbedGoals && scrubbedGoals.length > 0) {
    userParts.push(
      `Business Goals:\n${scrubbedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
    );
  }

  userParts.push(
    'Map these themes to product opportunities. Each opportunity should address one or more related themes.'
  );

  const result = await structured<LLMOpportunityResult>({
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    schemaName: 'opportunity_mapping_result',
    schema: {
      type: 'object',
      properties: {
        opportunities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              userProblem: { type: 'string' },
              feedbackCount: { type: 'number' },
              quotes: { type: 'array', items: { type: 'string' } },
              frequency: { type: 'string' },
              severity: { type: 'string' },
            },
            required: [
              'id',
              'name',
              'userProblem',
              'feedbackCount',
              'quotes',
              'frequency',
              'severity',
            ],
          },
        },
      },
      required: ['opportunities'],
    },
  });

  return { opportunities: result.opportunities };
}

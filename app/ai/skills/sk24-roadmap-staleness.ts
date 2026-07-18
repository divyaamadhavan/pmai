import { structured } from '../orchestration/llmGateway.js';
import { prompts } from '../orchestration/promptEngine.js';

export interface RoadmapHealthItem {
  id: string;
  title: string;
  description: string;
  status: string;
  addedAt: string;          // ISO date
  lastUpdatedAt: string;    // ISO date
  linkedSprintTickets: string[];
  linkedThemeCount: number;
}

export type StalenessRisk = 'Critical' | 'High' | 'Medium' | 'Low';

export interface StalenessReport {
  itemId: string;
  title: string;
  daysWithoutActivity: number;
  daysWithoutSprintTicket: number;
  stalenessRisk: StalenessRisk;
  recommendation: 'Create Sprint Ticket' | 'Reassess Priority' | 'Archive' | 'Needs Owner' | 'OK';
  actionPrompt: string;
  blockers: string[];
}

export interface RoadmapHealthOutput {
  reports: StalenessReport[];
  staleItemCount: number;             // items > 30 days without sprint ticket
  criticalCount: number;
  healthScore: number;                // 0–100 (100 = all items healthy)
  topRecommendations: string[];
}

interface LLMRoadmapHealthResult {
  reports: StalenessReport[];
  staleItemCount: number;
  criticalCount: number;
  healthScore: number;
  topRecommendations: string[];;
}

export async function analyzeRoadmapHealth(
  items: RoadmapHealthItem[],
  staleThresholdDays = 30
): Promise<RoadmapHealthOutput> {
  const now = new Date();
  const enriched = items.map((item) => {
    const addedMs = new Date(item.addedAt).getTime();
    const updatedMs = new Date(item.lastUpdatedAt).getTime();
    const daysWithoutActivity = Math.floor((now.getTime() - updatedMs) / 86_400_000);
    const daysOnRoadmap = Math.floor((now.getTime() - addedMs) / 86_400_000);
    return { ...item, daysWithoutActivity, daysOnRoadmap };
  });

  const system = prompts['SK-24']({ staleThresholdDays });

  const result = await structured<LLMRoadmapHealthResult>({
    system,
    messages: [
      {
        role: 'user',
        content: `Analyse roadmap health for the following ${enriched.length} items. Flag anything without a sprint ticket for more than ${staleThresholdDays} days:\n\n${JSON.stringify(enriched, null, 2)}`,
      },
    ],
    schemaName: 'roadmap_health_result',
    schema: {
      type: 'object',
      properties: {
        reports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              title: { type: 'string' },
              daysWithoutActivity: { type: 'number' },
              daysWithoutSprintTicket: { type: 'number' },
              stalenessRisk: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
              recommendation: { type: 'string', enum: ['Create Sprint Ticket', 'Reassess Priority', 'Archive', 'Needs Owner', 'OK'] },
              actionPrompt: { type: 'string' },
              blockers: { type: 'array', items: { type: 'string' } },
            },
            required: ['itemId', 'title', 'daysWithoutActivity', 'daysWithoutSprintTicket', 'stalenessRisk', 'recommendation', 'actionPrompt', 'blockers'],
          },
        },
        staleItemCount: { type: 'number' },
        criticalCount: { type: 'number' },
        healthScore: { type: 'number', minimum: 0, maximum: 100 },
        topRecommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['reports', 'staleItemCount', 'criticalCount', 'healthScore', 'topRecommendations'],
    },
  });

  return result;
}

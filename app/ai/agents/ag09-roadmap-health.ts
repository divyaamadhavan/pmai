import { analyzeRoadmapHealth } from '../skills/sk24-roadmap-staleness.js';
import type { RoadmapHealthItem, RoadmapHealthOutput } from '../skills/sk24-roadmap-staleness.js';

export interface RoadmapHealthAgentParams {
  items: RoadmapHealthItem[];
  staleThresholdDays?: number;
  onProgress?: (step: string) => void;
}

export interface RoadmapHealthAgentOutput extends RoadmapHealthOutput {
  alertSummary: string;
  itemsNeedingTicket: string[];   // titles of items needing a sprint ticket
  itemsToArchive: string[];
}

export async function runRoadmapHealthAgent(
  params: RoadmapHealthAgentParams
): Promise<RoadmapHealthAgentOutput> {
  const { onProgress } = params;
  const threshold = params.staleThresholdDays ?? 30;

  onProgress?.(`Scanning roadmap for items stale beyond ${threshold} days...`);
  const healthReport = await analyzeRoadmapHealth(params.items, threshold);

  const itemsNeedingTicket = healthReport.reports
    .filter((r) => r.recommendation === 'Create Sprint Ticket')
    .map((r) => r.title);

  const itemsToArchive = healthReport.reports
    .filter((r) => r.recommendation === 'Archive')
    .map((r) => r.title);

  const alertSummary =
    healthReport.criticalCount > 0
      ? `⚠ ${healthReport.criticalCount} critical item(s) have been on the roadmap for over ${threshold} days with no sprint ticket. Immediate action required.`
      : healthReport.staleItemCount > 0
      ? `${healthReport.staleItemCount} roadmap item(s) are stale. Review recommended.`
      : 'Roadmap is healthy — all items have recent activity or sprint coverage.';

  onProgress?.('Roadmap health scan complete.');

  return {
    ...healthReport,
    alertSummary,
    itemsNeedingTicket,
    itemsToArchive,
  };
}

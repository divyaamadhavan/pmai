export interface FeedbackItem {
  id: string;
  text: string;
  channel: string;
  timestamp: string;
  userId?: string;
}

export interface FeedbackTheme {
  id: string;
  name: string;
  description: string;
  count: number;
  quotes: string[];
  severity: 'Low' | 'Medium' | 'High';
  trend: 'Growing' | 'Stable' | 'Declining';
}

export interface Opportunity {
  id: string;
  name: string;
  userProblem: string;
  feedbackCount: number;
  quotes: string[];
  frequency: string;
  severity: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  linkedThemes?: FeedbackTheme[];
  priorityScore?: number;
}

export interface SprintTicket {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  storyPoints: number;
  dependencies: string[];
}

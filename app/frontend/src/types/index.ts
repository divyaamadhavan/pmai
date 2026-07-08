export type UserRole = 'PM' | 'Product Leader' | 'Scrum Master';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  tenantId: string;
  productAreaId?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  plan: 'starter' | 'growth' | 'enterprise';
  integrations: string[];
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface FeedbackItem {
  id: string;
  source: 'zendesk' | 'intercom' | 'nps' | 'app_store' | 'gong';
  content: string;
  sentiment: SentimentLabel;
  themes: string[];
  isDuplicate: boolean;
  createdAt: string;
  customerName?: string;
  customerSegment?: string;
}

export interface FeedbackTheme {
  id: string;
  name: string;
  count: number;
  sentiment: SentimentLabel;
  feedbackIds: string[];
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  given: string;
  when: string;
  then: string;
}

export interface UserStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  storyPoints?: number;
  acceptanceCriteria: AcceptanceCriteria[];
}

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface Document {
  id: string;
  type: 'prd' | 'user_stories' | 'acceptance_criteria';
  title: string;
  status: 'draft' | 'review' | 'approved';
  sections: DocumentSection[];
  linkedThemes: string[];
  createdAt: string;
  updatedAt: string;
  authorId: string;
}

export type RoadmapStatus = 'backlog' | 'planning' | 'committed' | 'in_progress' | 'done';

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  evidenceScore: number;
  linkedThemes: string[];
  linkedFeedbackCount: number;
  quarter?: string;
  justification?: string;
  effort: 'S' | 'M' | 'L' | 'XL';
  impact: 'low' | 'medium' | 'high';
}

export type TicketFlag = 'MISSING_AC' | 'TOO_LARGE' | 'AMBIGUOUS';

export interface SprintTicket {
  id: string;
  title: string;
  description: string;
  storyPoints: number;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  assignee?: string;
  dependencies: string[];
  flags: TicketFlag[];
  roadmapItemId?: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
  tickets: SprintTicket[];
  velocity?: number;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string;
  sourceType: 'confluence' | 'notion' | 'gdrive' | 'slack' | 'manual';
  tags: string[];
  createdAt: string;
  relevanceScore?: number;
  relevanceExplanation?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  problem: string;
  feedbackCount: number;
  quotes: string[];
  themes: string[];
  affectedSegments: string[];
  opportunityScore: number;
}

export interface InsightReport {
  id: string;
  audience: 'Engineering' | 'CPO' | 'Sales';
  summary: string;
  opportunities: Opportunity[];
  generatedAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'feedback_synced' | 'prd_created' | 'roadmap_updated' | 'sprint_started' | 'insight_generated';
  description: string;
  timestamp: string;
  userId: string;
  userName: string;
}

export interface DashboardStats {
  totalFeedback: number;
  topThemes: FeedbackTheme[];
  openPRDs: number;
  sprintProgress: number;
  recentActivity: ActivityItem[];
}

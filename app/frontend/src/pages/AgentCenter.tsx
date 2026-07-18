import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bot, Radio, GitMerge, Heart, Dumbbell, FileCode2,
  Play, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp,
  Zap, TrendingUp, Shield,
} from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import { useAgentStatus } from '../contexts/AgentStatusContext';
import { apiClient } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'running' | 'done' | 'error';

interface AgentState {
  status: AgentStatus;
  lastRun?: string;
  result?: Record<string, unknown>;
  error?: string;
  expanded: boolean;
}

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS = [
  {
    id: 'feedback-monitor',
    num: '07',
    label: 'Feedback Monitor',
    tagline: 'Classify & score every incoming feedback automatically',
    icon: Radio,
    color: '#00d4ff',
    skills: ['SK-03 Noise Filter', 'SK-01 Deduplication', 'SK-22 Classification & Scoring'],
    trigger: 'On new feedback arrival',
    outputKeys: ['totalReceived', 'totalActionable', 'criticalItems', 'highItems'],
    endpoint: '/api/agents/feedback-monitor',
    defaultBody: (scope: string) => ({ productScope: scope }),
    resultSummary: (r: Record<string, unknown>) =>
      `${r.totalActionable ?? 0} actionable items — ${(r.criticalItems as unknown[])?.length ?? 0} critical, ${(r.highItems as unknown[])?.length ?? 0} high priority`,
  },
  {
    id: 'triage',
    num: '08',
    label: 'Triage',
    tagline: 'Engineering Head + PM + Business vote on every feedback item',
    icon: GitMerge,
    color: '#ffee00',
    skills: ['SK-22 Classification', 'SK-23 Multi-Stakeholder Triage'],
    trigger: 'After feedback classification',
    outputKeys: ['movedToBacklog', 'monitored', 'rejected', 'escalated'],
    endpoint: '/api/agents/triage',
    defaultBody: (scope: string) => ({ productScope: scope }),
    resultSummary: (r: Record<string, unknown>) =>
      `Backlog: ${r.movedToBacklog ?? 0} · Monitor: ${r.monitored ?? 0} · Escalate: ${r.escalated ?? 0} · Reject: ${r.rejected ?? 0}`,
  },
  {
    id: 'roadmap-health',
    num: '09',
    label: 'Roadmap Health',
    tagline: 'Flag items without a sprint ticket for more than 30 days',
    icon: Shield,
    color: '#ff2d8b',
    skills: ['SK-24 Roadmap Staleness Detection'],
    trigger: 'Daily scan',
    outputKeys: ['healthScore', 'staleItemCount', 'criticalCount'],
    endpoint: '/api/agents/roadmap-health',
    defaultBody: () => ({ staleThresholdDays: 30 }),
    resultSummary: (r: Record<string, unknown>) =>
      `Health: ${r.healthScore ?? '—'}/100 · ${r.staleItemCount ?? 0} stale · ${r.criticalCount ?? 0} critical`,
  },
  {
    id: 'customer-pulse',
    num: '10',
    label: 'Customer Pulse',
    tagline: 'Identify gaps between what customers need and what is being built',
    icon: Heart,
    color: '#00ff88',
    skills: ['SK-02 Theme Detection', 'SK-25 Customer Gap Analysis'],
    trigger: 'Weekly / on roadmap change',
    outputKeys: ['coverageScore', 'criticalGapCount', 'totalFeedbackUnaddressed', 'alertLevel'],
    endpoint: '/api/agents/customer-pulse',
    defaultBody: () => ({}),
    resultSummary: (r: Record<string, unknown>) =>
      `Coverage: ${r.coverageScore ?? '—'}/100 · ${r.criticalGapCount ?? 0} critical gaps · Alert: ${r.alertLevel ?? '—'}`,
  },
  {
    id: 'sprint-coach',
    num: '11',
    label: 'Sprint Coach',
    tagline: 'Keep sprint tickets healthy — AC, grooming age, sizing & owners',
    icon: Dumbbell,
    color: '#a855f7',
    skills: ['SK-26 Sprint Hygiene', 'SK-19 Backlog Grooming'],
    trigger: 'Before sprint planning',
    outputKeys: ['sprintReadinessScore', 'readyForSprint', 'needsWork'],
    endpoint: '/api/agents/sprint-coach',
    defaultBody: () => ({ sprintGoal: 'Improve core user flow', storyPointCeiling: 40 }),
    resultSummary: (r: Record<string, unknown>) =>
      `Readiness: ${r.sprintReadinessScore ?? '—'}/100 · Ready: ${(r.readyForSprint as unknown[])?.length ?? 0} · Needs work: ${(r.needsWork as unknown[])?.length ?? 0}`,
  },
  {
    id: 'prd-drafter',
    num: '12',
    label: 'PRD Drafter',
    tagline: 'Auto-draft a PRD when a roadmap item moves to "Planned"',
    icon: FileCode2,
    color: '#fb923c',
    skills: ['SK-12 Feature-Theme Linkage', 'SK-27 PRD Auto-Draft'],
    trigger: 'Roadmap item → Planned',
    outputKeys: ['title', 'linkedThemeCount', 'generatedAt'],
    endpoint: '/api/agents/prd-drafter',
    defaultBody: (scope: string) => ({ productScope: scope }),
    resultSummary: (r: Record<string, unknown>) =>
      r.title ? `"${r.title}" · ${r.linkedThemeCount ?? 0} themes linked · ${r.generatedAt ? new Date(r.generatedAt as string).toLocaleString() : ''}` : 'No output yet',
  },
] as const;

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, lastRun }: { status: AgentStatus; lastRun?: string }) {
  const cfg = {
    idle:    { icon: Clock,         color: 'rgba(148,163,184,0.5)', label: 'Idle' },
    running: { icon: Zap,           color: '#00d4ff',               label: 'Running…' },
    done:    { icon: CheckCircle2,  color: '#00ff88',               label: 'Done' },
    error:   { icon: AlertTriangle, color: '#ff2d8b',               label: 'Error' },
  }[status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
      {lastRun && status !== 'running' && (
        <span className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>
          · {new Date(lastRun).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// ─── Result renderer ──────────────────────────────────────────────────────────

function ResultPanel({ result, agent, color }: {
  result: Record<string, unknown>;
  agent: typeof AGENTS[number];
  color: string;
}) {
  const summary = agent.resultSummary(result);

  // For triage: show stakeholder breakdown
  const triageResults = result.results as Array<{
    feedbackId: string;
    feedbackSummary: string;
    finalDecision: string;
    consensusRationale: string;
    stakeholderVotes: Array<{ role: string; recommendation: string; rationale: string }>;
  }> | undefined;

  // For roadmap health: show stale items
  const reports = result.reports as Array<{
    title: string;
    daysWithoutSprintTicket: number;
    stalenessRisk: string;
    recommendation: string;
    actionPrompt: string;
  }> | undefined;

  // For customer pulse: show top gaps
  const gaps = result.gaps as Array<{
    title: string;
    gapType: string;
    severity: string;
    recommendation: string;
    coveragePercent: number;
  }> | undefined;

  // For sprint coach: coaching notes
  const coachSummary = result.coachSummary as string | undefined;
  const hygiene = result.hygiene as { coachingNotes?: string[]; topFixActions?: string[] } | undefined;

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(2,2,18,0.8)', border: `1px solid ${color}20` }}>
      <p className="text-xs font-semibold mb-2" style={{ color }}>Latest Result</p>
      <p className="text-xs mb-3" style={{ color: 'rgba(226,232,240,0.7)' }}>{summary}</p>

      {/* Triage breakdown */}
      {triageResults && triageResults.length > 0 && (
        <div className="space-y-2">
          {triageResults.slice(0, 3).map((r) => (
            <div key={r.feedbackId} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium truncate flex-1" style={{ color: 'rgba(226,232,240,0.8)' }}>{r.feedbackSummary}</p>
                <span className="ml-2 shrink-0 text-xs font-semibold"
                  style={{
                    color: r.finalDecision === 'Move to Backlog' ? '#00ff88' : r.finalDecision === 'Escalate' ? '#ff2d8b' : 'rgba(148,163,184,0.7)',
                  }}>
                  {r.finalDecision}
                </span>
              </div>
              <div className="flex gap-2">
                {r.stakeholderVotes.map((v) => (
                  <span key={v.role} className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>
                    {v.role.split(' ')[0]}: <span style={{ color: 'rgba(226,232,240,0.5)' }}>{v.recommendation.split(' ')[0]}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {triageResults.length > 3 && (
            <p className="text-xs" style={{ color: 'rgba(100,116,139,0.4)' }}>+{triageResults.length - 3} more items</p>
          )}
        </div>
      )}

      {/* Roadmap stale items */}
      {reports && reports.length > 0 && (
        <div className="space-y-2">
          {reports.filter((r) => r.stalenessRisk !== 'Low').slice(0, 4).map((r, i) => (
            <div key={i} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium truncate flex-1" style={{ color: 'rgba(226,232,240,0.8)' }}>{r.title}</p>
                <span className="ml-2 shrink-0 text-xs font-bold"
                  style={{ color: r.stalenessRisk === 'Critical' ? '#ff2d8b' : r.stalenessRisk === 'High' ? '#fb923c' : '#ffee00' }}>
                  {r.stalenessRisk}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{r.actionPrompt}</p>
            </div>
          ))}
        </div>
      )}

      {/* Customer gaps */}
      {gaps && gaps.length > 0 && (
        <div className="space-y-2">
          {gaps.filter((g) => g.severity !== 'Low').slice(0, 3).map((g, i) => (
            <div key={i} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium truncate flex-1" style={{ color: 'rgba(226,232,240,0.8)' }}>{g.title}</p>
                <span className="ml-2 shrink-0 text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{g.coveragePercent}% covered</span>
              </div>
              <p className="text-xs truncate" style={{ color: 'rgba(100,116,139,0.6)' }}>{g.recommendation}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sprint coach summary */}
      {coachSummary && (
        <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs" style={{ color: 'rgba(226,232,240,0.7)' }}>{coachSummary}</p>
          {hygiene?.topFixActions && hygiene.topFixActions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {hygiene.topFixActions.slice(0, 3).map((action, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'rgba(100,116,139,0.7)' }}>
                  <span style={{ color: '#a855f7', marginTop: '2px' }}>›</span>
                  {action}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Executive summary for customer pulse */}
      {result.executiveSummary && (
        <p className="text-xs mt-2" style={{ color: 'rgba(100,116,139,0.7)' }}>{result.executiveSummary as string}</p>
      )}

      {/* Alert summary for roadmap health */}
      {result.alertSummary && (
        <p className="text-xs mt-2 font-medium" style={{ color: (result.criticalCount as number) > 0 ? '#ff2d8b' : 'rgba(226,232,240,0.6)' }}>
          {result.alertSummary as string}
        </p>
      )}
    </div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  state,
  onRun,
  onToggle,
}: {
  agent: typeof AGENTS[number];
  state: AgentState;
  onRun: () => void;
  onToggle: () => void;
}) {
  const Icon = agent.icon;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(10,10,36,0.95), rgba(6,6,26,0.95))',
        border: `1px solid ${agent.color}20`,
        boxShadow: state.status === 'running' ? `0 0 24px ${agent.color}20` : 'none',
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${agent.color}12`, border: `1px solid ${agent.color}30` }}
          >
            <Icon className="h-5 w-5" style={{ color: agent.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono" style={{ color: `${agent.color}60` }}>AG-{agent.num}</span>
              <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{agent.label}</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(100,116,139,0.6)' }}>{agent.tagline}</p>
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={state.status === 'running'}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: state.status === 'running' ? `${agent.color}08` : `${agent.color}15`,
            border: `1px solid ${agent.color}${state.status === 'running' ? '20' : '40'}`,
            color: state.status === 'running' ? `${agent.color}60` : agent.color,
            cursor: state.status === 'running' ? 'not-allowed' : 'pointer',
          }}
        >
          <Play className="h-3 w-3" />
          {state.status === 'running' ? 'Running' : 'Run'}
        </button>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between">
        <StatusBadge status={state.status} lastRun={state.lastRun} />
        <span className="text-xs" style={{ color: 'rgba(100,116,139,0.4)' }}>
          Trigger: {agent.trigger}
        </span>
      </div>

      {/* Skills — plain text labels, not interactive */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {agent.skills.map((skill) => (
          <span
            key={skill}
            className="text-xs"
            style={{ color: `${agent.color}60` }}
          >
            · {skill}
          </span>
        ))}
      </div>

      {/* Error */}
      {state.status === 'error' && state.error && (
        <p className="text-xs rounded p-2" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
          {state.error}
        </p>
      )}

      {/* Result panel */}
      {state.status === 'done' && state.result && (
        <>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-xs"
            style={{ color: `${agent.color}60` }}
          >
            {state.expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {state.expanded ? 'Hide result' : 'Show result'}
          </button>
          {state.expanded && (
            <ResultPanel result={state.result} agent={agent} color={agent.color} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Which query keys to invalidate after each agent writes back to the DB
const AGENT_INVALIDATIONS: Record<string, string[][]> = {
  'feedback-monitor': [['feedback', 'new'], ['feedback', 'addressed']],
  'triage':           [['feedback-themes'], ['feedback-classifications']],
  'customer-pulse':   [['agent-pulse']],
  'roadmap-health':   [['roadmap']],
  'sprint-coach':     [['sprint']],
  'prd-drafter':      [['documents']],
};

export function AgentCenter() {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const { setAgentRunning, clearAgentRunning } = useAgentStatus();
  const productScope = activeProject?.name ?? 'General Product';

  const initialStates: Record<string, AgentState> = Object.fromEntries(
    AGENTS.map((a) => [a.id, { status: 'idle', expanded: true }])
  );
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>(initialStates);

  const setAgent = (id: string, patch: Partial<AgentState>) =>
    setAgentStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const runAgent = async (agent: typeof AGENTS[number]) => {
    setAgent(agent.id, { status: 'running', error: undefined });
    setAgentRunning(agent.label);

    try {
      const body = agent.defaultBody(productScope);
      const res = await apiClient.post<{ data: Record<string, unknown> }>(agent.endpoint, body);

      setAgent(agent.id, {
        status: 'done',
        lastRun: new Date().toISOString(),
        result: res.data.data,
        expanded: true,
      });

      // Invalidate relevant query caches so Feedback Hub / other pages show updated data immediately
      const keys = AGENT_INVALIDATIONS[agent.id] ?? [];
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } }; message?: string })
        ?.response?.data?.error?.message ?? (err as Error).message ?? 'Unknown error';
      setAgent(agent.id, { status: 'error', error: msg });
    } finally {
      clearAgentRunning();
    }
  };

  const runAll = async () => {
    for (const agent of AGENTS) {
      if (agentStates[agent.id]?.status !== 'running') {
        void runAgent(agent);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  const totalDone  = Object.values(agentStates).filter((s) => s.status === 'done').length;
  const totalError = Object.values(agentStates).filter((s) => s.status === 'error').length;
  const anyRunning = Object.values(agentStates).some((s) => s.status === 'running');

  return (
    <div className="min-h-full p-8" style={{ background: '#020212' }}>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(168,85,247,0.4)' }}>
            ◆ AUTONOMOUS AGENTS
          </p>
          <h1 className="text-3xl font-bold mb-1" style={{ color: '#e2e8f0' }}>
            Agent{' '}
            <span style={{ color: '#a855f7', textShadow: '0 0 20px rgba(168,85,247,0.4)' }}>Center</span>
          </h1>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
            6 intelligent agents keeping your product pipeline healthy · {productScope}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary chips */}
          {totalDone > 0 && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#00ff88' }} />
              <span className="text-xs font-medium" style={{ color: '#00ff88' }}>{totalDone} done</span>
            </div>
          )}
          {totalError > 0 && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)' }}>
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#ff2d8b' }} />
              <span className="text-xs font-medium" style={{ color: '#ff2d8b' }}>{totalError} error{totalError > 1 ? 's' : ''}</span>
            </div>
          )}

          <button
            onClick={runAll}
            disabled={anyRunning}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={{
              background: anyRunning ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.15)',
              border: `1px solid rgba(168,85,247,${anyRunning ? '0.2' : '0.4'})`,
              color: anyRunning ? 'rgba(168,85,247,0.4)' : '#a855f7',
              cursor: anyRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <TrendingUp className="h-4 w-4" />
            Run All Agents
          </button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            state={agentStates[agent.id]!}
            onRun={() => void runAgent(agent)}
            onToggle={() => setAgent(agent.id, { expanded: !agentStates[agent.id]?.expanded })}
          />
        ))}
      </div>

      {/* Footer info */}
      <div className="mt-8 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.6),rgba(6,6,26,0.6))', border: '1px solid rgba(168,85,247,0.08)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-4 w-4" style={{ color: 'rgba(168,85,247,0.5)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.4)' }}>About Agents</p>
        </div>
        <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>
          Agents combine multiple AI skills to perform autonomous PM workflows. They can be triggered manually here,
          or automatically via webhooks and scheduled jobs. Results are written back to their respective sections
          (Feedback Hub, Roadmap, Sprint Planner, Documents) for your review.
        </p>
      </div>
    </div>
  );
}

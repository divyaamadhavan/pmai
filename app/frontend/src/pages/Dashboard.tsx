import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Lightbulb, Map, Zap, FileText,
  ChevronRight, ArrowRight, Sparkles, BookOpen,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';

interface ApiTheme { id: string; name: string; item_count: number; }
interface ApiStats {
  feedback: { total: number; last30Days: number };
  sentiment: { positive: number; neutral: number; negative: number };
  topThemes: ApiTheme[];
  documents: { total: number };
}

// ─── Pipeline step definitions ────────────────────────────────────────────────

interface Step {
  num: number;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  path: string;
  cta: string;
  emptyCta: string;
  getValue: (s: ApiStats) => string | number;
  getSubtext: (s: ApiStats) => string;
  isEmpty: (s: ApiStats) => boolean;
}

const STEPS: Step[] = [
  {
    num: 1, label: 'Feedback Hub', sublabel: 'Collect & cluster', icon: MessageSquare,
    color: '#00d4ff', path: '/feedback', cta: 'View Feedback', emptyCta: 'Upload Feedback',
    getValue: (s) => s.feedback.total,
    getSubtext: (s) => s.feedback.last30Days > 0 ? `+${s.feedback.last30Days} last 30 days` : 'No recent feedback',
    isEmpty: (s) => s.feedback.total === 0,
  },
  {
    num: 2, label: 'Insights', sublabel: 'Analyse themes', icon: Lightbulb,
    color: '#ffee00', path: '/insights', cta: 'View Insights', emptyCta: 'Generate Insights',
    getValue: (s) => s.topThemes.length,
    getSubtext: (s) => s.topThemes.length > 0 ? `Top: ${s.topThemes[0]?.name ?? '—'}` : 'Awaiting feedback analysis',
    isEmpty: (s) => s.topThemes.length === 0,
  },
  {
    num: 3, label: 'Documents', sublabel: 'PRDs & specs', icon: FileText,
    color: '#00ff88', path: '/documents', cta: 'View Docs', emptyCta: 'Generate PRD',
    getValue: (s) => s.documents.total,
    getSubtext: (s) => s.documents.total > 0 ? `${s.documents.total} document${s.documents.total !== 1 ? 's' : ''} saved` : 'Generate PRD from insights',
    isEmpty: (s) => s.documents.total === 0,
  },
  {
    num: 4, label: 'Roadmap', sublabel: 'Prioritise work', icon: Map,
    color: '#ff2d8b', path: '/roadmap', cta: 'View Roadmap', emptyCta: 'Build Roadmap',
    getValue: (_s) => '—',
    getSubtext: (_s) => 'Evidence-backed priorities',
    isEmpty: (_s) => false,
  },
  {
    num: 5, label: 'Sprint Planner', sublabel: 'Plan & groom', icon: Zap,
    color: '#a855f7', path: '/sprint', cta: 'View Sprint', emptyCta: 'Create Sprint',
    getValue: (_s) => '—',
    getSubtext: (_s) => 'Tickets, grooming & brief',
    isEmpty: (_s) => false,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;

  const { data: stats, isLoading } = useQuery<ApiStats>({
    queryKey: ['dashboard-stats', projectId],
    queryFn: () => apiClient.get('/api/dashboard/stats', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data),
    retry: false,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const total = stats?.feedback.total ?? 0;
  const pos = stats?.sentiment.positive ?? 0;
  const neg = stats?.sentiment.negative ?? 0;
  const neu = stats?.sentiment.neutral ?? 0;

  return (
    <div className="min-h-full p-8" style={{ background: '#020212' }}>

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(0,212,255,0.4)' }}>
          ◆ WORKSPACE OVERVIEW
        </p>
        <h1 className="text-3xl font-bold mb-1" style={{ color: '#e2e8f0' }}>
          {greeting},{' '}
          <span style={{ color: '#00d4ff', textShadow: '0 0 20px rgba(0,212,255,0.4)' }}>
            {user?.name?.split(' ')[0]}
          </span>
        </h1>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
          Your end-to-end PM pipeline · {activeProject?.name ?? 'Select a project to begin'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* ── Pipeline Flow ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(0,212,255,0.4)' }}>PM Pipeline</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,212,255,0.08)' }} />
            </div>

            {/* Step cards + connecting arrows */}
            <div className="flex items-stretch gap-0">
              {STEPS.map((step, i) => {
                const empty = stats ? step.isEmpty(stats) : true;
                const value = stats ? step.getValue(stats) : '—';
                const subtext = stats ? step.getSubtext(stats) : '';
                const Icon = step.icon;

                return (
                  <div key={step.path} className="flex items-center gap-0 flex-1 min-w-0">
                    <Link
                      to={step.path}
                      className="group flex-1 flex flex-col rounded-xl p-4 transition-all hover:scale-[1.02] min-w-0"
                      style={{
                        background: 'linear-gradient(135deg, rgba(10,10,36,0.95), rgba(6,6,26,0.95))',
                        border: `1px solid ${step.color}20`,
                        boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
                        minHeight: '160px',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${step.color}50`; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px rgba(0,0,0,0.3), 0 0 20px ${step.color}10`; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${step.color}20`; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
                    >
                      {/* Step header */}
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                          style={{ background: `${step.color}15`, border: `1px solid ${step.color}35`, color: step.color }}
                        >
                          {step.num}
                        </div>
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `${step.color}10`, border: `1px solid ${step.color}20` }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: step.color }} />
                        </div>
                      </div>

                      {/* Metric */}
                      <div className="mb-1">
                        <p
                          className="text-2xl font-bold"
                          style={{ color: empty ? 'rgba(148,163,184,0.3)' : step.color, textShadow: empty ? 'none' : `0 0 15px ${step.color}50` }}
                        >
                          {value}
                        </p>
                      </div>

                      {/* Label */}
                      <p className="text-xs font-semibold mb-0.5" style={{ color: 'rgba(226,232,240,0.8)' }}>{step.label}</p>
                      <p className="text-xs leading-tight flex-1" style={{ color: 'rgba(100,116,139,0.6)', fontSize: '10px' }}>{subtext}</p>

                      {/* CTA */}
                      <div
                        className="mt-3 flex items-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: step.color }}
                      >
                        {empty ? step.emptyCta : step.cta}
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </Link>

                    {/* Arrow connector */}
                    {i < STEPS.length - 1 && (
                      <div className="flex flex-col items-center justify-center px-1 shrink-0" style={{ height: '160px' }}>
                        <ChevronRight className="h-4 w-4" style={{ color: 'rgba(0,212,255,0.15)' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Bottom row: Sentiment + Themes + Quick actions ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

            {/* Sentiment */}
            <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.12)' }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(0,212,255,0.4)' }}>Sentiment</p>
              {total === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(100,116,139,0.5)' }}>Upload feedback to see sentiment</p>
              ) : (
                <>
                  <div className="flex gap-4 text-xs mb-3">
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-lg font-bold" style={{ color: '#00ff88' }}>{pos}</span>
                      <span style={{ color: 'rgba(148,163,184,0.5)' }}>Positive</span>
                    </span>
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-lg font-bold" style={{ color: 'rgba(148,163,184,0.6)' }}>{neu}</span>
                      <span style={{ color: 'rgba(148,163,184,0.5)' }}>Neutral</span>
                    </span>
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-lg font-bold" style={{ color: '#ff2d8b' }}>{neg}</span>
                      <span style={{ color: 'rgba(148,163,184,0.5)' }}>Negative</span>
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${(pos / total) * 100}%`, background: 'linear-gradient(90deg,#00ff88,#00d4ff)', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(neu / total) * 100}%`, background: 'rgba(148,163,184,0.3)' }} />
                    <div style={{ width: `${(neg / total) * 100}%`, background: 'linear-gradient(90deg,#ff2d8b,#a855f7)', transition: 'width 0.5s' }} />
                  </div>
                  <p className="text-xs mt-2 text-right" style={{ color: 'rgba(100,116,139,0.5)' }}>
                    {Math.round((pos / total) * 100)}% positive rate
                  </p>
                </>
              )}
            </div>

            {/* Top themes */}
            <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(168,85,247,0.12)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(168,85,247,0.5)' }}>Top Themes</p>
                <Link to="/feedback" className="text-xs" style={{ color: 'rgba(168,85,247,0.5)' }}>View all →</Link>
              </div>
              {!stats?.topThemes.length ? (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(100,116,139,0.5)' }}>No themes yet — upload feedback</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.topThemes.slice(0, 4).map((theme, i) => {
                    const colors = ['#00d4ff', '#a855f7', '#00ff88', '#ff2d8b'];
                    const c = colors[i % colors.length];
                    const pct = Math.min(100, (theme.item_count / (stats.topThemes[0]?.item_count ?? 1)) * 100);
                    return (
                      <div key={theme.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs truncate flex-1" style={{ color: 'rgba(226,232,240,0.7)' }}>{theme.name}</span>
                          <span className="text-xs font-bold ml-2 shrink-0" style={{ color: c }}>{theme.item_count}</span>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: c, boxShadow: `0 0 4px ${c}80` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick jump */}
            <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,255,136,0.1)' }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(0,255,136,0.4)' }}>Quick Jump</p>
              <div className="space-y-2">
                {[
                  { to: '/feedback',  label: 'Upload Feedback',   color: '#00d4ff', icon: MessageSquare },
                  { to: '/insights',  label: 'Generate Insights', color: '#ffee00', icon: Sparkles },
                  { to: '/documents', label: 'Generate PRD',      color: '#00ff88', icon: FileText },
                  { to: '/roadmap',   label: 'Update Roadmap',    color: '#ff2d8b', icon: Map },
                  { to: '/sprint',    label: 'Plan Sprint',       color: '#a855f7', icon: Zap },
                  { to: '/knowledge', label: 'Knowledge Base',    color: '#a855f7', icon: BookOpen },
                ].map((a) => (
                  <Link
                    key={a.to}
                    to={a.to}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:translate-x-0.5"
                    style={{ background: `${a.color}08`, border: `1px solid ${a.color}18`, color: a.color }}
                  >
                    <a.icon className="h-3.5 w-3.5 shrink-0" />
                    {a.label}
                    <ArrowRight className="h-3 w-3 ml-auto opacity-40" />
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, FileText, LayoutGrid, Zap, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { fetchSSEPost } from '../lib/api';
import { useAgentStatus } from '../contexts/AgentStatusContext';

interface Theme { name: string; count: number; }
interface ProposedItem { title: string; description?: string; priority?: number; type?: string; points?: number; }

export interface PipelinePreview {
  themes: Theme[];
  proposedPRD: { title: string; overview: string };
  proposedUserStories: Array<{ title: string }>;
  proposedRoadmapItems: Array<{ title: string; description: string; priority: number }>;
  proposedSprintName: string;
  proposedTickets: Array<{ title: string; type: string; points: number }>;
}

interface Props {
  preview: PipelinePreview;
  themes: string[];
  themeCounts: number[];
  themeEvidence: string[];
  feedbackCount: number;
  productAreaId?: string | null;
  onClose: () => void;
  onCommitted: () => void;
}

type ProgressStep = { step: string; message: string };

const STEP_ORDER = ['themes', 'opportunities', 'prd', 'user_stories', 'acceptance_criteria', 'roadmap', 'sprint', 'done'];

const STEP_LABEL: Record<string, string> = {
  themes: 'Storing themes',
  opportunities: 'Creating opportunities',
  prd: 'Generating PRD',
  user_stories: 'Generating User Stories',
  acceptance_criteria: 'Generating Acceptance Criteria',
  roadmap: 'Creating Roadmap items',
  sprint: 'Creating Sprint & tickets',
  done: 'Complete!',
};

function Section({ title, color, icon: Icon, items, expanded, onToggle }: {
  title: string; color: string; icon: React.FC<{ className?: string }>;
  items: ProposedItem[]; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ border: `1px solid ${color}20`, background: 'rgba(10,10,36,0.7)' }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ borderBottom: expanded ? `1px solid ${color}15` : 'none' }}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{title}</span>
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>{items.length}</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" style={{ color: 'rgba(148,163,184,0.5)' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'rgba(148,163,184,0.5)' }} />}
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, marginTop: '6px' }} />
              <div>
                <p className="text-xs font-medium" style={{ color: 'rgba(226,232,240,0.85)' }}>{item.title}</p>
                {item.description && <p className="text-xs mt-0.5" style={{ color: 'rgba(100,116,139,0.7)' }}>{item.description}</p>}
                {item.points && <span className="text-xs" style={{ color: `${color}99` }}>{item.points} pts · {item.type}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineApprovalModal({ preview, themes, themeCounts, themeEvidence, feedbackCount, productAreaId, onClose, onCommitted }: Props) {
  const { setAgentRunning, clearAgentRunning } = useAgentStatus();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ prd: true });
  const [prdTitle, setPrdTitle] = useState(preview.proposedPRD.title);
  const [sprintName, setSprintName] = useState(preview.proposedSprintName);
  const [isCommitting, setIsCommitting] = useState(false);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const progressEndRef = useRef<HTMLDivElement>(null);

  const completedSteps = new Set(progress.map((p) => p.step));
  const lastStep = progress[progress.length - 1];
  const isDone = done || lastStep?.step === 'done';

  useEffect(() => { progressEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [progress]);

  const handleApprove = async () => {
    setIsCommitting(true);
    setProgress([]);
    setError('');
    setAgentRunning('Feedback Pipeline');

    await fetchSSEPost('/api/feedback/pipeline/commit', {
      themes,
      themeCounts,
      feedbackCount,
      productAreaId: productAreaId ?? null,
      prdTitle,
      sprintName,
    }, {
      onMessage: () => {},
      onEvent: (eventName: string, data: string) => {
        if (eventName === 'progress') {
          try { const p = JSON.parse(data); setProgress((prev) => [...prev, p]); } catch { /* ignore */ }
        } else if (eventName === 'done') {
          setDone(true);
          setIsCommitting(false);
          setTimeout(() => { onCommitted(); }, 1800);
        } else if (eventName === 'error') {
          setError(data); setIsCommitting(false);
        }
      },
      onDone: () => { setIsCommitting(false); clearAgentRunning(); },
      onError: () => { setError('Pipeline failed. Please try again.'); setIsCommitting(false); clearAgentRunning(); },
    }).catch((e: Error) => { setError(e.message); setIsCommitting(false); clearAgentRunning(); });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,2,18,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.98),rgba(6,6,26,0.98))', border: '1px solid rgba(0,212,255,0.2)', boxShadow: '0 0 60px rgba(0,212,255,0.08)' }}>

        {/* Top glow line */}
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg,transparent,#00d4ff,#a855f7,transparent)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}>
              <Sparkles className="h-4 w-4" style={{ color: '#00d4ff' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: '#e2e8f0' }}>Review AI Plan</h2>
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {feedbackCount} feedback item(s) · {themes.length} theme(s) detected
              </p>
            </div>
            {!isCommitting && !isDone && (
              <button onClick={onClose} className="ml-auto rounded-lg p-1.5 hover:bg-white/5 transition-all" style={{ color: 'rgba(148,163,184,0.5)' }}>
                <XCircle className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Detected themes with evidence */}
          <div className="mt-3 space-y-2">
            {themes.map((name, i) => (
              <div key={name} className="rounded-lg px-3 py-2" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#00d4ff' }}>{name}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-xs" style={{ background: 'rgba(0,212,255,0.12)', color: 'rgba(0,212,255,0.6)' }}>×{themeCounts[i]}</span>
                </div>
                {themeEvidence[i] && (
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)', fontStyle: 'italic' }}>
                    "{themeEvidence[i]}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!isCommitting && !isDone ? (
            <>
              <p className="text-xs mb-4" style={{ color: 'rgba(148,163,184,0.6)' }}>
                The AI will create the following artifacts. You can edit the titles below before approving.
              </p>

              {/* Editable titles */}
              <div className="mb-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.6)' }}>PRD Title</label>
                  <input
                    value={prdTitle}
                    onChange={(e) => setPrdTitle(e.target.value)}
                    className="input-neon w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.6)' }}>Sprint Name</label>
                  <input
                    value={sprintName}
                    onChange={(e) => setSprintName(e.target.value)}
                    className="input-neon w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <Section title="PRD + User Stories + AC" color="#00d4ff" icon={FileText}
                expanded={!!expanded['prd']} onToggle={() => setExpanded((e) => ({ ...e, prd: !e.prd }))}
                items={[
                  { title: prdTitle, description: preview.proposedPRD.overview },
                  ...preview.proposedUserStories.map((u) => ({ title: u.title })),
                ]} />

              <Section title="Roadmap Items" color="#a855f7" icon={LayoutGrid}
                expanded={!!expanded['roadmap']} onToggle={() => setExpanded((e) => ({ ...e, roadmap: !e.roadmap }))}
                items={preview.proposedRoadmapItems.map((r) => ({ title: r.title, description: r.description }))} />

              <Section title="Sprint Tickets" color="#00ff88" icon={Zap}
                expanded={!!expanded['sprint']} onToggle={() => setExpanded((e) => ({ ...e, sprint: !e.sprint }))}
                items={preview.proposedTickets.map((t) => ({ title: t.title, type: t.type, points: t.points }))} />
            </>
          ) : isDone ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(0,255,136,0.1)', border: '2px solid rgba(0,255,136,0.4)' }}>
                <CheckCircle className="h-8 w-8" style={{ color: '#00ff88', filter: 'drop-shadow(0 0 8px #00ff88)' }} />
              </div>
              <p className="text-lg font-bold mb-1" style={{ color: '#00ff88' }}>Pipeline Complete!</p>
              <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>
                PRD, User Stories, Acceptance Criteria, Roadmap & Sprint created successfully.
              </p>
              <p className="text-xs mt-2" style={{ color: 'rgba(100,116,139,0.5)' }}>Closing in a moment…</p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(0,212,255,0.6)' }}>Running pipeline…</p>
              <div className="space-y-2">
                {STEP_ORDER.filter((s) => s !== 'done').map((step) => {
                  const done = completedSteps.has(step);
                  const isActive = lastStep?.step === step && !isDone;
                  const msg = progress.find((p) => p.step === step)?.message;
                  return (
                    <div key={step} className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{ background: done ? 'rgba(0,255,136,0.05)' : isActive ? 'rgba(0,212,255,0.05)' : 'transparent', border: `1px solid ${done ? 'rgba(0,255,136,0.15)' : isActive ? 'rgba(0,212,255,0.15)' : 'transparent'}` }}>
                      {done ? (
                        <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#00ff88' }} />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: '#00d4ff' }} />
                      ) : (
                        <div className="h-4 w-4 shrink-0 rounded-full" style={{ border: '1px solid rgba(148,163,184,0.2)' }} />
                      )}
                      <div>
                        <p className="text-xs font-medium" style={{ color: done ? '#00ff88' : isActive ? '#00d4ff' : 'rgba(148,163,184,0.4)' }}>
                          {STEP_LABEL[step] ?? step}
                        </p>
                        {msg && <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{msg}</p>}
                      </div>
                    </div>
                  );
                })}
                <div ref={progressEndRef} />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isDone && (
          <div className="flex items-center gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}>
            {!isCommitting && (
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleApprove}
              disabled={isCommitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(168,85,247,0.2))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
            >
              {isCommitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Approve & Create All</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

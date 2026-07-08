import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, AlertTriangle, CalendarDays, Ticket, ChevronDown, Pencil, Flag, X, Save, Plus, ArrowRightLeft } from 'lucide-react';
import { apiClient } from '../lib/api';
import { Modal } from '../components/Modal';
import { StreamingText } from '../components/StreamingText';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';

interface ApiSprint { id: string; name: string; start_date: string; end_date: string; goal: string | null; status: string; }
interface ApiTicket {
  id: string; title: string; description: string | null; type: string; status: string;
  story_points: number | null; acceptance_criteria: string | null;
  needs_grooming: boolean; grooming_notes: string | null; sprint_id: string | null;
}

const STATUS_OPTIONS = [
  { id: 'todo',        label: 'To Do',       color: 'rgba(148,163,184,0.9)', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
  { id: 'in_progress', label: 'In Progress', color: '#00d4ff',               bg: 'rgba(0,212,255,0.08)',   border: 'rgba(0,212,255,0.25)' },
  { id: 'done',        label: 'Done',        color: '#00ff88',               bg: 'rgba(0,255,136,0.08)',   border: 'rgba(0,255,136,0.25)' },
  { id: 'blocked',     label: 'Blocked',     color: '#ff2d8b',               bg: 'rgba(255,45,139,0.08)', border: 'rgba(255,45,139,0.25)' },
];
const statusStyle: Record<string, { color: string; bg: string; border: string }> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.id, { color: s.color, bg: s.bg, border: s.border }])
);

function parseAC(raw: string | null): string[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [String(p)]; } catch { return [raw]; }
}

function TicketEditModal({ ticket, onClose, onSave }: {
  ticket: ApiTicket;
  onClose: () => void;
  onSave: (updates: Partial<ApiTicket>) => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [points, setPoints] = useState(String(ticket.story_points ?? 5));
  const [acText, setAcText] = useState(parseAC(ticket.acceptance_criteria).join('\n'));
  const [groomingNotes, setGroomingNotes] = useState(ticket.grooming_notes ?? '');
  const [needsGrooming, setNeedsGrooming] = useState(ticket.needs_grooming);

  const handleSave = () => {
    const acLines = acText.split('\n').map(l => l.trim()).filter(Boolean);
    onSave({
      title,
      description: description || null,
      story_points: parseInt(points) || null,
      acceptance_criteria: acLines.length ? JSON.stringify(acLines) : null,
      needs_grooming: needsGrooming,
      grooming_notes: groomingNotes || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,2,18,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.98),rgba(6,6,26,0.98))', border: '1px solid rgba(0,212,255,0.2)', boxShadow: '0 0 60px rgba(0,212,255,0.08)' }}>
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg,transparent,#00d4ff,#a855f7,transparent)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4" style={{ color: '#00d4ff' }} />
            <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Edit User Story</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/5 transition-all" style={{ color: 'rgba(148,163,184,0.5)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.6)' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-neon w-full rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.6)' }}>Description / Context</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Add more context, background, user impact…"
              className="input-neon w-full rounded-lg px-3 py-2 text-sm resize-y"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.6)' }}>Story Points</label>
            <div className="flex gap-2">
              {[1,2,3,5,8,13,21].map(p => (
                <button
                  key={p}
                  onClick={() => setPoints(String(p))}
                  className="rounded-lg px-3 py-1.5 text-sm font-bold transition-all"
                  style={String(p) === points
                    ? { background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.6)', color: '#a855f7' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }
                  }
                >{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,255,136,0.6)' }}>Acceptance Criteria <span style={{ color: 'rgba(100,116,139,0.5)', textTransform: 'none', letterSpacing: 0 }}>(one per line)</span></label>
            <textarea
              value={acText}
              onChange={e => setAcText(e.target.value)}
              rows={5}
              placeholder={"Given… when… then…\nAll existing tests pass\nPM has verified…"}
              className="input-neon w-full rounded-lg px-3 py-2 text-sm font-mono resize-y"
            />
          </div>

          {/* Needs Grooming toggle */}
          <div className="rounded-xl p-4" style={{ background: needsGrooming ? 'rgba(255,238,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${needsGrooming ? 'rgba(255,238,0,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4" style={{ color: needsGrooming ? '#ffee00' : 'rgba(148,163,184,0.4)' }} />
                <span className="text-sm font-semibold" style={{ color: needsGrooming ? '#ffee00' : 'rgba(148,163,184,0.6)' }}>Needs Grooming</span>
              </div>
              <button
                onClick={() => setNeedsGrooming(v => !v)}
                className="rounded-full px-3 py-1 text-xs font-bold transition-all"
                style={needsGrooming
                  ? { background: 'rgba(255,238,0,0.15)', border: '1px solid rgba(255,238,0,0.4)', color: '#ffee00' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.6)' }
                }
              >{needsGrooming ? 'Flagged' : 'Flag for grooming'}</button>
            </div>
            {needsGrooming && (
              <textarea
                value={groomingNotes}
                onChange={e => setGroomingNotes(e.target.value)}
                rows={2}
                placeholder="What needs clarification or refinement?"
                className="input-neon w-full rounded-lg px-3 py-2 text-xs mt-1 resize-y"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>
            Cancel
          </button>
          <button onClick={handleSave} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold uppercase tracking-wider transition-all"
            style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(168,85,247,0.2))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}>
            <Save className="h-4 w-4" /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSprintModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: { name: string; goal: string; startDate: string; endDate: string }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [name, setName] = useState(`Sprint ${today}`);
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(twoWeeks);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,2,18,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.98),rgba(6,6,26,0.98))', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 60px rgba(168,85,247,0.1)' }}>
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg,transparent,#a855f7,#00d4ff,transparent)' }} />
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" style={{ color: '#a855f7' }} />
            <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Create New Sprint</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/5 transition-all" style={{ color: 'rgba(148,163,184,0.5)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.7)' }}>Sprint Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-neon w-full rounded-lg px-3 py-2 text-sm" placeholder="Sprint 1 — Auth & Onboarding" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.6)' }}>Sprint Goal</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} placeholder="What does the team aim to achieve?" className="input-neon w-full rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,255,136,0.6)' }}>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-neon w-full rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,45,139,0.6)' }}>End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-neon w-full rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(168,85,247,0.1)' }}>
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>
            Cancel
          </button>
          <button onClick={() => onSave({ name, goal, startDate, endDate })} disabled={!name.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(0,212,255,0.15))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>
            <Plus className="h-4 w-4" /> Create Sprint
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ ticket, sprints, onStatusChange, onEdit, onToggleGrooming, onMoveToSprint }: {
  ticket: ApiTicket;
  sprints: ApiSprint[];
  onStatusChange: (status: string) => void;
  onEdit: () => void;
  onToggleGrooming: () => void;
  onMoveToSprint: (sprintId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const hasGrooming = ticket.needs_grooming;
  const missingAC = !ticket.acceptance_criteria;
  const tooLarge = (ticket.story_points ?? 0) > 13;
  const flagged = hasGrooming || missingAC || tooLarge;
  const st = statusStyle[ticket.status] ?? statusStyle.todo;
  const currentOpt = STATUS_OPTIONS.find((s) => s.id === ticket.status) ?? STATUS_OPTIONS[0];
  const acItems = parseAC(ticket.acceptance_criteria);

  return (
    <div
      className="rounded-xl p-4 mb-2 transition-all"
      style={{
        background: 'linear-gradient(135deg,rgba(10,10,36,0.8),rgba(6,6,26,0.8))',
        border: flagged ? '1px solid rgba(255,238,0,0.2)' : '1px solid rgba(0,212,255,0.1)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-2 mb-2 flex-wrap">
            {flagged && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#ffee00' }} />}
            <p className="text-sm font-semibold flex-1 leading-snug" style={{ color: '#e2e8f0' }}>{ticket.title}</p>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {ticket.story_points != null && (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                  {ticket.story_points} pts
                </span>
              )}
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(v => !v)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all hover:opacity-80"
                  style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}
                >
                  {currentOpt.label} <ChevronDown className="h-3 w-3" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[130px] rounded-lg overflow-hidden"
                    style={{ background: 'rgba(10,10,36,0.98)', border: '1px solid rgba(0,212,255,0.15)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt.id} onClick={() => { onStatusChange(opt.id); setShowMenu(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-all hover:bg-white/5"
                        style={{ color: opt.id === ticket.status ? opt.color : 'rgba(148,163,184,0.8)' }}>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Flag grooming — one click */}
              <button
                onClick={onToggleGrooming}
                title={ticket.needs_grooming ? 'Remove grooming flag' : 'Flag for grooming'}
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-all hover:opacity-80"
                style={ticket.needs_grooming
                  ? { background: 'rgba(255,238,0,0.12)', border: '1px solid rgba(255,238,0,0.4)', color: '#ffee00' }
                  : { background: 'transparent', border: '1px solid rgba(255,238,0,0.2)', color: 'rgba(255,238,0,0.4)' }
                }
              >
                <Flag className="h-3 w-3" />
                {ticket.needs_grooming ? 'Needs Grooming' : 'Groom'}
              </button>
              {/* Edit button */}
              <button onClick={onEdit} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-all hover:bg-white/5"
                style={{ color: 'rgba(0,212,255,0.6)', border: '1px solid rgba(0,212,255,0.15)' }}>
                <Pencil className="h-3 w-3" /> Edit
              </button>
              {/* Move to Sprint */}
              {sprints.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowMoveMenu(v => !v)}
                    className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-all hover:bg-white/5"
                    style={{ color: 'rgba(168,85,247,0.7)', border: '1px solid rgba(168,85,247,0.2)' }}
                  >
                    <ArrowRightLeft className="h-3 w-3" /> Move
                  </button>
                  {showMoveMenu && (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg overflow-hidden"
                      style={{ background: 'rgba(10,10,36,0.98)', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                      <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.5)' }}>Move to sprint</p>
                      {sprints.filter(s => s.id !== ticket.sprint_id).map(s => (
                        <button key={s.id} onClick={() => { onMoveToSprint(s.id); setShowMoveMenu(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-all hover:bg-white/5 text-left"
                          style={{ color: 'rgba(226,232,240,0.8)' }}>
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: '#a855f7' }} />
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <p className="text-xs mb-2 leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>{ticket.description}</p>
          )}

          {/* Acceptance Criteria */}
          {acItems.length > 0 && (
            <div className="mb-2 space-y-1">
              {acItems.map((ac, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'rgba(0,255,136,0.5)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>{ac}</p>
                </div>
              ))}
            </div>
          )}

          {/* Flags */}
          <div className="flex flex-wrap gap-1.5">
            {missingAC && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(255,238,0,0.08)', border: '1px solid rgba(255,238,0,0.25)', color: '#ffee00' }}>Missing AC</span>}
            {tooLarge && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(255,238,0,0.08)', border: '1px solid rgba(255,238,0,0.25)', color: '#ffee00' }}>Too Large</span>}
            {hasGrooming && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(255,238,0,0.08)', border: '1px solid rgba(255,238,0,0.25)', color: '#ffee00' }}>
                Needs Grooming{ticket.grooming_notes ? `: ${ticket.grooming_notes.slice(0, 40)}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SprintPlanner() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [showBrief, setShowBrief] = useState(false);
  const [briefStreamKey, setBriefStreamKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'grooming'>('all');
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<ApiTicket | null>(null);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [editingSprintName, setEditingSprintName] = useState(false);
  const [sprintNameDraft, setSprintNameDraft] = useState('');

  const { data: sprints = [], isLoading: sprintsLoading } = useQuery<ApiSprint[]>({
    queryKey: ['sprints', projectId],
    queryFn: () => apiClient.get('/api/sprint/sprints', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data.sprints ?? []),
    retry: false,
  });

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<ApiTicket[]>({
    queryKey: ['tickets', projectId, selectedSprintId],
    queryFn: () => apiClient.get('/api/sprint/tickets', { params: { ...(projectId ? { productAreaId: projectId } : {}), ...(selectedSprintId ? { sprintId: selectedSprintId } : {}) } }).then((r) => r.data.data.tickets ?? []),
    retry: false,
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: string }) =>
      apiClient.patch(`/api/sprint/tickets/${ticketId}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    },
  });

  const updateTicketMut = useMutation({
    mutationFn: ({ ticketId, updates }: { ticketId: string; updates: Partial<ApiTicket> }) =>
      apiClient.patch(`/api/sprint/tickets/${ticketId}`, updates).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setEditingTicket(null);
    },
  });

  const createSprintMut = useMutation({
    mutationFn: (data: { name: string; goal: string; startDate: string; endDate: string }) =>
      apiClient.post('/api/sprint/sprints', { name: data.name, goal: data.goal, startDate: data.startDate, endDate: data.endDate, productAreaId: projectId }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      setShowNewSprint(false);
      setSelectedSprintId(res.data.id);
    },
  });

  const moveTicketMut = useMutation({
    mutationFn: ({ ticketId, sprintId }: { ticketId: string; sprintId: string }) =>
      apiClient.patch(`/api/sprint/tickets/${ticketId}`, { sprint_id: sprintId }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const renameSprintMut = useMutation({
    mutationFn: ({ sprintId, name }: { sprintId: string; name: string }) =>
      apiClient.patch(`/api/sprint/sprints/${sprintId}`, { name }).then((r) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sprints'] }); setEditingSprintName(false); },
  });

  const activeSprint = selectedSprintId ? sprints.find((s) => s.id === selectedSprintId) : sprints[0] ?? null;
  // Deduplicate by id — pipeline and from-roadmap can create tickets with the same roadmap_item_id
  const seen = new Set<string>();
  const sprintTickets = tickets.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return !activeSprint || t.sprint_id === activeSprint.id;
  });
  const flaggedTickets = sprintTickets.filter((t) => t.needs_grooming || !t.acceptance_criteria || (t.story_points ?? 0) > 13);
  const displayedTickets = activeTab === 'grooming' ? flaggedTickets : sprintTickets;
  const totalPoints = sprintTickets.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
  const donePoints = sprintTickets.filter((t) => t.status === 'done').reduce((sum, t) => sum + (t.story_points ?? 0), 0);
  const progressPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  if (sprintsLoading || ticketsLoading) return <div className="flex justify-center py-16" style={{ background: '#020212' }}><LoadingSpinner size="lg" /></div>;

  return (
    <div className="p-8 min-h-full" style={{ background: '#020212' }}>
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(0,212,255,0.5)' }}>◆ SPRINT PLANNER</p>
          <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Sprint Planner</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewSprint(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all"
            style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(168,85,247,0.05))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7', boxShadow: '0 0 15px rgba(168,85,247,0.1)' }}
          >
            <Plus className="h-4 w-4" /> New Sprint
          </button>
          {activeSprint && (
            <button
              onClick={() => { setShowBrief(true); setBriefStreamKey((k) => k + 1); }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff', boxShadow: '0 0 15px rgba(0,212,255,0.15)' }}
            >
              <Zap className="h-4 w-4" style={{ filter: 'drop-shadow(0 0 3px #00d4ff)' }} />
              Sprint Brief
            </button>
          )}
        </div>
      </div>

      {/* Sprint tabs — always visible */}
      {sprints.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center mb-6" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(168,85,247,0.15)' }}>
          <CalendarDays className="mb-3 h-10 w-10" style={{ color: 'rgba(168,85,247,0.2)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'rgba(148,163,184,0.6)' }}>No sprints yet</p>
          <p className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>Click "New Sprint" to create your first sprint, or add roadmap items to auto-create one</p>
        </div>
      )}
      {sprints.length > 0 && (
        <>
          <div className="mb-5 flex gap-2 flex-wrap items-center">
            {sprints.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSprintId(s.id)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                style={activeSprint?.id === s.id
                  ? { background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.5)', color: '#a855f7' }
                  : { background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }
                }
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Active sprint sub-header with inline rename */}
          {activeSprint && (
            <div className="mb-6 flex items-center gap-3">
              {editingSprintName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={sprintNameDraft}
                    onChange={e => setSprintNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameSprintMut.mutate({ sprintId: activeSprint.id, name: sprintNameDraft });
                      if (e.key === 'Escape') setEditingSprintName(false);
                    }}
                    className="input-neon rounded-lg px-3 py-1.5 text-sm font-bold"
                    style={{ color: '#e2e8f0', minWidth: '220px' }}
                  />
                  <button
                    onClick={() => renameSprintMut.mutate({ sprintId: activeSprint.id, name: sprintNameDraft })}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                    style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}
                  >Save</button>
                  <button onClick={() => setEditingSprintName(false)} className="rounded-lg px-2 py-1.5 text-xs transition-all hover:bg-white/5" style={{ color: 'rgba(148,163,184,0.5)' }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <div>
                    <h2 className="text-base font-bold" style={{ color: '#e2e8f0' }}>{activeSprint.name}</h2>
                    <p className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{activeSprint.start_date} → {activeSprint.end_date}</p>
                  </div>
                  <button
                    onClick={() => { setSprintNameDraft(activeSprint.name); setEditingSprintName(true); }}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 transition-all hover:bg-white/5"
                    style={{ color: 'rgba(148,163,184,0.4)' }}
                    title="Rename sprint"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-4">
            {[
              { label: 'Total Points', value: totalPoints, color: '#00d4ff' },
              { label: 'Completed', value: donePoints, color: '#00ff88' },
              { label: 'Total Tickets', value: sprintTickets.length, color: '#a855f7' },
              { label: 'Needs Grooming', value: flaggedTickets.length, color: '#ffee00' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: `1px solid ${stat.color}20` }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: `${stat.color}80` }}>{stat.label}</p>
                <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          {activeSprint && (
            <div className="mb-6 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>Sprint Progress</p>
                <span className="text-sm font-bold" style={{ color: '#00d4ff' }}>{progressPct}%</span>
              </div>
              {activeSprint.goal && <p className="text-xs mb-3" style={{ color: 'rgba(148,163,184,0.6)' }}>{activeSprint.goal}</p>}
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-2 rounded-full transition-all"
                  style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #00d4ff, #00ff88)', boxShadow: '0 0 10px rgba(0,212,255,0.5)' }} />
              </div>
            </div>
          )}

          {/* Ticket tabs */}
          <div className="mb-4 flex gap-1" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
            <button onClick={() => setActiveTab('all')} className="px-4 py-2 text-sm font-medium transition-all"
              style={{ borderBottom: activeTab === 'all' ? '2px solid #00d4ff' : '2px solid transparent', color: activeTab === 'all' ? '#00d4ff' : 'rgba(148,163,184,0.6)' }}>
              All Tickets ({sprintTickets.length})
            </button>
            <button onClick={() => setActiveTab('grooming')} className="px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5"
              style={{ borderBottom: activeTab === 'grooming' ? '2px solid #ffee00' : '2px solid transparent', color: activeTab === 'grooming' ? '#ffee00' : 'rgba(148,163,184,0.6)' }}>
              {flaggedTickets.length > 0 && <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#ffee00' }} />}
              Needs Grooming ({flaggedTickets.length})
            </button>
          </div>

          {displayedTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl py-16 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(0,212,255,0.08)' }}>
              <Ticket className="mb-3 h-10 w-10" style={{ color: 'rgba(0,212,255,0.2)' }} />
              <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {activeTab === 'grooming' ? 'No tickets need grooming.' : 'No tickets in this sprint.'}
              </p>
            </div>
          ) : (
            <div>{displayedTickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                sprints={sprints}
                onStatusChange={(status) => updateStatusMut.mutate({ ticketId: ticket.id, status })}
                onEdit={() => setEditingTicket(ticket)}
                onToggleGrooming={() => updateTicketMut.mutate({ ticketId: ticket.id, updates: { needs_grooming: !ticket.needs_grooming } })}
                onMoveToSprint={(sprintId) => moveTicketMut.mutate({ ticketId: ticket.id, sprintId })}
              />
            ))}</div>
          )}
        </>
      )}

      {editingTicket && (
        <TicketEditModal
          ticket={editingTicket}
          onClose={() => setEditingTicket(null)}
          onSave={(updates) => updateTicketMut.mutate({ ticketId: editingTicket.id, updates })}
        />
      )}

      {showNewSprint && (
        <NewSprintModal
          onClose={() => setShowNewSprint(false)}
          onSave={(data) => createSprintMut.mutate(data)}
        />
      )}

      <Modal isOpen={showBrief} onClose={() => setShowBrief(false)} title={`Sprint Brief — ${activeSprint?.name ?? ''}`} size="lg">
        <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}>
          {activeSprint && (
            <StreamingText key={briefStreamKey} path={`/api/sprint/sprints/${activeSprint.id}/brief`} body={{}} />
          )}
        </div>
      </Modal>
    </div>
  );
}

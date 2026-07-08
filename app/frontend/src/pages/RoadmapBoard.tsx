import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Zap, ArrowRight, CheckCircle, ChevronDown } from 'lucide-react';
import { apiClient } from '../lib/api';
import { Modal } from '../components/Modal';
import { StreamingText } from '../components/StreamingText';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';

interface ApiRoadmapItem {
  id: string; title: string; description: string; status: string;
  priority_score: number | null; justification: string | null;
  target_quarter: string | null; created_at: string;
}

const COLUMNS = [
  { id: 'backlog',      label: 'Backlog',      color: '#00d4ff' },
  { id: 'planned',     label: 'Planned',       color: '#a855f7' },
  { id: 'in_progress', label: 'In Progress',   color: '#ffee00' },
  { id: 'done',        label: 'Done',          color: '#00ff88' },
];

const STATUS_OPTIONS = [
  { id: 'backlog',      label: 'Backlog',      color: '#00d4ff' },
  { id: 'planned',     label: 'Planned',       color: '#a855f7' },
  { id: 'in_progress', label: 'In Progress',   color: '#ffee00' },
  { id: 'done',        label: 'Done',          color: '#00ff88' },
];

function RoadmapCard({
  item, onJustify, onAddToSprint, onStatusChange, isAddingToSprint,
}: {
  item: ApiRoadmapItem;
  onJustify: () => void;
  onAddToSprint: () => void;
  onStatusChange: (status: string) => void;
  isAddingToSprint: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const col = COLUMNS.find((c) => c.id === item.status);
  const c = col?.color ?? '#00d4ff';
  return (
    <div
      className="mb-2 rounded-xl p-4 transition-all hover:translate-y-[-2px]"
      style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.95),rgba(6,6,26,0.95))', border: `1px solid ${c}20`, boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: '#e2e8f0' }}>{item.title}</p>
        {item.priority_score != null && (
          <span className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${c}15`, border: `1px solid ${c}40`, color: c }}>
            {item.priority_score}
          </span>
        )}
      </div>
      {item.description && <p className="text-xs mb-3 leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>{item.description}</p>}
      {item.target_quarter && <p className="text-xs mb-2" style={{ color: `${c}99` }}>{item.target_quarter}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onJustify}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-all hover:bg-white/5"
          style={{ color: '#00d4ff' }}
        >
          <Zap className="h-3 w-3" /> Justify
        </button>
        <button
          onClick={onAddToSprint}
          disabled={item.status !== 'backlog' || isAddingToSprint}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-all disabled:cursor-default"
          style={item.status !== 'backlog'
            ? { color: '#00ff88' }
            : { color: 'rgba(168,85,247,0.8)', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }
          }
        >
          {item.status !== 'backlog'
            ? <><CheckCircle className="h-3 w-3" /> In Sprint</>
            : isAddingToSprint
              ? <><ArrowRight className="h-3 w-3" /> Adding…</>
              : <><ArrowRight className="h-3 w-3" /> → Sprint</>
          }
        </button>

        {/* Status change dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowStatusMenu((v) => !v)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-all hover:bg-white/5"
            style={{ color: c, border: `1px solid ${c}30` }}
          >
            {col?.label ?? item.status} <ChevronDown className="h-3 w-3" />
          </button>
          {showStatusMenu && (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg overflow-hidden"
              style={{ background: 'rgba(10,10,36,0.98)', border: '1px solid rgba(0,212,255,0.15)', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { onStatusChange(opt.id); setShowStatusMenu(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-all hover:bg-white/5"
                  style={{ color: opt.id === item.status ? opt.color : 'rgba(148,163,184,0.8)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RoadmapBoard() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [justifyItem, setJustifyItem] = useState<ApiRoadmapItem | null>(null);

  const { data: items = [], isLoading, isError } = useQuery<ApiRoadmapItem[]>({
    queryKey: ['roadmap', projectId],
    queryFn: () => apiClient.get('/api/roadmap', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data.items ?? []),
    retry: false,
  });

  const addToSprintMut = useMutation({
    mutationFn: (roadmapItemId: string) =>
      apiClient.post(`/api/sprint/from-roadmap/${roadmapItemId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    },
  });

  const changeStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.put(`/api/roadmap/${id}`, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap'] }),
  });

  if (isLoading) return <div className="flex justify-center py-16" style={{ background: '#020212' }}><LoadingSpinner size="lg" /></div>;

  return (
    <div className="flex h-full flex-col" style={{ background: '#020212' }}>
      <div className="flex items-center justify-between px-8 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.8)' }}>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,45,139,0.5)' }}>◆ ROADMAP BOARD</p>
          <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Product Roadmap</h1>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>Evidence-backed product planning · Click "→ Sprint" to create a ticket</p>
        </div>
      </div>

      {isError ? (
        <div className="p-8">
          <div className="rounded-xl p-6 text-center text-sm" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
            Failed to load roadmap items.
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <LayoutGrid className="mx-auto mb-3 h-10 w-10" style={{ color: 'rgba(0,212,255,0.2)' }} />
            <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>No roadmap items yet</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Upload feedback to auto-generate roadmap items</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {COLUMNS.map((col) => {
            const colItems = items.filter((i) => i.status === col.id);
            return (
              <div key={col.id} className="flex-1 min-w-[220px]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.color, boxShadow: `0 0 6px ${col.color}` }} />
                    <h2 className="text-sm font-semibold" style={{ color: col.color }}>{col.label}</h2>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${col.color}15`, border: `1px solid ${col.color}30`, color: col.color }}>
                    {colItems.length}
                  </span>
                </div>
                <div className="min-h-[200px] rounded-xl p-2" style={{ background: `${col.color}05`, border: `1px solid ${col.color}15` }}>
                  {colItems.length === 0 ? (
                    <div className="flex h-24 items-center justify-center">
                      <p className="text-xs" style={{ color: 'rgba(100,116,139,0.4)' }}>No items</p>
                    </div>
                  ) : colItems.map((item) => (
                    <RoadmapCard
                      key={item.id}
                      item={item}
                      onJustify={() => setJustifyItem(item)}
                      onAddToSprint={() => addToSprintMut.mutate(item.id)}
                      onStatusChange={(status) => changeStatusMut.mutate({ id: item.id, status })}
                      isAddingToSprint={addToSprintMut.isPending && addToSprintMut.variables === item.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={!!justifyItem} onClose={() => setJustifyItem(null)} title={`Justification: ${justifyItem?.title}`} size="lg">
        {justifyItem && (
          <div className="rounded-lg p-4" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <StreamingText path={`/api/roadmap/${justifyItem.id}/justification`} body={{ roadmapItemId: justifyItem.id }} />
          </div>
        )}
      </Modal>
    </div>
  );
}

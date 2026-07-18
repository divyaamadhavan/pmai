import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, CheckCircle, XCircle, Send, Sparkles, Bot, User,
  Paperclip, Trash2, RefreshCw, Wand2, ChevronRight, X, Clock,
  RotateCcw, Upload, Pencil, Save,
} from 'lucide-react';
import { apiClient, fetchSSEPost } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';
import { useAgentStatus } from '../contexts/AgentStatusContext';

interface ApiDocument {
  id: string; title: string; type: string; status: string;
  product_area_id: string | null; created_by: string;
  created_at: string; updated_at: string; created_by_name: string | null;
  sections?: { content?: string; fileName?: string; fileSize?: number } | null;
}
interface ApiTheme { id: string; name: string; item_count: number; }
interface ApiVersion { id: string; version: number; sections: string; changed_by: string; created_at: string; }
interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; isStreaming?: boolean; attachmentNames?: string[]; }

const DOC_TYPES: { value: 'PRD' | 'UserStory' | 'AcceptanceCriteria'; label: string; color: string; desc: string }[] = [
  { value: 'PRD',                label: 'PRD',                 color: '#a855f7', desc: 'Product Requirements Doc' },
  { value: 'UserStory',          label: 'User Story',          color: '#00d4ff', desc: 'As a user, I want…' },
  { value: 'AcceptanceCriteria', label: 'Acceptance Criteria', color: '#00ff88', desc: 'Definition of Done' },
];

const statusStyle: Record<string, { color: string; bg: string; border: string }> = {
  draft:     { color: '#ffee00', bg: 'rgba(255,238,0,0.1)',   border: 'rgba(255,238,0,0.3)' },
  in_review: { color: '#00d4ff', bg: 'rgba(0,212,255,0.1)',   border: 'rgba(0,212,255,0.3)' },
  approved:  { color: '#00ff88', bg: 'rgba(0,255,136,0.1)',   border: 'rgba(0,255,136,0.3)' },
  archived:  { color: 'rgba(148,163,184,0.5)', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)' },
};

const typeColor: Record<string, string> = {
  PRD: '#a855f7', UserStory: '#00d4ff', AcceptanceCriteria: '#00ff88',
  Reference: '#ff2d8b', PDF: '#ff2d8b', DOCX: '#00d4ff', DOC: '#00d4ff',
  TXT: '#00ff88', MD: '#a855f7', CSV: '#ffee00', XLSX: '#00ff88', PPTX: '#ff2d8b',
};

function DocRow({ doc, selected, onSelect, onDelete }: { doc: ApiDocument; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const st = statusStyle[doc.status] ?? statusStyle.archived;
  const tc = typeColor[doc.type] ?? '#00d4ff';
  return (
    <div
      className="group relative rounded-xl p-3 cursor-pointer transition-all hover:translate-x-0.5 mb-2"
      style={{
        background: selected ? 'rgba(0,212,255,0.06)' : 'rgba(10,10,36,0.6)',
        border: selected ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(0,212,255,0.08)',
      }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ background: `${tc}15`, border: `1px solid ${tc}30`, color: tc }}>
          {doc.type.slice(0, 3)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: selected ? '#00d4ff' : '#e2e8f0' }}>{doc.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="rounded-full px-1.5 py-0.5 text-xs capitalize" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color, fontSize: '10px' }}>
              {doc.status.replace('_', ' ')}
            </span>
            <span className="text-xs" style={{ color: 'rgba(100,116,139,0.6)', fontSize: '10px' }}>{new Date(doc.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-1 transition-all hover:bg-red-500/10"
          style={{ color: 'rgba(255,45,139,0.5)' }}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Generate from Feedback panel ─────────────────────────────────────────────

type GenPhase = 'pick' | 'streaming' | 'done' | 'error';

function GeneratePanel({
  themes, themesLoading, projectId, onDocSaved,
}: {
  themes: ApiTheme[];
  themesLoading: boolean;
  projectId: string | undefined;
  onDocSaved: (doc: ApiDocument) => void;
}) {
  const [selectedTheme, setSelectedTheme] = useState<ApiTheme | null>(null);
  const [docType, setDocType] = useState<'PRD' | 'UserStory' | 'AcceptanceCriteria'>('PRD');
  const [phase, setPhase] = useState<GenPhase>('pick');
  const [streamText, setStreamText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const docIdRef = useRef<string | null>(null);
  const accRef = useRef<string>('');
  const streamEndRef = useRef<HTMLDivElement>(null);
  const chosenType = DOC_TYPES.find((t) => t.value === docType)!;

  const handleGenerate = async () => {
    if (!selectedTheme) return;
    setPhase('streaming'); setStreamText(''); accRef.current = ''; docIdRef.current = null;
    await fetchSSEPost('/api/documents/', {
      title: selectedTheme.name, type: docType, productAreaId: projectId,
      context: { sourceTheme: selectedTheme.name, feedbackCount: selectedTheme.item_count },
    }, {
      onMessage: (chunk) => { accRef.current += chunk; setStreamText((t) => t + chunk); streamEndRef.current?.scrollIntoView({ behavior: 'smooth' }); },
      onEvent: (event, data) => {
        if (event === 'meta') { try { const d = JSON.parse(data) as { documentId?: string }; if (d.documentId) docIdRef.current = d.documentId; } catch { /**/ } }
      },
      onDone: async () => {
        const id = docIdRef.current;
        if (!id) { setPhase('error'); setErrMsg('No document ID received'); return; }
        try {
          const res = await apiClient.put(`/api/documents/${id}`, { sections: { content: accRef.current } });
          onDocSaved(res.data.data ?? res.data); setPhase('done');
        } catch (err) { setErrMsg((err as Error).message ?? 'Failed to save'); setPhase('error'); }
      },
      onError: (msg) => { setErrMsg(msg ?? 'Generation failed'); setPhase('error'); },
    }).catch((err) => { setErrMsg(err?.message ?? 'Network error'); setPhase('error'); });
  };

  const reset = () => { setPhase('pick'); setStreamText(''); setErrMsg(''); setSelectedTheme(null); };

  if (phase === 'streaming' || phase === 'done' || phase === 'error') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)', background: 'rgba(6,6,26,0.5)' }}>
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" style={{ color: '#00ff88' }} />
            <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Generating {chosenType.label} — {selectedTheme?.name}</span>
            {phase === 'streaming' && <LoadingSpinner size="sm" />}
            {phase === 'done' && <CheckCircle className="h-4 w-4" style={{ color: '#00ff88' }} />}
            {phase === 'error' && <XCircle className="h-4 w-4" style={{ color: '#ff2d8b' }} />}
          </div>
          {(phase === 'done' || phase === 'error') && (
            <button onClick={reset} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-all hover:bg-white/5" style={{ color: 'rgba(0,212,255,0.6)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <X className="h-3 w-3" /> Generate another
            </button>
          )}
        </div>
        {phase === 'error' ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <XCircle className="mx-auto mb-3 h-10 w-10" style={{ color: '#ff2d8b' }} />
              <p className="text-sm font-medium mb-1" style={{ color: '#ff2d8b' }}>Generation failed</p>
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{errMsg}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {phase === 'done' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#00ff88' }} />
                <p className="text-xs font-medium" style={{ color: '#00ff88' }}>Document saved — click it in the left panel to view or edit</p>
              </div>
            )}
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed" style={{ color: 'rgba(226,232,240,0.85)' }}>
              {streamText}
              {phase === 'streaming' && <span className="inline-block h-4 w-0.5 animate-blink align-middle ml-0.5" style={{ background: '#00ff88' }} />}
            </pre>
            <div ref={streamEndRef} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto w-full">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="h-5 w-5" style={{ color: '#00ff88' }} />
            <h2 className="text-base font-bold" style={{ color: '#e2e8f0' }}>Generate from Feedback</h2>
          </div>
          <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>Pick a feedback theme and document type — the AI will draft it for you instantly.</p>
        </div>

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(0,212,255,0.5)' }}>1 · Select a feedback theme</p>
          {themesLoading ? (
            <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>
          ) : themes.length === 0 ? (
            <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,238,0,0.04)', border: '1px solid rgba(255,238,0,0.15)' }}>
              <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,238,0,0.8)' }}>No themes found</p>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,238,0,0.5)' }}>Go to Feedback Hub, click "Analyse Feedback" (or upload a file), then approve the pipeline when analysis finishes.</p>
              <a href="/feedback" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all" style={{ background: 'rgba(255,238,0,0.12)', border: '1px solid rgba(255,238,0,0.3)', color: '#ffee00' }}>Go to Feedback Hub →</a>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {themes.map((theme) => {
                const isSelected = selectedTheme?.id === theme.id;
                return (
                  <button key={theme.id} onClick={() => setSelectedTheme(isSelected ? null : theme)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all"
                    style={{ background: isSelected ? 'rgba(0,255,136,0.08)' : 'rgba(10,10,36,0.7)', border: isSelected ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(0,212,255,0.1)', boxShadow: isSelected ? '0 0 12px rgba(0,255,136,0.08)' : 'none' }}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: isSelected ? 'rgba(0,255,136,0.15)' : 'rgba(0,212,255,0.06)', color: isSelected ? '#00ff88' : 'rgba(0,212,255,0.5)' }}>{theme.item_count}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: isSelected ? '#00ff88' : '#e2e8f0' }}>{theme.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>{theme.item_count} feedback item{theme.item_count !== 1 ? 's' : ''}</p>
                    </div>
                    {isSelected && <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#00ff88' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(0,212,255,0.5)' }}>2 · Choose document type</p>
          <div className="flex gap-2">
            {DOC_TYPES.map((dt) => {
              const isActive = docType === dt.value;
              return (
                <button key={dt.value} onClick={() => setDocType(dt.value)} className="flex-1 flex flex-col items-center gap-1 rounded-xl px-3 py-3 transition-all"
                  style={{ background: isActive ? `${dt.color}12` : 'rgba(10,10,36,0.7)', border: isActive ? `1px solid ${dt.color}50` : '1px solid rgba(0,212,255,0.1)', boxShadow: isActive ? `0 0 12px ${dt.color}15` : 'none' }}>
                  <span className="text-xs font-bold" style={{ color: isActive ? dt.color : 'rgba(226,232,240,0.5)' }}>{dt.label}</span>
                  <span className="text-xs text-center" style={{ color: 'rgba(100,116,139,0.5)', fontSize: '10px' }}>{dt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={handleGenerate} disabled={!selectedTheme} className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: selectedTheme ? 'linear-gradient(135deg,rgba(0,255,136,0.2),rgba(0,212,255,0.15))' : 'rgba(10,10,36,0.5)', border: selectedTheme ? '1px solid rgba(0,255,136,0.5)' : '1px solid rgba(0,212,255,0.1)', color: selectedTheme ? '#00ff88' : 'rgba(148,163,184,0.4)', boxShadow: selectedTheme ? '0 0 20px rgba(0,255,136,0.1)' : 'none' }}>
          <Wand2 className="h-4 w-4" />
          {selectedTheme ? `Generate ${chosenType.label} for "${selectedTheme.name}"` : 'Select a theme to generate'}
          {selectedTheme && <ChevronRight className="h-4 w-4 ml-auto" />}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: 'rgba(0,212,255,0.08)' }} />
          <span className="text-xs" style={{ color: 'rgba(100,116,139,0.4)' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,212,255,0.08)' }} />
        </div>
        <p className="text-xs text-center" style={{ color: 'rgba(100,116,139,0.4)' }}>Select an existing document from the left panel to view or edit it</p>
      </div>
    </div>
  );
}

// ─── Version History Panel ─────────────────────────────────────────────────────

function VersionPanel({ docId, onClose, onRestored }: { docId: string; onClose: () => void; onRestored: (doc: ApiDocument) => void }) {
  const { data, isLoading } = useQuery<ApiVersion[]>({
    queryKey: ['doc-versions', docId],
    queryFn: () => apiClient.get(`/api/documents/${docId}/versions`).then((r) => r.data.data?.versions ?? []),
  });
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (ver: ApiVersion) => {
    setRestoringId(ver.id);
    try {
      const res = await apiClient.post(`/api/documents/${docId}/restore/${ver.id}`);
      onRestored(res.data.data ?? res.data);
      onClose();
    } catch { /* ignore */ }
    finally { setRestoringId(null); }
  };

  const preview = (ver: ApiVersion) => {
    try {
      const s = typeof ver.sections === 'string' ? JSON.parse(ver.sections) : ver.sections;
      return (s?.content ?? '').slice(0, 120) + '…';
    } catch { return ''; }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'rgba(6,6,26,0.98)', borderLeft: '1px solid rgba(168,85,247,0.2)' }}>
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: '#a855f7' }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Version History</span>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/5" style={{ color: 'rgba(148,163,184,0.5)' }}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner size="sm" /></div>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="mx-auto mb-2 h-8 w-8" style={{ color: 'rgba(168,85,247,0.2)' }} />
            <p className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>No previous versions yet</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.35)' }}>Versions are saved automatically when you edit</p>
          </div>
        ) : (
          data.map((ver) => (
            <div key={ver.id} className="rounded-xl p-3" style={{ background: 'rgba(10,10,36,0.8)', border: '1px solid rgba(168,85,247,0.15)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}>v{ver.version}</span>
                  <span className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{new Date(ver.created_at).toLocaleString()}</span>
                </div>
                <button
                  onClick={() => handleRestore(ver)}
                  disabled={restoringId === ver.id}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50"
                  style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}
                >
                  {restoringId === ver.id ? <LoadingSpinner size="sm" /> : <RotateCcw className="h-3 w-3" />}
                  Restore
                </button>
              </div>
              <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(148,163,184,0.5)' }}>{preview(ver)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export function DocumentWorkspace() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [selectedDoc, setSelectedDoc] = useState<ApiDocument | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<ApiDocument[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { agentRunning, agentLabel } = useAgentStatus();
  const [prdAgentActive, setPrdAgentActive] = useState(false);

  // Poll more often when an agent is running OR when planned items exist (PRD creation pending)
  const shouldPoll = agentRunning || prdAgentActive;

  const { data: docs = [], isLoading, refetch: refetchDocs } = useQuery<ApiDocument[]>({
    queryKey: ['documents', projectId],
    queryFn: () => apiClient.get('/api/documents', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data.documents ?? []),
    retry: false,
    refetchInterval: shouldPoll ? 3000 : false,
  });

  // Poll for planned roadmap items (no productAreaId filter — items created by pipeline have null area)
  useQuery({
    queryKey: ['roadmap-planned-check'],
    queryFn: async () => {
      const rmResp = await apiClient.get('/api/roadmap', { params: { status: 'planned' } });
      const planned: Array<{ title: string }> = rmResp.data?.data?.items ?? [];
      const isActive = planned.length > 0;
      setPrdAgentActive(isActive);
      return isActive;
    },
    refetchInterval: 3000,
    retry: false,
  });

  // Immediately refetch docs the moment we detect planned items or agent starts
  useEffect(() => {
    if (prdAgentActive || agentRunning) refetchDocs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prdAgentActive, agentRunning]);

  const { data: themes = [], isLoading: themesLoading } = useQuery<ApiTheme[]>({
    queryKey: ['feedback-themes', projectId],
    queryFn: () => apiClient.get('/api/feedback/themes', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data?.themes ?? []),
    retry: false,
  });

  // Reset edit mode when doc changes
  useEffect(() => { setIsEditing(false); setEditContent(''); }, [selectedDoc?.id]);

  const handleSaveEdit = async () => {
    if (!selectedDoc) return;
    setIsSaving(true);
    try {
      const res = await apiClient.put(`/api/documents/${selectedDoc.id}`, { sections: { content: editContent } });
      const updated: ApiDocument = res.data.data ?? res.data;
      if (typeof updated.sections === 'string') {
        try { updated.sections = JSON.parse(updated.sections); } catch { /* leave as-is */ }
      }
      setSelectedDoc(updated);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['doc-versions', selectedDoc.id] });
      setIsEditing(false);
    } catch (err) { console.error('Save failed', err); }
    finally { setIsSaving(false); }
  };

  const refreshDoc = useCallback(async (docId: string) => {
    const res = await apiClient.get(`/api/documents/${docId}`);
    const updated: ApiDocument = res.data.data ?? res.data;
    if (updated?.sections) { setSelectedDoc(updated); queryClient.invalidateQueries({ queryKey: ['documents'] }); }
  }, [queryClient]);

  const handleDelete = useCallback(async (doc: ApiDocument) => {
    try {
      await apiClient.delete(`/api/documents/${doc.id}`);
      if (selectedDoc?.id === doc.id) { setSelectedDoc(null); setShowVersions(false); }
      setAttachedDocs((a) => a.filter((d) => d.id !== doc.id));
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) { console.error('Delete failed', err); }
  }, [selectedDoc, queryClient]);

  const handleDocSaved = useCallback((doc: ApiDocument) => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    setSelectedDoc(doc);
  }, [queryClient]);

  // Upload from AI assistant area
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      if (projectId) fd.append('productAreaId', projectId);
      return (await apiClient.post<{ data: ApiDocument }>('/api/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      // Auto-attach to AI context
      setAttachedDocs((a) => a.some((d) => d.id === doc.id) ? a : [...a, doc]);
      // Add system message
      setMessages((m) => [...m, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `📎 "${doc.title}" uploaded and attached as context. Ask me anything about it, or ask me to update a document based on it.`,
      }]);
      setIsUploading(false);
    },
    onError: () => setIsUploading(false),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setIsUploading(true); uploadMutation.mutate(file); }
    e.target.value = '';
  };

  const handleSend = async () => {
    if (!chatInput.trim() || isSending) return;
    const userText = chatInput.trim();
    setChatInput('');
    setIsSending(true);

    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user', content: userText,
      attachmentNames: attachedDocs.length ? attachedDocs.map((d) => d.title) : undefined,
    };
    const assistantId = (Date.now() + 1).toString();
    setMessages((m) => [...m, userMsg, { id: assistantId, role: 'assistant', content: '', isStreaming: true }]);

    await fetchSSEPost('/api/documents/assistant', {
      command: userText,
      documentId: selectedDoc?.id,
      uploadedFileIds: attachedDocs.map((d) => d.id),
    }, {
      onMessage: (chunk) => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      },
      onDone: () => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, isStreaming: false } : m));
        setIsSending(false);
        if (selectedDoc) setTimeout(() => refreshDoc(selectedDoc.id), 2000);
      },
      onError: () => {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: 'Sorry, something went wrong. Please try again.', isStreaming: false } : m));
        setIsSending(false);
      },
    }).catch(() => setIsSending(false));
  };

  const SUGGESTIONS = [
    'Summarize this document',
    'Add acceptance criteria',
    'Add user stories',
    'Analyze risks and assumptions',
    'Update the PRD with the latest changes',
    'Create a competitive analysis',
  ];

  const rawSections = selectedDoc?.sections;
  const parsedSections = typeof rawSections === 'string' ? (() => { try { return JSON.parse(rawSections); } catch { return {}; } })() : rawSections;
  const docContent = parsedSections?.content ?? '';

  return (
    <div className="flex h-full" style={{ background: '#020212' }}>

      {/* ── LEFT: Documents list ── */}
      <div className="w-64 shrink-0 flex flex-col" style={{ borderRight: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.6)' }}>
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
          <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(0,255,136,0.5)' }}>◆ DOCUMENTS</p>
          <h1 className="text-base font-bold" style={{ color: '#e2e8f0' }}>Workspace</h1>
          {agentRunning && (
            <div className="mt-2 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs" style={{ background: 'rgba(255,238,0,0.08)', border: '1px solid rgba(255,238,0,0.25)', color: '#ffee00' }}>
              <span className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#ffee00' }} />
              {agentLabel} running…
            </div>
          )}
          {!agentRunning && prdAgentActive && (() => {
            const hasDraftPrd = docs.some(d => d.type === 'PRD' && d.title.startsWith('PRD Draft:'));
            return hasDraftPrd ? (
              <div className="mt-2 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
                <CheckCircle className="h-3 w-3 shrink-0" />
                PRD draft ready · review below
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                <span className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#a855f7' }} />
                Agent drafting PRD · please wait…
              </div>
            );
          })()}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <FileText className="mb-2 h-7 w-7" style={{ color: 'rgba(0,255,136,0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>No documents yet</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.4)' }}>Generate from feedback or upload a reference doc via the AI assistant</p>
            </div>
          ) : (
            docs.map((doc) => (
              <DocRow key={doc.id} doc={doc} selected={selectedDoc?.id === doc.id}
                onSelect={() => { setSelectedDoc(doc); setShowVersions(false); }}
                onDelete={() => handleDelete(doc)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── MIDDLE: Generate wizard or doc viewer ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative" style={{ borderRight: '1px solid rgba(0,212,255,0.08)' }}>
        {selectedDoc ? (
          <>
            <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)', background: 'rgba(6,6,26,0.5)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold"
                  style={{ background: `${typeColor[selectedDoc.type] ?? '#00d4ff'}15`, border: `1px solid ${typeColor[selectedDoc.type] ?? '#00d4ff'}30`, color: typeColor[selectedDoc.type] ?? '#00d4ff' }}>
                  {selectedDoc.type.slice(0, 3)}
                </div>
                <p className="font-semibold text-sm truncate" style={{ color: '#e2e8f0' }}>{selectedDoc.title}</p>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-xs capitalize"
                  style={{ background: (statusStyle[selectedDoc.status] ?? statusStyle.archived).bg, border: `1px solid ${(statusStyle[selectedDoc.status] ?? statusStyle.archived).border}`, color: (statusStyle[selectedDoc.status] ?? statusStyle.archived).color }}>
                  {selectedDoc.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Edit / Save / Cancel */}
                {!isEditing ? (
                  <button
                    onClick={() => { setEditContent(docContent); setIsEditing(true); setShowVersions(false); }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                    style={{ background: 'rgba(255,238,0,0.08)', border: '1px solid rgba(255,238,0,0.25)', color: '#ffee00' }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                      style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}
                    >
                      {isSaving ? <LoadingSpinner size="sm" /> : <Save className="h-3.5 w-3.5" />}
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)' }}
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </>
                )}
                <button
                  onClick={() => setAttachedDocs((a) => a.some((d) => d.id === selectedDoc.id) ? a.filter((d) => d.id !== selectedDoc.id) : [...a, selectedDoc])}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={attachedDocs.some((d) => d.id === selectedDoc.id)
                    ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {attachedDocs.some((d) => d.id === selectedDoc.id) ? 'Attached to AI' : 'Attach to AI'}
                </button>
                <button
                  onClick={() => setShowVersions((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={showVersions
                    ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}
                  title="Version history"
                >
                  <Clock className="h-3.5 w-3.5" />
                  History
                </button>
                <button onClick={() => handleDelete(selectedDoc)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:bg-red-500/10"
                  style={{ background: 'rgba(255,45,139,0.06)', border: '1px solid rgba(255,45,139,0.2)', color: 'rgba(255,45,139,0.7)' }} title="Delete document">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </button>
                <button onClick={() => refreshDoc(selectedDoc.id)} className="rounded-lg p-1.5 transition-all hover:bg-white/5" style={{ color: 'rgba(0,212,255,0.5)' }} title="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={() => { setSelectedDoc(null); setShowVersions(false); }} className="rounded-lg p-1.5 transition-all hover:bg-white/5" style={{ color: 'rgba(148,163,184,0.4)' }} title="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] rounded-xl px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none"
                  style={{ background: 'rgba(10,10,36,0.8)', border: '1px solid rgba(255,238,0,0.3)', color: 'rgba(226,232,240,0.9)', caretColor: '#ffee00' }}
                  autoFocus
                />
              ) : docContent ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed" style={{ color: 'rgba(226,232,240,0.85)' }}>{docContent}</pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="mb-3 h-10 w-10" style={{ color: 'rgba(0,212,255,0.15)' }} />
                  <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>No content yet</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.4)' }}>Ask the AI assistant to generate content</p>
                </div>
              )}
            </div>
            {showVersions && (
              <VersionPanel
                docId={selectedDoc.id}
                onClose={() => setShowVersions(false)}
                onRestored={(doc) => { setSelectedDoc(doc); queryClient.invalidateQueries({ queryKey: ['documents'] }); }}
              />
            )}
          </>
        ) : (
          <GeneratePanel themes={themes} themesLoading={themesLoading} projectId={projectId} onDocSaved={handleDocSaved} />
        )}
      </div>

      {/* ── RIGHT: AI Assistant ── */}
      <div className="w-96 shrink-0 flex flex-col" style={{ background: 'rgba(6,6,26,0.7)' }}>
        <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
            <Sparkles className="h-4 w-4" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 4px #a855f7)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>AI Document Assistant</p>
            <p className="text-xs" style={{ color: 'rgba(168,85,247,0.6)' }}>
              {selectedDoc ? `Working on: ${selectedDoc.title.slice(0, 28)}${selectedDoc.title.length > 28 ? '…' : ''}` : 'Select a document to get started'}
            </p>
          </div>
        </div>

        {/* Upload hint */}
        <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.08)', background: 'rgba(168,85,247,0.03)' }}>
          <p className="text-xs" style={{ color: 'rgba(168,85,247,0.5)' }}>
            <Paperclip className="inline h-3 w-3 mr-1" />
            Attach a reference doc (PDF, DOCX, TXT…) using the 📎 button below — it'll be saved and used as AI context.
          </p>
        </div>

        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.04)' }}>
            {attachedDocs.map((d) => (
              <span key={d.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                <Paperclip className="h-2.5 w-2.5" />
                {d.title.slice(0, 20)}{d.title.length > 20 ? '…' : ''}
                <button onClick={() => setAttachedDocs((a) => a.filter((x) => x.id !== d.id))} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div>
              <div className="text-center mb-6">
                <Bot className="mx-auto mb-2 h-10 w-10" style={{ color: 'rgba(168,85,247,0.3)' }} />
                <p className="text-sm font-medium" style={{ color: 'rgba(226,232,240,0.6)' }}>What would you like to do?</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Select a doc or attach a reference file, then give a command</p>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setChatInput(s)} className="w-full rounded-lg px-3 py-2 text-left text-xs transition-all hover:translate-x-0.5"
                    style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(168,85,247,0.8)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-1" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                    <Bot className="h-3.5 w-3.5" style={{ color: '#a855f7' }} />
                  </div>
                )}
                <div className="max-w-[85%] rounded-xl px-3 py-2.5 text-xs leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#e2e8f0', borderBottomRightRadius: '4px' }
                    : { background: 'rgba(10,10,36,0.9)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(226,232,240,0.85)', borderBottomLeftRadius: '4px' }}>
                  {msg.attachmentNames && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {msg.attachmentNames.map((n) => (
                        <span key={n} className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs" style={{ background: 'rgba(0,212,255,0.1)', color: 'rgba(0,212,255,0.7)', fontSize: '10px' }}>
                          <Paperclip className="h-2 w-2" />{n.slice(0, 16)}{n.length > 16 ? '…' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  {msg.isStreaming && msg.content === '' && (
                    <div className="flex items-center gap-2" style={{ color: 'rgba(168,85,247,0.7)' }}>
                      <LoadingSpinner size="sm" /><span>Thinking…</span>
                    </div>
                  )}
                  {msg.isStreaming && msg.content !== '' && (
                    <span className="inline-block h-3 w-0.5 animate-blink align-middle ml-0.5" style={{ background: '#a855f7' }} />
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-1" style={{ background: 'linear-gradient(135deg,#00d4ff,#a855f7)', color: '#020212', fontSize: '10px', fontWeight: 700 }}>
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid rgba(168,85,247,0.1)' }}>
          {!selectedDoc && attachedDocs.length === 0 && (
            <p className="text-xs mb-2 text-center" style={{ color: 'rgba(255,238,0,0.5)' }}>
              ⚠ Select a document or attach a reference file to enable AI actions
            </p>
          )}
          <div className="flex gap-2">
            {/* Attach / upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center rounded-xl px-3 py-2 transition-all disabled:opacity-50"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff', minWidth: '40px' }}
              title="Upload a reference document"
            >
              {isUploading ? <LoadingSpinner size="sm" /> : <Upload className="h-4 w-4" />}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.pptx" className="hidden" onChange={handleFileChange} />

            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={selectedDoc ? 'Give a command… (Enter to send)' : 'Attach a file or select a document…'}
              rows={2}
              className="input-neon flex-1 rounded-xl px-3 py-2 text-xs resize-none"
              disabled={!selectedDoc && attachedDocs.length === 0}
            />
            <button
              onClick={handleSend}
              disabled={!chatInput.trim() || isSending || (!selectedDoc && attachedDocs.length === 0)}
              className="flex items-center justify-center rounded-xl px-3 py-2 transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7', minWidth: '40px' }}
            >
              {isSending ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs mt-1.5 text-center" style={{ color: 'rgba(100,116,139,0.4)' }}>
            📎 Upload reference doc · Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}

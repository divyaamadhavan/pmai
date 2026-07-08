import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Upload, CheckCircle, XCircle, FileText, MessageSquare, Sparkles, Loader2, X, ExternalLink } from 'lucide-react';
import { fetchSSEPost } from '../lib/api';
import { apiClient } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PipelineApprovalModal, type PipelinePreview } from '../components/PipelineApprovalModal';
import { useProject } from '../contexts/ProjectContext';

interface ApiFeedbackItem {
  id: string; channel: string; author: string; body: string;
  sentiment: string; sentiment_score: number; received_at: string;
  product_area_id: string | null; source_url: string | null;
}
interface ApiTheme { id: string; name: string; item_count: number; description: string | null; }

interface UploadResponse {
  inserted: number;
  ids: string[];
  themes: string[];
  themeCounts: number[];
  themeEvidence: string[];
  feedbackCount: number;
  productAreaId: string | null;
  preview: PipelinePreview;
  message: string;
}

const ACCEPTED = '.eml,.mbox,.csv,.txt,.md,.pdf,.docx,.doc';
const CHANNELS = [{ id: 'Email', label: 'Email', color: '#00d4ff' }] as const;

function sentimentStyle(s: string) {
  if (s === 'positive') return { color: '#00ff88', border: 'rgba(0,255,136,0.3)', bg: 'rgba(0,255,136,0.08)' };
  if (s === 'negative') return { color: '#ff2d8b', border: 'rgba(255,45,139,0.3)', bg: 'rgba(255,45,139,0.08)' };
  return { color: 'rgba(148,163,184,0.8)', border: 'rgba(148,163,184,0.2)', bg: 'rgba(148,163,184,0.06)' };
}

function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const total = positive + neutral + negative;
  if (!total) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <div style={{ width: `${(positive / total) * 100}%`, background: 'linear-gradient(90deg,#00ff88,#00d4ff)', boxShadow: '0 0 6px rgba(0,255,136,0.5)' }} />
      <div style={{ width: `${(neutral / total) * 100}%`, background: 'rgba(148,163,184,0.3)' }} />
      <div style={{ width: `${(negative / total) * 100}%`, background: 'linear-gradient(90deg,#ff2d8b,#a855f7)', boxShadow: '0 0 6px rgba(255,45,139,0.5)' }} />
    </div>
  );
}

function UploadZone({ onSuccess }: { onSuccess: (r: UploadResponse) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [selFile, setSelFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { activeProject } = useProject();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      if (activeProject?.id) fd.append('productAreaId', activeProject.id);
      return (await apiClient.post<{ data: UploadResponse }>('/api/feedback/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
    },
    onSuccess: (data) => { setStatus('idle'); setSelFile(null); onSuccess(data); },
    onError: (e: Error) => { setStatus('error'); setErrMsg(e.message || 'Upload failed.'); },
  });

  const handleFile = useCallback((file: File) => {
    setSelFile(file); setStatus('uploading'); setErrMsg('');
    upload.mutate(file);
  }, [upload]);

  const reset = () => { setStatus('idle'); setSelFile(null); setErrMsg(''); };

  if (status === 'error') {
    return (
      <div className="mb-4 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.15)' }}>
        <div className="flex items-start gap-3 rounded-lg p-3" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)' }}>
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#ff2d8b' }} />
          <div className="flex-1"><p className="text-sm font-medium" style={{ color: '#ff2d8b' }}>Upload failed</p><p className="text-xs mt-0.5" style={{ color: 'rgba(255,45,139,0.7)' }}>{errMsg}</p></div>
          <button onClick={reset} className="text-xs underline shrink-0" style={{ color: '#ff2d8b' }}>Try again</button>
        </div>
      </div>
    );
  }

  if (status === 'uploading') {
    return (
      <div className="mb-4 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.15)' }}>
        <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
          <LoadingSpinner size="sm" />
          <div>
            <p className="text-sm font-medium" style={{ color: '#00d4ff' }}>Analysing feedback…</p>
            {selFile && <p className="text-xs mt-0.5" style={{ color: 'rgba(0,212,255,0.6)' }}>{selFile.name}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.15)' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
          <Upload className="h-4 w-4" style={{ color: '#00d4ff' }} /> Upload Feedback
        </p>
        <span className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>EML, MBOX, CSV, TXT, PDF, DOCX</span>
      </div>
      <div
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 transition-all"
        style={{
          borderColor: isDragging ? '#00d4ff' : 'rgba(0,212,255,0.2)',
          background: isDragging ? 'rgba(0,212,255,0.05)' : 'transparent',
          boxShadow: isDragging ? '0 0 20px rgba(0,212,255,0.1)' : 'none',
        }}
      >
        <FileText className="h-8 w-8" style={{ color: isDragging ? '#00d4ff' : 'rgba(0,212,255,0.3)' }} />
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>
            {isDragging ? 'Drop your file here' : 'Drag & drop or click to select'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>Email, CSV, PDF, DOCX, or plain text — max 500 items</p>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ─── Generate PRD Modal ───────────────────────────────────────────────────────

function GeneratePRDModal({ theme, productAreaId, onClose, onSaved }: {
  theme: ApiTheme;
  productAreaId: string | undefined;
  onClose: () => void;
  onSaved: (docId: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const accRef = useRef('');
  const docIdRef = useRef<string | null>(null);

  const generate = useCallback(async () => {
    setStatus('generating');
    accRef.current = '';
    docIdRef.current = null;
    setStreamedText('');

    await fetchSSEPost('/api/documents', {
      title: theme.name,
      type: 'PRD',
      productAreaId: productAreaId ?? undefined,
      context: {
        themes: [theme.name],
        feedbackSummary: `${theme.item_count} feedback item(s) about "${theme.name}"`,
      },
    }, {
      onMessage: (chunk) => {
        accRef.current += chunk;
        setStreamedText(accRef.current);
      },
      onEvent: (eventName, data) => {
        if (eventName === 'meta') {
          try { const p = JSON.parse(data); if (p.documentId) docIdRef.current = p.documentId; } catch { /* ignore */ }
        }
      },
      onDone: async () => {
        const resolvedId = docIdRef.current;
        if (resolvedId && accRef.current) {
          try {
            await apiClient.put(`/api/documents/${resolvedId}`, {
              sections: { content: accRef.current },
            });
            onSaved(resolvedId);
          } catch { /* non-fatal */ }
        }
        setStatus('done');
      },
      onError: (msg) => {
        setErrMsg(msg ?? 'Generation failed');
        setStatus('error');
      },
    }).catch((e: Error) => {
      setErrMsg(e.message ?? 'Generation failed');
      setStatus('error');
    });
  }, [theme, productAreaId, onSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(2,2,18,0.85)', backdropFilter: 'blur(6px)' }}>
      <div className="relative flex flex-col rounded-2xl w-full max-w-2xl max-h-[85vh]" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.98),rgba(6,6,26,0.98))', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 60px rgba(168,85,247,0.15)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
              <Sparkles className="h-4 w-4" style={{ color: '#a855f7' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Generate PRD</p>
              <p className="text-xs" style={{ color: 'rgba(168,85,247,0.7)' }}>{theme.name} · {theme.item_count} feedback items</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-all hover:bg-white/5" style={{ color: 'rgba(148,163,184,0.5)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {status === 'idle' && (
            <div className="text-center py-8">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <FileText className="h-8 w-8" style={{ color: '#a855f7' }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#e2e8f0' }}>Ready to generate</p>
              <p className="text-xs mb-2" style={{ color: 'rgba(148,163,184,0.6)' }}>
                PMAI will create a full PRD based on the <span style={{ color: '#a855f7' }}>{theme.name}</span> feedback theme, including problem statement, goals, target users, functional requirements, and success criteria.
              </p>
              {theme.description && (
                <div className="mt-3 rounded-lg px-4 py-3 text-left" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <p className="text-xs" style={{ color: 'rgba(168,85,247,0.8)' }}>{theme.description}</p>
                </div>
              )}
            </div>
          )}

          {(status === 'generating' || status === 'done') && (
            <div>
              {status === 'generating' && streamedText === '' && (
                <div className="flex items-center gap-2 mb-3" style={{ color: 'rgba(168,85,247,0.7)' }}>
                  <LoadingSpinner size="sm" />
                  <span className="text-xs">Generating PRD…</span>
                </div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.85)' }}>
                {streamedText}
                {status === 'generating' && streamedText && (
                  <span className="inline-block h-3 w-0.5 animate-pulse align-middle ml-0.5" style={{ background: '#a855f7' }} />
                )}
              </pre>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)' }}>
              <XCircle className="h-5 w-5 shrink-0" style={{ color: '#ff2d8b' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#ff2d8b' }}>Generation failed</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,45,139,0.7)' }}>{errMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: '1px solid rgba(168,85,247,0.1)' }}>
          {status === 'done' ? (
            <>
              <div className="flex items-center gap-2" style={{ color: '#00ff88' }}>
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-semibold">PRD saved to Documents</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>
                  Close
                </button>
                <a href="/documents" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all" style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(0,212,255,0.1))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  View in Documents
                </a>
              </div>
            </>
          ) : status === 'error' ? (
            <>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>Cancel</button>
              <button onClick={generate} className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-all" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>Try Again</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }}>Cancel</button>
              <button
                onClick={generate}
                disabled={status === 'generating'}
                className="flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(0,212,255,0.1))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7', boxShadow: status === 'idle' ? '0 0 15px rgba(168,85,247,0.15)' : 'none' }}
              >
                {status === 'generating' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</> : <><Sparkles className="h-3.5 w-3.5" />Generate PRD</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedbackHub() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<UploadResponse | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [prdTheme, setPrdTheme] = useState<ApiTheme | null>(null);

  const { data: items = [], isLoading, isError } = useQuery<ApiFeedbackItem[]>({
    queryKey: ['feedback', projectId, activeChannel],
    queryFn: () => apiClient.get('/api/feedback', { params: { ...(projectId ? { productAreaId: projectId } : {}), ...(activeChannel ? { channel: activeChannel } : {}) } }).then((r) => r.data.data.items ?? []),
    retry: false,
  });

  const { data: themes = [] } = useQuery<ApiTheme[]>({
    queryKey: ['feedback-themes', projectId],
    queryFn: () => apiClient.get('/api/feedback/themes', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data.themes ?? []),
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiClient.post('/api/feedback/sync').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState('');
  const [isAnalysing, setIsAnalysing] = useState(false);

  const handleAnalyseExisting = async () => {
    setIsAnalysing(true);
    try {
      const r = await apiClient.post('/api/feedback/analyse-existing', { productAreaId: projectId ?? null });
      const result = r.data.data as UploadResponse;
      if (result.themes?.length > 0) {
        setPendingApproval(result);
      } else {
        setSuccessBanner('No themes found in existing feedback.');
        setTimeout(() => setSuccessBanner(null), 5000);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Analysis failed';
      setSuccessBanner(msg);
      setTimeout(() => setSuccessBanner(null), 5000);
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleGenerateFromExisting = async () => {
    setIsGenerating(true);
    setGenerateProgress('Starting pipeline…');
    await fetchSSEPost('/api/feedback/pipeline/run-from-existing',
      { productAreaId: projectId ?? null },
      {
        onMessage: () => {},
        onEvent: (eventName, data) => {
          if (eventName === 'progress') {
            try { const p = JSON.parse(data); setGenerateProgress(p.message); } catch { /* ignore */ }
          } else if (eventName === 'done') {
            setIsGenerating(false);
            setGenerateProgress('');
            setSuccessBanner('Roadmap, PRD, User Stories & Sprint created from existing feedback!');
            queryClient.invalidateQueries({ queryKey: ['roadmap'] });
            queryClient.invalidateQueries({ queryKey: ['documents'] });
            queryClient.invalidateQueries({ queryKey: ['sprint'] });
            setTimeout(() => setSuccessBanner(null), 8000);
          } else if (eventName === 'error') {
            setIsGenerating(false);
            setGenerateProgress('');
            setSuccessBanner('Pipeline failed: ' + data);
            setTimeout(() => setSuccessBanner(null), 5000);
          }
        },
        onDone: () => { setIsGenerating(false); setGenerateProgress(''); },
        onError: () => { setIsGenerating(false); setGenerateProgress(''); },
      }
    ).catch(() => { setIsGenerating(false); setGenerateProgress(''); });
  };

  const handleUploadSuccess = (result: UploadResponse) => {
    queryClient.invalidateQueries({ queryKey: ['feedback'] });
    queryClient.invalidateQueries({ queryKey: ['feedback-themes'] });
    // Show approval modal if there are themes to process
    if (result.themes?.length > 0) {
      setPendingApproval(result);
    } else {
      setSuccessBanner(result.message);
      setTimeout(() => setSuccessBanner(null), 6000);
    }
  };

  const handlePipelineCommitted = () => {
    setPendingApproval(null);
    setSuccessBanner('Pipeline complete! PRD, User Stories, Roadmap & Sprint created. Check Documents and Sprint Planner.');
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['roadmap'] });
    queryClient.invalidateQueries({ queryKey: ['sprint'] });
    queryClient.invalidateQueries({ queryKey: ['feedback-themes'] });
    setTimeout(() => setSuccessBanner(null), 8000);
  };

  const pos = items.filter((f) => f.sentiment === 'positive').length;
  const neu = items.filter((f) => f.sentiment === 'neutral').length;
  const neg = items.filter((f) => f.sentiment === 'negative').length;

  return (
    <div className="flex h-full flex-col" style={{ background: '#020212' }}>
      {/* PRD generation modal */}
      {prdTheme && (
        <GeneratePRDModal
          theme={prdTheme}
          productAreaId={projectId}
          onClose={() => setPrdTheme(null)}
          onSaved={(_docId) => {
            queryClient.invalidateQueries({ queryKey: ['documents'] });
            setSuccessBanner(`PRD for "${prdTheme.name}" saved to Documents!`);
            setTimeout(() => setSuccessBanner(null), 8000);
            // Modal stays open showing "View in Documents" — user closes manually
          }}
        />
      )}

      {/* Pipeline approval modal */}
      {pendingApproval && (
        <PipelineApprovalModal
          preview={pendingApproval.preview}
          themes={pendingApproval.themes}
          themeCounts={pendingApproval.themeCounts}
          themeEvidence={pendingApproval.themeEvidence ?? []}
          feedbackCount={pendingApproval.feedbackCount}
          productAreaId={pendingApproval.productAreaId}
          onClose={() => {
            setPendingApproval(null);
            setSuccessBanner(pendingApproval.message + ' (AI plan skipped — you can re-upload to create documents)');
            setTimeout(() => setSuccessBanner(null), 6000);
          }}
          onCommitted={handlePipelineCommitted}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.8)' }}>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(0,212,255,0.5)' }}>◆ FEEDBACK HUB</p>
          <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Customer Feedback</h1>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>{items.length.toLocaleString()} items across all channels</p>
        </div>
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <button
              onClick={handleAnalyseExisting}
              disabled={isAnalysing}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(168,85,247,0.1))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff', boxShadow: isAnalysing ? 'none' : '0 0 15px rgba(0,212,255,0.15)' }}
            >
              {isAnalysing
                ? <><Loader2 className="h-4 w-4 animate-spin" />Analysing…</>
                : <><Sparkles className="h-4 w-4" />Analyse Feedback</>
              }
            </button>
          )}
          {themes.length > 0 && (
            <button
              onClick={handleGenerateFromExisting}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(0,212,255,0.1))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7', boxShadow: isGenerating ? 'none' : '0 0 15px rgba(168,85,247,0.15)' }}
            >
              {isGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin" />{generateProgress || 'Running…'}</>
                : <><Sparkles className="h-4 w-4" />Generate Roadmap & PRD</>
              }
            </button>
          )}
        </div>
      </div>

      {successBanner && (
        <div className="flex items-center gap-2 px-8 py-2.5 shrink-0" style={{ background: 'rgba(0,255,136,0.08)', borderBottom: '1px solid rgba(0,255,136,0.2)' }}>
          <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#00ff88' }} />
          <p className="text-sm" style={{ color: '#00ff88' }}>{successBanner}</p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — channels */}
        <div className="w-52 shrink-0 overflow-y-auto px-3 py-4" style={{ borderRight: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.5)' }}>
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.5)' }}>Channels</p>
          <button
            onClick={() => setActiveChannel(null)}
            className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
            style={{ background: activeChannel === null ? 'rgba(0,212,255,0.1)' : 'transparent', color: activeChannel === null ? '#00d4ff' : 'rgba(148,163,184,0.7)', borderLeft: activeChannel === null ? '2px solid #00d4ff' : '2px solid transparent' }}
          >
            All channels
          </button>
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all"
              style={{ background: activeChannel === ch.id ? 'rgba(0,212,255,0.1)' : 'transparent', color: activeChannel === ch.id ? '#00d4ff' : 'rgba(148,163,184,0.7)', borderLeft: activeChannel === ch.id ? '2px solid #00d4ff' : '2px solid transparent' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ch.color, boxShadow: `0 0 4px ${ch.color}` }} />
              {ch.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 overflow-y-auto p-6">
          <UploadZone onSuccess={handleUploadSuccess} />

          {/* Sentiment bar */}
          <div className="mb-4 rounded-xl p-4" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.1)' }}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider font-semibold" style={{ color: 'rgba(0,212,255,0.5)' }}>Sentiment</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1" style={{ color: '#00ff88' }}><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#00ff88' }} />+{pos}</span>
                <span className="flex items-center gap-1" style={{ color: 'rgba(148,163,184,0.6)' }}><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: 'rgba(148,163,184,0.4)' }} />~{neu}</span>
                <span className="flex items-center gap-1" style={{ color: '#ff2d8b' }}><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#ff2d8b' }} />-{neg}</span>
              </div>
            </div>
            <SentimentBar positive={pos} neutral={neu} negative={neg} />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
          ) : isError ? (
            <div className="rounded-xl p-6 text-center text-sm" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
              Failed to load feedback. Please try again.
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl py-16 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(0,212,255,0.08)' }}>
              <MessageSquare className="mb-3 h-10 w-10" style={{ color: 'rgba(0,212,255,0.2)' }} />
              <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>No feedback yet</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Upload email, CSV, PDF or DOCX files above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const st = sentimentStyle(item.sentiment);
                return (
                  <div key={item.id} className="rounded-xl p-4 transition-all hover:translate-x-0.5"
                    style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.8),rgba(6,6,26,0.8))', border: '1px solid rgba(0,212,255,0.1)' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>{item.channel}</span>
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{item.sentiment}</span>
                          {typeof item.sentiment_score === 'number' && (
                            <span className="text-xs" style={{ color: 'rgba(100,116,139,0.7)' }}>score: {item.sentiment_score.toFixed(2)}</span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(226,232,240,0.8)' }}>{item.body}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {item.author && <p className="text-xs font-medium" style={{ color: 'rgba(226,232,240,0.7)' }}>{item.author}</p>}
                        <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{item.received_at ? new Date(item.received_at).toLocaleDateString() : ''}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel: themes */}
        <div className="w-56 shrink-0 overflow-y-auto px-4 py-4" style={{ borderLeft: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.5)' }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.6)' }}>Theme Clusters</p>
          {themes.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'rgba(100,116,139,0.5)' }}>No themes yet</p>
          ) : (
            <div className="space-y-2">
              {themes.map((theme, idx) => {
                const colors = ['#ff2d8b', '#ffee00', '#00d4ff', '#00ff88', '#a855f7'];
                const c = colors[idx % colors.length];
                const pct = Math.min(100, (theme.item_count / (themes[0]?.item_count ?? 1)) * 100);
                return (
                  <div key={theme.id} className="rounded-lg p-3" style={{ background: 'rgba(10,10,36,0.8)', border: '1px solid rgba(168,85,247,0.15)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold truncate flex-1" style={{ color: 'rgba(226,232,240,0.8)' }}>{theme.name}</span>
                      <span className="ml-2 shrink-0 text-sm font-bold" style={{ color: c }}>{theme.item_count}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: c, boxShadow: `0 0 6px ${c}80` }} />
                    </div>
                    <button
                      onClick={() => setPrdTheme(theme)}
                      className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs font-medium transition-all hover:opacity-90"
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      Generate PRD
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, CheckCircle, XCircle, FileText, MessageSquare, Sparkles, Loader2, X,
  Tag, TrendingUp, AlertTriangle, BookOpen, Archive, Trash2, ChevronDown, ChevronUp,
  Zap, Users, DollarSign, Star, ThumbsUp, Inbox, CheckSquare, Brain, RefreshCw, Bot,
  Scale,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PipelineApprovalModal, type PipelinePreview } from '../components/PipelineApprovalModal';
import { useProject } from '../contexts/ProjectContext';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApiFeedbackItem {
  id: string; channel: string; author: string; body: string;
  sentiment: string; sentiment_score: number; received_at: string;
  product_area_id: string | null; source_url: string | null;
  status: 'new' | 'addressed';
  agent_category?: string | null;
  agent_priority?: string | null;
  agent_composite_score?: number | null;
}
interface StakeholderVote {
  role: string;
  recommendation: string;
  rationale: string;
  concerns: string[];
}
interface ApiTheme {
  id: string; name: string; item_count: number; description: string | null;
  agent_triage_decision?: string | null;
  agent_triage_rationale?: string | null;
  agent_triage_details?: string | null;
  agent_triage_actioned?: number | null;
}
interface PulseSnapshot {
  alertLevel: 'Critical' | 'Warning' | 'Healthy' | 'None';
  coverageScore: number;
  criticalGapCount: number;
  topGaps: string[];
  nudge: string;
}

interface FeedbackClassification {
  id: string;
  theme_name: string;
  category: string;
  type: 'Fix' | 'Enhancement';
  customer_aspect: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priority_rationale: string;
  critical_recommendation: number;
  critical_reason: string;
  financial_benefits: string;
  qualitative_benefits: string;
  tradeoffs: string;
  affected_users: string;
  revenue_impact: string;
  pm_decision: 'backlog' | 'dismissed' | 'pending';
  pm_decision_at: string | null;
  feedback_count: number;
  roadmap_item_id: string | null;
}

interface ConflictVerdict {
  themeId: string;
  themeName: string;
  feedbackCount: number;
  monitorPriority: string | null;
  monitorCategory: string | null;
  triageDecision: string | null;
  negSentimentPct: number;
  isConflict: boolean;
  score: number;
  verdict: string;
  rationale: string;
}

interface ConflictResult {
  verdicts: ConflictVerdict[];
  conflicts: number;
  message: string;
}

interface UploadResponse {
  inserted: number; ids: string[]; themes: string[]; themeCounts: number[];
  themeEvidence: string[]; feedbackCount: number; productAreaId: string | null;
  preview: PipelinePreview; message: string;
}

const ACCEPTED = '.eml,.mbox,.csv,.txt,.md,.pdf,.docx,.doc';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sentimentStyle(s: string) {
  if (s === 'positive') return { color: '#00ff88', border: 'rgba(0,255,136,0.3)', bg: 'rgba(0,255,136,0.08)', label: 'Positive' };
  if (s === 'negative') return { color: '#ff2d8b', border: 'rgba(255,45,139,0.3)', bg: 'rgba(255,45,139,0.08)', label: 'Negative' };
  return { color: 'rgba(148,163,184,0.8)', border: 'rgba(148,163,184,0.2)', bg: 'rgba(148,163,184,0.06)', label: 'Neutral' };
}

function priorityConfig(p: string) {
  if (p === 'critical') return { color: '#ff2d8b', bg: 'rgba(255,45,139,0.12)', border: 'rgba(255,45,139,0.35)', label: 'CRITICAL' };
  if (p === 'high')     return { color: '#ffaa00', bg: 'rgba(255,170,0,0.12)',   border: 'rgba(255,170,0,0.35)',   label: 'HIGH' };
  if (p === 'medium')   return { color: '#00d4ff', bg: 'rgba(0,212,255,0.08)',   border: 'rgba(0,212,255,0.25)',   label: 'MEDIUM' };
  return                       { color: 'rgba(148,163,184,0.7)', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', label: 'LOW' };
}

function priorityColor(p: string): string {
  if (p === 'Critical') return '#ff2d8b';
  if (p === 'High')     return '#ffaa00';
  if (p === 'Medium')   return '#00d4ff';
  return 'rgba(148,163,184,0.5)';
}

function categoryColor2(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('bug') || c.includes('reliab') || c.includes('security')) return '#ff2d8b';
  if (c.includes('performance')) return '#ffaa00';
  if (c.includes('integration') || c.includes('api')) return '#00ff88';
  if (c.includes('ux') || c.includes('usab') || c.includes('onboard')) return '#00d4ff';
  return 'rgba(148,163,184,0.6)';
}

function channelColor(channel: string): string {
  const c = channel.toLowerCase();
  if (c === 'email') return '#00d4ff';
  if (c === 'slack') return '#a855f7';
  if (c === 'survey') return '#00ff88';
  if (c === 'support') return '#ffaa00';
  return 'rgba(148,163,184,0.6)';
}

function categoryColor(cat: string) {
  const map: Record<string, string> = {
    'Bug Fix / Reliability': '#ff2d8b', 'Feature Request': '#a855f7',
    'UX / Usability': '#00d4ff', 'Performance': '#ffaa00',
    'Integration / API': '#00ff88', 'Security / Compliance': '#ff6b35',
    'Onboarding / Documentation': '#3b82f6', 'Billing / Pricing': '#f59e0b',
  };
  return map[cat] ?? '#a855f7';
}

function parseJson(s: string, fallback: string[] = []): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

// ─── Upload Zone ───────────────────────────────────────────────────────────────

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

  if (status === 'error') return (
    <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)' }}>
      <div className="flex items-center gap-3">
        <XCircle className="h-5 w-5 shrink-0" style={{ color: '#ff2d8b' }} />
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: '#ff2d8b' }}>Upload failed</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,45,139,0.7)' }}>{errMsg}</p>
        </div>
        <button onClick={() => { setStatus('idle'); setErrMsg(''); }} className="text-xs underline" style={{ color: '#ff2d8b' }}>Try again</button>
      </div>
    </div>
  );

  if (status === 'uploading') return (
    <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
      <div className="flex items-center gap-3">
        <LoadingSpinner size="sm" />
        <div>
          <p className="text-sm font-medium" style={{ color: '#00d4ff' }}>Analysing feedback…</p>
          {selFile && <p className="text-xs mt-0.5" style={{ color: 'rgba(0,212,255,0.6)' }}>{selFile.name}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => fileRef.current?.click()}
      className="mb-6 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-6 py-4 transition-all"
      style={{
        borderColor: isDragging ? '#00d4ff' : 'rgba(0,212,255,0.2)',
        background: isDragging ? 'rgba(0,212,255,0.05)' : 'rgba(6,6,26,0.6)',
      }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)' }}>
        <Upload className="h-5 w-5" style={{ color: '#00d4ff' }} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Upload Feedback</p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>EML, MBOX, CSV, TXT, PDF, DOCX — drag & drop or click · max 500 items</p>
      </div>
      <span className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>Browse</span>
      <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Feedback Card (Inbox + Addressed) ─────────────────────────────────────────

function FeedbackCard({ item, onDelete, onAddress }: {
  item: ApiFeedbackItem;
  onDelete: (id: string) => void;
  onAddress?: (id: string, status: 'new' | 'addressed') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const st = sentimentStyle(item.sentiment);
  const preview = item.body.length > 240 ? item.body.slice(0, 240) + '…' : item.body;

  return (
    <div className="rounded-xl overflow-hidden transition-all hover:translate-y-[-1px]"
      style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,212,255,0.1)' }}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>{item.channel}</span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{st.label}</span>
              {/* Agent enrichment badges — written back by Feedback Monitor agent */}
              {item.agent_priority && (() => {
                const pc = priorityConfig(item.agent_priority!.toLowerCase());
                return (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold flex items-center gap-1" style={{ background: pc.bg, border: `1px solid ${pc.border}`, color: pc.color }}>
                    <Bot className="h-3 w-3" />{pc.label}
                  </span>
                );
              })()}
              {item.agent_category && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `${categoryColor(item.agent_category)}18`, border: `1px solid ${categoryColor(item.agent_category)}40`, color: categoryColor(item.agent_category) }}>
                  {item.agent_category}
                </span>
              )}
              {item.status === 'addressed' && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
                  <CheckCircle className="h-3 w-3" />Addressed
                </span>
              )}
            </div>

            {/* Body */}
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'rgba(226,232,240,0.85)' }}>
              {expanded ? item.body : preview}
            </p>
            {item.body.length > 240 && (
              <button onClick={() => setExpanded(v => !v)} className="text-xs mt-2 flex items-center gap-1" style={{ color: 'rgba(0,212,255,0.7)' }}>
                {expanded ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Read full feedback</>}
              </button>
            )}
          </div>

          {/* Meta + Actions */}
          <div className="shrink-0 flex flex-col items-end gap-2 ml-2">
            {item.author && <p className="text-xs font-medium text-right" style={{ color: 'rgba(226,232,240,0.7)' }}>{item.author.split('<')[0].trim()}</p>}
            <p className="text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>{item.received_at ? new Date(item.received_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {onAddress && item.status === 'new' && (
                <button
                  onClick={() => onAddress(item.id, 'addressed')}
                  title="Mark as addressed"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all hover:opacity-90"
                  style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}
                >
                  <CheckSquare className="h-3 w-3" />Address
                </button>
              )}
              {onAddress && item.status === 'addressed' && (
                <button
                  onClick={() => onAddress(item.id, 'new')}
                  title="Reopen"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all hover:opacity-90"
                  style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.15)', color: 'rgba(148,163,184,0.6)' }}
                >
                  <RefreshCw className="h-3 w-3" />Reopen
                </button>
              )}
              <button
                onClick={() => onDelete(item.id)}
                title="Delete"
                className="flex items-center justify-center rounded-lg p-1.5 transition-all hover:opacity-90"
                style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Classification Card (Intelligence tab) ────────────────────────────────────

function ClassificationCard({ item, onDecision }: {
  item: FeedbackClassification;
  onDecision: (id: string, decision: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pc = priorityConfig(item.priority);
  const cc = categoryColor(item.category);
  const isCritical = item.critical_recommendation === 1;
  const financial = parseJson(item.financial_benefits);
  const qualitative = parseJson(item.qualitative_benefits);
  const tradeoffs = parseJson(item.tradeoffs);

  const decisionLabel = item.pm_decision === 'backlog' ? 'Backlog'
    : item.pm_decision === 'dismissed' ? 'Dismissed' : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.97),rgba(6,6,26,0.97))', border: `1px solid ${isCritical && item.pm_decision === 'pending' ? pc.border : 'rgba(255,255,255,0.08)'}` }}>

      {/* AI critical banner */}
      {isCritical && item.pm_decision === 'pending' && (
        <div className="flex items-start gap-2.5 px-5 py-3" style={{ background: 'linear-gradient(90deg,rgba(255,45,139,0.12),rgba(255,170,0,0.08))', borderBottom: `1px solid ${pc.border}` }}>
          <Star className="h-4 w-4 shrink-0 mt-0.5" style={{ color: pc.color }} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: pc.color }}>AI Recommends: Add to Backlog</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(226,232,240,0.65)' }}>{item.critical_reason}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ background: pc.bg, border: `1px solid ${pc.border}`, color: pc.color }}>{pc.label}</span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ background: item.type === 'Fix' ? 'rgba(255,107,53,0.12)' : 'rgba(168,85,247,0.12)', border: item.type === 'Fix' ? '1px solid rgba(255,107,53,0.4)' : '1px solid rgba(168,85,247,0.4)', color: item.type === 'Fix' ? '#ff6b35' : '#a855f7' }}>{item.type ?? 'Enhancement'}</span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `${cc}18`, border: `1px solid ${cc}40`, color: cc }}>{item.category}</span>
              <span className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{item.feedback_count} feedback item{item.feedback_count !== 1 ? 's' : ''}</span>
              {decisionLabel && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{
                  background: item.pm_decision === 'backlog' ? 'rgba(0,212,255,0.08)' : 'rgba(148,163,184,0.06)',
                  border: item.pm_decision === 'backlog' ? '1px solid rgba(0,212,255,0.25)' : '1px solid rgba(148,163,184,0.15)',
                  color: item.pm_decision === 'backlog' ? '#00d4ff' : 'rgba(148,163,184,0.5)',
                }}>
                  {decisionLabel}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: '#e2e8f0' }}>{item.theme_name}</h3>
            {item.customer_aspect && (
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>
                <span className="font-medium" style={{ color: 'rgba(168,85,247,0.8)' }}>Customer aspect: </span>{item.customer_aspect}
              </p>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)} className="shrink-0 rounded-lg p-2 transition-all hover:bg-white/5" style={{ color: 'rgba(148,163,184,0.4)' }}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Priority rationale */}
        <div className="rounded-lg px-3.5 py-2.5" style={{ background: pc.bg, border: `1px solid ${pc.border}` }}>
          <p className="text-xs flex items-center gap-1.5 font-semibold mb-0.5" style={{ color: pc.color }}><Zap className="h-3 w-3" />Priority Rationale</p>
          <p className="text-xs" style={{ color: 'rgba(226,232,240,0.7)' }}>{item.priority_rationale}</p>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="pt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Financial Benefits */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.18)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: '#00ff88' }}>
                <DollarSign className="h-3.5 w-3.5" />Financial Benefits of Implementing
              </p>
              <ul className="space-y-2">
                {financial.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(226,232,240,0.8)' }}>
                    <span className="shrink-0 font-bold mt-0.5" style={{ color: '#00ff88' }}>$</span>{b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Qualitative Benefits */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.18)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: '#00d4ff' }}>
                <ThumbsUp className="h-3.5 w-3.5" />Qualitative Benefits
              </p>
              <ul className="space-y-2">
                {qualitative.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(226,232,240,0.8)' }}>
                    <span className="shrink-0 font-bold mt-0.5" style={{ color: '#00d4ff' }}>✓</span>{b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Trade-offs */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,45,139,0.04)', border: '1px solid rgba(255,45,139,0.18)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5" style={{ color: '#ff6b6b' }}>
              <AlertTriangle className="h-3.5 w-3.5" />Trade-offs of NOT Implementing
            </p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {tradeoffs.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(226,232,240,0.8)' }}>
                  <span className="shrink-0 font-bold mt-0.5" style={{ color: '#ff6b6b' }}>✗</span>{t}
                </div>
              ))}
            </div>
          </div>

          {/* Affected users + revenue */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.18)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1" style={{ color: '#a855f7' }}><Users className="h-3 w-3" />Affected Users</p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.7)' }}>{item.affected_users}</p>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.18)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1" style={{ color: '#ffaa00' }}><TrendingUp className="h-3 w-3" />Revenue Impact</p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.7)' }}>{item.revenue_impact}</p>
            </div>
          </div>
        </div>
      )}

      {/* PM Decision footer */}
      {item.pm_decision === 'pending' ? (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}>
          <p className="text-xs font-semibold mr-auto" style={{ color: 'rgba(148,163,184,0.5)' }}>PM Decision:</p>
          <div className="flex flex-col items-start gap-0.5">
            <button onClick={() => onDecision(item.id, 'backlog')}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all hover:opacity-90"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
              <Archive className="h-3.5 w-3.5" />Add to Backlog
            </button>
            <p className="text-xs pl-1" style={{ color: 'rgba(148,163,184,0.35)' }}>Accept — add to backlog for planning</p>
          </div>
          <button onClick={() => onDecision(item.id, 'dismissed')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:opacity-90"
            style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.15)', color: 'rgba(148,163,184,0.5)' }}>
            <X className="h-3.5 w-3.5" />Dismiss
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
          <span className="text-xs font-semibold flex items-center gap-1.5" style={{
            color: item.pm_decision === 'backlog' ? '#00d4ff' : 'rgba(148,163,184,0.5)'
          }}>
            <CheckCircle className="h-3.5 w-3.5" />
            {item.pm_decision === 'backlog' ? 'Added to Backlog' : 'Dismissed'}
            {item.roadmap_item_id && <span className="ml-1 font-normal" style={{ color: 'rgba(148,163,184,0.4)' }}>· Roadmap item created</span>}
          </span>
          <button onClick={() => onDecision(item.id, 'pending')} className="text-xs underline" style={{ color: 'rgba(148,163,184,0.35)' }}>Reset decision</button>
        </div>
      )}
    </div>
  );
}

// ─── Main FeedbackHub ──────────────────────────────────────────────────────────

export function FeedbackHub() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [activeTab, setActiveTab] = useState<'inbox' | 'intelligence' | 'addressed'>('inbox');
  const [pendingRoadmapApproval, setPendingRoadmapApproval] = useState<UploadResponse | null>(null);
  const [banner, setBanner] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);
  const [isResolvingConflicts, setIsResolvingConflicts] = useState(false);

  const showBanner = (msg: string, type: 'success' | 'error' = 'success') => {
    setBanner({ msg, type });
    setTimeout(() => setBanner(null), 7000);
  };

  // ── Queries — staleTime:0 so navigating back from Agent Center always fetches fresh data ──
  const feedbackQuery = useQuery<ApiFeedbackItem[]>({
    queryKey: ['feedback', 'new'],
    queryFn: () => apiClient.get('/api/feedback', { params: { status: 'new', limit: 100 } }).then(r => r.data.data.items ?? []),
    retry: false,
    staleTime: 0,
  });

  const addressedQuery = useQuery<ApiFeedbackItem[]>({
    queryKey: ['feedback', 'addressed'],
    queryFn: () => apiClient.get('/api/feedback', { params: { status: 'addressed', limit: 100 } }).then(r => r.data.data.items ?? []),
    retry: false,
    staleTime: 0,
  });

  const themesQuery = useQuery<ApiTheme[]>({
    queryKey: ['feedback-themes'],
    queryFn: () => apiClient.get('/api/feedback/themes').then(r => r.data.data.themes ?? []),
    retry: false,
    staleTime: 0,
  });

  const classificationsQuery = useQuery<FeedbackClassification[]>({
    queryKey: ['feedback-classifications'],
    queryFn: () => apiClient.get('/api/feedback/classifications').then(r => r.data.data.classifications ?? []),
    retry: false,
    staleTime: 0,
  });

  const pulseQuery = useQuery<PulseSnapshot>({
    queryKey: ['agent-pulse', projectId],
    queryFn: () => apiClient.get('/api/agents/latest-pulse', { params: projectId ? { productAreaId: projectId } : {} }).then(r => r.data.data),
    retry: false,
    staleTime: 0,
  });

  const newItems = feedbackQuery.data ?? [];
  const addressedItems = addressedQuery.data ?? [];
  const themes = themesQuery.data ?? [];
  const classifications = classificationsQuery.data ?? [];

  // ── Mutations ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/feedback/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      showBanner('Feedback deleted.');
    },
    onError: () => showBanner('Could not delete feedback.', 'error'),
  });

  const addressMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'new' | 'addressed' }) =>
      apiClient.patch(`/api/feedback/items/${id}/address`, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      showBanner(status === 'addressed' ? 'Feedback marked as addressed.' : 'Feedback reopened.');
    },
  });

  const handleDecision = async (id: string, decision: string) => {
    try {
      await apiClient.patch(`/api/feedback/classifications/${id}/decision`, { decision });
      queryClient.invalidateQueries({ queryKey: ['feedback-classifications'] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
      if (decision === 'backlog') showBanner('Added to Backlog — PRD auto-drafted and feedback marked addressed.');
      else if (decision === 'dismissed') showBanner('Theme dismissed — feedback marked as addressed.');
      else showBanner('Decision reset.');
    } catch { showBanner('Could not save decision.', 'error'); }
  };

  const handleResolveConflicts = async () => {
    setIsResolvingConflicts(true);
    try {
      const r = await apiClient.post<{ data: ConflictResult }>('/api/agents/conflict-resolver', {});
      setConflictResult(r.data.data);
    } catch {
      showBanner('Conflict resolver failed.', 'error');
    } finally {
      setIsResolvingConflicts(false);
    }
  };

  const handleTriageAction = async (themeId: string, themeName: string, themeDescription?: string) => {
    try {
      await apiClient.post('/api/agents/triage-action', { themeId, themeName, themeDescription });
      queryClient.invalidateQueries({ queryKey: ['feedback-themes'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-classifications'] });
      queryClient.invalidateQueries({ queryKey: ['roadmap'] });
      showBanner(`"${themeName}" moved to Backlog — roadmap item created.`);
    } catch {
      showBanner('Could not create roadmap item.', 'error');
    }
  };

  const handleAnalyseExisting = async () => {
    setIsAnalysing(true);
    try {
      const r = await apiClient.post('/api/feedback/analyse-existing', { productAreaId: projectId ?? null });
      const result = r.data.data as UploadResponse;
      queryClient.invalidateQueries({ queryKey: ['feedback-themes'] });
      if (result.themes?.length > 0) {
        showBanner(`${result.themes.length} theme(s) detected from ${result.feedbackCount} feedback items. Click "Classify & Score" to generate intelligence.`);
      } else {
        showBanner('No themes found in existing feedback.', 'error');
      }
    } catch (err: unknown) {
      showBanner((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Analysis failed.', 'error');
    } finally { setIsAnalysing(false); }
  };

  const handleClassify = async () => {
    if (themes.length === 0) { showBanner('No themes to classify. Upload and analyse feedback first.', 'error'); return; }
    setIsAnalysing(true);
    try {
      await apiClient.post('/api/feedback/classify', {
        themes: themes.map(t => t.name),
        themeCounts: themes.map(t => t.item_count),
        productAreaId: projectId ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ['feedback-classifications'] });
      setActiveTab('intelligence');
      showBanner(`Classified ${themes.length} theme(s). Review the Intelligence tab for PM recommendations.`);
    } catch (err: unknown) {
      showBanner((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Classification failed.', 'error');
    } finally { setIsAnalysing(false); }
  };

  const handleGenerateRoadmap = async () => {
    if (themes.length === 0) { showBanner('No themes found. Upload and analyse feedback first.', 'error'); return; }
    // Show preview modal so PM can review before generating all documents
    const preview = {
      themes: themes.map(t => ({ name: t.name, count: t.item_count })),
      proposedPRD: { title: `Product Requirements — ${themes.slice(0,2).map(t=>t.name).join(' & ')}`, overview: `Based on ${newItems.length + addressedItems.length} feedback item(s) across ${themes.length} theme(s).` },
      proposedUserStories: themes.map(t => ({ title: `User Stories — ${t.name}` })),
      proposedRoadmapItems: themes.map((t, i) => ({ title: `Address: ${t.name}`, description: `${t.item_count} feedback item(s) about "${t.name}".`, priority: Math.max(1, 10-i) })),
      proposedSprintName: `Sprint ${new Date().toISOString().slice(0,10)} — ${themes.slice(0,2).map(t=>t.name).join(' & ')}`,
      proposedTickets: themes.slice(0,5).map((t, i) => ({ title: `[${(['STORY','STORY','TASK','SPIKE','BUG'])[i%5]}] ${t.name}`, type: (['story','story','task','spike','bug'])[i%5], points: [5,8,3,5,3][i%5] })),
    };
    setPendingRoadmapApproval({
      inserted: 0, ids: [], preview,
      themes: themes.map(t => t.name),
      themeCounts: themes.map(t => t.item_count),
      themeEvidence: [],
      feedbackCount: newItems.length + addressedItems.length,
      productAreaId: projectId ?? null,
      message: '',
    });
  };

  const handleUploadSuccess = async (result: UploadResponse) => {
    // Immediately refresh feedback list and themes
    await queryClient.refetchQueries({ queryKey: ['feedback', 'new'] });
    await queryClient.refetchQueries({ queryKey: ['feedback-themes'] });
    showBanner(`${result.inserted} item(s) imported — running AI monitor…`);
    setIsAnalysing(true);

    try {
      await apiClient.post('/api/agents/feedback-monitor', {});
      // Force-refetch so Intelligence tab sees enriched items immediately
      await queryClient.refetchQueries({ queryKey: ['feedback', 'new'] });
      await queryClient.refetchQueries({ queryKey: ['feedback', 'addressed'] });
      queryClient.invalidateQueries({ queryKey: ['agent-pulse'] });
      setActiveTab('intelligence');
      showBanner(`${result.inserted} item(s) classified by AI Monitor. See Intelligence tab.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'AI monitor failed';
      showBanner(`Items imported but AI monitor error: ${msg}`, 'error');
    } finally {
      setIsAnalysing(false);
    }
  };

  const pendingClassifications = classifications.filter(c => c.pm_decision === 'pending');
  const decidedClassifications = classifications.filter(c => c.pm_decision !== 'pending');
  const criticalCount = pendingClassifications.filter(c => c.critical_recommendation === 1).length;

  // ── Tab definitions ──
  const agentClassifiedCount = [...newItems, ...addressedItems].filter(i => i.agent_priority).length;
  const intelligenceCount = agentClassifiedCount + pendingClassifications.length + themes.filter(t => t.agent_triage_decision).length;

  const tabs = [
    { id: 'inbox' as const,        label: 'Inbox',        icon: Inbox,       count: newItems.length,      color: '#00d4ff' },
    { id: 'intelligence' as const, label: 'Intelligence', icon: Brain,       count: intelligenceCount,    color: '#a855f7' },
    { id: 'addressed' as const,    label: 'Addressed',    icon: CheckSquare, count: addressedItems.length, color: '#00ff88' },
  ];

  return (
    <div className="flex h-full flex-col" style={{ background: '#020212' }}>

      {/* Pipeline approval modal — only for "Generate Roadmap & PRD" */}
      {pendingRoadmapApproval && (
        <PipelineApprovalModal
          preview={pendingRoadmapApproval.preview}
          themes={pendingRoadmapApproval.themes}
          themeCounts={pendingRoadmapApproval.themeCounts}
          themeEvidence={pendingRoadmapApproval.themeEvidence ?? []}
          feedbackCount={pendingRoadmapApproval.feedbackCount}
          productAreaId={pendingRoadmapApproval.productAreaId}
          onClose={() => { setPendingRoadmapApproval(null); showBanner('Roadmap generation skipped.'); }}
          onCommitted={() => {
            setPendingRoadmapApproval(null);
            queryClient.invalidateQueries({ queryKey: ['documents'] });
            queryClient.invalidateQueries({ queryKey: ['roadmap'] });
            queryClient.invalidateQueries({ queryKey: ['sprint'] });
            showBanner('Pipeline complete! PRD, User Stories, Roadmap & Sprint created.');
          }}
        />
      )}

      {/* Header */}
      <div className="shrink-0 px-4 sm:px-8 py-4 sm:py-5" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.9)' }}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(0,212,255,0.5)' }}>◆ FEEDBACK HUB</p>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#e2e8f0' }}>Customer Feedback</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
              {newItems.length} new · {addressedItems.length} addressed · {themes.length} theme{themes.length !== 1 ? 's' : ''}
              {criticalCount > 0 && <span className="ml-2 font-semibold" style={{ color: '#ff2d8b' }}>· {criticalCount} critical</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {newItems.length > 0 && (
              <button onClick={handleAnalyseExisting} disabled={isAnalysing}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(168,85,247,0.1))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}>
                {isAnalysing ? <><Loader2 className="h-4 w-4 animate-spin" />Analysing…</> : <><Sparkles className="h-4 w-4" />Analyse Feedback</>}
              </button>
            )}
            {themes.length > 0 && (
              <button onClick={handleClassify} disabled={isAnalysing}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(0,212,255,0.1))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>
                {isAnalysing ? <><Loader2 className="h-4 w-4 animate-spin" />…</> : <><Tag className="h-4 w-4" />Classify &amp; Score</>}
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4 sm:mt-5 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  background: active ? `${tab.color}18` : 'transparent',
                  border: active ? `1px solid ${tab.color}40` : '1px solid transparent',
                  color: active ? tab.color : 'rgba(148,163,184,0.5)',
                }}>
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-bold leading-none"
                    style={{ background: active ? `${tab.color}25` : 'rgba(148,163,184,0.1)', color: active ? tab.color : 'rgba(148,163,184,0.5)', minWidth: '18px', textAlign: 'center' }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div className="shrink-0 flex items-center gap-2 px-4 sm:px-8 py-2.5" style={{
          background: banner.type === 'error' ? 'rgba(255,45,139,0.08)' : 'rgba(0,255,136,0.08)',
          borderBottom: banner.type === 'error' ? '1px solid rgba(255,45,139,0.2)' : '1px solid rgba(0,255,136,0.2)',
        }}>
          {banner.type === 'error'
            ? <XCircle className="h-4 w-4 shrink-0" style={{ color: '#ff2d8b' }} />
            : <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#00ff88' }} />}
          <p className="text-sm" style={{ color: banner.type === 'error' ? '#ff2d8b' : '#00ff88' }}>{banner.msg}</p>
          <button onClick={() => setBanner(null)} className="ml-auto" style={{ color: 'rgba(148,163,184,0.4)' }}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Customer Pulse alert banner — shown when Agent has detected critical gaps */}
      {pulseQuery.data && (pulseQuery.data.alertLevel === 'Critical' || pulseQuery.data.alertLevel === 'Warning') && (
        <div className="shrink-0 flex items-start gap-3 px-4 sm:px-8 py-3" style={{
          background: pulseQuery.data.alertLevel === 'Critical' ? 'rgba(255,45,139,0.08)' : 'rgba(255,170,0,0.07)',
          borderBottom: pulseQuery.data.alertLevel === 'Critical' ? '1px solid rgba(255,45,139,0.25)' : '1px solid rgba(255,170,0,0.25)',
        }}>
          <Bot className="h-4 w-4 shrink-0 mt-0.5" style={{ color: pulseQuery.data.alertLevel === 'Critical' ? '#ff2d8b' : '#ffaa00' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: pulseQuery.data.alertLevel === 'Critical' ? '#ff2d8b' : '#ffaa00' }}>
              Customer Pulse · {pulseQuery.data.alertLevel} — {pulseQuery.data.coverageScore}% roadmap coverage
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(226,232,240,0.6)' }}>
              {pulseQuery.data.nudge}
              {pulseQuery.data.topGaps.length > 0 && (
                <> Top gaps: <span style={{ color: 'rgba(226,232,240,0.85)' }}>{pulseQuery.data.topGaps.join(', ')}</span></>
              )}
            </p>
          </div>
          <a href="/agents" className="text-xs font-semibold shrink-0 rounded-lg px-3 py-1.5 transition-all" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}>
            Run Customer Pulse →
          </a>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── INBOX ── */}
        {activeTab === 'inbox' && (
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
            <UploadZone onSuccess={handleUploadSuccess} />

            {feedbackQuery.isLoading ? (
              <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            ) : feedbackQuery.isError ? (
              <div className="rounded-xl p-6 text-center text-sm" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>Failed to load feedback.</div>
            ) : newItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(0,212,255,0.08)' }}>
                <MessageSquare className="mb-4 h-12 w-12" style={{ color: 'rgba(0,212,255,0.15)' }} />
                <p className="text-base font-semibold" style={{ color: 'rgba(148,163,184,0.6)' }}>No new feedback</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Upload email, CSV, PDF or DOCX files above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(0,212,255,0.5)' }}>{newItems.length} new feedback item{newItems.length !== 1 ? 's' : ''}</p>
                {newItems.map(item => (
                  <FeedbackCard key={item.id} item={item}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onAddress={(id, status) => addressMutation.mutate({ id, status })} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INTELLIGENCE ── */}
        {activeTab === 'intelligence' && (() => {
          const agentItems = [...newItems, ...addressedItems].filter(i => i.agent_priority);
          const triageThemes = themes.filter(t => t.agent_triage_decision);
          const hasAnyData = agentItems.length > 0 || triageThemes.length > 0 || classifications.length > 0;

          if (!hasAnyData) return (
            <div className="max-w-5xl mx-auto px-8 py-6">
              <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(168,85,247,0.1)' }}>
                <Brain className="mb-4 h-12 w-12" style={{ color: 'rgba(168,85,247,0.2)' }} />
                <p className="text-base font-semibold" style={{ color: 'rgba(148,163,184,0.6)' }}>No intelligence yet</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>
                  Upload feedback — the AI monitor runs automatically and populates this view.
                </p>
              </div>
            </div>
          );

          return (
            <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">

              {/* ── LEFT COLUMN: AI Monitor + Agent Triage + PM Decisions ── */}
              <div className="flex-1 min-w-0 space-y-10">

              {/* ── AI Monitor — classified items ── */}
              {agentItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    AI Monitor · {agentItems.length} items classified
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'rgba(100,116,139,0.5)' }}>
                    Priority is relative — items ranked against each other by evidence volume and sentiment.
                  </p>

                  <div className="flex gap-4 mb-4">
                    {(['Critical','High','Medium','Low'] as const).map(p => {
                      const cnt = agentItems.filter(i => i.agent_priority === p).length;
                      if (cnt === 0) return null;
                      return (
                        <div key={p} className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: priorityColor(p) }} />
                          <span className="text-sm font-bold" style={{ color: priorityColor(p) }}>{cnt}</span>
                          <span className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>{p}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1">
                    {agentItems.map(item => {
                      const pc = priorityColor(item.agent_priority ?? '');
                      return (
                        <div key={item.id} className="flex items-start gap-3 rounded-lg px-4 py-3"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-xs font-bold" style={{ color: pc }}>
                                {item.agent_priority}
                              </span>
                              {item.agent_category && (
                                <span className="text-xs font-medium" style={{ color: categoryColor2(item.agent_category) }}>
                                  {item.agent_category}
                                </span>
                              )}
                              <span className="text-xs font-medium" style={{ color: channelColor(item.channel) }}>
                                {item.channel}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.7)' }}>
                              {item.body.slice(0, 180)}{item.body.length > 180 ? '…' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Agent Triage ── */}
              {triageThemes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    Agent Triage · {triageThemes.length} theme{triageThemes.length !== 1 ? 's' : ''} reviewed
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'rgba(100,116,139,0.5)' }}>
                    These are AI recommendations — you make the final call. Use the Conflict Resolver on the right if signals disagree.
                  </p>
                  <div className="space-y-3">
                    {triageThemes.map(t => {
                      let votes: StakeholderVote[] = [];
                      try { votes = JSON.parse(t.agent_triage_details ?? '[]'); } catch { votes = []; }
                      return (
                        <div key={t.id} className="rounded-xl overflow-hidden"
                          style={{ background: 'rgba(10,10,36,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{t.name}</p>
                                <span className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>· {t.item_count} feedback items</span>
                              </div>
                              {t.agent_triage_rationale && (
                                <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>{t.agent_triage_rationale}</p>
                              )}
                            </div>
                            {/* AI recommendation — plain text, clearly not a button */}
                            <div className="shrink-0 text-right">
                              <p className="text-xs" style={{ color: 'rgba(100,116,139,0.5)' }}>AI recommends</p>
                              <p className="text-xs font-semibold mt-0.5" style={{ color: 'rgba(226,232,240,0.8)' }}>{t.agent_triage_decision}</p>
                            </div>
                          </div>

                          {/* Stakeholder votes — neutral, no colored role names */}
                          {votes.length > 0 && (
                            <div className="px-5 py-3 grid grid-cols-1 gap-2 lg:grid-cols-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              {votes.map(v => (
                                <div key={v.role} className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.7)' }}>{v.role}</p>
                                    <span className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>{v.recommendation.replace('Move to ', '')}</span>
                                  </div>
                                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>{v.rationale}</p>
                                  {v.concerns.length > 0 && (
                                    <p className="text-xs mt-1.5" style={{ color: 'rgba(255,170,0,0.7)' }}>
                                      ⚠ {v.concerns[0]}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action footer */}
                          <div className="px-5 py-3 flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.1)' }}>
                            {(t.agent_triage_actioned || classifications.some(c => c.theme_name === t.name && c.pm_decision === 'backlog')) ? (
                              <span className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(0,255,136,0.7)' }}>
                                <CheckCircle className="h-3 w-3" />Added to Backlog
                              </span>
                            ) : (
                              <button
                                onClick={() => handleTriageAction(t.id, t.name, t.description ?? undefined)}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-80"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(226,232,240,0.8)' }}>
                                <Archive className="h-3 w-3" />Accept — Move to Backlog
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── PM Classifications ── */}
              {classifications.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(148,163,184,0.4)' }}>
                    PM Decisions {pendingClassifications.length > 0 && `· ${pendingClassifications.length} awaiting your decision`}
                  </p>
                  {pendingClassifications.length > 0 && (
                    <p className="text-xs mb-4" style={{ color: 'rgba(100,116,139,0.5)' }}>
                      Review each theme and make a decision. When AI signals conflict, the theme with more feedback items has stronger evidence.
                    </p>
                  )}
                  {pendingClassifications.length > 0 && (
                    <div className="space-y-4 mb-6">
                      {pendingClassifications.map(c => <ClassificationCard key={c.id} item={c} onDecision={handleDecision} />)}
                    </div>
                  )}
                  {decidedClassifications.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3 mt-6" style={{ color: 'rgba(100,116,139,0.35)' }}>
                        Decisions made · {decidedClassifications.length}
                      </p>
                      <div className="space-y-3">
                        {decidedClassifications.map(c => <ClassificationCard key={c.id} item={c} onDecision={handleDecision} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              </div>{/* end left column */}

              {/* ── RIGHT COLUMN: Conflict Resolver ── */}
              {(agentItems.length > 0 || triageThemes.length > 0) && (
                <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-6 lg:self-start">
                  <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,10,36,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* Panel header */}
                    <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <Scale className="h-3.5 w-3.5" style={{ color: '#a855f7' }} />
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(226,232,240,0.7)' }}>Conflict Resolver</p>
                    </div>

                    <div className="px-4 py-4">
                      <p className="text-xs mb-4 leading-relaxed" style={{ color: 'rgba(100,116,139,0.7)' }}>
                        When AI Monitor and Agent Triage disagree, this agent applies tiebreaker rules — sentiment, category urgency, evidence count — and gives a final verdict.
                      </p>

                      <button
                        onClick={handleResolveConflicts}
                        disabled={isResolvingConflicts}
                        className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(168,85,247,0.05))', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}
                      >
                        {isResolvingConflicts
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analysing…</>
                          : <><Scale className="h-3.5 w-3.5" />{conflictResult ? 'Re-run Conflict Resolver' : 'Run Conflict Resolver'}</>}
                      </button>

                      {conflictResult && (
                        <div className="mt-3">
                          {/* Result summary */}
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold" style={{ color: conflictResult.conflicts > 0 ? '#ffaa00' : '#00ff88' }}>
                              {conflictResult.message}
                            </p>
                          </div>

                          {/* Verdict list — conflicts only */}
                          {(() => {
                            const conflicts = conflictResult.verdicts.filter(v => v.isConflict);
                            if (conflicts.length === 0) return (
                              <p className="text-xs text-center py-4" style={{ color: 'rgba(0,255,136,0.7)' }}>
                                ✓ All signals are aligned — no conflicts detected.
                              </p>
                            );
                            return (
                              <div className="space-y-2">
                                {conflicts.map((v, i) => (
                                  <div key={v.themeId} className="rounded-lg p-3"
                                    style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.2)' }}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="text-xs shrink-0" style={{ color: '#ffaa00' }}>⚡</span>
                                      <span className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{v.themeName}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-1.5 text-xs flex-wrap" style={{ color: 'rgba(148,163,184,0.5)' }}>
                                      {v.monitorPriority && (
                                        <span>Monitor: <span style={{ color: priorityColor(v.monitorPriority) }}>{v.monitorPriority}</span></span>
                                      )}
                                      {v.triageDecision && (
                                        <span>Triage: <span style={{ color: 'rgba(226,232,240,0.6)' }}>{v.triageDecision}</span></span>
                                      )}
                                    </div>
                                    <p className="text-xs font-semibold mb-1" style={{ color: '#00ff88' }}>→ {v.verdict}</p>
                                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(100,116,139,0.6)' }}>{v.rationale}</p>
                                    <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.4)' }}>{v.feedbackCount} items · {v.negSentimentPct}% negative</p>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* ── ADDRESSED ── */}
        {activeTab === 'addressed' && (
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
            {addressedQuery.isLoading ? (
              <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
            ) : addressedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(0,255,136,0.08)' }}>
                <CheckSquare className="mb-4 h-12 w-12" style={{ color: 'rgba(0,255,136,0.15)' }} />
                <p className="text-base font-semibold" style={{ color: 'rgba(148,163,184,0.6)' }}>No addressed feedback yet</p>
                <p className="text-sm mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Feedback moves here when you make a PM decision on Intelligence classifications, or manually mark items as addressed.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: '#00ff88' }}>
                  <CheckCircle className="h-3.5 w-3.5" />{addressedItems.length} addressed feedback item{addressedItems.length !== 1 ? 's' : ''}
                </p>
                {addressedItems.map(item => (
                  <FeedbackCard key={item.id} item={item}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onAddress={(id, status) => addressMutation.mutate({ id, status })} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

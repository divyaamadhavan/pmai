import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Download, Sparkles, MessageSquare, CheckCircle,
  Archive, Map, Zap, AlertTriangle, Users, TrendingUp,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { StreamingText } from '../components/StreamingText';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';

type Audience = 'CPO' | 'Engineering' | 'Sales';

const audienceConfig: Record<Audience, { desc: string; color: string; icon: string; detail: string }> = {
  CPO:         { icon: '◆', color: '#a855f7', desc: 'CPO / Leadership',    detail: 'Strategic summary — themes, decisions made, roadmap alignment' },
  Engineering: { icon: '⚙', color: '#00d4ff', desc: 'Engineering Team',    detail: 'Technical handoff — what\'s committed, sprint scope, customer context' },
  Sales:       { icon: '◈', color: '#00ff88', desc: 'Sales / CS Team',     detail: 'Customer-facing — what\'s being built, talking points, timelines' },
};

interface PipelineSummary {
  feedbackCount: number;
  themeCount: number;
  backlogCount: number;
  dismissedCount: number;
  pendingCount: number;
  roadmapCount: number;
  sprintName: string | null;
  ticketCount: number;
}

export function InsightExplorer() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [selectedAudience, setSelectedAudience] = useState<Audience>('CPO');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [streamBody, setStreamBody] = useState<Record<string, unknown> | null>(null);
  const [completedReport, setCompletedReport] = useState<string | null>(null);

  const { data: summary, isLoading } = useQuery<PipelineSummary>({
    queryKey: ['pipeline-summary', projectId],
    queryFn: () => apiClient.get('/api/insights/pipeline-summary', { params: projectId ? { productAreaId: projectId } : {} }).then(r => r.data.data),
    retry: false,
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    setCompletedReport(null);
    setStreamBody({ audience: selectedAudience, ...(projectId ? { productAreaId: projectId } : {}), includeOpportunities: true, includeFeedbackSummary: true });
    setStreamKey(k => k + 1);
  };

  const handleExport = () => {
    if (!completedReport) return;
    const blob = new Blob([completedReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${selectedAudience.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasData = summary && (summary.feedbackCount > 0 || summary.themeCount > 0);

  const pipelineTiles = summary ? [
    { icon: MessageSquare, label: 'Feedback Items', value: summary.feedbackCount, color: '#00d4ff' },
    { icon: TrendingUp,    label: 'Themes Found',   value: summary.themeCount,    color: '#ffee00' },
    { icon: Archive,       label: 'Backlog',         value: summary.backlogCount,  color: '#00d4ff' },
    { icon: Map,           label: 'Roadmap Items',  value: summary.roadmapCount,  color: '#ff2d8b' },
    { icon: Zap,           label: 'Sprint Tickets', value: summary.ticketCount,   color: '#a855f7' },
  ] : [];

  return (
    <div className="min-h-full p-8" style={{ background: '#020212' }}>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'rgba(255,238,0,0.4)' }}>◆ STEP 5 — COMMUNICATE</p>
          <h1 className="text-3xl font-bold mb-1" style={{ color: '#e2e8f0' }}>
            Stakeholder{' '}
            <span style={{ color: '#ffee00', textShadow: '0 0 20px rgba(255,238,0,0.3)' }}>Reports</span>
          </h1>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Generate reports grounded in your real PM decisions — for CPO, Engineering, or Sales
          </p>
        </div>
        {completedReport && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,238,0,0.1)', border: '1px solid rgba(255,238,0,0.3)', color: '#ffee00' }}
          >
            <Download className="h-4 w-4" /> Export Markdown
          </button>
        )}
      </div>

      {/* Pipeline snapshot */}
      <div className="mb-8 rounded-xl p-5" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.95),rgba(6,6,26,0.95))', border: '1px solid rgba(255,238,0,0.12)' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: 'rgba(255,238,0,0.5)' }}>
          <FileText className="h-3.5 w-3.5" />Pipeline Snapshot — what this report will be based on
        </p>

        {isLoading ? (
          <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>
        ) : !hasData ? (
          <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#ffaa00' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#ffaa00' }}>No pipeline data yet</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Complete the pipeline first: upload feedback → make PM decisions → build roadmap → plan sprint. Then come back here to generate a meaningful report.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
            {pipelineTiles.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-lg p-3 text-center" style={{ background: `${color}08`, border: `1px solid ${color}18` }}>
                <Icon className="h-4 w-4 mx-auto mb-1" style={{ color }} />
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5 leading-tight" style={{ color: 'rgba(148,163,184,0.5)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {summary?.pendingCount !== undefined && summary.pendingCount > 0 && (
          <p className="mt-3 text-xs flex items-center gap-1.5" style={{ color: '#ffaa00' }}>
            <AlertTriangle className="h-3 w-3" />
            {summary.pendingCount} theme{summary.pendingCount !== 1 ? 's' : ''} still awaiting PM decision in Feedback Hub — report will be incomplete until decided.
          </p>
        )}
      </div>

      {/* Audience selector + generate */}
      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.95),rgba(6,6,26,0.95))', border: '1px solid rgba(168,85,247,0.15)' }}>
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="h-5 w-5" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 4px #a855f7)' }} />
          <h2 className="text-base font-bold" style={{ color: '#e2e8f0' }}>Generate Report</h2>
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(148,163,184,0.4)' }}>Select Audience</p>
        <div className="flex flex-wrap gap-3 mb-5">
          {(Object.entries(audienceConfig) as [Audience, typeof audienceConfig[Audience]][]).map(([aud, cfg]) => (
            <button
              key={aud}
              onClick={() => { setSelectedAudience(aud); setCompletedReport(null); setStreamBody(null); }}
              className="flex flex-col items-start rounded-xl px-4 py-3 text-left transition-all"
              style={selectedAudience === aud
                ? { background: `${cfg.color}12`, border: `1px solid ${cfg.color}50`, minWidth: '160px' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', minWidth: '160px' }
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm" style={{ color: selectedAudience === aud ? cfg.color : 'rgba(148,163,184,0.5)' }}>{cfg.icon}</span>
                <span className="text-sm font-bold" style={{ color: selectedAudience === aud ? cfg.color : 'rgba(226,232,240,0.6)' }}>{cfg.desc}</span>
              </div>
              <p className="text-xs leading-snug" style={{ color: 'rgba(100,116,139,0.6)' }}>{cfg.detail}</p>
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !hasData}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}
        >
          <Sparkles className="h-4 w-4" />
          {isGenerating ? 'Generating…' : `Generate ${selectedAudience} Report`}
        </button>
        {!hasData && !isLoading && (
          <p className="mt-2 text-xs" style={{ color: 'rgba(148,163,184,0.4)' }}>Complete the pipeline first to enable report generation.</p>
        )}

        {streamBody && (
          <div className="mt-5 rounded-xl p-5" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-3.5 w-3.5" style={{ color: audienceConfig[selectedAudience].color }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: audienceConfig[selectedAudience].color }}>
                {audienceConfig[selectedAudience].desc} Report
              </p>
            </div>
            <div className="prose prose-sm max-w-none" style={{ color: 'rgba(226,232,240,0.85)', lineHeight: 1.7 }}>
              <StreamingText
                key={streamKey}
                path="/api/insights/generate"
                body={streamBody}
                onComplete={(text) => { setCompletedReport(text); setIsGenerating(false); }}
                onError={() => setIsGenerating(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

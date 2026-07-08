import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, Download, Sparkles } from 'lucide-react';
import { apiClient } from '../lib/api';
import { StreamingText } from '../components/StreamingText';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';

interface ApiOpportunity { id: string; title: string; description?: string; feedback_count?: number; opportunity_score?: number; }
type Audience = 'Engineering' | 'CPO' | 'Sales';

const audienceConfig: Record<Audience, { desc: string; color: string; icon: string }> = {
  Engineering: { desc: 'Technical depth — scoping, complexity, dependencies', color: '#00d4ff', icon: '⚙' },
  CPO:         { desc: 'Strategic summary — opportunity sizing, alignment',    color: '#a855f7', icon: '◆' },
  Sales:       { desc: 'Revenue impact — deal blockers, customer quotes',      color: '#00ff88', icon: '◈' },
};

export function InsightExplorer() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [selectedAudience, setSelectedAudience] = useState<Audience>('CPO');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [streamBody, setStreamBody] = useState<Record<string, unknown> | null>(null);
  const [completedReport, setCompletedReport] = useState<string | null>(null);

  const { data: opportunities = [], isLoading, isError } = useQuery<ApiOpportunity[]>({
    queryKey: ['opportunities', projectId],
    queryFn: () => apiClient.get('/api/insights/opportunities', { params: projectId ? { productAreaId: projectId } : {} }).then((r) => r.data.data.opportunities ?? []),
    retry: false,
  });

  const handleGenerate = () => {
    setIsGenerating(true); setCompletedReport(null);
    setStreamBody({ audience: selectedAudience, productAreaId: projectId });
    setStreamKey((k) => k + 1);
  };

  const handleExport = (format: 'pdf' | 'markdown') => {
    if (!completedReport) return;
    if (format === 'markdown') {
      const blob = new Blob([completedReport], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `insight-${selectedAudience.toLowerCase()}.md`; a.click();
      URL.revokeObjectURL(url);
    } else { window.print(); }
  };

  const cardColors = ['#00d4ff', '#a855f7', '#00ff88', '#ff2d8b', '#ffee00'];

  return (
    <div className="p-8 min-h-full" style={{ background: '#020212' }}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,238,0,0.5)' }}>◆ INSIGHT EXPLORER</p>
          <h1 className="text-2xl font-bold" style={{ color: '#e2e8f0' }}>Product Insights</h1>
          <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>Discover and communicate product opportunities</p>
        </div>
        {completedReport && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('markdown')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}
            >
              <Download className="h-4 w-4" /> Markdown
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}
            >
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : isError ? (
        <div className="rounded-xl p-6 text-center text-sm mb-8" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
          Failed to load opportunities.
        </div>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl py-16 text-center mb-8" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(255,238,0,0.1)' }}>
          <Lightbulb className="mb-3 h-10 w-10" style={{ color: 'rgba(255,238,0,0.3)' }} />
          <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>No opportunities yet</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Upload feedback to discover insights</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {opportunities.map((opp, i) => {
            const c = cardColors[i % cardColors.length];
            return (
              <div
                key={opp.id}
                className="rounded-xl p-5 transition-all hover:translate-y-[-2px]"
                style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: `1px solid ${c}20`, boxShadow: `0 4px 20px rgba(0,0,0,0.3)` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
                    <Lightbulb className="h-4 w-4" style={{ color: c, filter: `drop-shadow(0 0 4px ${c})` }} />
                  </div>
                  {opp.opportunity_score !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>Score</span>
                      <span className="rounded-full px-2 py-0.5 text-sm font-bold" style={{ background: `${c}15`, border: `1px solid ${c}30`, color: c }}>
                        {opp.opportunity_score}
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="font-semibold mb-1.5" style={{ color: '#e2e8f0' }}>{opp.title}</h3>
                {opp.description && <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(148,163,184,0.7)' }}>{opp.description}</p>}
                {opp.feedback_count !== undefined && (
                  <p className="text-xs" style={{ color: `${c}80` }}>{opp.feedback_count} feedback items</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generate summary */}
      <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="h-5 w-5" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 4px #a855f7)' }} />
          <h2 className="font-semibold" style={{ color: '#e2e8f0' }}>Generate Insight Summary</h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.entries(audienceConfig) as [Audience, typeof audienceConfig[Audience]][]).map(([aud, cfg]) => (
            <button
              key={aud}
              onClick={() => setSelectedAudience(aud)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
              style={selectedAudience === aud
                ? { background: `${cfg.color}15`, border: `1px solid ${cfg.color}50`, color: cfg.color, boxShadow: `0 0 15px ${cfg.color}25` }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)' }
              }
            >
              <span className="mr-1.5">{cfg.icon}</span>
              {aud}
            </button>
          ))}
        </div>

        <p className="mb-4 text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>
          {audienceConfig[selectedAudience].desc}
        </p>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}
        >
          <Sparkles className="h-4 w-4" />
          {isGenerating ? 'Generating…' : 'Generate Summary'}
        </button>

        {streamBody && (
          <div className="rounded-lg p-5" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.6)' }}>
              Summary for {selectedAudience}
            </p>
            <StreamingText
              key={streamKey}
              path="/api/insights/generate"
              body={streamBody}
              onComplete={(text) => { setCompletedReport(text); setIsGenerating(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

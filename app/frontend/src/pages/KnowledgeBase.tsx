import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, BookOpen, Send, MessageSquare, ExternalLink, Sparkles, RefreshCw, CheckCircle } from 'lucide-react';
import { apiClient, fetchSSEPost } from '../lib/api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useProject } from '../contexts/ProjectContext';

interface ApiSearchResult {
  id: string; title: string; content: string; source?: string;
  tags?: string[]; created_at?: string; relevance_score?: number;
}
interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'What are the main onboarding pain points?',
  'What are our enterprise security requirements?',
  'What is the product vision for this year?',
];

export function KnowledgeBase() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'chat'>('search');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const syncMut = useMutation({
    mutationFn: () => apiClient.post('/api/knowledge/sync-documents', projectId ? { productAreaId: projectId } : {}).then((r) => r.data.data),
    onSuccess: (data: { indexed: number; message: string }) => {
      setSyncMsg(data.message);
      setTimeout(() => setSyncMsg(''), 5000);
    },
  });

  const { data: results, isLoading: isSearching } = useQuery<ApiSearchResult[]>({
    queryKey: ['knowledge-search', projectId, activeQuery],
    queryFn: () =>
      activeQuery
        ? apiClient.get('/api/knowledge/search', { params: { q: activeQuery, ...(projectId ? { productAreaId: projectId } : {}) } }).then((r) => r.data.data.results ?? [])
        : Promise.resolve([]),
    enabled: true,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setActiveQuery(query); };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: chatInput };
    setMessages((m) => [...m, userMsg]);
    const question = chatInput;
    setChatInput('');
    setIsChatLoading(true);
    const assistantMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: '' };
    setMessages((m) => [...m, assistantMsg]);
    await fetchSSEPost('/api/knowledge/ask', { question }, {
      onMessage: (data) => {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + data } : m));
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      },
      onDone: () => setIsChatLoading(false),
      onError: () => setIsChatLoading(false),
    }).catch(() => setIsChatLoading(false));
  };

  return (
    <div className="flex h-full flex-col" style={{ background: '#020212' }}>
      {/* Header */}
      <div className="px-8 py-4" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.8)' }}>
        <p className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: 'rgba(168,85,247,0.5)' }}>◆ KNOWLEDGE BASE</p>
        <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Knowledge Base</h1>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>Search your team's institutional knowledge or ask AI</p>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}
          >
            <RefreshCw className={`h-3 w-3 ${syncMut.isPending ? 'animate-spin' : ''}`} />
            {syncMut.isPending ? 'Syncing…' : 'Sync from Documents'}
          </button>
          {syncMsg && (
            <span className="flex items-center gap-1 text-xs" style={{ color: '#00ff88' }}>
              <CheckCircle className="h-3 w-3" /> {syncMsg}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-8" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.5)' }}>
        {[
          { id: 'search' as const, label: 'Semantic Search', icon: Search,        color: '#00d4ff' },
          { id: 'chat'   as const, label: 'Q&A Chat',        icon: MessageSquare, color: '#a855f7' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all"
            style={{
              borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
              color: activeTab === tab.id ? tab.color : 'rgba(148,163,184,0.6)',
            }}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'search' ? (
        <div className="flex-1 overflow-y-auto p-8">
          <form onSubmit={handleSearch} className="mb-6 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'rgba(0,212,255,0.5)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by topic, keyword, or concept…"
                className="input-neon w-full rounded-xl py-3 pl-10 pr-4 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all"
              style={{ background: 'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05))', border: '1px solid rgba(0,212,255,0.4)', color: '#00d4ff' }}
            >
              Search
            </button>
          </form>

          {!activeQuery ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="mb-3 h-12 w-12" style={{ color: 'rgba(0,212,255,0.2)' }} />
              <p className="text-sm font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>Enter a query to search</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(100,116,139,0.5)' }}>Powered by semantic similarity search</p>
            </div>
          ) : isSearching ? (
            <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
          ) : (results ?? []).length === 0 ? (
            <div className="rounded-xl py-16 text-center" style={{ background: 'rgba(10,10,36,0.5)', border: '1px solid rgba(0,212,255,0.08)' }}>
              <BookOpen className="mx-auto mb-3 h-10 w-10" style={{ color: 'rgba(0,212,255,0.2)' }} />
              <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>No results for "{activeQuery}"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(results ?? []).map((entry, i) => {
                const colors = ['#00d4ff', '#a855f7', '#00ff88', '#ff2d8b', '#ffee00'];
                const c = colors[i % colors.length];
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl p-5 transition-all hover:translate-y-[-1px]"
                    style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: `1px solid ${c}20` }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold" style={{ color: '#e2e8f0' }}>{entry.title}</h3>
                      {entry.relevance_score !== undefined && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ml-3" style={{ background: `${c}15`, border: `1px solid ${c}30`, color: c }}>
                          {Math.round(entry.relevance_score * 100)}% match
                        </span>
                      )}
                    </div>
                    <p className="text-sm mb-3 leading-relaxed line-clamp-3" style={{ color: 'rgba(148,163,184,0.7)' }}>{entry.content}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {(entry.tags ?? []).map((t) => (
                          <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${c}10`, border: `1px solid ${c}20`, color: `${c}cc` }}>{t}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>
                        {entry.source && <span>{entry.source}</span>}
                        {entry.created_at && <><span>·</span><span>{new Date(entry.created_at).toLocaleDateString()}</span></>}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(168,85,247,0.05))', border: '1px solid rgba(168,85,247,0.3)' }}
                >
                  <Sparkles className="h-8 w-8" style={{ color: '#a855f7', filter: 'drop-shadow(0 0 6px #a855f7)' }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: 'rgba(226,232,240,0.8)' }}>Ask anything about your product knowledge</p>
                <p className="text-xs mb-6" style={{ color: 'rgba(100,116,139,0.6)' }}>Grounded in your connected knowledge sources</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setChatInput(s)}
                      className="rounded-full px-4 py-1.5 text-xs transition-all hover:scale-105"
                      style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(168,85,247,0.9)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-2xl rounded-2xl px-5 py-3 text-sm leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(0,212,255,0.1))', border: '1px solid rgba(0,212,255,0.3)', color: '#e2e8f0', borderBottomRightRadius: '4px' }
                    : { background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(226,232,240,0.9)', borderBottomLeftRadius: '4px' }
                  }
                >
                  {msg.content}
                  {msg.role === 'assistant' && msg.content === '' && (
                    <span className="inline-block h-4 w-0.5 animate-blink align-middle" style={{ background: '#a855f7' }} />
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-4" style={{ borderTop: '1px solid rgba(0,212,255,0.1)', background: 'rgba(6,6,26,0.8)' }}>
            <div className="flex gap-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Ask a question about your knowledge base…"
                className="input-neon flex-1 rounded-xl px-4 py-2.5 text-sm"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || isChatLoading}
                className="flex items-center justify-center rounded-xl px-4 py-2.5 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}
              >
                {isChatLoading ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Check, Plus, Trash2, Settings as SettingsIcon, Zap, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/Badge';

interface Integration { id: string; name: string; description: string; connected: boolean; icon: string; category: 'feedback' | 'project' | 'communication' | 'docs'; }

const ALL_INTEGRATIONS: Integration[] = [
  { id: 'zendesk',   name: 'Zendesk',    description: 'Import support tickets as feedback',   connected: true,  icon: '🟢', category: 'feedback' },
  { id: 'intercom',  name: 'Intercom',   description: 'Sync customer conversations',          connected: true,  icon: '🔵', category: 'feedback' },
  { id: 'gong',      name: 'Gong',       description: 'Extract feedback from sales calls',    connected: false, icon: '🎙️', category: 'feedback' },
  { id: 'jira',      name: 'Jira',       description: 'Push tickets and sync sprint status',  connected: false, icon: '🔷', category: 'project' },
  { id: 'linear',    name: 'Linear',     description: 'Bidirectional issue sync',             connected: false, icon: '⬡',  category: 'project' },
  { id: 'slack',     name: 'Slack',      description: 'Sprint briefs and notifications',      connected: false, icon: '💬', category: 'communication' },
  { id: 'confluence',name: 'Confluence', description: 'Index team knowledge',                 connected: true,  icon: '📘', category: 'docs' },
  { id: 'notion',    name: 'Notion',     description: 'Index team knowledge',                 connected: false, icon: '⬜', category: 'docs' },
];

const TEAM_MEMBERS = [
  { id: '1', name: 'Sarah Kim',       email: 'sarah@company.com', role: 'PM' as const },
  { id: '2', name: 'Alex Morrison',   email: 'alex@company.com',  role: 'Product Leader' as const },
  { id: '3', name: 'James Thompson',  email: 'james@company.com', role: 'Scrum Master' as const },
];

const categoryLabel: Record<string, string> = {
  feedback: 'Feedback Sources', project: 'Project Management',
  communication: 'Communication', docs: 'Documentation',
};
const categoryColor: Record<string, string> = {
  feedback: '#00d4ff', project: '#a855f7', communication: '#00ff88', docs: '#ffee00',
};

type SettingsTab = 'integrations' | 'workspace' | 'team';

export function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');
  const [integrations, setIntegrations] = useState(ALL_INTEGRATIONS);
  const toggleIntegration = (id: string) => setIntegrations((prev) => prev.map((i) => i.id === id ? { ...i, connected: !i.connected } : i));

  const tabs: { id: SettingsTab; label: string; color: string }[] = [
    { id: 'integrations', label: 'Integrations',  color: '#00d4ff' },
    { id: 'workspace',    label: 'Workspace',      color: '#a855f7' },
    { id: 'team',         label: 'Team Members',   color: '#00ff88' },
  ];

  return (
    <div className="p-8 max-w-4xl min-h-full" style={{ background: '#020212' }}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <SettingsIcon className="h-5 w-5" style={{ color: '#00d4ff' }} />
          <p className="text-xs font-mono uppercase tracking-widest" style={{ color: 'rgba(0,212,255,0.5)' }}>◆ SETTINGS</p>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: '#e2e8f0' }}>Workspace Settings</h1>
        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>Manage your workspace, team, and connected tools</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
        {tabs.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-5 py-3 text-sm font-medium transition-all"
            style={{
              borderBottom: activeTab === id ? `2px solid ${color}` : '2px solid transparent',
              color: activeTab === id ? color : 'rgba(148,163,184,0.6)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          {(['feedback', 'project', 'communication', 'docs'] as const).map((category) => {
            const catItems = integrations.filter((i) => i.category === category);
            const c = categoryColor[category];
            return (
              <div key={category} className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: `1px solid ${c}20` }}>
                <div className="px-6 py-3" style={{ borderBottom: `1px solid ${c}15`, background: `${c}08` }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: `${c}99` }}>{categoryLabel[category]}</p>
                </div>
                <div>
                  {catItems.map((integration, i) => (
                    <div
                      key={integration.id}
                      className="flex items-center gap-4 px-6 py-4"
                      style={{ borderTop: i > 0 ? `1px solid ${c}10` : 'none' }}
                    >
                      <div className="text-2xl w-8 text-center">{integration.icon}</div>
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#e2e8f0' }}>{integration.name}</p>
                        <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>{integration.description}</p>
                      </div>
                      {integration.connected ? (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#00ff88' }}>
                            <Check className="h-3.5 w-3.5" /> Connected
                          </span>
                          <button
                            onClick={() => toggleIntegration(integration.id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                            style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleIntegration(integration.id)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                          style={{ background: `${c}10`, border: `1px solid ${c}30`, color: c }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Connect
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'workspace' && (
        <div className="space-y-4">
          <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(168,85,247,0.2)' }}>
            <h2 className="mb-4 font-semibold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
              <Zap className="h-4 w-4" style={{ color: '#a855f7' }} /> Workspace Details
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Workspace Name', type: 'input', defaultValue: 'Acme Corp Product Team' },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.7)' }}>{f.label}</label>
                  <input defaultValue={f.defaultValue} className="input-neon w-full rounded-lg px-3.5 py-2.5 text-sm" />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.7)' }}>AI Model</label>
                <select className="input-neon w-full rounded-lg px-3.5 py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <option>Claude 3.5 Sonnet (Recommended)</option>
                  <option>Claude 3 Opus</option>
                  <option>Claude 3 Haiku</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.7)' }}>Feedback Sync Interval</label>
                <select className="input-neon w-full rounded-lg px-3.5 py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <option>Every hour</option>
                  <option>Every 4 hours</option>
                  <option>Daily</option>
                  <option>Manual only</option>
                </select>
              </div>
              <button className="rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(168,85,247,0.05))', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>
                Save Changes
              </button>
            </div>
          </div>

          <div className="rounded-xl p-6" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(255,45,139,0.2)' }}>
            <h2 className="mb-2 font-semibold flex items-center gap-2" style={{ color: '#ff2d8b' }}>
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h2>
            <p className="mb-4 text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>These actions are irreversible. Please be certain.</p>
            <button className="rounded-lg px-4 py-2 text-sm font-medium transition-all" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.3)', color: '#ff2d8b' }}>
              Delete Workspace
            </button>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(10,10,36,0.9),rgba(6,6,26,0.9))', border: '1px solid rgba(0,255,136,0.2)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(0,255,136,0.1)' }}>
            <h2 className="font-semibold" style={{ color: '#e2e8f0' }}>Team Members</h2>
            <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
              <Plus className="h-4 w-4" /> Invite Member
            </button>
          </div>
          <div>
            {TEAM_MEMBERS.map((member, i) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-6 py-4"
                style={{ borderTop: i > 0 ? '1px solid rgba(0,255,136,0.08)' : 'none' }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#00d4ff,#a855f7)', color: '#020212' }}
                >
                  {member.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium" style={{ color: '#e2e8f0' }}>{member.name}</p>
                    {member.email === user?.email && (
                      <span className="text-xs" style={{ color: 'rgba(0,212,255,0.5)' }}>(you)</span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'rgba(148,163,184,0.6)' }}>{member.email}</p>
                </div>
                <Badge label={member.role} variant="role" />
                <button className="rounded-lg p-1.5 transition-colors" style={{ color: 'rgba(255,45,139,0.4)' }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

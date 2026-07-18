import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, FileText, Lightbulb, Map, Zap,
  BookOpen, Settings, LogOut, ChevronDown, Plus, FolderOpen,
  Pencil, Trash2, Check, X, ChevronRight, Bot,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';

const pipelineSteps = [
  { num: 1, to: '/feedback',  icon: MessageSquare, label: 'Feedback Hub',      color: '#00d4ff', desc: 'Collect & classify' },
  { num: 2, to: '/documents', icon: FileText,       label: 'Documents',         color: '#00ff88', desc: 'PRDs & specs' },
  { num: 3, to: '/roadmap',   icon: Map,            label: 'Roadmap',           color: '#ff2d8b', desc: 'Prioritise work' },
  { num: 4, to: '/sprint',    icon: Zap,            label: 'Sprint Planner',    color: '#a855f7', desc: 'Plan & groom' },
  { num: 5, to: '/insights',  icon: Lightbulb,      label: 'Reports',           color: '#ffee00', desc: 'Communicate findings' },
];

const toolItems = [
  { to: '/agents',    icon: Bot,      label: 'Agent Center',  color: '#a855f7' },
  { to: '/knowledge', icon: BookOpen, label: 'Knowledge Base', color: '#a855f7' },
];

function ProjectSwitcher() {
  const { projects, activeProject, setActiveProjectId, createProject, updateProject, deleteProject } = useProject();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError('');
    try { await createProject(newName.trim()); setNewName(''); setCreating(false); }
    catch { setError('Failed to create project'); }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try { await updateProject(id, editName.trim()); setEditingId(null); }
    catch { setError('Failed to rename project'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return;
    try { await deleteProject(id); }
    catch (err: unknown) {
      const serverMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      alert(serverMsg ?? 'Delete failed');
    }
  };

  return (
    <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-all hover:bg-white/5"
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(168,85,247,0.1))', border: '1px solid rgba(168,85,247,0.4)' }}
        >
          <FolderOpen className="h-3.5 w-3.5" style={{ color: '#a855f7' }} />
        </div>
        <span className="flex-1 truncate text-xs font-medium" style={{ color: 'rgba(226,232,240,0.9)' }}>
          {activeProject?.name ?? 'Select project'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'rgba(0,212,255,0.5)' }} />
      </button>

      {open && (
        <div className="mt-1 rounded-lg overflow-hidden" style={{ background: 'rgba(2,2,18,0.95)', border: '1px solid rgba(0,212,255,0.15)' }}>
          {projects.map((p) => (
            <div
              key={p.id}
              className="group flex items-center gap-2 px-3 py-2 transition-all"
              style={{
                background: activeProject?.id === p.id ? 'rgba(0,212,255,0.1)' : 'transparent',
                borderLeft: activeProject?.id === p.id ? '2px solid #00d4ff' : '2px solid transparent',
              }}
            >
              {editingId === p.id ? (
                <>
                  <input
                    value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(p.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                    className="flex-1 rounded px-2 py-0.5 text-xs outline-none"
                    style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#e2e8f0' }}
                  />
                  <button onClick={() => handleUpdate(p.id)} style={{ color: '#00ff88' }}><Check className="h-3 w-3" /></button>
                  <button onClick={() => setEditingId(null)} style={{ color: 'rgba(148,163,184,0.6)' }}><X className="h-3 w-3" /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setActiveProjectId(p.id); setOpen(false); }}
                    className="flex-1 truncate text-left text-xs"
                    style={{ color: activeProject?.id === p.id ? '#00d4ff' : 'rgba(226,232,240,0.8)' }}
                  >
                    {p.name}
                  </button>
                  <button onClick={() => { setEditingId(p.id); setEditName(p.name); }} className="hidden group-hover:block" style={{ color: 'rgba(0,212,255,0.5)' }} title="Rename">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleDelete(p.id, p.name)} className="hidden group-hover:block" style={{ color: 'rgba(255,45,139,0.6)' }} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          ))}
          {creating ? (
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid rgba(0,212,255,0.1)' }}>
              <input
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                autoFocus placeholder="Project name…"
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#e2e8f0' }}
              />
              <button onClick={handleCreate} style={{ color: '#00ff88' }}><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setCreating(false); setNewName(''); }} style={{ color: 'rgba(148,163,184,0.6)' }}><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-all hover:bg-white/5"
              style={{ borderTop: '1px solid rgba(0,212,255,0.1)', color: 'rgba(0,212,255,0.6)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
          )}
          {error && <p className="px-3 pb-2 text-xs" style={{ color: '#ff2d8b' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();

  return (
    <div
      className={[
        'flex h-full w-56 flex-col shrink-0',
        'fixed inset-y-0 left-0 z-50 transition-transform duration-300',
        'md:relative md:translate-x-0 md:z-auto',
        open ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
      style={{
        background: 'linear-gradient(180deg, #06061a 0%, #020212 100%)',
        borderRight: '1px solid rgba(0,212,255,0.08)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(168,85,247,0.2))',
            border: '1px solid rgba(0,212,255,0.4)',
            boxShadow: '0 0 15px rgba(0,212,255,0.2)',
          }}
        >
          <Zap className="h-5 w-5" style={{ color: '#00d4ff', filter: 'drop-shadow(0 0 4px #00d4ff)' }} />
        </div>
        <div className="flex-1">
          <span className="text-base font-bold tracking-tight" style={{ color: '#00d4ff', textShadow: '0 0 8px rgba(0,212,255,0.5)' }}>PMAI</span>
          <p className="text-xs" style={{ color: 'rgba(0,212,255,0.4)', lineHeight: 1 }}>AI for PMs</p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden rounded-lg p-1.5 transition-all hover:bg-white/5"
          style={{ color: 'rgba(0,212,255,0.5)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ProjectSwitcher />

      {/* Dashboard home */}
      <div className="px-3 pt-3 pb-1">
        <NavLink
          to="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          style={({ isActive }) => isActive
            ? { background: 'rgba(0,212,255,0.08)', color: '#00d4ff', borderLeft: '2px solid #00d4ff' }
            : { color: 'rgba(148,163,184,0.5)', borderLeft: '2px solid transparent' }
          }
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Overview
        </NavLink>
      </div>

      {/* Pipeline steps */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <p className="px-3 py-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(0,212,255,0.3)' }}>
          PM Pipeline
        </p>

        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="absolute left-[22px] top-4 bottom-4 w-px"
            style={{ background: 'linear-gradient(180deg, rgba(0,212,255,0.15) 0%, rgba(168,85,247,0.15) 50%, rgba(0,255,136,0.15) 100%)' }}
          />

          {pipelineSteps.map(({ num, to, icon: Icon, label, color, desc }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 transition-all mb-0.5"
              style={({ isActive }) => isActive
                ? { background: `${color}10`, borderLeft: `2px solid ${color}`, paddingLeft: '6px' }
                : { borderLeft: '2px solid transparent', paddingLeft: '6px' }
              }
            >
              {({ isActive }) => (
                <>
                  {/* Step number bubble */}
                  <div
                    className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: isActive ? color : 'rgba(10,10,36,0.9)',
                      border: `1px solid ${isActive ? color : `${color}30`}`,
                      color: isActive ? '#020212' : `${color}60`,
                      boxShadow: isActive ? `0 0 10px ${color}50` : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-semibold truncate"
                      style={{ color: isActive ? color : 'rgba(226,232,240,0.7)' }}
                    >
                      {label}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'rgba(100,116,139,0.5)', fontSize: '10px' }}>{desc}</p>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-3 w-3 shrink-0" style={{ color }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Tools section */}
        <p className="px-3 pt-3 pb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.2)' }}>
          Tools
        </p>
        {toolItems.map(({ to, icon: Icon, label, color }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all mb-0.5"
            style={({ isActive }) => isActive
              ? { background: `${color}10`, color, borderLeft: `2px solid ${color}` }
              : { color: 'rgba(148,163,184,0.4)', borderLeft: '2px solid transparent' }
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 py-3 space-y-0.5" style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}>
        <NavLink
          to="/settings"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:bg-white/5"
          style={{ color: 'rgba(148,163,184,0.4)', borderLeft: '2px solid transparent' }}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          Settings
        </NavLink>

        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #00d4ff, #a855f7)', color: '#020212' }}
          >
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-medium" style={{ color: 'rgba(226,232,240,0.8)' }}>{user?.name}</p>
            <p className="truncate" style={{ color: 'rgba(0,212,255,0.4)', fontSize: '10px' }}>{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="shrink-0 rounded p-1 transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,45,139,0.4)' }}
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

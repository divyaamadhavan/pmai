import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PipelineBar } from './PipelineBar';
import { Bell, FolderOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';

export function Layout() {
  const { user } = useAuth();
  const { activeProject } = useProject();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#020212' }}>
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex h-14 shrink-0 items-center justify-between px-6"
          style={{
            background: 'rgba(6,6,26,0.9)',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {activeProject ? (
            <div className="flex items-center gap-2 text-sm">
              <FolderOpen className="h-4 w-4" style={{ color: '#a855f7' }} />
              <span className="font-medium" style={{ color: 'rgba(0,212,255,0.9)' }}>
                {activeProject.name}
              </span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button
              className="relative rounded-lg p-2 transition-all hover:bg-white/5"
              style={{ color: 'rgba(0,212,255,0.6)' }}
            >
              <Bell className="h-5 w-5" />
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full animate-glow-pulse"
                style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }}
              />
            </button>

            <div
              className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{
                background: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.15)',
              }}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                  color: '#020212',
                }}
              >
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <span className="text-sm font-medium" style={{ color: 'rgba(226,232,240,0.9)' }}>
                {user?.name}
              </span>
            </div>
          </div>
        </header>

        <PipelineBar />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const STEPS = [
  { num: 1, label: 'Feedback',  path: '/feedback',  color: '#00d4ff' },
  { num: 2, label: 'Insights',  path: '/insights',  color: '#ffee00' },
  { num: 3, label: 'Docs / PRD', path: '/documents', color: '#00ff88' },
  { num: 4, label: 'Roadmap',   path: '/roadmap',   color: '#ff2d8b' },
  { num: 5, label: 'Sprint',    path: '/sprint',    color: '#a855f7' },
];

const PIPELINE_PATHS = new Set(STEPS.map((s) => s.path));

export function PipelineBar() {
  const { pathname } = useLocation();

  if (!PIPELINE_PATHS.has(pathname)) return null;

  const activeIdx = STEPS.findIndex((s) => s.path === pathname);

  return (
    <div
      className="flex items-center gap-0 px-6 shrink-0 overflow-x-auto"
      style={{
        height: '36px',
        background: 'rgba(2,2,18,0.8)',
        borderBottom: '1px solid rgba(0,212,255,0.08)',
      }}
    >
      {STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const isDone = i < activeIdx;
        const color = isActive ? step.color : isDone ? 'rgba(0,255,136,0.6)' : 'rgba(148,163,184,0.25)';

        return (
          <div key={step.path} className="flex items-center gap-0 shrink-0">
            <Link
              to={step.path}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all hover:opacity-100"
              style={{
                color,
                background: isActive ? `${step.color}10` : 'transparent',
                border: isActive ? `1px solid ${step.color}30` : '1px solid transparent',
                opacity: isDone || isActive ? 1 : 0.4,
              }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: isActive ? step.color : isDone ? 'rgba(0,255,136,0.2)' : 'rgba(148,163,184,0.1)',
                  color: isActive ? '#020212' : color,
                  fontSize: '9px',
                }}
              >
                {isDone ? '✓' : step.num}
              </span>
              {step.label}
            </Link>
            {i < STEPS.length - 1 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 mx-0.5"
                style={{ color: i < activeIdx ? 'rgba(0,255,136,0.3)' : 'rgba(148,163,184,0.15)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { AgentStatusProvider } from './contexts/AgentStatusContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { FeedbackHub } from './pages/FeedbackHub';
import { DocumentWorkspace } from './pages/DocumentWorkspace';
import { InsightExplorer } from './pages/InsightExplorer';
import { RoadmapBoard } from './pages/RoadmapBoard';
import { SprintPlanner } from './pages/SprintPlanner';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { Settings } from './pages/Settings';
import { AgentCenter } from './pages/AgentCenter';
import { LoadingSpinner } from './components/LoadingSpinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <ProjectProvider>{children}</ProjectProvider>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/feedback" element={<FeedbackHub />} />
        <Route path="/documents" element={<DocumentWorkspace />} />
        <Route path="/insights" element={<InsightExplorer />} />
        <Route path="/roadmap" element={<RoadmapBoard />} />
        <Route path="/sprint" element={<SprintPlanner />} />
        <Route path="/knowledge" element={<KnowledgeBase />} />
        <Route path="/agents" element={<AgentCenter />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AgentStatusProvider>
            <AppRoutes />
          </AgentStatusProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
  setActiveProjectId: (id: string) => void;
  createProject: (name: string, description?: string) => Promise<Project>;
  updateProject: (id: string, name: string, description?: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    () => localStorage.getItem('pmai_active_project')
  );

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiClient.get('/api/projects').then((r) => r.data.data.projects ?? []),
    retry: false,
  });

  // Auto-select first project if none selected or saved one no longer exists
  useEffect(() => {
    if (projects.length === 0) return;
    const valid = projects.find((p) => p.id === activeProjectId);
    if (!valid) {
      setActiveProjectIdState(projects[0].id);
      localStorage.setItem('pmai_active_project', projects[0].id);
    }
  }, [projects, activeProjectId]);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    localStorage.setItem('pmai_active_project', id);
  }, []);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      apiClient.post<{ data: { project: Project } }>('/api/projects', body).then((r) => r.data.data.project),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveProjectId(project.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; description?: string }) =>
      apiClient.put(`/api/projects/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  return (
    <ProjectContext.Provider value={{
      projects,
      activeProject,
      setActiveProjectId,
      createProject: (name, description) => createMutation.mutateAsync({ name, description }),
      updateProject: (id, name, description) => updateMutation.mutateAsync({ id, name, description }).then(() => {}),
      deleteProject: (id) => deleteMutation.mutateAsync(id).then(() => {}),
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

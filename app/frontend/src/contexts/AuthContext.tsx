import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserRole } from '../types';
import { apiClient } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pmai_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      apiClient
        .get<{ data: { id: string; email: string; fullName: string; role: string; tenantId: string; productAreaId: string | null } }>('/api/auth/me')
        .then((res) => {
          const u = res.data.data;
          setUser({ id: u.id, email: u.email, name: u.fullName, role: u.role as User['role'], tenantId: u.tenantId, productAreaId: u.productAreaId });
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('pmai_token');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<{
      data: {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; fullName: string; role: string; tenantId: string; productAreaId: string | null };
      };
    }>('/api/auth/login', { email, password });

    const { accessToken, user: apiUser } = res.data.data;
    const mappedUser: User = {
      id: apiUser.id,
      email: apiUser.email,
      name: apiUser.fullName,
      role: apiUser.role as User['role'],
      tenantId: apiUser.tenantId,
      productAreaId: apiUser.productAreaId,
    };

    localStorage.setItem('pmai_token', accessToken);
    localStorage.removeItem('pmai_demo_user');
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setToken(accessToken);
    setUser(mappedUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pmai_token');
    delete apiClient.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (role: UserRole | UserRole[]) => {
      if (!user) return false;
      if (Array.isArray(role)) return role.includes(user.role);
      return user.role === role;
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

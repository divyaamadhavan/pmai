import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Terminal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('pm@acme.example');
  const [password, setPassword] = useState('PM12345!');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials. Access denied.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: '#020212' }}
    >
      {/* Neon grid background */}
      <div className="absolute inset-0 neon-grid opacity-40" />

      {/* Glowing orbs */}
      <div
        className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full opacity-10 blur-3xl"
        style={{ background: 'radial-gradient(circle, #00d4ff, transparent)' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full opacity-10 blur-3xl"
        style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl animate-float"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(168,85,247,0.2))',
              border: '1px solid rgba(0,212,255,0.4)',
              boxShadow: '0 0 30px rgba(0,212,255,0.3)',
            }}
          >
            <Zap className="h-8 w-8" style={{ color: '#00d4ff', filter: 'drop-shadow(0 0 8px #00d4ff)' }} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-glow-cyan" style={{ color: '#00d4ff' }}>
            PMAI
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
            AI ASSISTANT FOR PRODUCT MANAGERS
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(10,10,36,0.95) 0%, rgba(6,6,26,0.95) 100%)',
            border: '1px solid rgba(0,212,255,0.2)',
            boxShadow: '0 0 40px rgba(0,212,255,0.1), 0 25px 50px rgba(0,0,0,0.7)',
          }}
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-8 right-8 h-px" style={{ background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)' }} />

          <div className="flex items-center gap-2 mb-6">
            <Terminal className="h-4 w-4" style={{ color: '#00d4ff' }} />
            <span className="text-xs font-mono" style={{ color: 'rgba(0,212,255,0.7)' }}>
              SECURE ACCESS PORTAL
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm font-mono"
                style={{
                  background: 'rgba(255,45,139,0.1)',
                  border: '1px solid rgba(255,45,139,0.3)',
                  color: '#ff2d8b',
                }}
              >
                ⚠ {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.7)' }}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="input-neon w-full rounded-lg px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(0,212,255,0.7)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="input-neon w-full rounded-lg px-4 py-3 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(0,212,255,0.5)' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-neon-solid flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : (
                <>
                  <Zap className="h-4 w-4" />
                  Initialize Session
                </>
              )}
            </button>
          </form>
        </div>


        <p className="mt-4 text-center text-xs" style={{ color: 'rgba(100,116,139,0.6)' }}>
          © {new Date().getFullYear()} PMAI — Secure workspace for product teams
        </p>
      </div>
    </div>
  );
}

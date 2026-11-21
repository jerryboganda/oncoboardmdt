import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api, setAuthToken } from '../services/api';
import type { Clinician, SpecialtyRole } from '../types';
import { SlidingHighlight, SpringModal } from './MotionPrimitives';
import { useToast } from './ToastProvider';

interface ClinicianAuthModalProps {
  open: boolean;
  onClose: () => void;
  clinicians: Clinician[];
  activeClinician: Clinician | null;
  onAuthenticated: (clinician: Clinician, token: string) => void;
}

const SPECIALTIES: SpecialtyRole[] = [
  'Medical Oncology',
  'Surgical Oncology',
  'Radiation Oncology',
  'Diagnostic Radiology',
  'Molecular Pathology',
  'MDT Coordinator',
];

export function ClinicianAuthModal({
  open,
  onClose,
  clinicians,
  activeClinician,
  onAuthenticated,
}: ClinicianAuthModalProps) {
  const { pushToast } = useToast();
  const [mode, setMode] = useState<'switch' | 'login' | 'register'>('switch');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState<SpecialtyRole>('Medical Oncology');
  const [title, setTitle] = useState('Attending Oncologist');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickSwitch = async (clinicianId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.startDemoSession(clinicianId);
      setAuthToken(res.token);
      onAuthenticated(res.clinician, res.token);
      pushToast({
        title: `Active specialist: ${res.clinician.fullName}`,
        description: `Acting as ${res.clinician.specialty} for votes, annotations, and audit attribution.`,
        variant: 'info',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch clinician role.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      setAuthToken(res.token);
      onAuthenticated(res.clinician, res.token);
      pushToast({
        title: `Signed in as ${res.clinician.fullName}`,
        description: res.clinician.specialty,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.register({ fullName, email, password, specialty, title });
      setAuthToken(res.token);
      onAuthenticated(res.clinician, res.token);
      pushToast({
        title: `Clinician account created`,
        description: `${res.clinician.fullName} (${res.clinician.specialty}) is now active.`,
        variant: 'success',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpringModal open={open} onClose={onClose} labelledBy="auth-modal-title" maxWidthClass="max-w-lg">
      <div className="overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <h2
              id="auth-modal-title"
              className="font-display text-sm font-semibold text-ink"
            >
              Clinician Identity &amp; Specialty Access
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All clinical actions, votes, and consensus sign-offs are attributed in the audit trail.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close clinician access modal"
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900">
            {[
              ['switch', 'Switch MDT Specialist'],
              ['login', 'Password Sign-In'],
              ['register', 'Register Clinician'],
            ].map(([id, label]) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id as 'switch' | 'login' | 'register');
                    setError(null);
                  }}
                  className={`relative flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <SlidingHighlight
                      layoutId="auth-mode-tab"
                      className="bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {mode === 'switch' && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {clinicians.map((c) => {
                const isCurrent = activeClinician?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickSwitch(c.id)}
                    className={`w-full p-3 rounded-md border text-left transition-colors flex items-center justify-between gap-2 ${
                      isCurrent
                        ? 'border-blue-600 dark:border-sky-400 bg-blue-50/50 dark:bg-sky-500/10'
                        : 'border-hairline hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {c.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.specialty} · {c.title}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700 dark:text-sky-400 shrink-0">
                      {isCurrent ? 'Active' : 'Assume Role'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Institutional Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.rostova@oncoboard.org"
                  className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                />
              </div>
              <div>
                <label htmlFor="login-pass" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  id="login-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold"
              >
                {loading ? 'Verifying...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name &amp; Credentials
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Jordan Patel, MD"
                  className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-specialty" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    MDT Specialty
                  </label>
                  <select
                    id="reg-specialty"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value as SpecialtyRole)}
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  >
                    {SPECIALTIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Clinical Title
                  </label>
                  <input
                    id="reg-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Institutional Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                />
              </div>
              <div>
                <label htmlFor="reg-pass" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password (min 8 characters)
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold"
              >
                {loading ? 'Creating Account...' : 'Create Clinician Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </SpringModal>
  );
}

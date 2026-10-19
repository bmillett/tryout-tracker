import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamRow {
  slug: string;
  name: string;
  coach_pin: string;
  mixed_gender: boolean;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch(
  method: 'GET' | 'POST' | 'PUT',
  pin: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-super-admin-pin': pin
    }
  };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch('/api/teams', init);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = { error: 'Non-JSON response from server' };
  }
  return { ok: res.ok, data, status: res.status };
}

function extractError(data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d['error'] === 'string') {
      const details = d['details'];
      if (Array.isArray(details) && details.length > 0) {
        return (
          d['error'] +
          ': ' +
          details.map((e: unknown) => (e as Record<string, string>)['message']).join('; ')
        );
      }
      return d['error'];
    }
  }
  return 'Unknown error';
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
    {children}
  </label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={[
      'w-full px-3 py-2 rounded-xl border text-sm',
      'bg-white dark:bg-slate-800',
      'border-slate-200 dark:border-slate-700',
      'text-slate-900 dark:text-white',
      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
      'focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400',
      props.className ?? ''
    ].join(' ')}
  />
);

const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }
> = ({ variant = 'primary', className = '', children, ...rest }) => {
  const base =
    'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-amber-400 hover:bg-amber-500 text-slate-900',
    ghost:
      'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    danger:
      'bg-rose-500 hover:bg-rose-600 text-white'
  };
  return (
    <button {...rest} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const ErrorMsg: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
    <span>{message}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Copy-link button
// ---------------------------------------------------------------------------

const CopyLinkBtn: React.FC<{ slug: string }> = ({ slug }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const url = `${window.location.origin}/t/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy team link"
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : `${window.location.origin}/t/${slug}`}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Team form (shared for create & edit)
// ---------------------------------------------------------------------------

interface TeamFormProps {
  initial?: Partial<TeamRow>;
  slugReadOnly?: boolean;
  onSave: (fields: { slug?: string; name: string; coach_pin: string; mixed_gender: boolean }) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

const TeamForm: React.FC<TeamFormProps> = ({
  initial = {},
  slugReadOnly = false,
  onSave,
  onCancel,
  saving,
  error
}) => {
  const [slug, setSlug] = useState(initial.slug ?? '');
  const [name, setName] = useState(initial.name ?? '');
  const [pin, setPin] = useState(initial.coach_pin ?? '');
  const [showPin, setShowPin] = useState(false);
  const [mixedGender, setMixedGender] = useState(initial.mixed_gender ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ slug: slugReadOnly ? undefined : slug, name, coach_pin: pin, mixed_gender: mixedGender });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!slugReadOnly && (
        <div>
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="e.g. ignite-u17"
            autoComplete="off"
            required
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Lowercase letters, digits, hyphens. Used in the team URL: /t/&lt;slug&gt;
          </p>
        </div>
      )}
      <div>
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ignite U17"
          required
        />
      </div>
      <div>
        <Label htmlFor="coach-pin">Coach PIN (4–8 digits)</Label>
        <div className="relative">
          <Input
            id="coach-pin"
            type={showPin ? 'text' : 'password'}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="e.g. 1234"
            inputMode="numeric"
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            tabIndex={-1}
          >
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          id="mixed-gender"
          type="checkbox"
          checked={mixedGender}
          onChange={(e) => setMixedGender(e.target.checked)}
          className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
        />
        <label htmlFor="mixed-gender" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          Mixed-gender team (enables M/F badges and gender filter)
        </label>
      </div>
      {error && <ErrorMsg message={error} />}
      <div className="flex gap-2 pt-1">
        <Btn type="submit" variant="primary" disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        <Btn type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="w-3.5 h-3.5" />
          Cancel
        </Btn>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Single team card
// ---------------------------------------------------------------------------

interface TeamCardProps {
  team: TeamRow;
  pin: string;
  onUpdated: (team: TeamRow) => void;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, pin, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSave = async (fields: {
    slug?: string;
    name: string;
    coach_pin: string;
    mixed_gender: boolean;
  }) => {
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch('PUT', pin, { slug: team.slug, ...fields });
      if (!result.ok) {
        setError(extractError(result.data));
      } else {
        const updated = (result.data as { team: TeamRow }).team;
        onUpdated(updated);
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 dark:text-white truncate">{team.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">/t/{team.slug}</span>
            {team.mixed_gender && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                Mixed
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => { setEditing(true); setExpanded(true); }}
          className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
          title="Edit team"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-3">
          <CopyLinkBtn slug={team.slug} />
          {editing ? (
            <TeamForm
              initial={team}
              slugReadOnly
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              saving={saving}
              error={error}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div>
                <span className="font-semibold">Coach PIN:</span>{' '}
                <span className="font-mono">{'•'.repeat(team.coach_pin.length)}</span>
              </div>
              <div>
                <span className="font-semibold">Created:</span>{' '}
                {team.created_at ? new Date(team.created_at).toLocaleDateString() : '—'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create form panel
// ---------------------------------------------------------------------------

interface CreatePanelProps {
  pin: string;
  onCreated: (team: TeamRow) => void;
}

const CreatePanel: React.FC<CreatePanelProps> = ({ pin, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (fields: {
    slug?: string;
    name: string;
    coach_pin: string;
    mixed_gender: boolean;
  }) => {
    setSaving(true);
    setError('');
    try {
      const result = await apiFetch('POST', pin, fields);
      if (!result.ok) {
        setError(extractError(result.data));
      } else {
        onCreated((result.data as { team: TeamRow }).team);
        setOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Btn variant="primary" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        New team
      </Btn>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <h3 className="font-bold text-slate-900 dark:text-white mb-3">Create team</h3>
      <TeamForm
        onSave={handleSave}
        onCancel={() => setOpen(false)}
        saving={saving}
        error={error}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------

interface LoginProps {
  onLogin: (pin: string) => void;
}

const LoginScreen: React.FC<LoginProps> = ({ onLogin }) => {
  const [value, setValue] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch('GET', value.trim());
      if (result.status === 401) {
        setError('Incorrect secret. Try again.');
        setValue('');
      } else if (!result.ok) {
        setError(extractError(result.data));
      } else {
        onLogin(value.trim());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
        <div className="w-14 h-14 mx-auto mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-center mb-1">Super Admin</h2>
        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-6">
          Enter the <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">SUPER_ADMIN_PIN</code> secret to manage teams
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Input
              type={showPin ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Secret"
              autoComplete="current-password"
              className="pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              tabIndex={-1}
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <ErrorMsg message={error} />}
          <Btn type="submit" variant="primary" disabled={loading} className="w-full justify-center">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Checking…' : 'Sign in'}
          </Btn>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main SuperAdmin screen
// ---------------------------------------------------------------------------

const SESSION_KEY = 'super_admin_pin';

export const SuperAdmin: React.FC = () => {
  // Persist pin for the tab session only.
  const [pin, setPin] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const handleLogin = (p: string) => {
    try {
      sessionStorage.setItem(SESSION_KEY, p);
    } catch {}
    setPin(p);
  };

  const loadTeams = useCallback(async (p: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await apiFetch('GET', p);
      if (result.ok) {
        setTeams((result.data as { teams: TeamRow[] }).teams);
      } else {
        setLoadError(extractError(result.data));
        if (result.status === 401) {
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
          setPin(null);
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pin) void loadTeams(pin);
  }, [pin, loadTeams]);

  if (!pin) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-black">Super Admin — Teams</h1>
          </div>
          <button
            onClick={() => {
              try { sessionStorage.removeItem(SESSION_KEY); } catch {}
              setPin(null);
            }}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white underline"
          >
            Sign out
          </button>
        </div>

        {/* Create panel */}
        <CreatePanel
          pin={pin}
          onCreated={(team) => {
            setTeams((prev) => {
              const idx = prev.findIndex((t) => t.slug === team.slug);
              return idx >= 0
                ? prev.map((t, i) => (i === idx ? { ...t, ...team } : t))
                : [team, ...prev];
            });
          }}
        />

        {/* Team list */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading teams…
          </div>
        )}
        {!loading && loadError && <ErrorMsg message={loadError} />}
        {!loading && !loadError && teams.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No teams yet. Create one above.
          </p>
        )}
        {teams.map((team) => (
          <TeamCard
            key={team.slug}
            team={team}
            pin={pin}
            onUpdated={(updated) =>
              setTeams((prev) =>
                prev.map((t) => (t.slug === updated.slug ? { ...t, ...updated } : t))
              )
            }
          />
        ))}

        {/* Footer note */}
        <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
          ⚠️ Local testing requires <code className="font-mono">vercel dev</code>. The{' '}
          <code className="font-mono">npm run dev</code> Vite server does not serve{' '}
          <code className="font-mono">/api/*</code>.
        </p>
      </div>
    </div>
  );
};

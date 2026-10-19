import React, { createContext, useContext, useEffect, useState } from 'react';
import { Loader2, SearchX, WifiOff } from 'lucide-react';
import type { Team } from '../types';
import {
  parseRoute,
  isStandalone,
  getLastTeamSlug,
  saveLastTeamSlug,
  readCachedTeam,
  cacheTeam,
  clearCachedTeam,
  fetchTeam
} from '../services/team';
import { SuperAdmin } from '../components/SuperAdmin';

const TeamContext = createContext<Team | null>(null);

/** Returns the team loaded for the current `/t/<slug>` URL. Only usable under `<TeamGate>`. */
export function useTeam(): Team {
  const team = useContext(TeamContext);
  if (!team) throw new Error('useTeam must be used within a loaded TeamGate');
  return team;
}

const Screen: React.FC<{ icon: React.ReactNode; title: string; message: string }> = ({ icon, title, message }) => (
  <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 text-center">
      <div className="w-14 h-14 mx-auto mb-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-2xl flex items-center justify-center">
        {icon}
      </div>
      <h2 className="text-xl font-black mb-1">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  </div>
);

const NotFoundScreen: React.FC = () => (
  <Screen
    icon={<SearchX className="w-7 h-7" />}
    title="Team not found"
    message="This team link doesn't exist. Check the link you were given, or ask your coach for the correct one."
  />
);

const RootScreen: React.FC = () => {
  // Installed PWA launched at "/" goes straight to the last-used team.
  const redirectSlug = isStandalone() ? getLastTeamSlug() : null;

  useEffect(() => {
    if (redirectSlug) window.location.replace(`/t/${redirectSlug}`);
  }, [redirectSlug]);

  // PWA redirect in progress — render nothing to avoid flash.
  if (redirectSlug) return null;

  // Normal browser: show the super-admin screen.
  return <SuperAdmin />;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; team: Team };

const TeamLoader: React.FC<{ slug: string; children: React.ReactNode }> = ({ slug, children }) => {
  const [state, setState] = useState<LoadState>(() => {
    const cached = readCachedTeam(slug);
    return cached ? { status: 'ready', team: cached } : { status: 'loading' };
  });

  useEffect(() => {
    let cancelled = false;
    fetchTeam(slug)
      .then((team) => {
        if (cancelled) return;
        if (team) {
          cacheTeam(team);
          setState({ status: 'ready', team });
        } else {
          clearCachedTeam(slug);
          setState({ status: 'not-found' });
        }
      })
      .catch((err) => {
        console.warn('Team fetch failed:', err);
        // Keep a cached team (offline); otherwise surface the error.
        if (!cancelled) setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const readyTeam = state.status === 'ready' ? state.team : null;
  useEffect(() => {
    if (readyTeam) {
      saveLastTeamSlug(readyTeam.slug);
      document.title = `${readyTeam.name} – Tryout Tracker`;
    }
  }, [readyTeam]);

  if (state.status === 'loading') {
    return <Screen icon={<Loader2 className="w-7 h-7 animate-spin" />} title="Loading team…" message="One moment." />;
  }
  if (state.status === 'not-found') return <NotFoundScreen />;
  if (state.status === 'error') {
    return (
      <Screen
        icon={<WifiOff className="w-7 h-7" />}
        title="Can't load team"
        message="Connect to the internet and reload. Once a team has loaded, it works offline."
      />
    );
  }

  return <TeamContext.Provider value={state.team}>{children}</TeamContext.Provider>;
};

/** Resolves the team from the URL and renders children only once it is ready. */
export const TeamGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const route = parseRoute();
  if (route.kind === 'root') return <RootScreen />;
  if (route.kind === 'unknown') return <NotFoundScreen />;
  return <TeamLoader slug={route.slug}>{children}</TeamLoader>;
};

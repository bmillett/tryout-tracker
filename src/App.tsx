import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './services/db';
import { SyncService } from './services/sync';
import type { TryoutSession, Player } from './types';

import { SyncStatusBadge } from './components/SyncStatusBadge';
import { EvaluatorPrompt } from './components/EvaluatorPrompt';
import { PlayerCard } from './components/PlayerCard';
import { ScoringModal } from './components/ScoringModal';
import { AdminPinModal } from './components/AdminPinModal';
import { AdminPanel } from './components/AdminPanel';
import { Leaderboard } from './components/Leaderboard';

import { 
  Users, 
  Trophy, 
  Settings, 
  Search, 
  Flame, 
  LogOut,
  Lock
} from 'lucide-react';

export const App: React.FC = () => {
  const [evaluatorName, setEvaluatorName] = useState<string>(() => {
    return localStorage.getItem('ignite_evaluator_name') || '';
  });

  const [activeSession, setActiveSession] = useState<TryoutSession | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('ignite_admin_unlocked') === 'true';
  });
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'evaluator' | 'leaderboard' | 'admin'>('evaluator');

  // Scoring Sheet State
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');
  const [onlyUnratedFilter, setOnlyUnratedFilter] = useState(false);

  // Live queries from IndexedDB
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) || [];
  const players = useLiveQuery(
    () => (activeSession ? db.players.where('session_id').equals(activeSession.id).toArray() : []),
    [activeSession?.id]
  ) || [];
  const criteria = useLiveQuery(
    () => (activeSession ? db.criteria.where('session_id').equals(activeSession.id).toArray() : []),
    [activeSession?.id]
  ) || [];
  const evaluations = useLiveQuery(
    () => (activeSession ? db.evaluations.where('session_id').equals(activeSession.id).toArray() : []),
    [activeSession?.id]
  ) || [];
  const notes = useLiveQuery(
    () => (activeSession ? db.notes.where('session_id').equals(activeSession.id).toArray() : []),
    [activeSession?.id]
  ) || [];

  // Init DB and default session
  useEffect(() => {
    SyncService.initDB();
  }, []);

  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      const active = sessions.find(s => s.status === 'active') || sessions[0];
      setActiveSession(active);
    }
  }, [sessions, activeSession]);

  const handleAdminClick = () => {
    if (isAdminUnlocked) {
      setCurrentView(currentView === 'admin' ? 'evaluator' : 'admin');
    } else {
      setShowPinModal(true);
    }
  };

  const handleLeaderboardClick = () => {
    if (isAdminUnlocked) {
      setCurrentView(currentView === 'leaderboard' ? 'evaluator' : 'leaderboard');
    } else {
      setShowPinModal(true);
    }
  };

  // Switch player in scoring modal
  const handleNavigatePlayer = (direction: 'prev' | 'next') => {
    if (!selectedPlayer) return;
    const currentIndex = filteredPlayers.findIndex(p => p.id === selectedPlayer.id);
    if (direction === 'prev' && currentIndex > 0) {
      setSelectedPlayer(filteredPlayers[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < filteredPlayers.length - 1) {
      setSelectedPlayer(filteredPlayers[currentIndex + 1]);
    }
  };

  if (!evaluatorName) {
    return <EvaluatorPrompt onNameSubmit={(name) => setEvaluatorName(name)} />;
  }

  // Filter players for Evaluator Grid
  const filteredPlayers = players.filter(p => {
    if (p.status === 'cut_moved_down') return false;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.pinney_number.toString().includes(searchQuery);
    const matchesGroup = selectedGroupFilter === 'All' || p.group_name === selectedGroupFilter;

    if (onlyUnratedFilter) {
      const ratedCount = evaluations.filter(e => e.player_id === p.id && e.evaluator_name === evaluatorName).length;
      if (ratedCount >= criteria.length && criteria.length > 0) return false;
    }

    return matchesSearch && matchesGroup;
  });

  const groups = ['All', ...Array.from(new Set(players.map(p => p.group_name || 'Group A')))];
  const selectedPlayerIndex = selectedPlayer ? filteredPlayers.findIndex(p => p.id === selectedPlayer.id) : -1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          
          {/* Logo / Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-md">
              <Flame className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm tracking-tight text-white leading-none">
                  IGNITE JUNIORS
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {activeSession?.name.split('-')[0] || 'Tryouts'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Evaluator: <strong className="text-slate-200">{evaluatorName}</strong>
              </p>
            </div>
          </div>

          {/* Sync Badge & Actions */}
          <div className="flex items-center gap-2">
            <SyncStatusBadge />

            {/* Coach Leaderboard Button */}
            <button
              onClick={handleLeaderboardClick}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                currentView === 'leaderboard'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md font-bold'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
              }`}
              title="Coach Roster & Leaderboard"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Roster Board</span>
              {!isAdminUnlocked && <Lock className="w-3 h-3 text-slate-400" />}
            </button>

            {/* Coach Admin / Settings */}
            <button
              onClick={handleAdminClick}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                currentView === 'admin'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md font-bold'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
              }`}
              title="Coach Settings / Admin"
            >
              <Settings className="w-4 h-4 text-slate-300" />
              <span className="hidden sm:inline">Settings</span>
              {!isAdminUnlocked && <Lock className="w-3 h-3 text-slate-400" />}
            </button>

            {/* Evaluator Switcher / Logout */}
            <button
              onClick={() => {
                if (confirm('Switch evaluator profile name? This will also lock Coach Admin.')) {
                  localStorage.removeItem('ignite_evaluator_name');
                  sessionStorage.removeItem('ignite_admin_unlocked');
                  setIsAdminUnlocked(false);
                  setCurrentView('evaluator');
                  setEvaluatorName('');
                }
              }}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Switch Evaluator Profile (Locks Admin)"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6">
        {/* VIEW 1: EVALUATOR MOBILE GRID */}
        {currentView === 'evaluator' && (
          <div className="space-y-4">
            
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Search input */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Quick find by name or jersey #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 text-white text-xs border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                />
              </div>

              {/* Drill Group Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
                {groups.map((group) => (
                  <button
                    key={group}
                    onClick={() => setSelectedGroupFilter(group)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                      selectedGroupFilter === group
                        ? 'bg-amber-400 text-slate-950 shadow-md'
                        : 'bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {group}
                  </button>
                ))}

                <button
                  onClick={() => setOnlyUnratedFilter(!onlyUnratedFilter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                    onlyUnratedFilter
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Unrated Only
                </button>
              </div>
            </div>

            {/* Evaluator Notice if Finalized */}
            {activeSession?.status === 'finalized' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl text-xs flex items-center justify-between">
                <span>🔒 This tryout session has been finalized by coaches (Read-Only Mode).</span>
              </div>
            )}

            {/* Responsive Player Card Grid */}
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-300">No players match the criteria</h4>
                <p className="text-xs text-slate-500 mt-1">Try switching filters or check Coach settings.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredPlayers.map((player) => {
                  const playerEvals = evaluations.filter(
                    e => e.player_id === player.id && e.evaluator_name === evaluatorName
                  );
                  return (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      evaluations={playerEvals}
                      totalCriteriaCount={criteria.length}
                      onClick={() => setSelectedPlayer(player)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: COACH-ONLY LEADERBOARD & 22-ROSTER BOARD */}
        {currentView === 'leaderboard' && activeSession && (
          <Leaderboard
            session={activeSession}
            players={players}
            criteria={criteria}
            evaluations={evaluations}
            notes={notes}
            onRefresh={() => {}}
          />
        )}

        {/* VIEW 3: COACH ADMIN PANEL */}
        {currentView === 'admin' && activeSession && (
          <AdminPanel
            currentSession={activeSession}
            sessions={sessions}
            players={players}
            criteria={criteria}
            onSessionChange={(s) => setActiveSession(s)}
            onRefresh={() => {}}
          />
        )}
      </main>

      {/* Bottom Sheet / Modal Scoring View */}
      {selectedPlayer && activeSession && (
        <ScoringModal
          player={selectedPlayer}
          session={activeSession}
          evaluatorName={evaluatorName}
          criteria={criteria}
          evaluations={evaluations.filter(e => e.player_id === selectedPlayer.id && e.evaluator_name === evaluatorName)}
          notes={notes.filter(n => n.player_id === selectedPlayer.id)}
          onClose={() => setSelectedPlayer(null)}
          onNavigate={handleNavigatePlayer}
          hasPrev={selectedPlayerIndex > 0}
          hasNext={selectedPlayerIndex < filteredPlayers.length - 1}
          onRefresh={() => {}}
        />
      )}

      {/* Admin PIN Keypad Modal */}
      <AdminPinModal
        isOpen={showPinModal}
        targetPin={activeSession?.admin_pin_hash || '2026'}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => {
          setIsAdminUnlocked(true);
          setShowPinModal(false);
          setCurrentView(currentView === 'leaderboard' ? 'leaderboard' : 'admin');
        }}
      />
    </div>
  );
};

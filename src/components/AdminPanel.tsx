import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { SyncService } from '../services/sync';
import type { Player, Criterion, TryoutSession, PlayerStatus } from '../types';
import { PINNEY_COLORS, NO_PINNEY_COLOR, getPinneyColor, DEFAULT_CRITERIA_TEMPLATES } from '../data/defaultData';
import { useTeam } from '../context/TeamContext';
import { cacheTeam } from '../services/team';
import { normalizeGender } from './GenderBadge';
import {
  Users,
  Upload,
  Plus,
  Trash2,
  Sliders,
  Calendar,
  CheckCircle2,
  ArrowRightLeft,
  Lock,
  Unlock,
  FileSpreadsheet,
  Flame,
  Sparkles,
  Pencil,
  Check,
  UserX
} from 'lucide-react';

// Inline-editable player name. Edits stay local until blur / Enter, so a rename
// is one Firestore write instead of one per keystroke. Empty names are rejected.
const PlayerNameInput: React.FC<{ name: string; onCommit: (name: string) => void }> = ({ name, onCommit }) => {
  const [value, setValue] = useState(name);
  // Pick up remote changes (another device renamed the player).
  useEffect(() => { setValue(name); }, [name]);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) { setValue(name); return; }
    if (trimmed !== name) onCommit(trimmed);
    else setValue(name);
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setValue(name); (e.target as HTMLInputElement).blur(); }
      }}
      className="w-40 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-amber-400"
      aria-label="Player name"
    />
  );
};

interface AdminPanelProps {
  currentSession: TryoutSession;
  sessions: TryoutSession[];
  players: Player[];
  criteria: Criterion[];
  onSessionChange: (session: TryoutSession) => void;
  onRefresh: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentSession,
  sessions,
  players,
  criteria,
  onSessionChange,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'criteria' | 'sessions' | 'settings'>('roster');
  
  const team = useTeam();
  const { mixed_gender } = team;

  // New Player Form State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNum, setNewPlayerNum] = useState<number | ''>('');
  const [newPlayerColor, setNewPlayerColor] = useState(NO_PINNEY_COLOR);
  const [newPlayerGroup, setNewPlayerGroup] = useState('Group A');
  const [newPlayerGender, setNewPlayerGender] = useState<'M' | 'F' | ''>('');

  // New Criterion Form State
  const [newCritName, setNewCritName] = useState('');
  const [newCritCat, setNewCritCat] = useState<'Offense' | 'Defense' | 'Athleticism & Intangibles'>('Offense');
  const [newCritDesc, setNewCritDesc] = useState('');
  const [newCritExemplar, setNewCritExemplar] = useState('');

  // Inline Criterion Edit State
  const [editingCritId, setEditingCritId] = useState<string | null>(null);
  const [editCritName, setEditCritName] = useState('');
  const [editCritCat, setEditCritCat] = useState<'Offense' | 'Defense' | 'Athleticism & Intangibles'>('Offense');
  const [editCritDesc, setEditCritDesc] = useState('');

  // New Session Form State
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionNum, setNewSessionNum] = useState(sessions.length + 1);
  const [rolloverSourceSessionId, setRolloverSourceSessionId] = useState<string>(currentSession.id);
  const [includeLocksOnly, setIncludeLocksOnly] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState('');

  // Evaluator list (derived from evaluations in the current session)
  const sessionEvaluators = useLiveQuery(async () => {
    const evals = await db.evaluations.where('session_id').equals(currentSession.id).toArray();
    const names = [...new Set(evals.map(e => e.evaluator_name))].sort();
    return names.map(name => ({
      name,
      evalCount: evals.filter(e => e.evaluator_name === name).length
    }));
  }, [currentSession.id]) ?? [];

  const handleDeleteEvaluator = async (name: string) => {
    if (!confirm(`Remove all scores and notes by "${name}" from this session? This cannot be undone.`)) return;
    await SyncService.deleteEvaluator(name, currentSession.id);
  };

  // CSV Import
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
      const rows = results.data as any[];

      // Load existing players for this session to dedup
      const existing = await db.players.where('session_id').equals(currentSession.id).toArray();

      let added = 0, updated = 0;
      for (const [idx, row] of rows.entries()) {
        const firstName = row['FirstName'] || row['First Name'] || row['firstname'] || '';
        const lastName = row['LastName'] || row['Last Name'] || row['lastname'] || '';
        const combinedName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : '';
        const name = (row['Name'] || row['name'] || row['Player'] || combinedName || `Player ${idx + 1}`).trim();
        const rawNum = parseInt(row['Number'] || row['number'] || row['Jersey'] || row['#'] || '', 10);
        const num = Number.isFinite(rawNum) ? rawNum : idx + 1;
        const hasExplicitNumber = Number.isFinite(rawNum);
        const color = getPinneyColor(row['PinneyColor'] || row['Color'] || row['color']).name;
        const group = (row['Group'] || row['group'] || 'Group A').trim();
        const gender = normalizeGender(row['Gender'] || row['gender']);

        // Match by name (case-insensitive); also require jersey number match when one is provided
        const nameLower = name.toLowerCase();
        const match = existing.find(p => {
          const nameMatch = p.name.toLowerCase() === nameLower;
          if (!nameMatch) return false;
          return !hasExplicitNumber || p.pinney_number === num;
        });

        if (match) {
          // Upsert: update mutable fields, preserve status/is_locked/id
          const updatedPlayer: Player = {
            ...match,
            pinney_number: num,
            pinney_color: color,
            group_name: group,
            ...(gender ? { gender } : {})
          };
          await SyncService.syncPlayer(updatedPlayer);
          // Keep existing[] in sync so later rows in the same file don't re-match stale data
          existing.splice(existing.indexOf(match), 1, updatedPlayer);
          updated++;
        } else {
          const player: Player = {
            id: `player_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
            session_id: currentSession.id,
            name,
            pinney_number: num,
            pinney_color: color,
            group_name: group,
            is_locked: false,
            status: 'active'
          };
          if (gender) player.gender = gender;
          await db.players.add(player);
          await SyncService.syncPlayer(player);
          existing.push(player);
          added++;
        }
      }

      if (added > 0 || updated > 0) {
        onRefresh();
        const parts = [];
        if (added > 0) parts.push(`${added} added`);
        if (updated > 0) parts.push(`${updated} updated`);
        setSaveSuccess(`CSV import: ${parts.join(', ')}.`);
        setTimeout(() => setSaveSuccess(''), 3000);
      }
      }
    });
  };

  // Add Single Player
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const newPlayer: Player = {
      id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      session_id: currentSession.id,
      name: newPlayerName.trim(),
      pinney_number: Number(newPlayerNum) || 0,
      pinney_color: newPlayerColor,
      group_name: newPlayerGroup.trim() || 'Group A',
      is_locked: false,
      status: 'active'
    };
    if (newPlayerGender) newPlayer.gender = newPlayerGender as 'M' | 'F';

    await db.players.add(newPlayer);
    await SyncService.syncPlayer(newPlayer);
    setNewPlayerName('');
    setNewPlayerNum('');
    setNewPlayerGender('');
    onRefresh();
  };

  // Update Player Status or Lock
  const handleUpdatePlayer = async (playerId: string, updates: Partial<Player>) => {
    await db.players.update(playerId, updates);
    const updated = await db.players.get(playerId);
    if (updated) {
      await SyncService.syncPlayer(updated);
    }
    onRefresh();
  };

  // Delete Player
  const handleDeletePlayer = async (playerId: string) => {
    if (confirm('Delete this player from current tryout session?')) {
      await SyncService.deletePlayer(playerId);
      onRefresh();
    }
  };

  // Clear All Players
  const handleClearAllPlayers = async () => {
    if (players.length === 0) return;
    if (!confirm(`Remove all ${players.length} players from this session? This cannot be undone.`)) return;
    for (const p of players) {
      await SyncService.deletePlayer(p.id);
    }
    onRefresh();
  };

  // Add Criterion
  const handleAddCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCritName.trim()) return;

    const newCrit: Criterion = {
      id: `crit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      session_id: currentSession.id,
      name: newCritName.trim(),
      category: newCritCat,
      description: newCritDesc.trim(),
      exemplar_player_name: newCritExemplar.trim(),
      sort_order: criteria.length + 1
    };

    await SyncService.syncCriterion(newCrit);
    setNewCritName('');
    setNewCritDesc('');
    setNewCritExemplar('');
    onRefresh();
  };

  // Delete Criterion
  const handleDeleteCriterion = async (critId: string) => {
    if (confirm('Delete this evaluation criterion?')) {
      await SyncService.deleteCriterion(critId);
      onRefresh();
    }
  };

  // Save Inline Criterion Edit
  const handleSaveCriterionEdit = async () => {
    if (!editingCritId || !editCritName.trim()) return;
    await db.criteria.update(editingCritId, {
      name: editCritName.trim(),
      category: editCritCat,
      description: editCritDesc.trim(),
    });
    const updatedCrit = await db.criteria.get(editingCritId);
    if (updatedCrit) {
      await SyncService.syncCriterion(updatedCrit);
    }
    setEditingCritId(null);
    onRefresh();
  };

  // Freeze / Re-Open Session
  const handleToggleFinalize = async () => {
    const nextStatus = currentSession.status === 'active' ? 'finalized' : 'active';
    if (nextStatus === 'finalized') {
      if (!confirm('Freeze evaluator inputs? Evaluators will immediately see a read-only banner. You can re-open at any time.')) return;
    }
    await db.sessions.update(currentSession.id, { status: nextStatus });
    const updated = { ...currentSession, status: nextStatus as any };
    await SyncService.syncSession(updated);
    onSessionChange(updated);
    onRefresh();
  };

  // Create New Session & Rollover Roster
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    const newSessionId = `session-${Date.now()}`;
    const newSession: TryoutSession = {
      id: newSessionId,
      name: newSessionName.trim(),
      session_number: Number(newSessionNum) || (sessions.length + 1),
      target_roster_size: currentSession.target_roster_size || 22,
      date: new Date().toISOString().split('T')[0],
      status: 'active',
    };

    await SyncService.syncSession(newSession);

    // Copy criteria from previous
    const prevCriteria = await db.criteria.where('session_id').equals(rolloverSourceSessionId).toArray();
    const copiedCriteria: Criterion[] = (prevCriteria.length > 0 ? prevCriteria : DEFAULT_CRITERIA_TEMPLATES).map((c: any, i: number) => ({
      ...c,
      id: `crit_${newSessionId}_${i + 1}`,
      session_id: newSessionId
    }));
    for (const c of copiedCriteria) {
      await SyncService.syncCriterion(c);
    }

    // Rollover Players: carry over non-cut players
    const prevPlayers = await db.players.where('session_id').equals(rolloverSourceSessionId).toArray();
    const playersToRoll = prevPlayers.filter((p: Player) => {
      if (p.status === 'cut_moved_down') return false;
      if (includeLocksOnly && !p.is_locked) return false;
      return true;
    });

    const rolledPlayers: Player[] = playersToRoll.map((p: Player, idx: number) => ({
      ...p,
      id: `player_${newSessionId}_${idx + 1}`,
      session_id: newSessionId,
      status: p.status === 'no_need_to_watch' ? 'no_need_to_watch' : 'active'
    }));
    for (const p of rolledPlayers) {
      await SyncService.syncPlayer(p);
    }

    setNewSessionName('');
    onSessionChange(newSession);
    onRefresh();
    setSaveSuccess(`Created ${newSession.name} and carried over ${rolledPlayers.length} players!`);
    setTimeout(() => setSaveSuccess(''), 4000);
  };

  const lockedCount = players.filter(p => p.is_locked).length;
  const targetRoster = currentSession.target_roster_size || 22;

  // Coach PIN setting
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(newPin)) {
      setPinMsg({ ok: false, text: 'PIN must be 4–8 digits.' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinMsg({ ok: false, text: 'PINs do not match.' });
      return;
    }
    setPinSaving(true);
    setPinMsg(null);
    try {
      const res = await fetch('/api/team-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: team.slug, coach_pin: newPin })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPinMsg({ ok: false, text: data.error || `Failed to update PIN (${res.status})` });
        return;
      }
      // Update the cached team so the new PIN is used immediately, then reload
      // to pick it up in the TeamContext.
      cacheTeam({ ...team, coach_pin: newPin });
      setPinMsg({ ok: true, text: 'Coach PIN updated. Reloading…' });
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setPinMsg({ ok: false, text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setPinSaving(false);
    }
  };

  // Target roster size setting (edits commit on blur / Enter)
  const [targetRosterInput, setTargetRosterInput] = useState(String(targetRoster));
  useEffect(() => { setTargetRosterInput(String(targetRoster)); }, [targetRoster]);

  const commitTargetRoster = async () => {
    const n = Math.floor(Number(targetRosterInput));
    if (!Number.isFinite(n) || n < 1) { setTargetRosterInput(String(targetRoster)); return; }
    setTargetRosterInput(String(n));
    if (n === targetRoster) return;
    await db.sessions.update(currentSession.id, { target_roster_size: n });
    const updated = { ...currentSession, target_roster_size: n };
    await SyncService.syncSession(updated);
    onSessionChange(updated);
    onRefresh();
    setSaveSuccess(`Target roster size set to ${n}`);
    setTimeout(() => setSaveSuccess(''), 3000);
  };

  // shared input class
  const inputCls = 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-amber-400';
  const selectCls = `${inputCls}`;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner / Session Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
              Coach Admin Suite
            </span>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
              currentSession.status === 'active' 
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
            }`}>
              {currentSession.status === 'active' ? '🟢 Live' : '🔒 Frozen'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{currentSession.name}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Target Roster: {targetRoster} players • {lockedCount} locked onto team</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Session Switcher */}
          <select
            value={currentSession.id}
            onChange={(e) => {
              const selected = sessions.find(s => s.id === e.target.value);
              if (selected) {
                onSessionChange(selected);
                onRefresh();
              }
            }}
            className={selectCls}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>

          {/* Freeze / Re-Open Button */}
          <button
            onClick={handleToggleFinalize}
            className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition ${
              currentSession.status === 'active'
                ? 'bg-rose-600/20 text-rose-600 dark:text-rose-300 border-rose-500/40 hover:bg-rose-600/30'
                : 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
            }`}
          >
            {currentSession.status === 'active' ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Freeze Evaluator Inputs</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>Re-Open Inputs</span>
              </>
            )}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeTab === 'roster'
              ? 'bg-amber-400 text-slate-950 shadow'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Roster & Pinneys ({players.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('criteria')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeTab === 'criteria'
              ? 'bg-amber-400 text-slate-950 shadow'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Criteria & Exemplars ({criteria.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeTab === 'sessions'
              ? 'bg-amber-400 text-slate-950 shadow'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Multi-Session Rollover</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 ${
            activeTab === 'settings'
              ? 'bg-amber-400 text-slate-950 shadow'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Flame className="w-4 h-4 text-amber-500" />
          <span>Cloud & Security</span>
        </button>
      </div>

      {/* TAB 1: ROSTER & PINNEYS */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          {/* Quick Actions (Add player + CSV import) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CSV Import */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-1">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span>CSV Roster Upload</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Upload .csv with columns: <code className="text-slate-600 dark:text-slate-300">Name, Number, PinneyColor, Group{mixed_gender ? ', Gender' : ''}</code>
                  <span className="block mt-0.5 text-slate-400 dark:text-slate-500">Or use <code className="text-slate-500 dark:text-slate-400">FirstName, LastName</code> instead of <code className="text-slate-500 dark:text-slate-400">Name</code>. PinneyColor is optional.</span>
                  {mixed_gender && <span className="block mt-0.5 text-slate-400 dark:text-slate-500">Gender accepts: M / Male / Men / Man (and F equivalents), case-insensitive.</span>}
                </p>
              </div>
              <label className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>Select CSV File</span>
                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
              </label>
            </div>

            {/* Quick Add Player */}
            <form onSubmit={handleAddPlayer} className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-3">
                <Plus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>Add Single Player</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Player Name"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className={`col-span-2 sm:col-span-1 ${inputCls}`}
                  required
                />
                <input
                  type="number"
                  placeholder="Jersey #"
                  value={newPlayerNum}
                  onChange={(e) => setNewPlayerNum(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className={inputCls}
                  required
                />
                <select
                  value={newPlayerColor}
                  onChange={(e) => setNewPlayerColor(e.target.value)}
                  className={selectCls}
                >
                  {PINNEY_COLORS.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Group (e.g. Group A)"
                  value={newPlayerGroup}
                  onChange={(e) => setNewPlayerGroup(e.target.value)}
                  className={inputCls}
                />
                {mixed_gender && (
                  <select
                    value={newPlayerGender}
                    onChange={(e) => setNewPlayerGender(e.target.value as 'M' | 'F' | '')}
                    className={selectCls}
                  >
                    <option value="">Gender (optional)</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl transition"
              >
                Add Player to Roster
              </button>
            </form>
          </div>

          {/* Player Management Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Active Tryout Players ({players.length})</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 dark:text-slate-400">Click color or status to modify live</span>
                {players.length > 0 && (
                  <button
                    onClick={handleClearAllPlayers}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Player</th>
                    <th className="p-3">Pinney Color</th>
                    <th className="p-3">Group</th>
                    {mixed_gender && <th className="p-3 text-center">Gender</th>}
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Team Lock</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {players.length === 0 ? (
                    <tr>
                      <td colSpan={mixed_gender ? 8 : 7} className="p-8 text-center text-slate-400 dark:text-slate-500">
                        No players loaded yet. Upload a CSV or add players above.
                      </td>
                    </tr>
                  ) : (
                    players.map((player) => {
                      return (
                        <tr key={player.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono font-bold text-amber-500 dark:text-amber-400">
                            #{player.pinney_number}
                          </td>
                          <td className="p-3">
                            <PlayerNameInput
                              name={player.name}
                              onCommit={(name) => handleUpdatePlayer(player.id, { name })}
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={getPinneyColor(player.pinney_color).name}
                              onChange={(e) => handleUpdatePlayer(player.id, { pinney_color: e.target.value })}
                              className="bg-slate-50 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-200"
                            >
                              {PINNEY_COLORS.map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={player.group_name}
                              onChange={(e) => handleUpdatePlayer(player.id, { group_name: e.target.value })}
                              className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                            />
                          </td>
                          {mixed_gender && (
                            <td className="p-3 text-center">
                              <select
                                value={player.gender || ''}
                                onChange={(e) => handleUpdatePlayer(player.id, { gender: (e.target.value as 'M' | 'F') || undefined })}
                                className="bg-slate-50 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-200"
                              >
                                <option value="">—</option>
                                <option value="M">M</option>
                                <option value="F">F</option>
                              </select>
                            </td>
                          )}
                          <td className="p-3">
                            <select
                              value={player.status}
                              onChange={(e) => handleUpdatePlayer(player.id, { status: e.target.value as PlayerStatus })}
                              className={`text-xs border rounded-lg px-2 py-1 outline-none ${
                                player.status === 'active'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-600/40 text-emerald-700 dark:text-emerald-300'
                                  : player.status === 'no_need_to_watch'
                                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-600/40 text-sky-700 dark:text-sky-300'
                                  : player.status === 'injured'
                                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-600/40 text-amber-700 dark:text-amber-300'
                                  : player.status === 'cut_moved_down'
                                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-600/40 text-rose-700 dark:text-rose-300'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <option value="active">Active</option>
                              <option value="no_need_to_watch">No Need to Watch</option>
                              <option value="injured">Injured</option>
                              <option value="absent">Absent</option>
                              <option value="cut_moved_down">Cut / Moved Down</option>
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleUpdatePlayer(player.id, { is_locked: !player.is_locked })}
                              className={`p-1.5 rounded-lg border transition ${
                                player.is_locked
                                  ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300 border-amber-400/40'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                              }`}
                              title={player.is_locked ? 'Locked onto team' : 'Click to lock'}
                            >
                              {player.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeletePlayer(player.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded transition"
                              title="Delete player"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CRITERIA & EXEMPLARS */}
      {activeTab === 'criteria' && (
        <div className="space-y-6">
          {/* Add Criterion Form */}
          <form onSubmit={handleAddCriterion} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-3">
              <Plus className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Add Evaluation Criterion & Exemplar Benchmark</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <input
                type="text"
                placeholder="Skill Name (e.g. Break Throws)"
                value={newCritName}
                onChange={(e) => setNewCritName(e.target.value)}
                className={inputCls}
                required
              />
              <select
                value={newCritCat}
                onChange={(e) => setNewCritCat(e.target.value as any)}
                className={selectCls}
              >
                <option value="Offense">Offense</option>
                <option value="Defense">Defense</option>
                <option value="Athleticism & Intangibles">Athleticism & Intangibles</option>
              </select>
              <input
                type="text"
                placeholder="Exemplar Player Benchmark (e.g. Kian)"
                value={newCritExemplar}
                onChange={(e) => setNewCritExemplar(e.target.value)}
                className={inputCls}
              />
            </div>
            <textarea
              placeholder="Short description / what evaluators should look for..."
              value={newCritDesc}
              onChange={(e) => setNewCritDesc(e.target.value)}
              className={`w-full ${inputCls} mb-3`}
              rows={2}
            />
            <button
              type="submit"
              className="py-2 px-5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl transition"
            >
              Add Criterion
            </button>
          </form>

          {/* Criteria List Grouped by Category */}
          {(['Offense', 'Defense', 'Athleticism & Intangibles'] as const).map((cat) => {
            const catCriteria = criteria.filter(c => c.category === cat);
            return (
              <div key={cat} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>{cat} Skills ({catCriteria.length})</span>
                  </h4>
                </div>

                <div className="space-y-2">
                  {catCriteria.map((c) => {
                    const isEditing = editingCritId === c.id;
                    return (
                      <div
                        key={c.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/40"
                      >
                        {isEditing ? (
                          /* ── Edit mode ── */
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editCritName}
                                onChange={(e) => setEditCritName(e.target.value)}
                                placeholder="Skill Name"
                                className={inputCls}
                                autoFocus
                              />
                              <select
                                value={editCritCat}
                                onChange={(e) => setEditCritCat(e.target.value as any)}
                                className={selectCls}
                              >
                                <option value="Offense">Offense</option>
                                <option value="Defense">Defense</option>
                                <option value="Athleticism & Intangibles">Athleticism & Intangibles</option>
                              </select>
                            </div>
                            <textarea
                              value={editCritDesc}
                              onChange={(e) => setEditCritDesc(e.target.value)}
                              placeholder="Description / what evaluators should look for..."
                              className={`w-full ${inputCls}`}
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveCriterionEdit}
                                className="flex items-center gap-1 py-1 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-lg transition"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingCritId(null)}
                                className="py-1 px-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read mode ── */
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-800 dark:text-white text-xs">{c.name}</span>
                                {c.exemplar_player_name && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/30 text-[10px] font-medium flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                                    <span>Exemplar: {c.exemplar_player_name}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{c.description}</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="text"
                                placeholder="Exemplar"
                                value={c.exemplar_player_name || ''}
                                onChange={async (e) => {
                                  await SyncService.syncCriterion({ ...c, exemplar_player_name: e.target.value });
                                  onRefresh();
                                }}
                                className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-amber-600 dark:text-amber-300"
                              />
                              <button
                                onClick={() => {
                                  setEditingCritId(c.id);
                                  setEditCritName(c.name);
                                  setEditCritCat(c.category);
                                  setEditCritDesc(c.description || '');
                                }}
                                className="text-slate-400 hover:text-amber-500 p-1"
                                title="Edit criterion"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCriterion(c.id)}
                                className="text-slate-400 hover:text-rose-500 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: MULTI-SESSION ROLLOVER */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Create Next Tryout Session & Carry Over Advancing Players</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Advance from Session 1 to Session 2 or 3. Players marked as &ldquo;Cut / Moved Down&rdquo; will automatically be filtered out.
            </p>

            <form onSubmit={handleCreateSession} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">New Session Name</label>
                <input
                  type="text"
                  placeholder="e.g. Session 2 - Callbacks & Drills"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className={`w-full ${inputCls}`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Session Number</label>
                  <input
                    type="number"
                    value={newSessionNum}
                    onChange={(e) => setNewSessionNum(parseInt(e.target.value, 10))}
                    className={`w-full ${inputCls}`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Source Session</label>
                  <select
                    value={rolloverSourceSessionId}
                    onChange={(e) => setRolloverSourceSessionId(e.target.value)}
                    className={`w-full ${selectCls}`}
                  >
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="locksOnly"
                  checked={includeLocksOnly}
                  onChange={(e) => setIncludeLocksOnly(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-0"
                />
                <label htmlFor="locksOnly" className="text-xs text-slate-600 dark:text-slate-300">
                  Only carry over Locked players (leave unchecked to carry over all non-cut players)
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition"
              >
                Create Session & Carry Over Roster
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-xl">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-2">
              <Users className="w-5 h-5 text-amber-500" />
              <span>Target Roster Size</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              Number of spots to fill on the final roster for this session. Used by the roster board and leaderboard.
            </p>
            <input
              type="number"
              min={1}
              step={1}
              value={targetRosterInput}
              onChange={(e) => setTargetRosterInput(e.target.value)}
              onBlur={commitTargetRoster}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className={`${inputCls} w-24`}
              aria-label="Target roster size"
            />
          </div>

          <form
            onSubmit={handleChangePin}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-2">
              <Lock className="w-5 h-5 text-amber-500" />
              <span>Change Coach PIN</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              Set a new 4–8 digit PIN for this team. It takes effect on all devices the next time they load the team.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="New PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className={`${inputCls} w-32`}
                aria-label="New coach PIN"
              />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="Confirm PIN"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className={`${inputCls} w-32`}
                aria-label="Confirm new coach PIN"
              />
              <button
                type="submit"
                disabled={pinSaving || !newPin || !confirmPin}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition"
              >
                {pinSaving ? 'Saving…' : 'Update PIN'}
              </button>
            </div>
            {pinMsg && (
              <p className={`text-xs mt-2 ${pinMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {pinMsg.text}
              </p>
            )}
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <span>Cloud Sync</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              This app uses a shared Firebase Firestore backend. All devices on the same team URL sync automatically — no per-device configuration is needed. Use the super-admin screen (root URL) to create or edit teams.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-sm mb-1">
              <UserX className="w-5 h-5 text-rose-500" />
              <span>Evaluators</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Evaluators who have submitted scores this session. You can remove an evaluator's scores and notes entirely — for example if someone entered the wrong name.
            </p>
            {sessionEvaluators.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No evaluations recorded yet for this session.</p>
            ) : (
              <ul className="space-y-2">
                {sessionEvaluators.map(({ name, evalCount }) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">{name}</span>
                      <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">{evalCount} score{evalCount !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteEvaluator(name)}
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                      title={`Remove all scores and notes by ${name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

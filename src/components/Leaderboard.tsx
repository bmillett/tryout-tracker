import React, { useState } from 'react';
import type { Player, Criterion, Evaluation, PlayerNote, TryoutSession } from '../types';
import { PINNEY_COLORS } from '../data/defaultData';
import { db } from '../services/db';
import { SyncService } from '../services/sync';
import {
  Trophy,
  Lock,
  Unlock,
  Download,
  Search,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';

interface LeaderboardProps {
  session: TryoutSession;
  players: Player[];
  criteria: Criterion[];
  evaluations: Evaluation[];
  notes: PlayerNote[];
  onSessionChange: (session: TryoutSession) => void;
  onRefresh: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  session,
  players,
  criteria,
  evaluations,
  notes,
  onSessionChange,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'overall' | 'offense' | 'defense' | 'intangibles' | 'number'>('overall');
  const [selectedPlayerForDetail, setSelectedPlayerForDetail] = useState<Player | null>(null);

  const targetSpots = session.target_roster_size || 22;
  const lockedPlayers = players.filter(p => p.is_locked);
  const lockedCount = lockedPlayers.length;
  const openSpots = Math.max(0, targetSpots - lockedCount);

  // Calculate scores per player
  const playerStats = players.map(player => {
    const pEvals = evaluations.filter(e => e.player_id === player.id);
    const pNotes = notes.filter(n => n.player_id === player.id);

    // Group evaluations by criterion category
    let offSum = 0, offCount = 0;
    let defSum = 0, defCount = 0;
    let intSum = 0, intCount = 0;

    pEvals.forEach(ev => {
      const crit = criteria.find(c => c.id === ev.criterion_id);
      if (!crit) return;
      if (crit.category === 'Offense') {
        offSum += ev.score;
        offCount++;
      } else if (crit.category === 'Defense') {
        defSum += ev.score;
        defCount++;
      } else {
        intSum += ev.score;
        intCount++;
      }
    });

    const offAvg = offCount > 0 ? (offSum / offCount) : 0;
    const defAvg = defCount > 0 ? (defSum / defCount) : 0;
    const intAvg = intCount > 0 ? (intSum / intCount) : 0;
    const totalCount = pEvals.length;
    const overallAvg = totalCount > 0 ? (pEvals.reduce((acc, curr) => acc + curr.score, 0) / totalCount) : 0;

    // Evaluator count
    const uniqueEvaluators = new Set(pEvals.map(e => e.evaluator_name));

    return {
      player,
      evalCount: totalCount,
      evaluatorCount: uniqueEvaluators.size,
      offAvg,
      defAvg,
      intAvg,
      overallAvg,
      evals: pEvals,
      notes: pNotes
    };
  });

  // Filter & Sort
  const filtered = playerStats.filter(({ player }) => {
    if (player.status === 'cut_moved_down') return false;
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          player.pinney_number.toString().includes(searchQuery);
    const matchesGroup = selectedGroup === 'All' || player.group_name === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  filtered.sort((a, b) => {
    // Locked players stay pinned at the top if sorting by overall
    if (sortBy === 'overall') {
      if (a.player.is_locked && !b.player.is_locked) return -1;
      if (!a.player.is_locked && b.player.is_locked) return 1;
      return b.overallAvg - a.overallAvg;
    }
    if (sortBy === 'offense') return b.offAvg - a.offAvg;
    if (sortBy === 'defense') return b.defAvg - a.defAvg;
    if (sortBy === 'intangibles') return b.intAvg - a.intAvg;
    if (sortBy === 'number') return a.player.pinney_number - b.player.pinney_number;
    return 0;
  });

  const handleToggleLock = async (player: Player) => {
    const updated = { ...player, is_locked: !player.is_locked };
    await db.players.update(player.id, { is_locked: updated.is_locked });
    await SyncService.syncPlayer(updated);
    onRefresh();
  };

  // Export full CSV matrix
  const handleExportCsv = () => {
    const rows = filtered.map(({ player, overallAvg, offAvg, defAvg, intAvg, evalCount, evaluatorCount, notes }) => {
      const presetTags = notes.filter(n => n.preset_tag).map(n => n.preset_tag).join('; ');
      const customComments = notes.filter(n => n.custom_text).map(n => `${n.evaluator_name}: ${n.custom_text}`).join(' | ');

      return {
        'Jersey #': player.pinney_number,
        'Name': player.name,
        'Pinney Color': player.pinney_color,
        'Group': player.group_name,
        'Status': player.status,
        'Locked': player.is_locked ? 'YES' : 'NO',
        'Overall Avg (1-5)': overallAvg.toFixed(2),
        'Offense Avg (1-5)': offAvg.toFixed(2),
        'Defense Avg (1-5)': defAvg.toFixed(2),
        'Intangibles Avg (1-5)': intAvg.toFixed(2),
        'Total Evals': evalCount,
        'Evaluators Count': evaluatorCount,
        'Preset Tags': presetTags,
        'Coach Notes': customComments
      };
    });

    const csvContent = "data:text/csv;charset=utf-8," + 
      [Object.keys(rows[0] || {}).join(','), ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ignite_Tryout_${session.name.replace(/\s+/g, '_')}_Matrix.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const groups = ['All', ...Array.from(new Set(players.map(p => p.group_name || 'Group A')))];

  return (
    <div className="space-y-6 pb-20">
      {/* 1. COACH-ONLY LIVE ROSTER BOARD (TARGET 22 COUNTER) */}
      <div className="bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm">
                <Trophy className="w-3.5 h-3.5" />
                <span>Coach Roster Board</span>
              </span>
              <span className="text-xs text-slate-400">Target Roster: <strong>{targetSpots}</strong> players</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>{lockedCount} of {targetSpots} Spots Locked</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-amber-300 border border-slate-700 font-semibold">
                {openSpots} Open Spot{openSpots !== 1 ? 's' : ''} Remaining
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 1-Click Freeze / Finalize Session for all evaluators */}
            <button
              onClick={async () => {
                const nextStatus = session.status === 'active' ? 'finalized' : 'active';
                if (nextStatus === 'finalized') {
                  if (!confirm('Freeze this tryout session? This will immediately lock all input from non-coaches/evaluators on their devices.')) return;
                }
                await db.sessions.update(session.id, { status: nextStatus });
                const updated = { ...session, status: nextStatus as any };
                await SyncService.syncSession(updated);
                onSessionChange(updated);
                onRefresh();
              }}
              className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md transition border ${
                session.status === 'active'
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {session.status === 'active' ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Freeze Evaluator Inputs</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Re-Open Inputs</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl text-xs font-bold shadow-md transition"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV Matrix</span>
            </button>
          </div>
        </div>

        {/* Progress Bar of Locked Spots */}
        <div className="w-full h-3 bg-slate-800 rounded-full mt-4 overflow-hidden border border-slate-700/60 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (lockedCount / targetSpots) * 100)}%` }}
          />
        </div>
      </div>

      {/* Filters & Sorting Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name or jersey #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-white text-xs border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-amber-400"
            />
          </div>

          {/* Group Filter */}
          <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
            {groups.map(grp => (
              <button
                key={grp}
                onClick={() => setSelectedGroup(grp)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  selectedGroup === grp
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {grp}
              </button>
            ))}
          </div>
        </div>

        {/* Sort by Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 overflow-x-auto">
          <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1 shrink-0">
            <ArrowUpDown className="w-3 h-3" /> Sort by:
          </span>
          {[
            { id: 'overall', label: 'Overall Rank' },
            { id: 'offense', label: 'Offense' },
            { id: 'defense', label: 'Defense' },
            { id: 'intangibles', label: 'Intangibles' },
            { id: 'number', label: 'Jersey #' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition shrink-0 ${
                sortBy === s.id
                  ? 'bg-slate-800 text-amber-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/70 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-center w-12">Rank</th>
                <th className="p-3.5">Player</th>
                <th className="p-3.5 text-center">Group</th>
                <th className="p-3.5 text-center">Overall</th>
                <th className="p-3.5 text-center hidden md:table-cell">Offense</th>
                <th className="p-3.5 text-center hidden md:table-cell">Defense</th>
                <th className="p-3.5 text-center hidden sm:table-cell">Evaluators</th>
                <th className="p-3.5 text-center">Lock Spot</th>
                <th className="p-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filtered.map(({ player, overallAvg, offAvg, defAvg, evalCount, evaluatorCount }, idx) => {
                const pinney = PINNEY_COLORS.find(c => c.name.toLowerCase() === player.pinney_color.toLowerCase()) || PINNEY_COLORS[0];
                const isWithinTarget22 = idx < targetSpots;

                return (
                  <tr
                    key={player.id}
                    className={`transition hover:bg-slate-800/50 ${
                      player.is_locked ? 'bg-amber-500/5' : isWithinTarget22 ? 'bg-slate-900' : 'bg-slate-950/40 opacity-80'
                    }`}
                  >
                    {/* Rank */}
                    <td className="p-3.5 text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </td>

                    {/* Player Info */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs border ${pinney.bg} ${pinney.text} ${pinney.border}`}>
                          {player.pinney_number}
                        </span>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-1.5">
                            <span>{player.name}</span>
                            {player.is_locked && (
                              <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 rounded font-semibold">
                                Locked 🔒
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">{player.pinney_color}</span>
                        </div>
                      </div>
                    </td>

                    {/* Group */}
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                        {player.group_name}
                      </span>
                    </td>

                    {/* Overall Score */}
                    <td className="p-3.5 text-center font-black text-sm">
                      {overallAvg > 0 ? (
                        <span className={`px-2.5 py-1 rounded-xl border ${
                          overallAvg >= 4 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                          overallAvg >= 3 ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                          overallAvg >= 2 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                          'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}>
                          {overallAvg.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">-</span>
                      )}
                    </td>

                    {/* Offense */}
                    <td className="p-3.5 text-center hidden md:table-cell text-slate-300 font-semibold">
                      {offAvg > 0 ? offAvg.toFixed(1) : '-'}
                    </td>

                    {/* Defense */}
                    <td className="p-3.5 text-center hidden md:table-cell text-slate-300 font-semibold">
                      {defAvg > 0 ? defAvg.toFixed(1) : '-'}
                    </td>

                    {/* Evaluator count */}
                    <td className="p-3.5 text-center hidden sm:table-cell">
                      <span className="text-xs text-slate-400">
                        {evaluatorCount} coach{evaluatorCount !== 1 ? 'es' : ''} ({evalCount} evals)
                      </span>
                    </td>

                    {/* 1-Click Lock Toggle */}
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleToggleLock(player)}
                        className={`p-2 rounded-xl border transition ${
                          player.is_locked
                            ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md font-bold'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title={player.is_locked ? 'Click to Unlock spot' : 'Click to Lock onto team'}
                      >
                        {player.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Details Drawer Trigger */}
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedPlayerForDetail(player)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs flex items-center gap-1 ml-auto"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PLAYER DETAIL MODAL / DRAWER */}
      {selectedPlayerForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedPlayerForDetail.name}</h3>
                <p className="text-xs text-slate-400">
                  #{selectedPlayerForDetail.pinney_number} • {selectedPlayerForDetail.pinney_color} • {selectedPlayerForDetail.group_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedPlayerForDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Side-by-side Evaluator Notes */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recorded Coach Notes</h4>
              {notes.filter(n => n.player_id === selectedPlayerForDetail.id).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No notes recorded yet.</p>
              ) : (
                notes
                  .filter(n => n.player_id === selectedPlayerForDetail.id)
                  .map(n => (
                    <div key={n.id} className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-semibold text-amber-300">{n.evaluator_name}</span>
                        <span className="text-[10px]">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {n.preset_tag && <div className="font-bold text-white">{n.preset_tag}</div>}
                      {n.custom_text && <div className="text-slate-300">{n.custom_text}</div>}
                    </div>
                  ))
              )}
            </div>

            {/* Detailed Criteria Scores Breakdown */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Criteria Ratings</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {criteria.map(crit => {
                  const evalsForCrit = evaluations.filter(
                    e => e.player_id === selectedPlayerForDetail.id && e.criterion_id === crit.id
                  );
                  if (evalsForCrit.length === 0) return null;
                  const avg = evalsForCrit.reduce((a, b) => a + b.score, 0) / evalsForCrit.length;

                  return (
                    <div key={crit.id} className="flex items-center justify-between p-2 bg-slate-800/40 rounded-lg text-xs">
                      <div>
                        <span className="text-white font-medium">{crit.name}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">({crit.category})</span>
                      </div>
                      <span className="font-bold text-amber-300">{avg.toFixed(1)} / 5</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

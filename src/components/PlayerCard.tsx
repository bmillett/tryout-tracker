import React from 'react';
import type { Player, Evaluation } from '../types';
import { PINNEY_COLORS } from '../data/defaultData';
import { CheckCircle2, EyeOff, Bandage, Ban } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  evaluations: Evaluation[];
  totalCriteriaCount: number;
  onClick: () => void;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  evaluations,
  totalCriteriaCount,
  onClick
}) => {
  const pinney = PINNEY_COLORS.find(c => c.name.toLowerCase() === player.pinney_color.toLowerCase()) || PINNEY_COLORS[0];
  const evalCount = evaluations.length;
  const isComplete = totalCriteriaCount > 0 && evalCount >= totalCriteriaCount;

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left p-3.5 rounded-2xl border transition duration-150 active:scale-97 flex flex-col justify-between overflow-hidden shadow-sm group ${
        player.status === 'no_need_to_watch'
          ? 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/60 opacity-60'
          : player.status === 'injured' || player.status === 'absent'
          ? 'bg-amber-50 dark:bg-slate-900/40 border-amber-200 dark:border-amber-900/40 opacity-70'
          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Top Header: Pinney badge & Group */}
      <div className="flex items-start justify-between gap-2 w-full mb-3">
        {/* Large Pinney Badge */}
        <div
          className={`flex items-center justify-center font-black rounded-xl text-lg px-3 py-1 shadow-inner border font-mono ${pinney.bg} ${pinney.text} ${pinney.border}`}
        >
          #{player.pinney_number}
        </div>

        {/* Group Pill or Status */}
        <div className="flex flex-col items-end gap-1">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
            {player.group_name || 'Group A'}
          </span>

          {player.status === 'no_need_to_watch' && (
            <span className="flex items-center gap-1 text-[9px] text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800/40">
              <EyeOff className="w-2.5 h-2.5" /> No need to watch
            </span>
          )}
          {player.status === 'injured' && (
            <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/40">
              <Bandage className="w-2.5 h-2.5" /> Injured
            </span>
          )}
          {player.status === 'absent' && (
            <span className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/40">
              <Ban className="w-2.5 h-2.5" /> Absent
            </span>
          )}
        </div>
      </div>

      {/* Player Name (First Name + Last Initial for compact sideline grid) */}
      <div className="w-full">
        <h4 className="font-bold text-slate-900 dark:text-white text-base tracking-tight truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition">
          {(() => {
            const parts = player.name.trim().split(/\s+/);
            if (parts.length > 1) {
              const firstName = parts[0];
              const lastInitial = parts[parts.length - 1][0].toUpperCase();
              return `${firstName} ${lastInitial}.`;
            }
            return player.name;
          })()}
        </h4>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: pinney.hex }} />
          <span>{player.pinney_color}</span>
        </span>
      </div>

      {/* Bottom Evaluation Progress Bar */}
      <div className="w-full mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isComplete ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Rated ({evalCount}/{totalCriteriaCount})</span>
            </span>
          ) : evalCount > 0 ? (
            <span className="text-amber-500 dark:text-amber-400 text-xs font-medium">
              {evalCount}/{totalCriteriaCount} rated
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 text-xs">
              Not rated yet
            </span>
          )}
        </div>

        {/* Mini progress bar */}
        <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isComplete ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            style={{ width: `${totalCriteriaCount > 0 ? (evalCount / totalCriteriaCount) * 100 : 0}%` }}
          />
        </div>
      </div>
    </button>
  );
};

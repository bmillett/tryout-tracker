import React, { useState } from 'react';
import type { Player, Criterion, Evaluation, PlayerNote, TryoutSession } from '../types';
import { PINNEY_COLORS, PRESET_NOTE_TAGS } from '../data/defaultData';
import { SyncService } from '../services/sync';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  MessageSquare, 
  Send, 
  Shield, 
  Zap, 
  Activity 
} from 'lucide-react';

interface ScoringModalProps {
  player: Player;
  session: TryoutSession;
  evaluatorName: string;
  criteria: Criterion[];
  evaluations: Evaluation[];
  notes: PlayerNote[];
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  hasPrev: boolean;
  hasNext: boolean;
  onRefresh: () => void;
}

const SCORE_LEVELS = [
  { score: 1, label: '--', sub: 'Novice / 0', color: 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 hover:bg-rose-500/30' },
  { score: 2, label: '-', sub: 'Below / 1-', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/30' },
  { score: 3, label: 'Std', sub: 'Standard / 1', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/40 hover:bg-blue-500/30' },
  { score: 4, label: '+', sub: 'Above / 2', color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' },
  { score: 5, label: '++', sub: 'Expert / 3+', color: 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40 hover:bg-purple-500/30' },
];

export const ScoringModal: React.FC<ScoringModalProps> = ({
  player,
  session,
  evaluatorName,
  criteria,
  evaluations,
  notes,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'Offense' | 'Defense' | 'Athleticism & Intangibles' | 'Notes'>('Offense');
  const [customNoteText, setCustomNoteText] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  const pinney = PINNEY_COLORS.find(c => c.name.toLowerCase() === player.pinney_color.toLowerCase()) || PINNEY_COLORS[0];
  const isFinalized = session.status === 'finalized';

  // Build lookup map for scores
  const scoreMap = new Map<string, number>();
  evaluations.forEach(e => {
    scoreMap.set(e.criterion_id, e.score);
  });

  const handleScoreTap = async (criterionId: string, score: number) => {
    if (isFinalized) return;
    await SyncService.saveEvaluation({
      session_id: session.id,
      player_id: player.id,
      criterion_id: criterionId,
      evaluator_name: evaluatorName,
      score: score
    });
    onRefresh();
  };

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTag && !customNoteText.trim()) return;
    if (isFinalized) return;

    await SyncService.saveNote({
      session_id: session.id,
      player_id: player.id,
      evaluator_name: evaluatorName,
      preset_tag: selectedTag || undefined,
      custom_text: customNoteText.trim() || undefined
    });

    setCustomNoteText('');
    setSelectedTag('');
    onRefresh();
  };

  const handlePresetSelect = async (tag: string) => {
    if (isFinalized) return;
    await SyncService.saveNote({
      session_id: session.id,
      player_id: player.id,
      evaluator_name: evaluatorName,
      preset_tag: tag
    });
    onRefresh();
  };

  const filteredCriteria = criteria.filter(c => c.category === activeTab);
  const myPlayerNotes = notes.filter(n => n.evaluator_name === evaluatorName);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4">
      {/* Modal Card / Bottom Sheet */}
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden">
        
        {/* Sticky Header with Player Info & Quick Nav */}
        <div className="p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black font-mono text-xl border shadow-inner ${pinney.bg} ${pinney.text} ${pinney.border}`}>
              #{player.pinney_number}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{player.name}</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {player.group_name}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evaluating as <span className="text-amber-500 dark:text-amber-400 font-semibold">{evaluatorName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Prev / Next buttons */}
            <button
              onClick={() => onNavigate('prev')}
              disabled={!hasPrev}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
              title="Previous Player"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!hasNext}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
              title="Next Player"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 bg-slate-50/50 dark:bg-slate-900/50 gap-2 overflow-x-auto shrink-0 py-2">
          {(['Offense', 'Defense', 'Athleticism & Intangibles', 'Notes'] as const).map((tab) => {
            const count = tab === 'Notes' ? myPlayerNotes.length : criteria.filter(c => c.category === tab).length;
            const ratedCount = tab === 'Notes' ? 0 : criteria.filter(c => c.category === tab && scoreMap.has(c.id)).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeTab === tab
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab === 'Offense' && <Zap className="w-3.5 h-3.5" />}
                {tab === 'Defense' && <Shield className="w-3.5 h-3.5" />}
                {tab === 'Athleticism & Intangibles' && <Activity className="w-3.5 h-3.5" />}
                {tab === 'Notes' && <MessageSquare className="w-3.5 h-3.5" />}
                <span>{tab}</span>
                {tab !== 'Notes' ? (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeTab === tab ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    {ratedCount}/{count}
                  </span>
                ) : (
                  count > 0 && (
                    <span className="text-[10px] px-1.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
                      {count}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Criteria / Notes Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab !== 'Notes' ? (
            filteredCriteria.length === 0 ? (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-xs">
                No criteria found in this category.
              </div>
            ) : (
              filteredCriteria.map((crit) => {
                const currentScore = scoreMap.get(crit.id);
                return (
                  <div
                    key={crit.id}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl space-y-2.5 transition hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* Header: Skill Name & Exemplar */}
                    <div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{crit.name}</h4>
                        {crit.exemplar_player_name && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                            <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                            <span>e.g. {crit.exemplar_player_name}</span>
                          </span>
                        )}
                      </div>
                      {crit.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                          {crit.description}
                        </p>
                      )}
                    </div>

                    {/* 5-Point Segmented Touch Buttons */}
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {SCORE_LEVELS.map((lvl) => {
                        const isSelected = currentScore === lvl.score;
                        return (
                          <button
                            key={lvl.score}
                            type="button"
                            onClick={() => handleScoreTap(crit.id, lvl.score)}
                            disabled={isFinalized}
                            className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-center active:scale-95 ${
                              isSelected
                                ? 'bg-amber-400 border-amber-400 text-slate-950 font-black shadow-lg scale-102 ring-2 ring-amber-400/30'
                                : `${lvl.color} border-slate-200 dark:border-slate-700/60`
                            }`}
                          >
                            <span className="text-sm font-black tracking-tight">{lvl.label}</span>
                            <span className={`text-[9px] font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-500 dark:text-slate-400'}`}>
                              {lvl.sub.split('/')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* NOTES TAB */
            <div className="space-y-4">
              {/* Quick Preset Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span>Tap to add preset observation</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_NOTE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handlePresetSelect(tag)}
                      disabled={isFinalized}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-amber-400/40 transition active:scale-95"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Freeform Note Input */}
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  Add custom note / observation
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Great layout catch on endzone drill, solid pivots..."
                    value={customNoteText}
                    onChange={(e) => setCustomNoteText(e.target.value)}
                    disabled={isFinalized}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={isFinalized || !customNoteText.trim()}
                    className="px-4 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold rounded-xl transition flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* List of my previous notes on this player */}
              <div className="space-y-2 pt-3">
                <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400">My Notes on {player.name}</h5>
                {myPlayerNotes.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">No notes recorded yet.</p>
                ) : (
                  myPlayerNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        {note.preset_tag && (
                          <div className="font-semibold text-amber-600 dark:text-amber-300 mb-0.5">{note.preset_tag}</div>
                        )}
                        {note.custom_text && (
                          <div className="text-slate-700 dark:text-slate-200">{note.custom_text}</div>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                        {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <span>{scoreMap.size} of {criteria.length} total skills graded</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-semibold rounded-xl text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

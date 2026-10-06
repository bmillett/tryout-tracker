import React, { useState } from 'react';
import { User, Sparkles, ArrowRight, Smartphone, Share, MoreVertical, PlusSquare, Download } from 'lucide-react';

interface EvaluatorPromptProps {
  onNameSubmit: (name: string) => void;
}

export const EvaluatorPrompt: React.FC<EvaluatorPromptProps> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      localStorage.setItem('ignite_evaluator_name', name.trim());
      onNameSubmit(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-200/90 dark:bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200 my-auto">
        <div className="w-14 h-14 mx-auto mb-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-2xl flex items-center justify-center shadow-inner">
          <Sparkles className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Ignite Tryout Tracker</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Sideline real-time grading for coaches & support evaluators.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-left">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>What is your name / initials?</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Coach Alex, Sarah T."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 active:scale-98"
          >
            <span>Start Evaluating</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Add to Home Screen Accordion / Guide */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-left">
          <button
            type="button"
            onClick={() => setShowInstallHelp(!showInstallHelp)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-300 hover:text-amber-500 dark:hover:text-amber-200 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-xl transition"
          >
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Tip: Add to Phone Home Screen</span>
            </span>
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-bold">
              {showInstallHelp ? 'Hide' : 'How-to'}
            </span>
          </button>

          {showInstallHelp && (
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-3 animate-in fade-in duration-150">
              {/* iOS Instructions */}
              <div>
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 pl-1 text-[11px]">
                  <li>Tap the <strong className="text-slate-700 dark:text-slate-200">Share button</strong> (<Share className="w-3 h-3 inline text-sky-500 dark:text-sky-400" /> at bottom of Safari).</li>
                  <li>Scroll down and tap <strong className="text-slate-700 dark:text-slate-200">&ldquo;Add to Home Screen&rdquo;</strong> (<PlusSquare className="w-3 h-3 inline text-slate-500 dark:text-slate-300" />).</li>
                  <li>Tap <strong className="text-amber-600 dark:text-amber-300">Add</strong> in top right.</li>
                </ol>
              </div>

              {/* Android Instructions */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/60">
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  <span>Android (Chrome)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 pl-1 text-[11px]">
                  <li>Tap the <strong className="text-slate-700 dark:text-slate-200">Three Dots Menu</strong> (<MoreVertical className="w-3 h-3 inline text-slate-500 dark:text-slate-300" /> in top right).</li>
                  <li>Tap <strong className="text-slate-700 dark:text-slate-200">&ldquo;Install App&rdquo;</strong> or <strong className="text-slate-700 dark:text-slate-200">&ldquo;Add to Home Screen&rdquo;</strong> (<Download className="w-3 h-3 inline text-emerald-500 dark:text-emerald-400" />).</li>
                  <li>Tap <strong className="text-amber-600 dark:text-amber-300">Install / Add</strong>.</li>
                </ol>
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic pt-1 border-t border-slate-200 dark:border-slate-800/40">
                Works in standard mobile browsers too — offline caching and automatic sync work either way!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

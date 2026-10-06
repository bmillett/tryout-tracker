import React, { useState } from 'react';
import { Lock, AlertCircle, X } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetPin: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  targetPin
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(false);
      
      // Auto submit if length matches
      if (nextPin === targetPin) {
        sessionStorage.setItem('ignite_admin_unlocked', 'true');
        setPin('');
        onSuccess();
      } else if (nextPin.length === targetPin.length) {
        setError(true);
        setTimeout(() => setPin(''), 600);
      }
    }
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 mx-auto mb-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 rounded-2xl flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Coach / Admin Access</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Enter Coach PIN to manage roster & leaderboards</p>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                pin.length > idx
                  ? error
                    ? 'bg-rose-500 border-rose-500 scale-110'
                    : 'bg-amber-400 border-amber-400 scale-110'
                  : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-rose-500 dark:text-rose-400 mb-4 animate-shake">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Incorrect PIN</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-900 dark:text-white font-semibold rounded-xl text-lg transition border border-slate-200 dark:border-slate-700/60 shadow-sm"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="h-12 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-95 text-xs font-medium rounded-xl transition border border-slate-200 dark:border-slate-700/40"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-900 dark:text-white font-semibold rounded-xl text-lg transition border border-slate-200 dark:border-slate-700/60 shadow-sm"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-12 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-95 text-xs font-medium rounded-xl transition border border-slate-200 dark:border-slate-700/40"
          >
            ⌫
          </button>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">Enter your 4-digit Coach PIN</p>
      </div>
    </div>
  );
};

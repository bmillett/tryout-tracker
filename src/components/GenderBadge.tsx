import React from 'react';

/** Normalize a raw CSV/form value to 'M' | 'F' | undefined (case-insensitive). */
export function normalizeGender(raw: string | undefined | null): 'M' | 'F' | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (['m', 'male', 'men', 'man', 'boy'].includes(v)) return 'M';
  if (['f', 'female', 'women', 'woman', 'girl'].includes(v)) return 'F';
  return undefined;
}

interface GenderBadgeProps {
  gender: 'M' | 'F';
  /** 'chip' (default) shows a small inline pill; 'strip' renders a 3px left-edge bar (pass as className override). */
  variant?: 'chip' | 'strip';
  className?: string;
}

/** Colored chip with a text label.  Color is never the sole cue — the label M/F is always shown. */
export const GenderBadge: React.FC<GenderBadgeProps> = ({ gender, className = '' }) => {
  if (gender === 'M') {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600/50 ${className}`}
      >
        M
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-600/50 ${className}`}
    >
      F
    </span>
  );
};

/** A thin colored left-edge strip to be placed as the first child of a `relative` container. */
export const GenderStrip: React.FC<{ gender: 'M' | 'F' }> = ({ gender }) => (
  <span
    aria-hidden="true"
    className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl ${
      gender === 'M' ? 'bg-blue-400 dark:bg-blue-500' : 'bg-violet-400 dark:bg-violet-500'
    }`}
  />
);

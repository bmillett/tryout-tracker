import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { X } from 'lucide-react';
// HELP.md at the repo root is the single source of truth for this page.
import helpMarkdown from '../../HELP.md?raw';

interface HelpPageProps {
  onClose: () => void;
}

const components: Components = {
  // In-page anchors (table of contents style links) scroll within the app.
  // Links to other files in the repo (e.g. README.md) have no target in the app,
  // so they render as plain text.
  a: ({ href, children }) => {
    if (href && href.startsWith('#')) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {children}
        </a>
      );
    }
    if (href && /^https?:\/\//.test(href)) {
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    return <span>{children}</span>;
  },
  // Let wide tables scroll sideways on phones instead of breaking the layout.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  )
};

export const HelpPage: React.FC<HelpPageProps> = ({ onClose }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm p-5 sm:p-8">
    <div className="flex justify-end mb-2">
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
      >
        <X className="w-3.5 h-3.5" />
        <span>Close Help</span>
      </button>
    </div>
    <article className="prose prose-slate prose-sm sm:prose-base dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-amber-600 dark:prose-a:text-amber-400 prose-th:text-left">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {helpMarkdown}
      </ReactMarkdown>
    </article>
  </div>
);

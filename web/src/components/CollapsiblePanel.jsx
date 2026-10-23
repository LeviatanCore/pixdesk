import React from 'react';

function CollapsiblePanel({
  title,
  open,
  onToggle,
  children,
  badge = null,
  defaultOpen = true,
}) {
  const isOpen = open ?? defaultOpen;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition"
      >
        <span className="text-xs text-gray-400 w-3 shrink-0">{isOpen ? '▼' : '▶'}</span>
        <span className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 grow">
          {title}
        </span>
        {badge != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700/60">{children}</div>}
    </div>
  );
}

export default CollapsiblePanel;

import React, { useEffect, useState } from 'react';
import {
  clearHistory,
  listHistory,
  removeHistoryItem,
  subscribeHistory,
} from '../lib/sessionImageHistory';

const KIND_LABEL = {
  cutout: 'No BG',
  original: 'Original',
  thumbnail: 'Shorts',
  image: 'Image',
};

function SessionImageHistory({
  onSelect,
  filterKind = null,
  title = 'Session history',
  emptyHint = 'Processed images from this tab stay here until you close it.',
  bare = false,
  compact = false,
  selectedId = null,
  selectedDataUrl = null,
}) {
  const [items, setItems] = useState(() => listHistory());

  useEffect(() => subscribeHistory(setItems), []);

  const visible = filterKind
    ? items.filter((item) => item.kind === filterKind || (Array.isArray(filterKind) && filterKind.includes(item.kind)))
    : items;

  const thumbW = compact ? 'w-20' : 'w-28';

  const isSelected = (item) =>
    (selectedId && item.id === selectedId) ||
    (selectedDataUrl && item.dataUrl === selectedDataUrl);

  const body = !visible.length ? (
    <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">{emptyHint}</p>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2 pt-2 mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This tab only ({visible.length})
        </p>
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-red-500 underline"
          onClick={() => {
            if (window.confirm('Clear all session images?')) clearHistory();
          }}
        >
          Clear
        </button>
      </div>
      <div className={`flex gap-2 overflow-x-auto pb-1 ${compact ? 'flex-wrap' : ''}`}>
        {visible.map((item) => {
          const active = isSelected(item);
          return (
            <div
              key={item.id}
              className={`shrink-0 ${thumbW} rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900/40 transition ring-offset-1 dark:ring-offset-gray-800 ${
                active
                  ? 'ring-2 ring-violet-500 border-2 border-violet-500 shadow-md'
                  : 'border border-gray-200 dark:border-gray-700'
              }`}
            >
              <button
                type="button"
                className="block w-full aspect-square p-1 relative"
                onClick={() => onSelect?.(item)}
                title={active ? 'Selected' : 'Use this image'}
                style={{
                  backgroundImage:
                    item.kind === 'cutout'
                      ? 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)'
                      : undefined,
                  backgroundSize: '12px 12px',
                  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
                }}
              >
                <img
                  src={item.dataUrl}
                  alt={item.label}
                  className="w-full h-full object-contain"
                />
                {active && (
                  <span className="absolute top-1 right-1 text-[9px] font-semibold px-1 py-0.5 rounded bg-violet-500 text-white">
                    ✓
                  </span>
                )}
              </button>
              <div className="px-1.5 py-1 border-t border-gray-200 dark:border-gray-700">
                <p className="text-[10px] font-medium text-gray-700 dark:text-gray-200 truncate">
                  {KIND_LABEL[item.kind] || item.kind}
                </p>
                <div className="flex gap-2 mt-0.5">
                  <button
                    type="button"
                    className={`text-[10px] hover:underline ${
                      active ? 'text-violet-600 font-semibold' : 'text-violet-500'
                    }`}
                    onClick={() => onSelect?.(item)}
                  >
                    {active ? 'Selected' : 'Use'}
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-gray-400 hover:text-red-500"
                    onClick={() => removeHistoryItem(item.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  if (bare) return body;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200/60 dark:border-gray-700/60">
      <p className="text-xs uppercase font-semibold text-gray-400">{title}</p>
      {body}
    </div>
  );
}

export default SessionImageHistory;

import React, { useMemo, useRef, useState } from 'react';
import { clampVolume, normalizeVolumeKeyframes, uid } from '../lib/videoProject';

const MAX_V = 2;

/**
 * Editable volume automation.
 * - panel: sidebar card
 * - track: sits on the music layer (width = clip on timeline)
 * t is local to the music clip (0…duration).
 */
function VolumeEnvelope({
  duration,
  keyframes,
  fallbackVolume = 0.35,
  playheadLocal = null,
  onChange,
  variant = 'panel',
  widthPx,
  heightPx,
}) {
  const isTrack = variant === 'track';
  const W = Math.max(isTrack ? 48 : 280, Number(widthPx) || (isTrack ? 200 : 320));
  const H = Number(heightPx) || (isTrack ? 56 : 112);
  const PAD_X = isTrack ? 4 : 12;
  const PAD_Y = isTrack ? 6 : 14;

  const svgRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const points = useMemo(
    () => normalizeVolumeKeyframes(keyframes, duration, fallbackVolume),
    [keyframes, duration, fallbackVolume],
  );

  function toX(t) {
    return PAD_X + (t / Math.max(0.1, duration)) * (W - PAD_X * 2);
  }
  function toY(volume) {
    return PAD_Y + (1 - clampVolume(volume) / MAX_V) * (H - PAD_Y * 2);
  }
  function fromX(x) {
    const u = (x - PAD_X) / Math.max(1, W - PAD_X * 2);
    return Math.min(duration, Math.max(0, u * duration));
  }
  function fromY(y) {
    const u = (y - PAD_Y) / Math.max(1, H - PAD_Y * 2);
    return clampVolume((1 - u) * MAX_V);
  }

  function clientToLocal(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  function commit(next) {
    onChange(normalizeVolumeKeyframes(next, duration, fallbackVolume));
  }

  function onPointerDownPoint(e, point) {
    e.preventDefault();
    e.stopPropagation();
    setDragId(point.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragId) return;
    const { x, y } = clientToLocal(e);
    const t = fromX(x);
    const volume = fromY(y);
    commit(
      points.map((p, index) => {
        if (p.id !== dragId) return p;
        const isFirst = index === 0;
        const isLast = index === points.length - 1;
        return {
          ...p,
          t: isFirst ? 0 : isLast ? duration : t,
          volume,
        };
      }),
    );
  }

  function onPointerUp() {
    setDragId(null);
  }

  function onBgClick(e) {
    if (dragId) return;
    const { x, y } = clientToLocal(e);
    const t = fromX(x);
    const volume = fromY(y);
    if (points.some((p) => Math.abs(p.t - t) < Math.max(0.08, duration * 0.02))) return;
    commit([...points, { id: uid('vk'), t, volume }]);
  }

  function onDoubleClickPoint(e, point) {
    e.preventDefault();
    e.stopPropagation();
    if (points.length <= 2) return;
    if (point.id === points[0].id || point.id === points[points.length - 1].id) return;
    commit(points.filter((p) => p.id !== point.id));
  }

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t).toFixed(1)} ${toY(p.volume).toFixed(1)}`)
    .join(' ');
  const areaD = `${pathD} L ${toX(duration).toFixed(1)} ${H - PAD_Y} L ${PAD_X} ${H - PAD_Y} Z`;

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={isTrack ? W : undefined}
      height={isTrack ? H : undefined}
      className={
        isTrack
          ? 'block touch-none select-none overflow-visible'
          : 'w-full h-28 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 touch-none select-none'
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={onBgClick}
    >
      {!isTrack &&
        [0, 0.5, 1, 1.5, 2].map((v) => (
          <line
            key={v}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={toY(v)}
            y2={toY(v)}
            stroke="currentColor"
            className="text-gray-200 dark:text-gray-700"
            strokeWidth="1"
          />
        ))}
      {isTrack && (
        <rect x="0" y="0" width={W} height={H} rx="6" className="fill-violet-500/25" />
      )}

      <path d={areaD} className={isTrack ? 'fill-violet-300/25' : 'fill-violet-500/15'} />
      <path
        d={pathD}
        className={isTrack ? 'stroke-white' : 'stroke-violet-500'}
        fill="none"
        strokeWidth={isTrack ? 1.75 : 2}
      />

      {playheadLocal != null && playheadLocal >= 0 && playheadLocal <= duration && (
        <line
          x1={toX(playheadLocal)}
          x2={toX(playheadLocal)}
          y1={PAD_Y}
          y2={H - PAD_Y}
          className={isTrack ? 'stroke-white/80' : 'stroke-gray-800 dark:stroke-white'}
          strokeWidth="1"
          strokeDasharray="3 2"
        />
      )}

      {points.map((p) => (
        <circle
          key={p.id}
          cx={toX(p.t)}
          cy={toY(p.volume)}
          r={dragId === p.id ? (isTrack ? 6 : 7) : isTrack ? 4.5 : 5}
          className={
            isTrack
              ? 'fill-white stroke-violet-700 cursor-grab active:cursor-grabbing'
              : 'fill-violet-500 stroke-white dark:stroke-gray-900 cursor-grab active:cursor-grabbing'
          }
          strokeWidth="2"
          onPointerDown={(e) => onPointerDownPoint(e, p)}
          onDoubleClick={(e) => onDoubleClickPoint(e, p)}
        />
      ))}
    </svg>
  );

  if (isTrack) return svg;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>Volume envelope</span>
        <span>click = add · drag = move · dbl-click = delete</span>
      </div>
      {svg}
    </div>
  );
}

export default VolumeEnvelope;

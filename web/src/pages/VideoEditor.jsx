import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import CollapsiblePanel from '../components/CollapsiblePanel';
import VolumeEnvelope from '../components/VolumeEnvelope';
import {
  ASPECTS,
  EXPORT_QUALITIES,
  formatTime,
  makeMusicFromFile,
  makePageFromFile,
  defaultVolumeKeyframes,
  musicClipDuration,
  musicGainAt,
  normalizeVolumeKeyframes,
  pageAtTime,
  pageDuration,
  totalDuration,
} from '../lib/videoProject';

const PX_PER_SEC = 48;

function VolumeSlider({ label, value, onChange }) {
  return (
    <label className="block text-xs text-gray-500 dark:text-gray-400">
      <span className="flex justify-between mb-1">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
    </label>
  );
}

function VideoEditor() {
  const [aspect, setAspect] = useState('16:9');
  const [pages, setPages] = useState([]);
  const [music, setMusic] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [exportUrl, setExportUrl] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(0.65);
  const [openPanels, setOpenPanels] = useState({
    format: false,
    media: true,
    music: false,
    page: true,
  });

  const videoRef = useRef(null);
  const musicRef = useRef(null);
  const rafRef = useRef(0);
  const playOriginRef = useRef({ wall: 0, head: 0 });

  const duration = useMemo(() => totalDuration(pages), [pages]);
  const selected = pages.find((p) => p.id === selectedId) || null;
  const aspectMeta = ASPECTS[aspect];
  const active = pageAtTime(pages, playhead);
  const zoom = Math.min(1.5, Math.max(0.35, previewZoom));

  function bumpZoom(delta) {
    setPreviewZoom((z) => Math.min(1.5, Math.max(0.35, Number((z + delta).toFixed(2)))));
  }

  function togglePanel(key) {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openPanel(key) {
    setOpenPanels((prev) => ({ ...prev, [key]: true }));
  }

  function patchMusic(patch) {
    setMusic((m) => {
      if (!m) return m;
      const next = { ...m, ...patch };
      const clipDur = musicClipDuration(next);
      next.volumeKeyframes = normalizeVolumeKeyframes(next.volumeKeyframes, clipDur, 1);
      return next;
    });
  }

  const musicLocalPlayhead =
    music && playhead >= (music.offset || 0) && playhead < (music.offset || 0) + musicClipDuration(music)
      ? playhead - (music.offset || 0)
      : null;

  useEffect(() => {
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      if (music?.url) URL.revokeObjectURL(music.url);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time migrate: old flat envelopes stored absolute volume in points.
  // Envelope is now relative (1 = keep base); base slider owns the overall level.
  useEffect(() => {
    if (!music?.volumeKeyframes?.length) return;
    const kfs = music.volumeKeyframes;
    const first = Number(kfs[0]?.volume);
    if (!Number.isFinite(first) || first >= 0.95) return;
    const flat = kfs.every((k) => Math.abs(Number(k.volume) - first) < 0.02);
    if (!flat) return;
    if (Math.abs(first - Number(music.volume)) > 0.05) return;
    patchMusic({
      volume: first,
      volumeKeyframes: defaultVolumeKeyframes(musicClipDuration(music), 1),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [music?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active?.page) return;
    if (video.src !== active.page.url) {
      video.src = active.page.url;
    }
    const target = active.page.trimIn + active.localTime;
    if (Math.abs((video.currentTime || 0) - target) > 0.25) {
      video.currentTime = target;
    }
    video.volume = Math.min(1, Math.max(0, active.page.volume));
  }, [active?.page?.id, active?.page?.url, active?.page?.volume, active?.localTime, playing]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio || !music) return;
    if (audio.src !== music.url) audio.src = music.url;
    const offset = Math.max(0, Number(music.offset) || 0);
    const clipDur = musicClipDuration(music);
    const local = playhead - offset;
    const inRange = playhead >= offset && local >= 0 && local < clipDur;
    const gain = musicGainAt(music, local);
    // HTMLMediaElement.volume caps at 1; >100% still applies on export.
    audio.volume = inRange ? Math.min(1, Math.max(0, gain)) : 0;
    if (!inRange) {
      if (!audio.paused) audio.pause();
      return;
    }
    const musicTime = (Number(music.trimIn) || 0) + local;
    if (Math.abs((audio.currentTime || 0) - musicTime) > 0.25) {
      audio.currentTime = Math.min(music.duration - 0.05, Math.max(0, musicTime));
    }
    if (playing && audio.paused) audio.play().catch(() => {});
  }, [music, playhead, playing]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = musicRef.current;
    if (!playing) {
      video?.pause();
      audio?.pause();
      cancelAnimationFrame(rafRef.current);
      return;
    }
    playOriginRef.current = { wall: performance.now(), head: playhead };
    video?.play().catch(() => {});
    if (music) audio?.play().catch(() => {});

    const tick = (now) => {
      const next = playOriginRef.current.head + (now - playOriginRef.current.wall) / 1000;
      if (next >= duration) {
        setPlayhead(duration);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // intentionally not depending on playhead — origin captures start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, music?.id]);

  function updatePage(id, patch) {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== id) return page;
        const next = { ...page, ...patch };
        next.trimIn = Math.max(0, Math.min(next.trimIn, next.duration - 0.1));
        next.trimOut = Math.max(next.trimIn + 0.1, Math.min(next.trimOut, next.duration));
        return next;
      }),
    );
  }

  async function onAddVideos(fileList) {
    setError('');
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('video/'));
    if (!files.length) {
      setError('Pick one or more video files');
      return;
    }
    try {
      const created = [];
      for (const file of files) created.push(await makePageFromFile(file));
      setPages((prev) => [...prev, ...created]);
      setSelectedId(created[0]?.id || null);
      openPanel('page');
      setStatus(`Added ${created.length} page${created.length === 1 ? '' : 's'}`);
    } catch (err) {
      setError(err.message || 'Could not read video');
    }
  }

  async function onAddMusic(fileList) {
    setError('');
    const file = Array.from(fileList || [])[0];
    if (!file || !(file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
      setError('Pick an audio file (mp3, wav, m4a…)');
      return;
    }
    try {
      if (music?.url) URL.revokeObjectURL(music.url);
      const next = await makeMusicFromFile(file);
      setMusic(next);
      openPanel('music');
      setStatus(`Music: ${next.name}`);
    } catch (err) {
      setError(err.message || 'Could not read audio');
    }
  }

  function removePage(id) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  }

  function movePage(id, dir) {
    setPages((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function seekTo(time) {
    setPlaying(false);
    setPlayhead(Math.max(0, Math.min(duration, time)));
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'pixdesk-video.mp4';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function exportProject(qualityId = 'high') {
    if (!pages.length) {
      setError('Add at least one video page');
      return;
    }
    const qualityMeta = EXPORT_QUALITIES.find((q) => q.id === qualityId) || EXPORT_QUALITIES[0];
    setExportMenuOpen(false);
    setExporting(true);
    setError('');
    setStatus(`Exporting ${qualityMeta.label} (${qualityMeta.sizes[aspect]})…`);
    setExportUrl('');
    try {
      const form = new FormData();
      const project = {
        aspect,
        quality: qualityId,
        pages: pages.map((page, index) => ({
          field: `page_${index}`,
          trimIn: page.trimIn,
          trimOut: page.trimOut,
          volume: page.volume,
        })),
        music: music
          ? {
              field: 'music',
              volume: music.volume,
              trimIn: music.trimIn || 0,
              trimOut: music.trimOut ?? music.duration,
              offset: music.offset || 0,
              volumeKeyframes: normalizeVolumeKeyframes(
                music.volumeKeyframes,
                musicClipDuration(music),
                1,
              ),
            }
          : null,
      };
      form.append('project', JSON.stringify(project));
      pages.forEach((page, index) => form.append(`page_${index}`, page.file, page.name));
      if (music) form.append('music', music.file, music.name);

      const res = await fetch('/api/video/export', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setExportUrl(data.url);
      setStatus(`Downloaded ${data.name} · ${data.width}×${data.height}`);
      triggerDownload(data.url, data.name);
    } catch (err) {
      setError(err.message || 'Export failed');
      setStatus('');
    } finally {
      setExporting(false);
    }
  }

  const timelineWidth = Math.max(640, Math.ceil(Math.max(duration, 10) * PX_PER_SEC) + 40);

  const timelineBlock = (
    <div className="overflow-x-auto">
      <div style={{ width: timelineWidth }} className="relative select-none">
        <div
          className="h-8 border-b border-gray-200 dark:border-gray-700 relative mb-2 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / PX_PER_SEC);
          }}
        >
          {Array.from({ length: Math.ceil(Math.max(duration, 10) / 5) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 pl-1"
              style={{ left: i * 5 * PX_PER_SEC }}
            >
              {i * 5}s
            </div>
          ))}
        </div>

        <div className="relative h-20 mb-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700/80">
          {pages.reduce(
            (acc, page, index) => {
              const left = acc.offset;
              const width = pageDuration(page) * PX_PER_SEC;
              acc.nodes.push(
                <button
                  key={page.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(page.id);
                    openPanel('page');
                    seekTo(left + 0.01);
                  }}
                  className={`absolute top-2 bottom-2 rounded-md overflow-hidden border text-left px-2 py-1 ${
                    selectedId === page.id
                      ? 'border-violet-500 ring-2 ring-violet-500/30'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  style={{
                    left,
                    width: Math.max(36, width),
                    background:
                      'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(15,23,42,0.85)), #1f2937',
                  }}
                  title={page.name}
                >
                  <span className="block text-[10px] text-white/90 truncate">Página {index + 1}</span>
                  <span className="block text-[10px] text-white/60">{formatTime(pageDuration(page))}</span>
                </button>,
              );
              acc.offset += width;
              return acc;
            },
            { offset: 0, nodes: [] },
          ).nodes}
        </div>

        <div className="relative h-[72px] rounded-lg bg-violet-500/10 border border-violet-400/40">
          {music ? (
            <div
              className="absolute top-1.5 bottom-1.5 rounded-md overflow-hidden border border-violet-300/50 bg-violet-600/40"
              style={{
                left: Math.max(0, (music.offset || 0) * PX_PER_SEC),
                width: Math.max(48, musicClipDuration(music) * PX_PER_SEC),
              }}
            >
              <div className="absolute top-0 left-0 right-0 z-10 px-1.5 py-0.5 text-[9px] text-white/90 truncate pointer-events-none">
                Music · {formatTime(musicClipDuration(music))} @ {formatTime(music.offset || 0)}
              </div>
              <div className="absolute inset-0 pt-3">
                <VolumeEnvelope
                  variant="track"
                  duration={musicClipDuration(music)}
                  keyframes={music.volumeKeyframes}
                  fallbackVolume={1}
                  playheadLocal={musicLocalPlayhead}
                  widthPx={Math.max(48, musicClipDuration(music) * PX_PER_SEC)}
                  heightPx={52}
                  onChange={(volumeKeyframes) => patchMusic({ volumeKeyframes })}
                />
              </div>
            </div>
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-violet-400/80">
              Music layer (empty)
            </p>
          )}
        </div>

        <div
          className="absolute top-0 bottom-0 w-px bg-gray-900 dark:bg-white pointer-events-none z-10"
          style={{ left: playhead * PX_PER_SEC }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-gray-900 dark:bg-white text-[10px] text-white dark:text-gray-900 whitespace-nowrap">
            {active ? `Página ${active.index + 1}` : formatTime(playhead)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      title="Video editor"
      actions={
        <div className="relative">
          <button
            type="button"
            disabled={!pages.length || exporting}
            onClick={() => setExportMenuOpen((o) => !o)}
            className="btn bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export MP4'}
          </button>
          {exportMenuOpen && !exporting && (
            <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-2 space-y-1">
              <p className="px-2 pt-1 pb-1 text-[11px] text-gray-400">Choose quality — downloads automatically</p>
              {EXPORT_QUALITIES.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-violet-500/10 transition"
                  onClick={() => exportProject(q.id)}
                >
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{q.label}</span>
                  <span className="block text-[11px] text-gray-500">
                    {q.sizes[aspect]} · {q.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-3xl">
        Build a timeline of pages, trim clips, place music, set volumes, preview and export MP4.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] gap-4 items-start">
        {/* Left: accordion controls */}
        <div className="space-y-2 xl:sticky xl:top-4">
          <CollapsiblePanel
            title="Format"
            open={openPanels.format}
            onToggle={() => togglePanel('format')}
            badge={aspect}
          >
            <div className="flex gap-2 pt-2">
              {Object.entries(ASPECTS).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAspect(key)}
                  className={`flex-1 text-xs rounded-lg border px-2 py-2 ${
                    aspect === key
                      ? 'border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Add media"
            open={openPanels.media}
            onToggle={() => togglePanel('media')}
            badge={pages.length ? `${pages.length}p` : null}
          >
            <div className="space-y-2 pt-2">
              <label className="btn border border-gray-200 dark:border-gray-700 w-full justify-center cursor-pointer text-xs">
                + Add video pages
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onAddVideos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="btn border border-gray-200 dark:border-gray-700 w-full justify-center cursor-pointer text-xs">
                {music ? 'Replace music' : '+ Add background music'}
                <input
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    onAddMusic(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </CollapsiblePanel>

          {music && (
            <CollapsiblePanel
              title="Music"
              open={openPanels.music}
              onToggle={() => togglePanel('music')}
              badge={`${Math.round(musicGainAt(music, musicLocalPlayhead ?? 0) * 100)}%`}
            >
              <div className="space-y-2 pt-2">
                <p className="text-xs text-gray-500 truncate" title={music.name}>
                  {music.name}
                </p>
                <VolumeSlider
                  label="Base volume"
                  value={music.volume}
                  onChange={(volume) => patchMusic({ volume })}
                />
                <p className="text-[11px] text-gray-400 -mt-1">
                  Overall gain. Envelope on the layer multiplies this (100% = keep base).
                </p>
                <label className="block text-xs text-gray-500">
                  Cut start (s)
                  <input
                    type="number"
                    min="0"
                    max={music.duration}
                    step="0.1"
                    value={Number((music.trimIn || 0).toFixed(2))}
                    onChange={(e) => {
                      const trimIn = Math.max(0, Number(e.target.value) || 0);
                      const trimOut = Math.max(trimIn + 0.1, music.trimOut ?? music.duration);
                      patchMusic({ trimIn, trimOut: Math.min(trimOut, music.duration) });
                    }}
                    className="mt-1 form-input w-full"
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  Cut end (s)
                  <input
                    type="number"
                    min="0"
                    max={music.duration}
                    step="0.1"
                    value={Number((music.trimOut ?? music.duration).toFixed(2))}
                    onChange={(e) => {
                      const trimOut = Math.min(music.duration, Number(e.target.value) || 0);
                      const trimIn = Math.min(music.trimIn || 0, trimOut - 0.1);
                      patchMusic({ trimOut: Math.max(0.1, trimOut), trimIn: Math.max(0, trimIn) });
                    }}
                    className="mt-1 form-input w-full"
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  Timeline start (s)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={Number((music.offset || 0).toFixed(2))}
                    onChange={(e) => patchMusic({ offset: Math.max(0, Number(e.target.value) || 0) })}
                    className="mt-1 form-input w-full"
                  />
                </label>
                <p className="text-[11px] text-gray-400">
                  Keep {formatTime(musicClipDuration(music))} of {formatTime(music.duration)} · @{' '}
                  {formatTime(music.offset || 0)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn border border-gray-200 dark:border-gray-700 text-xs"
                    onClick={() => patchMusic({ offset: Math.max(0, (music.offset || 0) - 0.5) })}
                  >
                    ← 0.5s
                  </button>
                  <button
                    type="button"
                    className="btn border border-gray-200 dark:border-gray-700 text-xs"
                    onClick={() => patchMusic({ offset: (music.offset || 0) + 0.5 })}
                  >
                    0.5s →
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">
                  Envelope on the music layer is relative (100% = base). Click / drag / dbl-click points there.
                </p>
                <button
                  type="button"
                  className="text-xs text-red-500"
                  onClick={() => {
                    URL.revokeObjectURL(music.url);
                    setMusic(null);
                  }}
                >
                  Remove music
                </button>
              </div>
            </CollapsiblePanel>
          )}

          {selected && (
            <CollapsiblePanel
              title="Page cut"
              open={openPanels.page}
              onToggle={() => togglePanel('page')}
              badge={selected.name.slice(0, 18)}
            >
              <div className="space-y-2 pt-2">
                <label className="block text-xs text-gray-500">
                  Start (s)
                  <input
                    type="number"
                    min="0"
                    max={selected.duration}
                    step="0.1"
                    value={Number(selected.trimIn.toFixed(2))}
                    onChange={(e) => updatePage(selected.id, { trimIn: Number(e.target.value) })}
                    className="mt-1 form-input w-full"
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  End (s)
                  <input
                    type="number"
                    min="0"
                    max={selected.duration}
                    step="0.1"
                    value={Number(selected.trimOut.toFixed(2))}
                    onChange={(e) => updatePage(selected.id, { trimOut: Number(e.target.value) })}
                    className="mt-1 form-input w-full"
                  />
                </label>
                <p className="text-xs text-gray-400">
                  Keep {formatTime(pageDuration(selected))} of {formatTime(selected.duration)}
                </p>
                <VolumeSlider
                  label="Video volume"
                  value={selected.volume}
                  onChange={(volume) => updatePage(selected.id, { volume })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn border border-gray-200 dark:border-gray-700 text-sm"
                    onClick={() => movePage(selected.id, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="btn border border-gray-200 dark:border-gray-700 text-sm"
                    onClick={() => movePage(selected.id, 1)}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="btn text-sm text-red-500 ml-auto"
                    onClick={() => removePage(selected.id)}
                  >
                    Delete page
                  </button>
                </div>
              </div>
            </CollapsiblePanel>
          )}
        </div>

        {/* Right: preview + play + layers together */}
        <div className="space-y-3 min-w-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {formatTime(playhead)} / {formatTime(duration)} · {aspectMeta.width}×{aspectMeta.height}
                {active ? ` · Página ${active.index + 1}` : ''}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="btn btn-xs border border-gray-200 dark:border-gray-700 px-2"
                  onClick={() => bumpZoom(-0.1)}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="btn btn-xs border border-gray-200 dark:border-gray-700 px-2 min-w-14"
                  onClick={() => setPreviewZoom(0.65)}
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="btn btn-xs border border-gray-200 dark:border-gray-700 px-2"
                  onClick={() => bumpZoom(0.1)}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>

            <div
              className="relative w-full h-[600px] rounded-lg bg-gray-950 overflow-auto"
              onWheel={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                e.preventDefault();
                bumpZoom(e.deltaY < 0 ? 0.08 : -0.08);
              }}
            >
              <div className="min-h-full min-w-full flex items-center justify-center p-3">
                <div
                  className={`relative bg-black rounded-md overflow-hidden shadow-lg ${aspectMeta.className}`}
                  style={{
                    width: aspect === '9:16' ? 280 : 560,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-contain"
                    playsInline
                    muted={false}
                  />
                  {!pages.length && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 p-4 text-center">
                      Add video pages to start the timeline
                    </div>
                  )}
                </div>
              </div>
            </div>
            <audio ref={musicRef} preload="auto" className="hidden" />
            <p className="mt-1 text-[10px] text-gray-400 text-center">Ctrl + scroll to zoom</p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={!pages.length || exporting}
              onClick={() => setPlaying((p) => !p)}
              className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 px-8"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <span className="text-xs text-gray-400">
              {formatTime(playhead)} / {formatTime(duration)}
            </span>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Layers</h2>
              <p className="text-xs text-gray-400">
                Pages + music envelope · click add · drag move · dbl-click delete
              </p>
            </div>
            {timelineBlock}
          </div>

          {(status || error || exportUrl) && (
            <div className="text-sm">
              {status && <p className="text-gray-600 dark:text-gray-300">{status}</p>}
              {error && <p className="text-red-500">{error}</p>}
              {exportUrl && (
                <button
                  type="button"
                  className="text-violet-500 underline"
                  onClick={() => triggerDownload(exportUrl, exportUrl.split('/').pop())}
                >
                  Download again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default VideoEditor;

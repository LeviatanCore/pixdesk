import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { removeBackground } from '@imgly/background-removal';
import AppShell from '../components/AppShell';
import CollapsiblePanel from '../components/CollapsiblePanel';
import SessionImageHistory from '../components/SessionImageHistory';
import {
  downloadDataUrl,
  exportToServer,
  setHandoffImage,
} from '../lib/imageHandoff';
import { scaleDataUrl } from '../lib/imageScale';
import {
  addHistoryItem,
  blobUrlToDataUrl,
  fileToDataUrl,
  listHistory,
} from '../lib/sessionImageHistory';

function RemoveBg() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultScale, setResultScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [savedName, setSavedName] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [activePane, setActivePane] = useState('result'); // 'source' | 'result'
  const [panels, setPanels] = useState({
    properties: true,
    history: true,
  });

  const previewStyle = useMemo(
    () => ({
      transform: `scale(${resultScale})`,
      transformOrigin: 'center center',
      maxHeight: '28rem',
      transition: 'transform 120ms ease',
    }),
    [resultScale]
  );

  const togglePanel = (key) => {
    setPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onFile = async (file) => {
    setError('');
    setResultUrl(null);
    setResultScale(1);
    setSavedName('');
    setProgress('');
    setSelectedHistoryId(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setSourceUrl(dataUrl);
      setActivePane('source');
      const item = addHistoryItem({
        dataUrl,
        kind: 'original',
        label: file.name || 'Original',
      });
      setSelectedHistoryId(item.id);
    } catch (err) {
      setError(err?.message || 'Could not read image');
    }
  };

  const runRemove = async () => {
    if (!sourceUrl) return;
    setBusy(true);
    setError('');
    setResultScale(1);
    setProgress('Loading model (first run may take a minute)…');
    try {
      const blob = await removeBackground(sourceUrl, {
        progress: (key, current, total) => {
          if (total) {
            setProgress(`${key}: ${Math.round((current / total) * 100)}%`);
          } else {
            setProgress(String(key));
          }
        },
      });
      const blobUrl = URL.createObjectURL(blob);
      const dataUrl = await blobUrlToDataUrl(blobUrl);
      URL.revokeObjectURL(blobUrl);
      setResultUrl(dataUrl);
      setActivePane('result');
      const item = addHistoryItem({
        dataUrl,
        kind: 'cutout',
        label: 'Background removed',
      });
      setSelectedHistoryId(item.id);
      setProgress('Done — saved to session history');
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Background removal failed');
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  const getScaledResult = async () => {
    if (!resultUrl) return null;
    return scaleDataUrl(resultUrl, resultScale);
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    setBusy(true);
    try {
      const dataUrl = await getScaledResult();
      downloadDataUrl(dataUrl, 'pixdesk-no-bg.png');
      if (resultScale !== 1) {
        const item = addHistoryItem({
          dataUrl,
          kind: 'cutout',
          label: `Cutout ${Math.round(resultScale * 100)}%`,
        });
        setSelectedHistoryId(item.id);
      }
    } catch (err) {
      setError(err?.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveServer = async () => {
    if (!resultUrl) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await getScaledResult();
      const result = await exportToServer(dataUrl, {
        filename: 'pixdesk-no-bg',
        format: 'png',
      });
      setSavedName(result.name);
      if (resultScale !== 1) {
        const item = addHistoryItem({
          dataUrl,
          kind: 'cutout',
          label: `Cutout ${Math.round(resultScale * 100)}%`,
        });
        setSelectedHistoryId(item.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUseInThumbnails = async () => {
    if (!resultUrl) return;
    setBusy(true);
    try {
      const dataUrl = await getScaledResult();
      if (resultScale !== 1) {
        const item = addHistoryItem({
          dataUrl,
          kind: 'cutout',
          label: `Cutout ${Math.round(resultScale * 100)}%`,
        });
        setSelectedHistoryId(item.id);
      }
      setHandoffImage(dataUrl);
      navigate('/thumbnails');
    } catch (err) {
      setError(err?.message || 'Could not prepare image');
    } finally {
      setBusy(false);
    }
  };

  const onPickHistory = (item) => {
    setError('');
    setSavedName('');
    setProgress('');
    setResultScale(1);
    setSelectedHistoryId(item.id);
    if (item.kind === 'cutout') {
      setResultUrl(item.dataUrl);
      setActivePane('result');
      if (!sourceUrl) setSourceUrl(item.dataUrl);
    } else {
      setSourceUrl(item.dataUrl);
      setResultUrl(null);
      setActivePane('source');
    }
  };

  const checkerStyle = {
    backgroundImage:
      'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
  };

  return (
    <AppShell title="Remove background">
      {/* Compact top bar — same distribution as Shorts editor */}
      <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase font-semibold text-gray-400 mr-1">Add</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 bg-violet-500 text-white hover:bg-violet-600"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            + Image
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            onClick={runRemove}
            disabled={!sourceUrl || busy}
          >
            {busy ? 'Working…' : 'Remove BG'}
          </button>

          {resultUrl && (
            <>
              <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              <span className="text-xs text-gray-500">
                Scale {Math.round(resultScale * 100)}%
              </span>
              <input
                type="range"
                min="0.25"
                max="2.5"
                step="0.01"
                className="w-28"
                value={resultScale}
                onChange={(e) => setResultScale(Number(e.target.value))}
                disabled={busy}
              />
              {[0.5, 1, 1.5, 2].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn text-[10px] py-0.5 px-1.5 ${
                    Math.abs(resultScale - value) < 0.001
                      ? 'bg-violet-500 text-white'
                      : 'border border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => setResultScale(value)}
                  disabled={busy}
                >
                  {Math.round(value * 100)}%
                </button>
              ))}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn text-xs py-1 px-2.5 bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-50"
              onClick={handleDownload}
              disabled={!resultUrl || busy}
            >
              Download
            </button>
            <button
              type="button"
              className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              onClick={handleSaveServer}
              disabled={!resultUrl || busy}
            >
              Save
            </button>
            <button
              type="button"
              className="btn text-xs py-1 px-2.5 bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
              onClick={handleUseInThumbnails}
              disabled={!resultUrl || busy}
            >
              Use in Shorts
            </button>
          </div>
        </div>
        {(progress || error || savedName) && (
          <div className="mt-2 text-xs">
            {progress && <span className="text-gray-500">{progress}</span>}
            {error && <span className="text-red-500">{error}</span>}
            {savedName && (
              <span className="text-green-600 dark:text-green-400">Saved as {savedName}</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left panels */}
        <div className="xl:col-span-3 space-y-2 order-2 xl:order-1">
          <CollapsiblePanel
            title="Properties"
            open={panels.properties}
            onToggle={() => togglePanel('properties')}
            badge={resultUrl ? 'Cutout' : sourceUrl ? 'Original' : '—'}
          >
            <div className="pt-3 space-y-3">
              {!sourceUrl && (
                <p className="text-sm text-gray-500">
                  Upload an image from the top bar, or pick one from session history.
                </p>
              )}
              {sourceUrl && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Processing runs in your browser with{' '}
                    <code className="text-xs">@imgly/background-removal</code>.
                  </p>
                  {resultUrl && (
                    <label className="block text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        Cutout scale ({Math.round(resultScale * 100)}%)
                      </span>
                      <input
                        type="range"
                        min="0.25"
                        max="2.5"
                        step="0.01"
                        className="w-full mt-2"
                        value={resultScale}
                        onChange={(e) => setResultScale(Number(e.target.value))}
                        disabled={busy}
                      />
                    </label>
                  )}
                  <p className="text-xs text-gray-400">
                    Scale applies on download, save, or send to Shorts.
                  </p>
                </>
              )}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Session history"
            open={panels.history}
            onToggle={() => togglePanel('history')}
            badge={listHistory().length}
          >
            <SessionImageHistory
              bare
              compact
              selectedId={selectedHistoryId}
              selectedDataUrl={activePane === 'result' ? resultUrl : sourceUrl}
              onSelect={onPickHistory}
              emptyHint="No images in this tab yet."
            />
          </CollapsiblePanel>
        </div>

        {/* Center — previews */}
        <div className="xl:col-span-9 order-1 xl:order-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn text-xs py-1 px-2.5 ${
                activePane === 'source'
                  ? 'bg-violet-500 text-white'
                  : 'border border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => setActivePane('source')}
              disabled={!sourceUrl}
            >
              Original
            </button>
            <button
              type="button"
              className={`btn text-xs py-1 px-2.5 ${
                activePane === 'result'
                  ? 'bg-violet-500 text-white'
                  : 'border border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => setActivePane('result')}
              disabled={!resultUrl}
            >
              Result
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              Selected images are marked in history
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className={`rounded-xl border-2 overflow-hidden min-h-72 flex flex-col bg-white dark:bg-gray-800 transition ${
                activePane === 'source'
                  ? 'border-violet-500 shadow-md'
                  : 'border-gray-200/60 dark:border-gray-700/60'
              }`}
              onClick={() => sourceUrl && setActivePane('source')}
            >
              <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/60">
                <p className="text-xs uppercase font-semibold text-gray-400">Original</p>
                {activePane === 'source' && sourceUrl && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500 text-white">
                    Selected
                  </span>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center p-4">
                {sourceUrl ? (
                  <img
                    src={sourceUrl}
                    alt="Original"
                    className="max-h-80 object-contain"
                  />
                ) : (
                  <p className="text-sm text-gray-500">Upload an image to start</p>
                )}
              </div>
            </div>

            <div
              className={`rounded-xl border-2 overflow-hidden min-h-72 flex flex-col transition ${
                activePane === 'result'
                  ? 'border-violet-500 shadow-md'
                  : 'border-gray-200/60 dark:border-gray-700/60'
              }`}
              style={checkerStyle}
              onClick={() => resultUrl && setActivePane('result')}
            >
              <div className="px-3 py-2 flex items-center justify-between bg-white/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/60">
                <p className="text-xs uppercase font-semibold text-gray-700 dark:text-gray-200">
                  Result
                </p>
                {activePane === 'result' && resultUrl && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500 text-white">
                    Selected
                  </span>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                {resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="No background"
                    className="object-contain"
                    style={previewStyle}
                  />
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 px-3 py-1 rounded">
                    Transparent PNG appears here
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default RemoveBg;

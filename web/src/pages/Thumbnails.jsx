import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import CollapsiblePanel from '../components/CollapsiblePanel';
import ArrowClockwise from '../components/icons/ArrowClockwise';
import SessionImageHistory from '../components/SessionImageHistory';
import {
  clearHandoffImage,
  downloadDataUrl,
  exportToServer,
  getHandoffImage,
} from '../lib/imageHandoff';
import { drawImageFit } from '../lib/imageScale';
import { addHistoryItem, fileToDataUrl, listHistory } from '../lib/sessionImageHistory';
import {
  THUMBNAIL_FONTS,
  ensureFontsLoaded,
  fontById,
} from '../lib/thumbnailFonts';

const FORMATS = {
  vertical: {
    id: 'vertical',
    label: 'Vertical',
    hint: 'Shorts 9:16',
    w: 1080,
    h: 1920,
  },
  horizontal: {
    id: 'horizontal',
    label: 'Horizontal',
    hint: '16:9',
    w: 1920,
    h: 1080,
  },
};

const MIN_SIZE = 24;
const MAX_SIZE = 200;
const CORNERS = ['nw', 'ne', 'sw', 'se'];
const PAD_X = 24;
const PAD_Y = 16;
const SNAP_THRESHOLD = 14;
const PREVIEW_MAX = 540;

function blankLayers() {
  return [
    {
      id: 'background',
      type: 'background',
      name: 'Background',
      color: '#ffffff',
      imageUrl: null,
      fit: 'cover',
      visible: true,
      groupId: null,
    },
  ];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function measureWrappedText(ctx, text, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [''], height: lineHeight, width: 0 };
  const lines = [];
  let line = '';
  let maxLineW = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    const tw = ctx.measureText(test).width;
    if (tw > maxWidth && line) {
      lines.push(line);
      maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
      line = words[i];
    } else {
      line = test;
      maxLineW = Math.max(maxLineW, tw);
    }
  }
  if (line) {
    lines.push(line);
    maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
  }
  let ascent = 0;
  let descent = 0;
  for (const l of lines) {
    const m = ctx.measureText(l);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || lineHeight * 0.8);
    descent = Math.max(descent, m.actualBoundingBoxDescent || lineHeight * 0.2);
  }
  const lineBox = Math.max(lineHeight, ascent + descent + 4);
  return { lines, height: lines.length * lineBox, width: maxLineW, lineBox };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function moveLayer(order, id, direction) {
  const idx = order.indexOf(id);
  if (idx < 0) return order;
  const next = [...order];
  if (direction === 'front') {
    next.splice(idx, 1);
    next.push(id);
  } else if (direction === 'back') {
    next.splice(idx, 1);
    next.unshift(id);
  } else if (direction === 'forward' && idx < next.length - 1) {
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  } else if (direction === 'backward' && idx > 0) {
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  }
  const bg = next.filter((x) => x === 'background');
  const rest = next.filter((x) => x !== 'background');
  return [...bg, ...rest];
}

function imageDisplaySize(layer, canvasW, canvasH) {
  const natW = layer.naturalWidth || 1;
  const natH = layer.naturalHeight || 1;
  const base = Math.min(canvasW, canvasH) * (layer.scale || 0.45);
  const ratio = natW / natH;
  let dw = base;
  let dh = base / ratio;
  if (ratio < 1) {
    dh = base;
    dw = base * ratio;
  }
  return { width: dw, height: dh };
}

function Thumbnails() {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const subjectInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const imageCountRef = useRef(0);
  const textCountRef = useRef(0);

  const [formatId, setFormatId] = useState('vertical');
  const format = FORMATS[formatId];
  const W = format.w;
  const H = format.h;
  const previewScale = Math.min(PREVIEW_MAX / W, PREVIEW_MAX / H);
  const PREVIEW_W = Math.round(W * previewScale);
  const PREVIEW_H = Math.round(H * previewScale);

  const [layers, setLayers] = useState(blankLayers);
  const [layerOrder, setLayerOrder] = useState(() => blankLayers().map((l) => l.id));
  const [selectedId, setSelectedId] = useState(null);
  const [exportFormat, setExportFormat] = useState('png');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
  const [historyPickMode, setHistoryPickMode] = useState('image');
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null); // layer snapshot for paste
  const [guides, setGuides] = useState({ v: false, h: false });
  const [showGuidesAlways, setShowGuidesAlways] = useState(false);
  const [panels, setPanels] = useState({
    properties: true,
    layers: true,
    history: false,
  });
  const [historyCount, setHistoryCount] = useState(() => listHistory().length);

  useEffect(() => {
    const tick = () => setHistoryCount(listHistory().length);
    tick();
    const id = setInterval(tick, 800);
    return () => clearInterval(id);
  }, []);

  const togglePanel = (key) => setPanels((prev) => ({ ...prev, [key]: !prev[key] }));

  const layerById = useCallback((id) => layers.find((l) => l.id === id), [layers]);
  const selected = selectedId ? layerById(selectedId) : null;

  const updateLayer = (id, patch) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  };

  const patchSelected = (patch) => {
    if (!selectedId) return;
    updateLayer(selectedId, patch);
  };

  useEffect(() => {
    ensureFontsLoaded().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const handoff = getHandoffImage();
    if (handoff) {
      addImageLayer(handoff, 'From remove background');
      clearHandoffImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const measureTextLayer = useCallback(
    (layer) => {
      const canvas = canvasRef.current;
      const font = fontById(layer.fontId);
      const lineHeight = Math.round(layer.size * 1.2);
      const wrapWidth = Math.max(80, (layer.width || Math.min(W * 0.85, 900)) - PAD_X * 2);
      if (!canvas) {
        return {
          width: layer.width || 400,
          height: lineHeight + PAD_Y * 2,
          lines: [layer.text],
          lineBox: lineHeight,
        };
      }
      const ctx = canvas.getContext('2d');
      ctx.font = `${font.weight} ${layer.size}px ${font.family}`;
      const measured = measureWrappedText(ctx, layer.text, wrapWidth, lineHeight);
      return {
        ...measured,
        width: Math.max(measured.width + PAD_X * 2, 120),
        height: Math.max(measured.height + PAD_Y * 2, lineHeight + PAD_Y * 2),
        wrapWidth,
      };
    },
    [fontsReady, W]
  );

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    for (const id of layerOrder) {
      const layer = layers.find((l) => l.id === id);
      if (!layer || layer.visible === false) continue;

      if (layer.type === 'background') {
        ctx.fillStyle = layer.color || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        if (layer.imageUrl) {
          try {
            const bg = await loadImage(layer.imageUrl);
            drawImageFit(ctx, bg, 0, 0, W, H, layer.fit || 'cover');
          } catch {
            // ignore
          }
        }
        continue;
      }

      if (layer.type === 'image' && layer.imageUrl) {
        try {
          const img = await loadImage(layer.imageUrl);
          const { width: dw, height: dh } = imageDisplaySize(
            { ...layer, naturalWidth: img.width, naturalHeight: img.height },
            W,
            H
          );
          ctx.save();
          ctx.translate(layer.x, layer.y);
          ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        } catch {
          // ignore
        }
        continue;
      }

      if (layer.type === 'text') {
        const font = fontById(layer.fontId);
        const metrics = measureTextLayer(layer);
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
        ctx.fillStyle = layer.color;
        ctx.font = `${font.weight} ${layer.size}px ${font.family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const totalH = metrics.lines.length * metrics.lineBox;
        let yy = -totalH / 2 + metrics.lineBox / 2;
        for (const line of metrics.lines) {
          ctx.fillText(line, 0, yy);
          yy += metrics.lineBox;
        }
        ctx.restore();
      }
    }
  }, [layers, layerOrder, measureTextLayer, fontsReady, W, H]);

  useEffect(() => {
    draw();
  }, [draw]);

  const clientToCanvas = (clientX, clientY) => {
    const stage = stageRef.current.getBoundingClientRect();
    return {
      x: (clientX - stage.left) / previewScale,
      y: (clientY - stage.top) / previewScale,
    };
  };

  const applyCenterSnap = (x, y) => {
    const cx = W / 2;
    const cy = H / 2;
    const snapV = Math.abs(x - cx) <= SNAP_THRESHOLD;
    const snapH = Math.abs(y - cy) <= SNAP_THRESHOLD;
    setGuides({ v: snapV, h: snapH });
    return {
      x: clamp(snapV ? cx : x, 40, W - 40),
      y: clamp(snapH ? cy : y, 40, H - 40),
    };
  };

  const onMovePointerDown = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    setContextMenu(null);
    const layer = layerById(id);
    const p = clientToCanvas(event.clientX, event.clientY);
    dragRef.current = {
      mode: 'move',
      id,
      offsetX: p.x - layer.x,
      offsetY: p.y - layer.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerDown = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    const layer = layerById(id);
    const p = clientToCanvas(event.clientX, event.clientY);
    const dist = Math.hypot(p.x - layer.x, p.y - layer.y) || 1;
    dragRef.current = {
      mode: 'resize',
      id,
      startSize: layer.type === 'text' ? layer.size : layer.scale,
      startWidth: layer.width,
      startDist: dist,
      kind: layer.type,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onRotatePointerDown = (id, event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    const layer = layerById(id);
    const p = clientToCanvas(event.clientX, event.clientY);
    const startAngle = (Math.atan2(p.y - layer.y, p.x - layer.x) * 180) / Math.PI;
    dragRef.current = {
      mode: 'rotate',
      id,
      startPointerAngle: startAngle,
      startRotation: layer.rotation || 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = clientToCanvas(event.clientX, event.clientY);

    if (drag.mode === 'move') {
      updateLayer(drag.id, applyCenterSnap(p.x - drag.offsetX, p.y - drag.offsetY));
      return;
    }

    if (drag.mode === 'resize') {
      setGuides({ v: false, h: false });
      const layer = layerById(drag.id);
      const dist = Math.hypot(p.x - layer.x, p.y - layer.y) || 1;
      const ratio = dist / drag.startDist;
      if (drag.kind === 'text') {
        updateLayer(drag.id, {
          size: clamp(Math.round(drag.startSize * ratio), MIN_SIZE, MAX_SIZE),
          width: clamp(Math.round((drag.startWidth || 400) * ratio), 160, W - 40),
        });
      } else {
        updateLayer(drag.id, {
          scale: clamp(drag.startSize * ratio, 0.1, 1.5),
        });
      }
      return;
    }

    if (drag.mode === 'rotate') {
      setGuides({ v: false, h: false });
      const layer = layerById(drag.id);
      const angle = (Math.atan2(p.y - layer.y, p.x - layer.x) * 180) / Math.PI;
      let next = drag.startRotation + (angle - drag.startPointerAngle);
      for (const s of [-180, -90, 0, 90, 180]) {
        if (Math.abs(next - s) < 4) next = s;
      }
      updateLayer(drag.id, { rotation: Math.round(next) });
    }
  };

  const onPointerUp = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides({ v: false, h: false });
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const addImageLayer = async (dataUrl, label = 'Image') => {
    imageCountRef.current += 1;
    const n = imageCountRef.current;
    let naturalWidth = 1;
    let naturalHeight = 1;
    try {
      const img = await loadImage(dataUrl);
      naturalWidth = img.width;
      naturalHeight = img.height;
    } catch {
      // ignore
    }
    const id = `img-${Date.now()}-${n}`;
    const layer = {
      id,
      type: 'image',
      name: `${label} ${n}`,
      imageUrl: dataUrl,
      x: W / 2 + (n % 3) * 24,
      y: H / 2 + (n % 3) * 24,
      scale: 0.45,
      rotation: 0,
      naturalWidth,
      naturalHeight,
      visible: true,
      groupId: null,
    };
    setLayers((prev) => [...prev, layer]);
    setLayerOrder((prev) => [...prev, id]);
    setSelectedId(id);
    setPanels((p) => ({ ...p, properties: true, layers: true }));
    return layer;
  };

  const addTextLayer = () => {
    textCountRef.current += 1;
    const n = textCountRef.current;
    const id = `text-${Date.now()}-${n}`;
    const layer = {
      id,
      type: 'text',
      name: `Text ${n}`,
      text: 'New text',
      color: '#111827',
      fontId: 'montserrat',
      size: formatId === 'vertical' ? 72 : 64,
      x: W / 2,
      y: H / 2,
      width: Math.min(W * 0.8, 900),
      rotation: 0,
      visible: true,
      groupId: null,
    };
    setLayers((prev) => [...prev, layer]);
    setLayerOrder((prev) => [...prev, id]);
    setSelectedId(id);
    setPanels((p) => ({ ...p, properties: true }));
  };

  const copyLayer = (id) => {
    const source = id ? layerById(id) : selected;
    if (!source || source.type === 'background') return false;
    const { id: _id, groupId: _g, ...rest } = source;
    setClipboard({ ...rest });
    setMessage(`Copied ${source.name} — Ctrl/Cmd+V to paste`);
    setContextMenu(null);
    return true;
  };

  const pasteLayer = (atPoint = null) => {
    if (!clipboard) {
      setMessage('Nothing to paste — copy a layer first (Ctrl/Cmd+C)');
      setContextMenu(null);
      return;
    }
    if (clipboard.type === 'image') imageCountRef.current += 1;
    if (clipboard.type === 'text') textCountRef.current += 1;
    const n =
      clipboard.type === 'image' ? imageCountRef.current : textCountRef.current;
    const newId = `${clipboard.type}-${Date.now()}-paste`;
    const baseName = String(clipboard.name || clipboard.type).replace(/\s+copy$/, '');
    const pasted = {
      ...clipboard,
      id: newId,
      name: `${baseName} copy`,
      x: clamp(
        atPoint?.x ?? (clipboard.x || W / 2) + 40,
        40,
        W - 40
      ),
      y: clamp(
        atPoint?.y ?? (clipboard.y || H / 2) + 40,
        40,
        H - 40
      ),
      groupId: null,
    };
    // slight offset if pasting at same spot repeatedly without point
    if (!atPoint) {
      pasted.x = clamp((clipboard.x || W / 2) + 40 + (n % 4) * 12, 40, W - 40);
      pasted.y = clamp((clipboard.y || H / 2) + 40 + (n % 4) * 12, 40, H - 40);
    }
    setLayers((prev) => [...prev, pasted]);
    setLayerOrder((prev) => [...prev, newId]);
    setSelectedId(newId);
    setMessage(`Pasted ${pasted.name}`);
    setContextMenu(null);
  };

  const duplicateLayer = (id) => {
    const source = layerById(id);
    if (!source || source.type === 'background') return;
    const { id: _id, groupId: _g, ...rest } = source;
    setClipboard({ ...rest });
    if (source.type === 'image') imageCountRef.current += 1;
    if (source.type === 'text') textCountRef.current += 1;
    const newId = `${source.type}-${Date.now()}-copy`;
    const copy = {
      ...source,
      id: newId,
      name: `${source.name} copy`,
      x: clamp((source.x || W / 2) + 40, 40, W - 40),
      y: clamp((source.y || H / 2) + 40, 40, H - 40),
      groupId: null,
    };
    setLayers((prev) => [...prev, copy]);
    setLayerOrder((prev) => {
      const idx = prev.indexOf(id);
      const next = [...prev];
      next.splice(idx + 1, 0, newId);
      return next;
    });
    setSelectedId(newId);
    setMessage(`Duplicated ${source.name}`);
    setContextMenu(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'c' || e.key === 'C')) {
        if (selectedId && layerById(selectedId)?.type !== 'background') {
          e.preventDefault();
          copyLayer(selectedId);
        }
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        if (clipboard) {
          e.preventDefault();
          pasteLayer();
        }
      }
      if (mod && (e.key === 'd' || e.key === 'D')) {
        if (selectedId && layerById(selectedId)?.type !== 'background') {
          e.preventDefault();
          duplicateLayer(selectedId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, clipboard, W, H]);

  const changeFormat = (nextId) => {
    if (nextId === formatId) return;
    const prev = FORMATS[formatId];
    const next = FORMATS[nextId];
    const sx = next.w / prev.w;
    const sy = next.h / prev.h;
    setLayers((list) =>
      list.map((layer) => {
        if (layer.type === 'text' || layer.type === 'image') {
          return {
            ...layer,
            x: (layer.x || prev.w / 2) * sx,
            y: (layer.y || prev.h / 2) * sy,
            width: layer.width ? layer.width * sx : layer.width,
          };
        }
        return layer;
      })
    );
    setFormatId(nextId);
    setMessage(`Format: ${next.label} (${next.w}×${next.h})`);
  };

  const centerSelected = (axis) => {
    if (!selected || selected.type === 'background') return;
    const patch = {};
    if (axis === 'h' || axis === 'both') patch.x = W / 2;
    if (axis === 'v' || axis === 'both') patch.y = H / 2;
    patchSelected(patch);
    setGuides({
      v: axis === 'h' || axis === 'both',
      h: axis === 'v' || axis === 'both',
    });
    window.setTimeout(() => setGuides({ v: false, h: false }), 600);
  };

  const onImageFile = async (file) => {
    setMessage('');
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      await addImageLayer(dataUrl, file.name?.replace(/\.[^.]+$/, '') || 'Image');
      addHistoryItem({ dataUrl, kind: 'original', label: file.name || 'Image' });
    } catch (err) {
      setError(err?.message || 'Could not read image');
    }
  };

  const onBgFile = async (file) => {
    setMessage('');
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      updateLayer('background', { imageUrl: dataUrl });
      setSelectedId('background');
      addHistoryItem({ dataUrl, kind: 'image', label: file.name || 'Background' });
    } catch (err) {
      setError(err?.message || 'Could not read background');
    }
  };

  const exportDataUrl = (fmt) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (fmt === 'jpg' || fmt === 'jpeg') return canvas.toDataURL('image/jpeg', 0.92);
    return canvas.toDataURL('image/png');
  };

  const handleDownload = () => {
    const dataUrl = exportDataUrl(exportFormat);
    if (!dataUrl) return;
    addHistoryItem({ dataUrl, kind: 'thumbnail', label: `${format.label} thumbnail` });
    downloadDataUrl(
      dataUrl,
      `pixdesk-${formatId}.${exportFormat === 'jpg' ? 'jpg' : 'png'}`
    );
    setMessage('Downloaded — kept in session history');
  };

  const handleSaveServer = async () => {
    const dataUrl = exportDataUrl(exportFormat);
    if (!dataUrl) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      addHistoryItem({ dataUrl, kind: 'thumbnail', label: `${format.label} thumbnail` });
      const result = await exportToServer(dataUrl, {
        filename: `pixdesk-${formatId}`,
        format: exportFormat,
        width: W,
        height: H,
      });
      setMessage(`Saved as ${result.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openContextMenu = (event, id = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (id) setSelectedId(id);
    const stage = stageRef.current?.getBoundingClientRect();
    const canvasPoint = clientToCanvas(event.clientX, event.clientY);
    setContextMenu({
      id, // null = empty canvas
      x: event.clientX - (stage?.left || 0),
      y: event.clientY - (stage?.top || 0),
      canvasX: canvasPoint.x,
      canvasY: canvasPoint.y,
    });
  };

  const layersTopFirst = useMemo(
    () => [...layerOrder].reverse().map((id) => layerById(id)).filter(Boolean),
    [layerOrder, layerById]
  );

  const renderOverlay = (layer) => {
    if (!layer || layer.visible === false) return null;
    if (layer.type !== 'text' && layer.type !== 'image') return null;

    let width;
    let height;
    if (layer.type === 'text') {
      const metrics = measureTextLayer(layer);
      width = metrics.width;
      height = metrics.height;
    } else {
      const size = imageDisplaySize(layer, W, H);
      width = size.width;
      height = size.height;
    }

    const left = (layer.x - width / 2) * previewScale;
    const top = (layer.y - height / 2) * previewScale;
    const selected = selectedId === layer.id;
    const handleCls =
      'absolute w-3 h-3 bg-white border-2 border-violet-500 rounded-sm z-10';

    return (
      <div
        key={layer.id}
        className="absolute"
        style={{
          left,
          top,
          width: width * previewScale,
          height: height * previewScale,
          transform: `rotate(${layer.rotation || 0}deg)`,
          transformOrigin: 'center center',
        }}
        onContextMenu={(e) => openContextMenu(e, layer.id)}
      >
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => onMovePointerDown(layer.id, e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(layer.id);
          }}
          className={`absolute inset-0 touch-none cursor-move border-2 rounded-md ${
            selected
              ? 'border-violet-400 bg-violet-500/10'
              : 'border-white/30 hover:border-violet-300'
          }`}
        >
          {selected && (
            <span className="pointer-events-none absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded bg-violet-500 text-white">
              {layer.name}
            </span>
          )}
        </div>

        {selected && (
          <>
            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 -top-10 z-20 w-7 h-7 rounded-full bg-violet-500 text-white shadow flex items-center justify-center cursor-grab select-none hover:bg-violet-600"
              title="Rotate"
              onPointerDown={(e) => onRotatePointerDown(layer.id, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <ArrowClockwise className="w-3.5 h-3.5" />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 w-px bg-violet-400 top-[-14px] h-[8px]" />
            {CORNERS.map((corner) => {
              const pos =
                corner === 'nw'
                  ? { left: -6, top: -6, cursor: 'nwse-resize' }
                  : corner === 'ne'
                    ? { right: -6, top: -6, cursor: 'nesw-resize' }
                    : corner === 'sw'
                      ? { left: -6, bottom: -6, cursor: 'nesw-resize' }
                      : { right: -6, bottom: -6, cursor: 'nwse-resize' };
              return (
                <button
                  key={corner}
                  type="button"
                  className={handleCls}
                  style={pos}
                  title="Scale"
                  onPointerDown={(e) => onResizePointerDown(layer.id, e)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              );
            })}
          </>
        )}
      </div>
    );
  };

  const bg = layerById('background');
  const showVGuide = showGuidesAlways || guides.v;
  const showHGuide = showGuidesAlways || guides.h;

  const onHistorySelect = async (item) => {
    setSelectedHistoryId(item.id);
    setMessage('');
    setError('');
    if (historyPickMode === 'background') {
      updateLayer('background', { imageUrl: item.dataUrl });
      setSelectedId('background');
    } else {
      await addImageLayer(item.dataUrl, item.label || 'Image');
    }
  };

  const activeHistoryDataUrl =
    selected?.type === 'image'
      ? selected.imageUrl
      : selected?.type === 'background'
        ? selected.imageUrl
        : null;

  return (
    <AppShell title="Thumbnails">
      <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase font-semibold text-gray-400 mr-1">Format</span>
          {Object.values(FORMATS).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn text-xs py-1 px-2.5 ${
                formatId === f.id
                  ? 'bg-violet-500 text-white'
                  : 'border border-gray-300 dark:border-gray-600'
              }`}
              onClick={() => changeFormat(f.id)}
              title={`${f.hint} · ${f.w}×${f.h}`}
            >
              {f.label}
              <span className="opacity-70 ml-1">{f.w}×{f.h}</span>
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />

          <span className="text-[10px] uppercase font-semibold text-gray-400">Add</span>
          <input
            ref={subjectInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={bgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onBgFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 bg-violet-500 text-white hover:bg-violet-600"
            onClick={() => subjectInputRef.current?.click()}
          >
            + Image
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600"
            onClick={addTextLayer}
          >
            + Text
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600"
            onClick={() => bgInputRef.current?.click()}
          >
            + Background
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            disabled={!selected || selected.type === 'background'}
            onClick={() => selected && copyLayer(selected.id)}
            title="Copy (Ctrl/Cmd+C)"
          >
            Copy
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            disabled={!clipboard}
            onClick={() => pasteLayer()}
            title="Paste (Ctrl/Cmd+V)"
          >
            Paste
          </button>

          <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>BG</span>
            <input
              type="color"
              className="h-7 w-9 p-0.5 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer"
              value={bg?.color || '#ffffff'}
              onChange={(e) => {
                updateLayer('background', { color: e.target.value });
                setSelectedId('background');
              }}
            />
          </label>
          <select
            className="form-select text-xs py-1 w-auto"
            value={bg?.fit || 'cover'}
            onChange={(e) => updateLayer('background', { fit: e.target.value })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
          {bg?.imageUrl && (
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-red-500 underline"
              onClick={() => updateLayer('background', { imageUrl: null })}
            >
              Clear BG img
            </button>
          )}

          <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={showGuidesAlways}
              onChange={(e) => setShowGuidesAlways(e.target.checked)}
            />
            Guides
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="form-select text-xs py-1 w-auto"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
            <button
              type="button"
              className="btn text-xs py-1 px-2.5 bg-violet-500 hover:bg-violet-600 text-white"
              onClick={handleDownload}
              disabled={busy}
            >
              Download
            </button>
            <button
              type="button"
              className="btn text-xs py-1 px-2.5 border border-gray-300 dark:border-gray-600"
              onClick={handleSaveServer}
              disabled={busy}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 space-y-2 order-2 xl:order-1">
          <CollapsiblePanel
            title="Properties"
            open={panels.properties}
            onToggle={() => togglePanel('properties')}
            badge={selected?.name || '—'}
          >
            <div className="pt-3 space-y-3">
              {!selected && (
                <p className="text-sm text-gray-500">
                  Blank canvas. Add an image or text, or pick from history.
                </p>
              )}

              {(selected?.type === 'text' || selected?.type === 'image') && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn text-xs py-1 px-2 border border-gray-300 dark:border-gray-600"
                    onClick={() => centerSelected('h')}
                  >
                    ↔ Center H
                  </button>
                  <button
                    type="button"
                    className="btn text-xs py-1 px-2 border border-gray-300 dark:border-gray-600"
                    onClick={() => centerSelected('v')}
                  >
                    ↕ Center V
                  </button>
                  <button
                    type="button"
                    className="btn text-xs py-1 px-2 bg-violet-500 text-white"
                    onClick={() => centerSelected('both')}
                  >
                    ⊕ Center
                  </button>
                  <button
                    type="button"
                    className="btn text-xs py-1 px-2 border border-gray-300 dark:border-gray-600"
                    onClick={() => copyLayer(selected.id)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn text-xs py-1 px-2 border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                    disabled={!clipboard}
                    onClick={() => pasteLayer()}
                  >
                    Paste
                  </button>
                </div>
              )}

              {selected?.type === 'text' && (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {selected.name}
                  </p>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Text</span>
                    <input
                      className="form-input w-full mt-1"
                      value={selected.text}
                      onChange={(e) => patchSelected({ text: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Font</span>
                    <select
                      className="form-select w-full mt-1"
                      value={selected.fontId}
                      onChange={(e) => patchSelected({ fontId: e.target.value })}
                      style={{ fontFamily: fontById(selected.fontId).family }}
                    >
                      {THUMBNAIL_FONTS.map((f) => (
                        <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200">Color</span>
                      <input
                        type="color"
                        className="form-input w-full mt-1 h-10 p-1"
                        value={selected.color}
                        onChange={(e) => patchSelected({ color: e.target.value })}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        Size ({selected.size})
                      </span>
                      <input
                        type="range"
                        min={MIN_SIZE}
                        max={MAX_SIZE}
                        className="w-full mt-3"
                        value={selected.size}
                        onChange={(e) => patchSelected({ size: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 inline-flex items-center gap-1">
                      Rotation ({selected.rotation || 0}°)
                      <ArrowClockwise className="w-3.5 h-3.5 text-violet-500" />
                    </p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { label: '0°', value: 0 },
                        { label: 'Vertical ↑', value: -90 },
                        { label: 'Vertical ↓', value: 90 },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          className={`btn text-xs py-1 px-2 ${
                            selected.rotation === opt.value
                              ? 'bg-violet-500 text-white'
                              : 'border border-gray-300 dark:border-gray-600'
                          }`}
                          onClick={() => patchSelected({ rotation: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      className="w-full"
                      value={selected.rotation || 0}
                      onChange={(e) => patchSelected({ rotation: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}

              {selected?.type === 'image' && (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {selected.name}
                  </p>
                  <img
                    src={selected.imageUrl}
                    alt=""
                    className="h-20 object-contain rounded border border-gray-200 dark:border-gray-700"
                  />
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      Scale ({Math.round((selected.scale || 0.45) * 100)}%)
                    </span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.5"
                      step="0.01"
                      className="w-full mt-2"
                      value={selected.scale || 0.45}
                      onChange={(e) => patchSelected({ scale: Number(e.target.value) })}
                    />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 inline-flex items-center gap-1">
                      Rotation ({selected.rotation || 0}°)
                      <ArrowClockwise className="w-3.5 h-3.5 text-violet-500" />
                    </p>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      className="w-full"
                      value={selected.rotation || 0}
                      onChange={(e) => patchSelected({ rotation: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}

              {selected?.type === 'background' && (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Background</p>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Color fill</span>
                    <input
                      type="color"
                      className="form-input w-full mt-1 h-10 p-1"
                      value={selected.color}
                      onChange={(e) => patchSelected({ color: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Image fit</span>
                    <select
                      className="form-select w-full mt-1"
                      value={selected.fit}
                      onChange={(e) => patchSelected({ fit: e.target.value })}
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Layers"
            open={panels.layers}
            onToggle={() => togglePanel('layers')}
            badge={layers.length}
          >
            <ul className="pt-2 space-y-1">
              {layersTopFirst.map((layer) => (
                <li key={layer.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(layer.id);
                      setPanels((p) => ({ ...p, properties: true }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(layer.id);
                    }}
                    onContextMenu={(e) => {
                      if (layer.type !== 'background') openContextMenu(e, layer.id);
                      else {
                        e.preventDefault();
                        setSelectedId(layer.id);
                      }
                    }}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition cursor-pointer ${
                      selectedId === layer.id
                        ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span className="w-5 text-center shrink-0">
                      {layer.type === 'text' ? 'T' : layer.type === 'image' ? '◻' : '▦'}
                    </span>
                    <span className="truncate grow">{layer.name}</span>
                    {layer.type !== 'background' && (
                      <button
                        type="button"
                        className="text-[10px] text-violet-500 hover:underline"
                        title="Copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyLayer(layer.id);
                        }}
                      >
                        Copy
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(layer.id, { visible: layer.visible === false });
                      }}
                    >
                      {layer.visible === false ? '🙈' : '👁'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-2">
              Ctrl/Cmd+C copy · Ctrl/Cmd+V paste · right-click on canvas.
            </p>
          </CollapsiblePanel>

          <CollapsiblePanel
            title="Session history"
            open={panels.history}
            onToggle={() => togglePanel('history')}
            badge={historyCount}
          >
            <div className="pt-1 space-y-2">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={`btn text-xs py-1 px-2 ${
                    historyPickMode === 'image'
                      ? 'bg-violet-500 text-white'
                      : 'border border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => setHistoryPickMode('image')}
                >
                  → Canvas (copy)
                </button>
                <button
                  type="button"
                  className={`btn text-xs py-1 px-2 ${
                    historyPickMode === 'background'
                      ? 'bg-violet-500 text-white'
                      : 'border border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={() => setHistoryPickMode('background')}
                >
                  → Background
                </button>
              </div>
              <SessionImageHistory
                bare
                compact
                selectedId={selectedHistoryId}
                selectedDataUrl={activeHistoryDataUrl}
                onSelect={onHistorySelect}
                emptyHint="No images in this tab yet."
              />
            </div>
          </CollapsiblePanel>

          {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="xl:col-span-9 flex flex-col items-center order-1 xl:order-2">
          <p className="text-xs uppercase font-semibold text-gray-400 mb-2">
            Preview · {format.label} {W}×{H} · blank start
          </p>
          <div
            ref={stageRef}
            className="relative rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 select-none"
            style={{ width: PREVIEW_W, height: PREVIEW_H, background: '#f3f4f6' }}
            onClick={() => {
              setSelectedId(null);
              setContextMenu(null);
            }}
            onContextMenu={(e) => openContextMenu(e, null)}
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                style={{ width: PREVIEW_W, height: PREVIEW_H, display: 'block' }}
              />
            </div>

            {showVGuide && (
              <div
                className="absolute top-0 bottom-0 w-px bg-cyan-400/90 pointer-events-none z-30"
                style={{ left: PREVIEW_W / 2 }}
              />
            )}
            {showHGuide && (
              <div
                className="absolute left-0 right-0 h-px bg-cyan-400/90 pointer-events-none z-30"
                style={{ top: PREVIEW_H / 2 }}
              />
            )}

            {layerOrder.map((id) => renderOverlay(layerById(id))).filter(Boolean)}

            {contextMenu && (
              <div
                className="absolute z-50 min-w-44 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1 text-sm"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                {contextMenu.id && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-violet-600"
                    onClick={() => copyLayer(contextMenu.id)}
                  >
                    Copy
                    <span className="float-right text-[10px] text-gray-400">Ctrl+C</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium ${
                    clipboard ? 'text-violet-600' : 'text-gray-400 cursor-not-allowed'
                  }`}
                  disabled={!clipboard}
                  onClick={() => {
                    if (!clipboard) return;
                    pasteLayer(
                      contextMenu.canvasX != null
                        ? { x: contextMenu.canvasX, y: contextMenu.canvasY }
                        : null
                    );
                  }}
                >
                  Paste
                  <span className="float-right text-[10px] text-gray-400">Ctrl+V</span>
                </button>
                {contextMenu.id && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => duplicateLayer(contextMenu.id)}
                    >
                      Duplicate
                      <span className="float-right text-[10px] text-gray-400">Ctrl+D</span>
                    </button>
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        updateLayer(contextMenu.id, { x: W / 2 });
                        setContextMenu(null);
                        setGuides({ v: true, h: false });
                        window.setTimeout(() => setGuides({ v: false, h: false }), 600);
                      }}
                    >
                      Center horizontally
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        updateLayer(contextMenu.id, { y: H / 2 });
                        setContextMenu(null);
                        setGuides({ v: false, h: true });
                        window.setTimeout(() => setGuides({ v: false, h: false }), 600);
                      }}
                    >
                      Center vertically
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        updateLayer(contextMenu.id, { x: W / 2, y: H / 2 });
                        setContextMenu(null);
                        setGuides({ v: true, h: true });
                        window.setTimeout(() => setGuides({ v: false, h: false }), 600);
                      }}
                    >
                      Center both
                    </button>
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setLayerOrder((o) => moveLayer(o, contextMenu.id, 'forward'));
                        setContextMenu(null);
                      }}
                    >
                      Bring forward
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setLayerOrder((o) => moveLayer(o, contextMenu.id, 'backward'));
                        setContextMenu(null);
                      }}
                    >
                      Send backward
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setLayerOrder((o) => moveLayer(o, contextMenu.id, 'front'));
                        setContextMenu(null);
                      }}
                    >
                      Bring to front
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setLayerOrder((o) => moveLayer(o, contextMenu.id, 'back'));
                        setContextMenu(null);
                      }}
                    >
                      Send to back
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default Thumbnails;

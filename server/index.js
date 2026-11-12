import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { exportVideoProject, ensureAspect, resolveQuality } from './videoExport.js';
import { clipdeskStatus, listClipdeskVideos, streamClipdeskFile } from './clipdeskBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(ROOT, 'exports');
const WEB_DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES || 800 * 1024 * 1024);

fs.mkdirSync(EXPORT_DIR, { recursive: true });

const app = Fastify({ logger: true, bodyLimit: MAX_VIDEO_BYTES });

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: MAX_VIDEO_BYTES, files: 40 },
});

app.get('/api/health', async () => ({
  ok: true,
  name: 'pixdesk',
  exportDir: EXPORT_DIR,
  clipdesk: await clipdeskStatus(),
}));

app.get('/api/clipdesk/status', async () => clipdeskStatus());

app.get('/api/clipdesk/files', async (request, reply) => {
  try {
    return await listClipdeskVideos(request.query.output || '');
  } catch (err) {
    return reply.code(err.status || 502).send({ error: err.message || 'Clipdesk unreachable' });
  }
});

app.get('/api/clipdesk/file', async (request, reply) => {
  try {
    const name = String(request.query.name || '');
    const { contentType, body, filename } = await streamClipdeskFile(name, request.query.output || '');
    reply.header('content-type', contentType);
    reply.header('content-disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    return reply.send(body);
  } catch (err) {
    return reply.code(err.status || 502).send({ error: err.message || 'Clipdesk file failed' });
  }
});

app.get('/api/exports', async () => {
  const files = fs
    .readdirSync(EXPORT_DIR)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const stat = fs.statSync(path.join(EXPORT_DIR, name));
      return {
        name,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return { files };
});

app.post('/api/export', async (request, reply) => {
  const parts = request.parts();
  let fileBuffer = null;
  let filename = `pixdesk-${Date.now()}.png`;
  let format = 'png';
  let width = null;
  let height = null;

  for await (const part of parts) {
    if (part.type === 'file') {
      fileBuffer = await part.toBuffer();
      if (part.filename) filename = path.basename(part.filename);
    } else if (part.type === 'field') {
      if (part.fieldname === 'format') format = String(part.value || 'png').toLowerCase();
      if (part.fieldname === 'filename') filename = path.basename(String(part.value));
      if (part.fieldname === 'width') width = Number(part.value) || null;
      if (part.fieldname === 'height') height = Number(part.value) || null;
    }
  }

  if (!fileBuffer) {
    return reply.code(400).send({ error: 'Missing image file' });
  }

  const safeFormat = format === 'jpg' || format === 'jpeg' ? 'jpeg' : 'png';
  const ext = safeFormat === 'jpeg' ? 'jpg' : 'png';
  const base = filename.replace(/\.[^.]+$/, '') || `pixdesk-${randomUUID().slice(0, 8)}`;
  const outName = `${base}.${ext}`;
  const outPath = path.join(EXPORT_DIR, outName);

  let pipeline = sharp(fileBuffer, { failOn: 'none' });
  if (width || height) {
    pipeline = pipeline.resize({
      width: width || undefined,
      height: height || undefined,
      fit: 'inside',
      withoutEnlargement: false,
    });
  }

  if (safeFormat === 'jpeg') {
    await pipeline.jpeg({ quality: 92 }).toFile(outPath);
  } else {
    await pipeline.png().toFile(outPath);
  }

  const stat = fs.statSync(outPath);
  return {
    ok: true,
    name: outName,
    path: outPath,
    size: stat.size,
    url: `/exports/${encodeURIComponent(outName)}`,
  };
});

app.get('/exports/:name', async (request, reply) => {
  const name = path.basename(request.params.name);
  const filePath = path.join(EXPORT_DIR, name);
  if (!fs.existsSync(filePath)) {
    return reply.code(404).send({ error: 'Not found' });
  }
  return reply.send(fs.createReadStream(filePath));
});

app.post('/api/video/export', async (request, reply) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixdesk-video-'));
  const saved = new Map();
  let project = null;

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const safe = `${randomUUID().slice(0, 8)}-${path.basename(part.filename || 'media.bin')}`;
        const dest = path.join(workDir, safe);
        await fs.promises.writeFile(dest, await part.toBuffer());
        saved.set(part.fieldname, dest);
      } else if (part.type === 'field' && part.fieldname === 'project') {
        project = JSON.parse(String(part.value || '{}'));
      }
    }

    if (!project?.pages?.length) {
      return reply.code(400).send({ error: 'Project needs at least one page' });
    }

    const pages = project.pages.map((page, index) => {
      const field = page.field || `page_${index}`;
      const filePath = saved.get(field);
      if (!filePath) throw new Error(`Missing media for page ${index + 1}`);
      return {
        path: filePath,
        trimIn: page.trimIn,
        trimOut: page.trimOut,
        volume: page.volume,
      };
    });

    let music = null;
    if (project.music?.field) {
      const musicPath = saved.get(project.music.field);
      if (!musicPath) throw new Error('Missing music file');
      music = {
        path: musicPath,
        volume: project.music.volume,
        trimIn: project.music.trimIn,
        trimOut: project.music.trimOut,
        offset: project.music.offset,
        volumeKeyframes: project.music.volumeKeyframes,
      };
    }

    const aspect = ensureAspect(project.aspect);
    const quality = project.quality || 'high';
    const q = resolveQuality(quality, aspect);
    const result = await exportVideoProject({
      workDir,
      aspect,
      pages,
      music,
      quality,
    });

    const outName = result.name;
    const outPath = path.join(EXPORT_DIR, outName);
    fs.copyFileSync(result.path, outPath);
    const stat = fs.statSync(outPath);

    return {
      ok: true,
      name: outName,
      size: stat.size,
      url: `/exports/${encodeURIComponent(outName)}`,
      quality,
      width: q.width,
      height: q.height,
    };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: err.message || 'Video export failed' });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

if (fs.existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    wildcard: false,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/exports')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
} else {
  app.get('/', async () => ({
    message: 'Pixdesk API is running. Start the Vite app in development, or build web/ for production.',
    health: '/api/health',
  }));
}

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Pixdesk server on http://${HOST}:${PORT}`);
  console.log('UI based on Mosaic Lite — https://github.com/cruip/tailwind-dashboard-template');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

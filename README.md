# Pixdesk

![Node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)

> Part of an open-source toolkit for **streamers, video editors, and content creators** — built to simplify workflows, automate repetitive tasks, and make content creation easier.

**Pixdesk** is a local web app for creator media tasks: remove backgrounds, compose YouTube Shorts thumbnails (9:16), and edit short videos with a Canva-style page timeline, background music, and volume controls. Files stay on your computer. Optional **Leviatan** Google sign-in (shared with Clipdesk) unlocks synced prefs and future Pro features — media is never uploaded.

**Powered by [Leviatan Core](https://github.com/LeviatanCore).**

## Template credit

The dashboard UI is based on **Mosaic Lite** by [Cruip](https://cruip.com/).

- Template repository: [https://github.com/cruip/tailwind-dashboard-template](https://github.com/cruip/tailwind-dashboard-template)
- Mosaic Lite is released under the GPL. Pixdesk inherits that license for the derived UI.

Please keep this attribution when you fork or redistribute Pixdesk.

## Features

- **Remove background** — runs in the browser with `@imgly/background-removal` (local model, no API key)
- **Shorts thumbnails** — 1080×1920 canvas with subject image, title, subtitle, and background color
- Hand off a cutout from Remove background into the thumbnail editor
- Download PNG/JPG or save into a local `exports/` folder via the Node API
- Video editor: page timeline, trim clips, music layer, video/music volume, export 16:9 or 9:16 MP4
- **Clipdesk handoff**: import downloaded clips into the video editor (`CLIPDESK_URL`, default `http://127.0.0.1:8765`)
- **Leviatan account** (optional): Google sign-in via `leviatan-auth` (`VITE_LEVIATAN_AUTH_URL`, default `http://127.0.0.1:8790`)
- Docker-ready

## Requirements

- **Node.js 20+**, or
- **Docker**

## Quick start (local)

```bash
cd pixdesk
npm install
npm run dev
```

- UI: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- API: [http://127.0.0.1:8787](http://127.0.0.1:8787)

### Clipdesk → Pixdesk

1. Run Clipdesk (`./web` → :8765) and Pixdesk (`npm run dev`)
2. Download a video in Clipdesk
3. Click **Abrir en Pixdesk** (or in Pixdesk → Video editor → Add media → From Clipdesk)

Optional: `CLIPDESK_URL=http://127.0.0.1:8765` for the Pixdesk server, `PIXDESK_URL=http://127.0.0.1:5173` for Clipdesk.

### Leviatan sign-in

1. Start `leviatan-auth` on `:8790` (see workspace `leviatan-auth/README.md`)
2. In Pixdesk header → **Sign in** → Google (or Dev sign-in while `DEV_LOGIN=1`)
3. Same JWT works across Pixdesk and Clipdesk; Pro plan is set on the auth service

## Quick start (Docker)

```bash
docker compose up --build -d
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787). Exports land in `./exports`.

```bash
docker compose logs -f
docker compose down
```

## Project layout

```text
pixdesk/
├── web/       # React + Vite UI (Mosaic Lite)
├── server/    # Fastify + sharp API
├── exports/   # saved images (gitignored)
└── README.md
```

## License

GPL-3.0-or-later (required by Mosaic Lite derivative use). See the [Cruip template terms](https://github.com/cruip/tailwind-dashboard-template).

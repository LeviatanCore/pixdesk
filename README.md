# Pixdesk

![Node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)

> Part of an open-source toolkit for **streamers, video editors, and content creators** — built to simplify workflows, automate repetitive tasks, and make content creation easier.

**Pixdesk** is a local web app for image-only creator tasks: remove backgrounds and compose YouTube Shorts thumbnails (9:16). No account required. Files stay on your computer.

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

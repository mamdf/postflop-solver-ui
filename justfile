ROOT := justfile_directory()

default:
    @just --list

# Install dependencies (locked).
setup:
    cd "{{ROOT}}" && npm ci

# UI + API: reuses a healthy API on :3001, otherwise starts it (PORT=5174 for the UI).
dev:
    cd "{{ROOT}}" && exec ./run-dev.sh

# Dev server only; expects the API already running (API_URL, default http://127.0.0.1:3001).
web:
    cd "{{ROOT}}" && exec npm run dev -- --host 127.0.0.1 --port ${PORT:-5174}

# Production bundle into dist/ (serve it with `postflop-solver-api serve --ui-dir dist`).
build:
    cd "{{ROOT}}" && npm run build

lint:
    cd "{{ROOT}}" && npm run lint

ROOT := justfile_directory()
PORT := env_var_or_default("PORT", "5174")

default:
    @just --list

# Install dependencies (locked).
setup:
    cd "{{ROOT}}" && npm ci

# Dev server on http://127.0.0.1:PORT. It only proxies /game, /solves and /info to
# the API (API_URL, default http://127.0.0.1:3001); it does NOT start the API.
dev:
    cd "{{ROOT}}" && exec npm run dev -- --host 127.0.0.1 --port {{PORT}}

# Production bundle into dist/ (serve it with `postflop-solver-api serve --ui-dir dist`).
build:
    cd "{{ROOT}}" && npm run build

lint:
    cd "{{ROOT}}" && npm run lint

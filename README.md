# Postflop Solver UI

Web UI for the `postflop-solver-api` server (solver runs server-side over HTTP).
Fork of [b-inary/wasm-postflop](https://github.com/b-inary/wasm-postflop) (AGPL-3.0); the WebAssembly solver was replaced by an HTTP client.

## Development

```sh
just setup
just dev           # UI on http://127.0.0.1:5174 (PORT=...) + API on :3001
```

`just dev` reuses a healthy API on `:3001` or starts it (`cargo run --release`), and stops only what it started. `just web` runs the UI alone against `API_URL` (default `http://127.0.0.1:3001`); an explicit `API_URL` is never started by `just dev`. `UI_HOST` (default `127.0.0.1`) sets the UI bind, e.g. `UI_HOST=<host>.<tailnet>.ts.net` on a VPS so the dev server is reachable over Tailscale; open it by that same name (other Host headers get 403).

## Production

```sh
npm run build
postflop-solver-api serve --ui-dir <path-to>/dist
```

## License

AGPL-3.0, see [LICENSE](LICENSE).

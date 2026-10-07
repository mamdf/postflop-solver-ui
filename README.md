# Postflop Solver UI

Web UI for the `postflop-solver-api` server (solver runs server-side over HTTP).
Fork of [b-inary/wasm-postflop](https://github.com/b-inary/wasm-postflop) (AGPL-3.0); the WebAssembly solver was replaced by an HTTP client.

## Development

```sh
npm install
npm run dev        # proxies /game, /solves, /info to the API
```

The API must be running at `127.0.0.1:3001` (override with `API_URL=http://host:port npm run dev`).

## Production

```sh
npm run build
postflop-solver-api serve --ui-dir <path-to>/dist
```

## License

AGPL-3.0, see [LICENSE](LICENSE).

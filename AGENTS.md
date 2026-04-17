# Agents

## Cursor Cloud specific instructions

This is a single-file browser game (`index.html`) with no build step, no dependencies, and no backend. It includes a service worker (`sw.js`) and manifest (`manifest.json`) for offline PWA support.

### Running the app locally

Serve the repo root with any static file server:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` in Chrome.

### Lint / Test / Build

There are no linters, test frameworks, or build tools configured. The entire application is self-contained inline HTML/CSS/JS in `index.html`. Validation is done by opening the page in a browser and interacting with the game.

### Railway deployment

The app is deployed on Railway using a `Dockerfile` (nginx:alpine). To deploy, set your Railway account-level token as `RAILWAY_API_TOKEN` and run:

```
railway up
```

The `nginx.conf.template` dynamically binds to Railway's `$PORT` environment variable.

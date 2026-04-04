# Grade 1 Learning Arcade

A browser-based learning app for 6-year-olds (Grade 1), with colorful mini-games and instant feedback.

## Included games

- Simple addition
- Simple multiplication
- Simple division
- Pathway problems
- Venn diagrams
- Number patterns (extra age-appropriate game)

## Login and progress tracking

- Child profile login by name (saved in browser localStorage)
- Separate progress per profile
- Tracks:
  - total score
  - current streak
  - best streak
  - stars earned
  - correct/wrong answer counts
  - attempts and best score for each mini-game
- Profile switcher and logout/reset controls

## Run locally

Requirements: Node.js 20+

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy to Railway

This repo is ready for Railway as a Node web service:

- `server.js` serves static files
- Uses Railway's `PORT` environment variable
- `nixpacks.toml` defines build/start

### Option 1: GitHub connected deploy

1. Push this branch to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Railway will detect Node and deploy automatically.

### Option 2: Railway CLI deploy

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

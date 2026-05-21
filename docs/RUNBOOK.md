# Runbook (Dev Loop)

This project has 3 moving parts during development:

- **API server** (local): `http://localhost:8787`
- **Expo dev server** (local): Metro bundler (shows QR / LAN URL)
- **ngrok**: exposes your local API so the phone app can call it without hardcoding your LAN IP

---

## One-time setup

### Install ngrok

Install ngrok and log in (so you get stable sessions).

- Download + install: `https://ngrok.com/download`
- Then authenticate:

```powershell
ngrok config add-authtoken <YOUR_TOKEN>
```

---

## Daily development workflow

### 1) Start everything (recommended)

From repo root:

```powershell
npm run dev:all
```

This starts:

- API server (watch mode)
- Expo dev server
- ngrok pointing to the API

### 2) Paste ngrok URL in the app (once per session)

When ngrok starts, it prints a forwarding URL like:

- `https://xxxxxx.ngrok-free.app`

Paste that into the app’s connection setting (stored locally).  
The app shows a **connection badge**:

- **green**: API reachable (`GET /health` ok)
- **red**: unreachable / not configured

---

## Alternative commands

### Start only API

```powershell
npm run server:dev
```

### Start only Expo

```powershell
npm run mobile:start
```

### Start only ngrok

```powershell
npm run dev:ngrok
```

---

## Troubleshooting

### API fails with `EADDRINUSE: 8787`

That means something is already running on port **8787**.

Fix (recommended):

```powershell
npm run kill:8787
```

Then start again:

```powershell
npm run server:dev
```

### Phone can’t load the app (Expo)

- Ensure laptop + phone are on the same Wi‑Fi
- Allow Expo/Node in Windows Firewall (Private network)
- In Expo, switch to **Tunnel** mode if LAN fails

### App shows red badge

- Verify ngrok is running and URL pasted correctly
- API health should work locally:

```powershell
node -e "fetch('http://localhost:8787/health').then(r=>r.json()).then(console.log)"
```


# Beginner Setup Guide (Windows)

This guide assumes you’re new to coding. Follow it step-by-step in order.

## What you are building

You will run 3 things:

1. **Backend API (Node.js)** — runs on your laptop at `http://localhost:8787`
2. **Expo Dev Server (React Native)** — shows a QR code so your phone can open the app
3. **ngrok** — gives you a public HTTPS URL so your phone app can reach your laptop API **without hardcoding your IP**

---

## 0) Install prerequisites (one-time)

### A) Install Node.js

1. Install Node.js (LTS).
2. Open **PowerShell** and verify:

```powershell
node -v
npm -v
```

### B) Install Expo Go on your phone

- Android: install **Expo Go** from Play Store
- iPhone: install **Expo Go** from App Store

---

## 1) Get the project on your laptop

Open PowerShell and go to your project folder:

```powershell
cd "c:\Users\jayad\OneDrive\Documents\SwiggyInstamart"
```

---

## 2) Install project dependencies (one-time per fresh clone)

Run these commands from the repo root:

```powershell
npm install
npm --prefix apps/server install
npm --prefix apps/mobile install --legacy-peer-deps
```

---

## 3) Setup ngrok (one-time)

### A) Create an ngrok account

1. Go to `https://ngrok.com/`
2. Sign up / log in
3. Copy your **Auth Token** from the ngrok dashboard

### B) Install ngrok

1. Download ngrok: `https://ngrok.com/download`
2. Install it (so `ngrok` works from PowerShell)

### C) Login ngrok on your laptop (adds token)

In PowerShell:

```powershell
ngrok config add-authtoken <PASTE_YOUR_TOKEN_HERE>
```

✅ That’s the only “credential” ngrok needs: your **ngrok auth token**.

---

## 4) Start the project (daily workflow)

### Option A (recommended): start everything together

From repo root:

```powershell
npm run dev:all
```

This starts:

- API server
- Expo dev server
- ngrok tunnel for the API

### Option B: start them one by one (if you prefer)

Terminal 1 (API):

```powershell
npm run server:dev
```

Terminal 2 (Expo):

```powershell
npm run mobile:start
```

Terminal 3 (ngrok):

```powershell
ngrok http 8787
```

---

## 5) Run the Expo app on your phone (same Wi‑Fi)

1. Ensure your **phone and laptop are on the same Wi‑Fi**
2. In the Expo terminal, you will see a **QR code**
3. Open **Expo Go**:
   - Android: Scan QR from Expo Go
   - iPhone: scan QR using Camera → “Open in Expo Go”

If LAN doesn’t work, switch Expo to **Tunnel** mode (slower but reliable).

---

## 6) Connect the frontend (phone app) to the backend (your laptop API)

### A) Get the ngrok HTTPS URL

When ngrok starts, it prints something like:

- `Forwarding  https://xxxxxx.ngrok-free.app -> http://localhost:8787`

Copy the **HTTPS** URL.

### B) Paste the URL into the app

In the app:

- Open any screen and look at the **connection badge**
  - **Set API / Offline** means it’s not connected yet
- Paste the ngrok URL into the app’s API setting (we store it locally)

### C) Confirm connection

When the app can reach the backend:

- badge shows **Online**
- it’s successfully calling: `GET /health`

---

## Credentials you need (summary)

- **ngrok auth token**: required (to use ngrok properly)
- **No other credentials are required** for running the UI + local backend

Later, when we wire Swiggy MCP calls on the backend, the MCP server auth happens via the MCP client environment (Cursor/connector auth), not inside your mobile app.

---

## Common problems

### “Expo won’t open on my phone”

- Ensure same Wi‑Fi (not guest Wi‑Fi)
- Disable VPN on laptop/phone
- Allow Node/Expo in Windows Firewall (Private network)
- Use Expo **Tunnel** mode

### “Badge shows Offline”

- Make sure API is running
- Make sure ngrok is running
- Paste the correct **HTTPS** ngrok URL


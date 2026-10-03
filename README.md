# Ignite Juniors Tryout Tracker

A lightweight, mobile-first Progressive Web App (PWA) built with **React (Vite) + Tailwind CSS + Firebase Firestore** for real-time sideline evaluations during ultimate frisbee tryouts.

---

## Features

- **Thumb-Optimized Sideline UI**: Big, high-contrast player cards color-coded to match real-life pinneys (Red, Navy, White, Yellow, Green, etc.).
- **5-Point Segmented Touch Scoring**: Rapidly score criteria in under 5 seconds with zero clutter (`--`, `-`, `Std`, `+`, `++`).
- **Exemplar Player Anchors**: Display benchmark exemplar players next to criteria (e.g., *"Break Throws (e.g. Kian)"*).
- **Preset Quick-Take Chips**: 1-tap note tags (*"Lock for team"*, *"Cut / Move Down"*, *"Bubble"*, *"High motor"*, *"Struggles with turnovers"*).
- **Coach-Only Live Roster Board (22 Target Count)**:
  - Dynamic spot counter (*"14 of 22 spots locked • 8 open"*).
  - 1-click lock/unlock toggle.
  - Aggregated leaderboard sorting by overall, offense, and defense ratings.
  - 1-click CSV Matrix export for selection meetings.
- **Multi-Session Lifecycle (Ignite 3-Session Model)**:
  - Advance from Session 1 $\to$ Session 2 $\to$ Session 3.
  - 1-click roster rollover that carries over advancing trialists and filters out cuts.
  - Finalize/Lock button to freeze evaluator inputs.
- **Offline Resilience & Instant Writes**:
  - Instant optimistic writes to local IndexedDB (`Dexie.js`).
  - Native Firestore multi-tab offline caching (`persistentLocalCache`) + automatic background sync.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
```

Open your browser to `http://localhost:5173`.

---

## Firebase Firestore Setup (Free 24/7 Cloud Backend)

1. Open [console.firebase.google.com](https://console.firebase.google.com) and click **Add Project** (e.g. `ignite-tryouts`).
2. Go to **Build** $\to$ **Firestore Database** $\to$ **Create Database** (start in Test mode or configure open collection rules for `sessions`, `players`, `criteria`, `evaluations`, `player_notes`).
3. In Project Settings (⚙️ icon) $\to$ **General** $\to$ **Your apps**, click the Web icon (`</>`) to register a Web App.
4. In the Tryout Tracker Web App, click the ⚙️ **Settings** button (enter Coach PIN `2026`), go to **Firebase Cloud Sync**, and paste your `projectId`, `apiKey`, and `appId`.
5. Click **Connect & Start Realtime Sync**.

---

## Coach / Admin Access
- When evaluators first open the link on their mobile phones, they just enter their name (e.g. *"Alex"*) to start rating players.
- Coaches click the ⚙️ icon or the **Roster Board** button and enter the default 4-digit PIN: `2026` to unlock admin controls.

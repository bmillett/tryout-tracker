# Ignite Juniors Tryout Tracker

A lightweight, mobile-first Progressive Web App (PWA) built with **React (Vite) + Tailwind CSS + PocketBase / PocketHost.io** for real-time sideline evaluations during ultimate frisbee tryouts.

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
  - Automatic background sync to PocketBase whenever cellular data is available.

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

## PocketHost.io Setup (Backend Hosting)

1. Go to [PocketHost.io](https://pockethost.io) and create a free account.
2. Click **Create Instance** and pick a name (e.g. `ignite-tryouts`).
3. Click into your instance **Admin UI** (e.g. `https://ignite-tryouts.pockethost.io/_/`).
4. Set your PocketBase Admin Email and Password.
5. In the left navigation, go to **Settings** $\to$ **Import collections** and upload [`pocketbase-schema.json`](pocketbase-schema.json).
6. In the Tryout Tracker Web App, click the ⚙️ **Settings** tab in Coach Admin and set your backend URL to `https://ignite-tryouts.pockethost.io`.

---

## Coach / Admin Access
- When evaluators first open the link on their mobile phones, they just enter their name (e.g. *"Alex"*) to start rating players.
- Coaches click the ⚙️ icon or the **Roster Board** button and enter the default 4-digit PIN: `2026` to unlock admin controls.

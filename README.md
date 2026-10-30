# SkillSwap — Micro-Mentorship & Skill Exchange Hub

SkillSwap is an audit-verifiable, peer-to-peer micro-mentorship and live code collaboration platform where developers exchange focused 1-on-1 assistance with experienced peers. Operating on an append-only cryptographic-style credit ledger, users spend platform tokens to receive help and earn tokens by mentoring others.

---

## 🏛️ Architecture

SkillSwap pairs a single-process Node.js / Express backend backed by an append-only SQLite double-entry ledger (`WAL` mode) and in-memory Yjs CRDT synchronization with a Vite React client featuring Monaco live code collaboration, real-time Socket.io presence, and public zero-trust audit verification.

---

## 🚀 Key Features

1. **Double-Entry Append-Only Credit Ledger**:
   - Zero mutable balance columns. User balances and running balances are computed dynamically as `SUM(delta)`.
   - Atomic settlements in single transactions (`session_spend` -5 / `session_earn` +5) enforced by `UNIQUE(booking_id, kind)`.
   - Closed-loop platform credit conservation: Total circulating credits always strictly match total minted platform tokens.

2. **Full Public Auditability (`/audit`)**:
   - Open to every valid authenticated user (no opaque administrative barriers).
   - Real-time verification of 7 mathematical integrity checks (conservation law, matching settlement pairs, historical non-negative balance invariants, booking foreign key integrity, valid bonus links, and duplicate settlement prevention).
   - Live side-by-side settlement proofs (`-5 / +5`) and socket-driven real-time refresh.

3. **Peer Directory & Micro-Mentorship Booking Flow**:
   - Searchable peer directory with skill, language, and online filtering.
   - Smart booking rules: `mentor.level >= learner.level`, single active booking between peers, and dynamic credit availability calculation (`balance - reserved_credits`).
   - Real-time booking state machine: `requested` → `accepted` / `declined` / `cancelled` → `in_progress` → `completed`.

4. **Live Collaborative Code Room (`/room/:bookingId`)**:
   - High-performance Monaco code editor synchronized in real time via Yjs CRDTs over WebSockets.
   - Dual-presence tracking (who is online and active in the session).
   - Ephemeral in-room chat with timestamped messaging.
   - Instant single-transaction atomic settlement on session completion with final code snapshotting.

5. **5-Star Mentorship Ratings & Bonus Minting**:
   - Learners rate completed sessions (1–5 stars) with optional feedback comments.
   - 5-star ratings mint exactly `+1` platform bonus credit awarded directly to the mentor within the same transaction.
   - Full idempotency protection preventing duplicate reviews or duplicate bonus awards.

6. **Public Mentorship Leaderboard (`/leaderboard`)**:
   - Dynamic rankings highlighting top community mentors across 4 deterministic tie-breakers (completed mentor sessions DESC, average rating DESC, total credits earned DESC, name ASC).
   - Visual podium for top 3 mentors (Gold, Silver, Bronze) and personalized user rank indicator.

7. **Session Code Archive & Notes (`/sessions/:bookingId`)**:
   - Read-only code archive preserved in the session's selected programming language with instant code download (`.js`, `.py`, `.ts`, etc.).
   - Persistent, editable collaborative session summary notes for participants.

8. **Hardened Production Mode & In-Process Demo Reset**:
   - Single-process production deployment: Express serves optimized static assets and handles SPA routing fallback for `/room/*` and `/profile`.
   - 0.0.0.0 LAN binding displaying local WiFi URLs for cross-device evaluation (phones/tablets/laptops).
   - In-process demo reset (`POST /api/demo/reset`) restores the deterministic seed and resets all rooms in a single transaction without killing the server.

---

## 💻 Prerequisites

- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher
- **Operating System**: Windows (PowerShell compatible), macOS, or Linux

---

## ⚡ Quick Start & Production Mode

### 1. Installation
```powershell
npm install
```

### 2. Production Mode (Recommended for Demos & Judging)
Builds the client SPA, resets the database to the deterministic seed, and starts the unified single-process server:
```powershell
npm run demo:prod
```
The server listens on `0.0.0.0:4000` and displays:
```
🚀 SkillSwap Server running at:
   Local:        http://localhost:4000
   On your wifi: http://192.168.x.x:4000
   Health:       http://localhost:4000/api/health
   Users:        http://localhost:4000/api/users
```
Open `http://localhost:4000` or the WiFi URL on any phone or laptop on the same local network!

### 3. Development Mode
To run client (Vite HMR on port 5173) and backend API (Express on port 4000) concurrently:
```powershell
npm run dev
```

### 4. In-Process Demo Reset
To restore the platform to the initial clean seed at any time during an active demo:
- **From the UI**: Click the **"🔄 Reset Demo"** button in the top navigation bar.
- **From the CLI**:
  ```powershell
  npm run demo:reset
  ```

---

## 🧪 Smoke Testing & Verification

SkillSwap provides an automated cross-platform HTTP smoke test that verifies all critical API contracts, header-based balance privacy, and audit conservation rules against a running server:
```powershell
npm run smoke
```
Default target is `http://localhost:4000`. Set `BASE_URL` in environment to target a remote or alternate port:
```powershell
$env:BASE_URL="http://localhost:4100"; npm run smoke; $env:BASE_URL=""
```

---

## 🛡️ Test Suite Reference

All automated tests use plain Node.js with zero external test runners, assert strict error handling, and exit non-zero on failure. Every test script honors `FORCE_FAIL=1` for failsafe testing.

| Command | File | What it Proves |
| :--- | :--- | :--- |
| `npm run test:db` | `server/tests/db-sanity.js` | Verifies SQLite schema creation, foreign key enforcement, uniqueness constraints, and the node:sqlite compatibility fallback. |
| `npm run test:bookings` | `server/tests/bookings.test.js` | Validates the complete booking state machine (`requested` → `accepted` → `in_progress` → `completed`), mentor level gates (`mentor.level >= learner.level`), and duplicate booking prevention. |
| `npm run test:sockets` | `server/tests/sockets.test.js` | Proves real-time Socket.io delivery: authenticated user rooms, booking event broadcasts, room joining, and disconnect handling. |
| `npm run test:profile` | `server/tests/profile.test.js` | Tests user profile retrieval, skill associations, availability slots, and strict ledger privacy (balance fields hidden from other users). |
| `npm run test:room` | `server/tests/room.test.js` | Confirms live room access control (rejects non-participants), Yjs CRDT synchronization convergence across concurrent edits, and in-room chat. |
| `npm run test:ledger` | `server/tests/ledger.test.js` | Demonstrates double-entry settlement atomicity, double-spend prevention under concurrent requests, and running balance calculation. |
| `npm run test:slice7` | `server/tests/slice7.test.js` | Proves 5-star review bonus minting (+1 credit), idempotent rating submissions, session notes code persistence, and mentor leaderboard rankings. |
| `npm run test:integrity` | `server/tests/integrity.test.js` | Formally verifies the 5 platform conservation invariants: total circulating credits = total minted tokens, zero non-negative balance histories, and valid foreign keys. |
| `npm run test:prod` | `server/tests/prod.test.js` | Validates production single-process serving: client SPA routing fallbacks (`/room/*`, `/profile`), static asset caching headers, JSON 404s, and Yjs WebSocket upgrades. |
| `npm run test:demo` | `server/tests/demo.test.js` | Tests in-process demo reset (`POST /api/demo/reset`): atomic database re-seeding, Yjs room cleanup, socket broadcast notification, and production security disablement. |
| `npm run test:failsafe` | `server/tests/failsafe.js` | Spawns all 10 test suites with `FORCE_FAIL=1` and asserts that every single file exits with a non-zero exit code. |
| `npm run test:all` | *(All 10 suites)* | Runs the entire end-to-end integration test suite sequentially. |

---

## 📖 Additional Documentation

- [Live 4-Minute Demo Script & Pre-Demo Checklist](file:///f:/HackathonCodeAsap/docs/DEMO_SCRIPT.md)
- [Judge Evaluation Matrix & Requirements Proofs](file:///f:/HackathonCodeAsap/docs/JUDGES.md)
- [Full Technical Specification & Decisions Log](file:///f:/HackathonCodeAsap/SPEC.md)

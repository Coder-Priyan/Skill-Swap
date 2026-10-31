# SkillSwap — 4-Minute Live Demo Script & Judge Preparation

This document outlines the exact step-by-step walkthrough for a 4-minute live hackathon presentation of **SkillSwap**, showcasing real-time collaborative code mentorship and transparent double-entry credit ledger economics.

---

## 📋 Pre-Demo Checklist

Complete these 7 steps before stepping on stage or presenting to judges:

1. **Kill Stale Processes & Launch Demo Server**:
   Kill any old node processes on ports 4000/5173/5174 before `npm run demo:prod`, and confirm `/api/health` uptime is a few seconds:
   ```powershell
   Get-NetTCPConnection -LocalPort 4000,4001,5173,5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
   npm run demo:prod
   ```
   *Resets the SQLite database to deterministic seed data and boots the single-process production server listening on `0.0.0.0:4000` with static SPA assets.*
2. **Execute Smoke Test Verification**:
   ```bash
   npm run smoke
   ```
   *Confirms all 8 core API contracts, ledger balances, and audit conservation checks pass with HTTP 200.*
3. **Open Two Independent Browser Windows (Side-by-Side)**:
   - **Window 1 (Learner)**: Navigate to `http://localhost:4000`. Switch active user in top-right switcher to **Tanvi Deshmukh (`usr_terminaltinkerer`)** (Starts with 5 credits, 1 booking capacity).
   - **Window 2 (Mentor)**: Open an **Incognito / Private Window** (to ensure isolated `sessionStorage`). Navigate to `http://localhost:4000`. Switch active user to **Priya Sharma (`usr_pixelpriya`)** (Staff Frontend Engineer, Level 3 Mentor, 65 credits).
   - **Audio / Device Setup**: Two windows on ONE laptop: use headphones; for two devices over wifi the mic requires HTTPS or the Chrome flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with `http://<LAN-IP>:4000` added on BOTH devices, then relaunch Chrome.
4. **LAN / Mobile Device Ready**:
   - Note the LAN IP printed in server startup banner (e.g. `http://192.168.137.190:4000`).
   - Open on your mobile phone browser to demonstrate cross-device capability.
5. **Display & Zoom**:
   - Set browser zoom to 90% or 100% so split-screen fits both windows comfortably without horizontal scrolling.
6. **Tabs Hygiene**:
   - Close devtools console or filter warnings; keep network and console clean.
7. **Rule of Gold**:
   - **Never restart the server mid-demo.** If you need to re-run the demo, click the in-app **"🔄 Reset Demo"** button in the navigation bar!

---

## ⏱️ Timed 4-Minute Demo Script

```
+--------------------------------------------------------------------------------------------------+
| TIME      | SPEAKER / ACTION                        | SCREEN / WOW MOMENT                        |
+--------------------------------------------------------------------------------------------------+
| 0:00-0:30 | Pitch & Browse Directory                | Window 1: Tanvi browsing Find Peers        |
| 0:30-1:10 | Smart Match Deterministic Engine         | Tanvi finds Priya via explainable scoring   |
| 1:10-1:50 | Real-Time Booking & Credit Reservation   | Dual Windows: Live notification & badge     |
| 1:50-2:55 | Collaborative Room & Yjs CRDT Editor    | Dual Windows: Live typing, cursors, chat    |
| 2:55-3:35 | Immediate Settlement, Rating & Bonus    | Tanvi rates Priya -> Credits update live    |
| 3:35-4:00 | System Audit & Demo Reset                | Audit Page (100% green) -> 1-click reset    |
+--------------------------------------------------------------------------------------------------+
```

### Phase 1: The Problem & Skill Directory (0:00 – 0:30)
- **Talking Points**:
  - *"Traditional tutoring is transactional and expensive. SkillSwap is an egalitarian peer-mentorship network where developers exchange knowledge using a finite-supply credit economy."*
  - *"Meet Tanvi (`usr_terminaltinkerer`), a junior learner with 5 credits. She needs help with React. In our peer directory, she can explore peers or switch to our explainable matching engine."*
- **Actions in Window 1 (Tanvi)**:
  1. Click **Find Peers** (`/peers`).
  2. Notice the top view mode switcher: **Browse** and **Smart Match**.

### Phase 1.5: Smart Match — Explainable Deterministic Matching (0:30 – 1:10)
- **Talking Points**:
  - *"Finding the right mentor usually means guessing or relying on black-box LLMs that hallucinate. We built Smart Match: a 100% deterministic, rule-based matching engine running on pure server logic with zero external API keys."*
- **Actions in Window 1 (Tanvi)**:
  1. Click **"✨ Smart Match"** tab (default directory mode).
  2. In the "Describe your problem" box, paste the exact problem:
     > `My React component re-renders too much, need help in Hindi this evening`
  3. **Auto-Detection & Evening Daypart**:
     - Notice the **Hindi** language chip is automatically detected from problem text and highlighted with a **`⚡ detected`** badge.
     - Select **Time of Day: Evening** (evening daypart must be chosen to evaluate evening availability slots).
     - Press **Ctrl+Enter** (or click **"Find my best match"**).
  4. **Expected Real Top 3 Results (Deterministic)**:
     - **#1 Priya Sharma (`usr_pixelpriya`)** — **100% Match** (`★ BEST MATCH`)
       - `✓ React` (topic match)
       - `✓ Hindi` (detected spoken language matched)
       - `✓ Mon slot` (evening availability matched)
       - `✓ Online now` (active in system)
       - `✓ Level 3 Mentor` (mentor level 3 >= learner level 1)
       - `✓ 4.8 stars (11)` (top rating)
     - **#2 Rahul Nair (`usr_devdynamo`)** — **93% Match**
       - `✓ React`, `✓ Hindi`, `✓ Mon slot`, `✓ Online now`, `✓ Level 1 Newcomer`, `✓ 5.0 stars (1)`
     - **#3 Rohan Das (`usr_shadersorcerer`)** — **75% Match**
       - `✓ React`, `✕ Hindi` (does not speak Hindi), `✓ Tue slot`, `✓ Online now`, `✓ Level 1 Newcomer`, `✕ No ratings yet`
  5. Click **"How is this scored?"** expander on Priya's card:
     - Shows real-time mathematical breakdown: Topic (45/45), Language (15/15), Availability (15/15), Online (10/10), Level (10/10), Rating (5/5) = 100/100.
  6. Click **"Request Session"** on Priya’s card:
     - Notice **BookModal opens pre-filled**: Topic is `React`, problem description is pre-filled, and Priya's suggested evening slot is automatically selected!

> [!NOTE]
> Ensure **"Reset Demo"** (`npm run demo:reset` or in-app navbar button) has been executed prior to starting the walkthrough so seed balances, slots, and ratings match these exact scores.

### Phase 2: Instant Booking & Credit Reservation (1:10 – 1:50)
- **Talking Points**:
  - *"To prevent double-spending without locking funds prematurely, SkillSwap computes available credits dynamically: Total Balance minus Active Reservations. Tanvi has 5 credits, enough for exactly 1 session."*
- **Actions**:
  1. **Window 1 (Tanvi)**: Click **"Book Session"** on Priya’s card.
  2. Select slot `Mon 14:00-18:00`. Problem note: *"Help debugging infinite re-render in useEffect"*. Click **"Confirm Request"**.
  3. **WOW Moment 1 (Instant Socket Notification)**:
     - Notice **Window 2 (Priya)** instantly receives an animated toast: *"Tanvi Deshmukh requested a React session"* and the Bookings tab badge increments to `1` without any page refresh!
  4. **Window 2 (Priya)**: Navigate to **Bookings** (`/bookings`). Click **"Accept"**.
  5. **Window 1 (Tanvi)**: Instantly sees toast *"Priya Sharma accepted your React session!"* and status changes to `Accepted` with a glowing **"Join Room"** button.

### Phase 3: Collaborative Room & Live CRDT Code Sync (1:30 – 2:45)
- **Talking Points**:
  - *"When entering the room, an authenticated Yjs WebSocket room initializes with deterministic operational CRDT replication. Not naive socket broadcasts—real Conflict-free Replicated Data Types."*
- **Actions**:
  1. **Window 1 (Tanvi)**: Click **"Join Room"**.
  2. **Window 2 (Priya)**: Click **"Join Room"**.
  3. Both windows now show the **SkillSwap Pair Room**:
     - Connected avatars with presence rings.
     - Real-time chat side drawer.
     - Monaco-powered code editor with syntax highlighting and multi-cursor sync.
  4. **WOW Moment 2 (Live Concurrent Collaboration)**:
     - In **Window 1 (Tanvi)**, type: `function solveRenderLoop() {`
     - In **Window 2 (Priya)**, select the language `TypeScript` and add: `  const [count, setCount] = useState(0);`
     - Observe concurrent keystrokes, remote cursor indicators with peer names, and sub-10ms sync latency.
     - Send a quick chat message from Priya: *"Found the missing dependency array!"*. It appears instantly on Tanvi's screen.
  5. **OPTIONAL 30-Second Voice Step ("Voice in the Room")**:
     - **Talking Points**: *"For real-time voice guidance, peers can jump into a 1:1 audio call right inside the room—peer-to-peer WebRTC, zero audio recording or storage, with headphones recommended."*
     - **Click Path**:
       1. In **Window 1 (Tanvi)**: Click **"🎙️ Join voice"** -> Allow microphone access.
       2. In **Window 2 (Priya)**: Notice Priya's header chip now shows a live mic icon `🎙️` and voice presence badge lights up. Click **"🎙️ Join voice"** -> Allow microphone.
       3. Both windows enter **"Connected"** state: speaking rings and live audio meters pulse when speaking. Demonstrate **Mute / Unmute** and **Leave Voice**.
     - **FALLBACK LINE**: *If microphone permission is blocked or voice fails, calmly state: "Voice requires microphone access, but text chat and the live Monaco editor remain 100% operational." Move smoothly to Phase 4.*

### Phase 4: Atomic Settlement, Session Notes & Rating Bonus (2:45 – 3:30)
- **Talking Points**:
  - *"When the session concludes, settlement is atomic and immutable. In a single ACID transaction, Tanvi's session_spend (-5) and Priya's session_earn (+5) are committed, and the room document is archived."*
- **Actions**:
  1. **Window 2 (Priya)**: Click **"End Session"** -> confirm modal.
  2. Both windows receive instant socket redirection and settlement summary modal.
  3. In **Window 1 (Tanvi)**: Rating modal prompts: *"How helpful was Priya?"*.
     - Select **5 Stars** ⭐⭐⭐⭐⭐.
     - Note: *"Brilliant mentor, resolved my re-render in minutes!"*. Click **"Submit Review"**.
  4. **WOW Moment 3 (Dynamic Bonus Minting)**:
     - Tanvi’s profile reflects balance `0` (spent 5).
     - Priya’s profile reflects balance `71` (65 starting + 5 earned + 1 bonus minted for 5★ review!).
     - Session code snapshot is safely preserved in Session Notes (`/notes`).

### Phase 5: Complete Ledger Transparency & 1-Click Reset (3:30 – 4:00)
- **Talking Points**:
  - *"SkillSwap maintains mathematical fairness through our real-time double-entry audit engine."*
- **Actions**:
  1. Navigate to **Audit** (`/audit`).
  2. Show the **System Audit Report**:
     - Total Minted = Total Circulating (`CONSERVED`).
     - Zero broken invariant checks.
     - Every single credit delta is backed by a verified transaction kind (`grant`, `session_spend`, `session_earn`, `bonus`).
  3. Click **Leaderboard** (`/leaderboard`):
     - Priya is #1 on the podium with 12 completed sessions and 71 credits.
  4. **WOW Moment 4 (Instant Demo Reset)**:
     - Click **"🔄 Reset Demo"** in top bar -> Confirm.
     - Both client windows instantly reset to the deterministic seed, display toast *"Demo data was reset"*, and return to clean initial state.

---

## 🚨 Fallback Plan (Edge-Case Mitigation)

| Scenario | Immediate Action |
| :--- | :--- |
| **Yjs WebSocket fails to upgrade** (e.g., restrictive corporate proxy) | Refresh the page. If WS is blocked by port restriction, demonstrate the Chat panel and Bookings settlement which operate over HTTP + Socket.io polling fallback. |
| **Socket.io connection drops** | The client automatically reconnects. Status dot in top bar indicates connection status. Clicking manual refresh refetches fresh state from SQLite API. |
| **Accidental navigation away from Room** | Return to `/bookings`; active booking retains `in_progress` state with active **"Re-join Room"** link. |
| **Server process terminates unexpectedly** | Re-run `npm run demo:prod`. The deterministic seed loads in under 200ms with full seed integrity intact. |

---

## 💡 12 Likely Judge Questions & Concrete Answers

### 1. How do you prevent double-spending if a learner attempts multiple bookings?
**Answer**: Through dynamic credit reservation in [`server/src/ledger.js`](file:///f:/HackathonCodeAsap/server/src/ledger.js). Available credits are defined as:
$$\text{Available} = \text{Total Balance} - \sum \text{Cost of (accepted + in\_progress bookings)}$$
Before any new booking is inserted, the server checks if `availableCredits >= 5`. If a learner with 5 credits has an active accepted booking, subsequent booking requests reject immediately with HTTP 402 Insufficient Available Credits (proven in `bookings.test.js` Case 4 & `ledger.test.js` Case 4).

### 2. Why use Yjs CRDT over plain Socket.io broadcasting for the code editor?
**Answer**: Socket.io broadcasting sends raw strings or diffs that cause cursor jumping, lost characters, and race conditions under network latency. Yjs is an operational CRDT (Conflict-free Replicated Data Type) that mathematically guarantees eventual convergence of concurrent keystrokes without an authoritative central lock (proven in `room.test.js` Case 3).

### 3. What happens to rooms if the server restarts mid-session?
**Answer**: Active booking status and participants are persisted in SQLite (`bookings.status = 'in_progress'`). Upon restart, clients re-join `/room/:id`. If the session had completed, the final editor code was already persisted to the `session_notes` table (`server/src/yjs.js#snapshotAndCloseRoom`). In-memory volatile docs are kept lightweight during active editing and persisted to relational storage on completion.

### 4. How are mentor levels calculated?
**Answer**: Levels are deterministically computed based on verified completed sessions as mentor:
- **Level 1 (Newcomer)**: 0 – 2 completed sessions
- **Level 2 (Helper)**: 3 – 9 completed sessions
- **Level 3 (Mentor)**: 10+ completed sessions
Learners can only book mentors who have equal or higher level (`mentor.level >= learner.level`), ensuring quality guidance (enforced in `server/src/bookings.js#canBookMentor`).

### 5. How are credits minted and conserved?
**Answer**: Credits are strictly controlled. At seed, 14 users receive a 10-credit welcome grant (140 credits minted). Standard sessions cost 5 credits: 5 credits are deducted from learner (`session_spend`) and 5 credits credited to mentor (`session_earn`), resulting in zero net change ($\Delta = 0$). The only new minting event is a 1-credit system bonus awarded for exceptional 5-star ratings (`kind = 'bonus'`). Every credit is accounted for in `GET /api/audit` (proven in `integrity.test.js`).

### 6. Why is there a user switcher instead of traditional email/password login?
**Answer**: Hackathon judges need to experience both sides of the marketplace (learner and mentor) within seconds without registering fake emails, checking OTPs, or logging in and out. The switcher stores active user identity in `sessionStorage`, allowing side-by-side evaluation across two browser windows.

### 7. How does the architecture handle concurrent settlement attempts?
**Answer**: SQLite's write serialization combined with an atomic SQL transaction and a unique partial index:
```sql
CREATE UNIQUE INDEX idx_ledger_booking_kind ON ledger_entries(booking_id, kind) WHERE booking_id IS NOT NULL;
```
If 10 concurrent HTTP complete requests arrive simultaneously, exactly one commits both ledger rows; the remaining 9 return `alreadySettled = true` and write 0 duplicate rows (proven in `ledger.test.js` Case 7).

### 8. Is the ledger append-only and immutable?
**Answer**: Yes. No ledger row is ever updated or deleted (`UPDATE` and `DELETE` on `ledger_entries` do not exist in the codebase). User balances are computed as `SUM(delta)`. Chronological running balances are reconstructed deterministically via SQLite window functions.

### 9. What is real vs. simulated in this application?
**Answer**:
- **100% Real**: SQLite database, WebSocket connections, Yjs CRDT real-time sync, Socket.io presence & toasts, double-entry ledger settlement, credit conservation audit, Monaco code editor.
- **Simulated / Sampled**: Seed data history of 25 completed sessions to showcase realistic leaderboard rankings, level progressions, and audit logs on first boot.

### 10. Why SQLite instead of PostgreSQL or MongoDB?
**Answer**: Zero external daemon dependencies. The entire system boots instantly from a fresh clone with `npm run demo:prod` on any developer laptop (Windows, macOS, Linux). We utilize WAL mode (`PRAGMA journal_mode = WAL`) and native node:sqlite fallback for 100% offline reliability.

### 11. How is room access control enforced?
**Answer**: At the HTTP WebSocket upgrade boundary (`server/src/yjs.js`). When a client initiates a WebSocket handshake to `/yjs/{roomId}?userId={id}`, the server queries SQLite: if the booking does not exist, status is not `accepted`/`in_progress`, or the user is not a participant, the socket handshake is destroyed immediately with HTTP 401/403/404 (proven in `prod.test.js` and `room.test.js`).

### 12. Does the client support LAN access from other laptops or phones?
**Answer**: Yes. The server binds to `0.0.0.0` and prints local WiFi LAN URLs (`http://192.168.x.x:4000`). All client API, Socket.io, and Yjs connections use dynamic relative origin hostnames, avoiding hardcoded `localhost` references.

### 13. Why rule-based and not an LLM for Smart Match?
**Answer**:
1. **Zero External API Keys & Costs**: Runs 100% offline with zero cost per query, zero network hops, and zero API rate limits during high-pressure judge evaluation.
2. **Deterministic & Unit-Testable**: The exact same query always yields the exact same ranked results and byte-identical scoring breakdown (tested in `server/tests/match.test.js`).
3. **No Hallucinations**: Mentors are strictly matched against skills and availability slots that genuinely exist in SQLite; an LLM could hallucinate non-existent skills, time slots, or mentor identities.
4. **Sub-millisecond Latency**: Pure JavaScript string search and scoring executes in under 2ms, providing instant UI feedback without spinning loading wheels.

### 14. How does the Smart Match scoring algorithm calculate the final match percentage?
**Answer**: The engine computes scores across 6 distinct components defined in `server/src/config.js` summing to 100 points:
- **Topic (45 pts)**: Ratio of detected/signaled topics the mentor possesses ($45 \times \frac{\text{matched}}{\text{wanted}}$).
- **Language (15 pts)**: Full 15 points if the mentor shares at least one preferred learner language.
- **Availability (15 pts)**: Full 15 points if any mentor slot overlaps the preferred day and/or daypart.
- **Online Status (10 pts)**: Full 10 points if the mentor is currently online.
- **Mentor Level (10 pts)**: 10 points if `mentor.level > learner.level`, 5 points if equal, 0 if lower.
- **Rating (5 pts)**: $5 \times \frac{\text{rating\_avg}}{5}$ if $\ge 3$ ratings; 2.5 pts if fewer; 0 if unrated.
Unsignaled preferences (e.g. no time window provided) are omitted from the denominator:
$$\text{Score} = \text{round}\left(100 \times \frac{\text{Points Earned}}{\text{Max Signaled Points}}\right)$$
Deterministic tie-breaking orders results by: (1) Level eligibility (mentor $\ge$ learner), (2) match_score DESC, (3) online DESC, (4) rating_avg DESC, (5) sessions DESC, (6) name ASC.

### 15. How would you extend Smart Match in a production environment?
**Answer**:
1. **Learner-Mentor Interaction History**: Apply an exponential decay penalty for mentors the learner recently paired with to encourage diverse peer connections.
2. **Timezone Offset Computations**: Convert availability slots dynamically across UTC offsets for distributed remote developers.
3. **Skill Affinity Ontology**: Add a lightweight synonym/graph layer where related skills (e.g., `Next.js` and `React`, or `PostgreSQL` and `SQL`) share partial credit.
4. **Learner Credit Sensitivity**: Factor in session duration options (e.g., 15-minute quick debugging vs. 45-minute deep dives).


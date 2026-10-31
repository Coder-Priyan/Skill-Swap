# SkillSwap

> Real-time peer-to-peer micro-mentorship & collaborative pairing cockpit powered by double-entry credit escrow, CRDT code synchronization, and encrypted WebRTC audio.

**Problem Statement 05:** Micro-Mentorship & Skill Exchange Hub  
**Team:** Code ASAP  
**Members:**
- `Sandeep Singh Mehta` (`Sandeep123-sys`)
- `Abhishek Dhapola` (`abdhapola20`)
- `Aditya Mehra` (`ADITYAMEHRA247`)
- `Deepak Kumar Kabi` (`deepakkabi`)
- `Priyanshu Dangi` (`Coder-Priyan`)

---

## Problem Statement

Traditional developer mentorship platforms (e.g., ADPList, Topmate, Superpeer) suffer from crippling structural friction:
1. **Passive & Disconnected:** Sessions take place over awkward third-party video calls where mentors talk *at* learners rather than pairing inside a shared, synchronized development environment.
2. **High Friction Scheduling & Flakes:** Rigid multi-day calendar bookings lead to high cancellation rates and zero real-time accountability.
3. **Flawed Incentives & The "Cold-Start" Deficit:** High financial costs exclude aspiring engineers. Conversely, free community Discord servers suffer from no verified quality filter, free-rider burnout, and no mechanism for beginners to earn guidance if they lack immediate expertise to teach.

---

## Solution

SkillSwap transforms micro-mentorship into an interactive, high-density pair programming exchange. Developers connect for focused, 30-minute hands-on problem-solving sessions inside an integrated browser IDE with zero external tooling required.

- **Double-Entry Escrow Ledger:** 5 credits are locked in cryptographic-grade escrow upon booking and settled atomically upon session completion.
- **Real-Time CRDT Code Synchronization:** Powered by Yjs and Microsoft Monaco Editor for collision-free multi-cursor pair programming.
- **1:1 Peer-to-Peer Encrypted Voice:** Native browser WebRTC audio channel negotiated via Socket.io signaling.
- **Multi-Track Earning Economy:** Learners with depleted credits can replenish their ledger through algorithmic **Daily Bug Hunt** challenges and verified **Community Cheat-Sheets** contributions.
- **Deterministic Peer Matching:** Multi-parameter ranking algorithm scoring topic relevance, language compatibility, availability windows, and mentor reputation.

---

## Features

### 1. Collaborative Pairing Studio (`/room/:bookingId`)
- **VS Code Monaco Engine:** Full code editor experience in the browser with syntax highlighting (JavaScript, TypeScript, Python, C++, HTML, CSS, SQL), line numbers, and minimap.
- **Yjs CRDT Engine:** Conflict-free Replicated Data Type engine over binary WebSocket streams (`/yjs`), guaranteeing zero typing overwrite race conditions.
- **Encrypted WebRTC Audio:** 1:1 low-latency voice calling directly in-browser. No Zoom, Google Meet, or Discord links required.
- **Persistent Session Artifacts:** Real-time dual-cursor notes and live code automatically freeze into an immutable read-only snapshot upon session completion (`/sessions/:bookingId`).

### 2. Double-Entry Escrow & Financial Guardrails (`/audit`)
- **Atomic Escrow Locking:** Initiating a session locks 5 credits in escrow (`status: 'escrow'`). Credits can neither be double-spent nor vanish.
- **Zero Fractional Drift:** Pure integer math ensures the system-wide credit supply always satisfies:
  $$\sum \text{User Balances} + \text{Active Escrows} = \text{Initial Supply} + \sum \text{Verified Incentives}$$
- **Full Transaction Ledger:** Real-time audit trail recording timestamped transfers, transaction hashes, sender/receiver references, and verifiable integrity checksums.

### 3. Sustainable Earning Economy (`/challenges` & `/community`)
- **Daily Bug Hunt Engine:** 5 daily rotating software debugging challenges (Python, JavaScript, TypeScript, Memory Leaks, Async Pitfalls). Verified automated grading credits +3 to +5 credits directly to the user's ledger.
- **Community Cheat-Sheet Repository:** High-yield reference guides with instant copy/download controls. Publishing community-verified technical guides rewards +2 credits.
- **Streak & Activity Heatmap:** GitHub-style 10-week telemetry tracking daily activity, current streak, and longest streaks on developer profiles.

### 4. Deterministic Smart Matching (`/`)
- **Deterministic Component Weights** (Strictly sums to 100, zero external LLM dependencies):
  - **Topic Overlap (45%)**: $45 \times \frac{\text{matched}}{\text{wanted}}$ based on word-boundary keyword dictionary.
  - **Language Compatibility (15%)**: Full 15 pts if sharing $\ge 1$ preferred programming language.
  - **Availability Overlap (15%)**: Full 15 pts if overlapping day/daypart with instant slot reservation.
  - **Online Status (10%)**: Full 10 pts for active online mentors ready to pair immediately.
  - **Mentor Level (10%)**: 10 pts if mentor level > learner level, 5 pts if equal, 0 if lower.
  - **Reputation Rating (5%)**: $5 \times \frac{\text{rating\_avg}}{5.0}$ (for $\ge 3$ verified ratings).
- **Score Normalization**:
  $$\text{Score} = \text{round}\left(100 \times \frac{\sum \text{Points Earned}}{\sum \text{Max Signaled Points}}\right)$$
- **Studio Spotlight Terminal:** Raycast/Linear-inspired inspection pane with live status telemetry, technical credentials, hourly rate verification, and one-click slot reservation.

### 5. Level Progression & Reputation
- **Three-Tier Progression System:** Level 1 Associate &rarr; Level 2 Peer Guide &rarr; Level 3 Senior Mentor.
- **Mutual Post-Session Feedback:** Both participants submit structured ratings and technical tags, feeding directly into Bayesian rating averages and leaderboard positioning (`/leaderboard`).

---

## Tech Stack

Exact package versions from [client/package.json](client/package.json) and [server/package.json](server/package.json):

| Technology | Layer | Version | Architecture Role |
| :--- | :--- | :--- | :--- |
| **React** | Client | `18.3.1` | Reactive component architecture and single-page view routing |
| **Vite** | Client Bundler | `5.4.11` | Hot module replacement (HMR), tree-shaking, and asset compilation |
| **Monaco Editor** | Client IDE | `0.57.0` | Microsoft VS Code browser editing engine |
| **Yjs** | Client / Server | `13.6.33` | Conflict-Free Replicated Data Type (CRDT) document state engine |
| **Y-Monaco** | Client | `0.1.6` | Real-time binding layer connecting Yjs shared text to Monaco models |
| **Y-WebSocket** | Client / Server | `1.5.4` | Binary WebSocket communication provider for Yjs documents |
| **React Router DOM** | Client | `6.28.0` | Client-side routing (`/`, `/bookings`, `/room/:id`, `/challenges`, etc.) |
| **Node.js + Express** | Server | `4.21.2` | REST API routing, session management, and ledger transaction orchestration |
| **Better-SQLite3** | Database | `11.8.1` | Ultra-fast embedded synchronous SQL database with WAL mode and ACID transactions |
| **Socket.io** | Real-time WebSockets | `4.8.4` | Live presence, session negotiation alerts, and WebRTC SDP signaling |
| **WebRTC** | Voice | *Native API* | Browser-native 1:1 peer-to-peer encrypted audio stream |
| **Concurrently** | Monorepo Tooling | `^9.1.2` | Simultaneous client and server process orchestrator |

---

## How It Works: High-Throughput Pairing Flow

```
[ Learner (Browser) ]                  [ SkillSwap Server (Port 4000) ]                 [ Mentor (Browser) ]
         │                                              │                                              │
         ├──── 1. POST /api/bookings ──────────────────>│                                              │
         │     (5 Credits Locked into Escrow)           │──── 2. Socket.io ('booking:new') ───────────>│
         │                                              │     (Instant notification banner)            │
         │                                              │                                              │
         │                                              │<─── 3. POST /api/bookings/:id/accept ────────┤
         │<─── 4. Socket.io ('booking:accepted') ───────┤                                              │
         │                                              │                                              │
         │ ══════════════════════════ [ JOIN LIVE PAIRING ROOM #101 ] ════════════════════════════════ │
         │                                              │                                              │
         │ <══════════ 5. Monaco Editor Sync (via Y-WebSocket CRDT on /yjs) ═════════════════════════> │
         │ <══════════ 6. Room Chat & Live Telemetry (via Socket.io channel) ════════════════════════> │
         │ <══════════ 7. WebRTC Audio Stream (Direct P2P Encrypted Voice) ══════════════════════════> │
         │                                              │                                              │
         │ ══════════════════════════ [ END SESSION & ESCROW SETTLEMENT ] ════════════════════════════ │
         │                                              │                                              │
         ├──── 8. POST /api/bookings/:id/complete ─────>│                                              │
         │                                              │ ──> Atomic SQLite Transaction:               │
         │                                              │     • Release 5 cr from escrow to Mentor     │
         │                                              │     • Append double-entry ledger entry       │
         │                                              │     • Freeze Monaco doc to session notes     │
         │                                              │                                              │
         │<─── 9. Session Settled Event ────────────────┴──── 9. Session Settled Event ───────────────>│
         │                                                                                             │
         │ ══════════════════════════ [ MUTUAL POST-SESSION RATINGS ] ════════════════════════════════ │
         │                                                                                             │
         ├──── 10. POST /api/bookings/:id/rate ────────>│                                              │
         │         (5-Star Bonus: +1 platform bonus)    │                                              │
```

---

## Double-Entry Ledger Mechanics

SkillSwap implements strict accounting principles to eliminate phantom credits and unauthorized inflation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DOUBLE-ENTRY LEDGER AUDIT                         │
├────────────────────────────────────────────────────────────────────────┤
│ Total Circulating Credits    = Sum of all active user wallets          │
│ In-Flight Escrow Credits     = Sum of all pending/active session costs │
│ Minted System Incentives     = Bug Hunt rewards + Sheet rewards        │
├────────────────────────────────────────────────────────────────────────┤
│ INVARIANT:                                                             │
│ Total Circulating + In-Flight Escrows === Initial Base + Total Rewards │
│ STATUS: VERIFIED (0 discrepancies across all audit checkpoints)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Setup Instructions

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Coder-Priyan/Skill-Swap.git
cd Skill-Swap

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
cd ..
```

### 2. Seed Database
Initialize SQLite database with pre-configured personas, mock sessions, availability slots, and verified ledger transactions:
```bash
npm run seed
```

### 3. Run Development Server
Start both Express backend (Port 4000) and Vite frontend (Port 5173) concurrently:
```bash
npm run dev
```

- **Frontend Client:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:4000](http://localhost:4000)
- **CRDT WebSocket:** `ws://localhost:4000/yjs`
- **API Health Check:** [http://localhost:4000/api/health](http://localhost:4000/api/health)

### 4. Running Over Local WiFi (Two Laptops / Cross-Device Testing)
SkillSwap is engineered for live two-laptop demonstrations. When the server boots, it outputs LAN endpoints:
```bash
# Example server output on startup:
[SkillSwap] Server running at:
   Local:        http://localhost:4000
   On your wifi: http://192.168.1.15:4000
   Health:       http://localhost:4000/api/health
```
1. Open `http://<YOUR_LAN_IP>:5173` on Laptop B.
2. Select **Arjun** on Laptop A and **Priya** on Laptop B using the top-right persona switcher.
3. Book a session, join the pairing room, and test simultaneous real-time code collaboration and P2P voice calling across devices.

---

## Test Suite

SkillSwap comes equipped with a comprehensive automated test suite covering database operations, transaction integrity, socket notifications, and WebRTC negotiation:

```bash
# Run all automated tests
npm run test:all

# Individual test runners:
npm run test:db          # Database connection, schemas, and indexing sanity
npm run test:bookings    # Booking lifecycle, status transitions, and conflicts
npm run test:ledger      # Double-entry invariants and escrow balance deduction
npm run test:sockets     # Real-time WebSocket connection and event dispatching
npm run test:room        # Live room authorization and read-only freeze state
npm run test:match       # Deterministic match ranking engine validation
npm run test:rtc         # WebRTC SDP signaling exchange
npm run test:integrity   # Ledger zero-knowledge and conservation checks
npm run smoke            # Full-stack integration smoke test
```

---

## REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | System heartbeat, uptime, active socket count, and ledger health |
| `/api/peers` | `GET` | Query available mentors with skills, rating, and availability filter |
| `/api/peers/match` | `POST` | Deterministic smart match scoring against challenge text |
| `/api/bookings` | `GET / POST` | List user bookings or create a new booking with escrow lock |
| `/api/bookings/:id/accept` | `POST` | Accept pending session request and notify learner |
| `/api/bookings/:id/complete` | `POST` | Settle session, release escrow credits, and freeze code snapshot |
| `/api/bookings/:id/rate` | `POST` | Submit post-session feedback, rating score, and review tags |
| `/api/challenges` | `GET` | Retrieve daily rotating coding bug challenges |
| `/api/challenges/solve` | `POST` | Submit solution for automated evaluation and credit reward |
| `/api/community` | `GET / POST` | Browse community cheat-sheets or publish a new technical guide |
| `/api/ledger` | `GET` | Fetch double-entry transaction passbook and audit history |
| `/api/leaderboard` | `GET` | Global rankings sorted by reputation, level, and sessions completed |
| `/api/users/profile` | `GET / PUT` | Fetch profile details, activity heatmap, or update bio & skills |

---

## Project Structure

```
Skill-Swap/
├── client/
│   ├── src/
│   │   ├── components/         # BookingCard, PeerCard, VoiceControls, RatingModal, LedgerTable
│   │   ├── pages/
│   │   │   ├── Directory.jsx   # Mentor search, studio terminal, and smart matching
│   │   │   ├── Room.jsx        # Collaborative IDE with Monaco, Yjs CRDT, and WebRTC voice
│   │   │   ├── Bookings.jsx    # Active, pending, and completed session management
│   │   │   ├── Challenges.jsx  # Daily Bug Hunt developer challenges
│   │   │   ├── CommunityNotes.jsx # Community cheat-sheets repository
│   │   │   ├── Leaderboard.jsx # Verified peer rankings and top contributors
│   │   │   ├── Audit.jsx       # Real-time ledger audit and mathematical verification
│   │   │   └── Profile.jsx     # Developer profile, skills, and 10-week activity heatmap
│   │   ├── api.js              # Centralized client API service
│   │   ├── styles.css          # Engineering-grade high-density design system
│   │   └── App.jsx             # SPA router, toast provider, and top navigation bar
│   ├── index.html              # HTML5 entry with metadata and SEO tags
│   └── vite.config.js          # Vite build config with Monaco worker and proxy rules
├── server/
│   ├── src/
│   │   ├── db.js               # Better-SQLite3 connection and schema definitions
│   │   ├── seed.js             # Deterministic database seeder
│   │   ├── index.js            # Express server, Socket.io, and Y-WebSocket binary provider
│   │   └── routes/
│   │       ├── peers.js        # Peer queries and deterministic matching
│   │       ├── bookings.js     # Booking lifecycle and escrow settlements
│   │       ├── challenges.js   # Daily Bug Hunt logic and solution grading
│   │       ├── community.js    # Community cheat-sheets management
│   │       ├── ledger.js       # Double-entry ledger audit endpoints
│   │       └── users.js        # Profiles, levels, and activity heatmaps
│   └── tests/                  # Automated integration and regression test scripts
├── scripts/                    # Production demo runners and smoke test scripts
├── docs/                       # Hackathon demo script and judges evaluation reference
├── package.json                # Root monorepo workspace configuration
└── README.md                   # Project documentation
```

---

## License

Developed by **Team Code ASAP** for Hackathon Round 3. All rights reserved.
# SkillSwap — Micro-Mentorship & Skill Exchange Hub

SkillSwap is an audit-verifiable, peer-to-peer micro-mentorship and live code collaboration platform where developers exchange focused 1-on-1 assistance with experienced peers. Operating on an append-only cryptographic-style credit ledger, users spend platform tokens to receive help and earn tokens by mentoring others.

---

## Architecture Sentence

SkillSwap pairs an Express backend backed by an append-only SQLite double-entry ledger and in-memory Yjs CRDT synchronization with a Vite React client featuring Monaco live code collaboration, real-time Socket.io presence, and public zero-trust audit verification.

---

## Key Features

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

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher
- **Operating System**: Windows (PowerShell compatible), macOS, or Linux

---

## Quick Setup

1. **Install Dependencies**:
   ```powershell
   npm install
   ```

2. **Reset / Seed Database**:
   Wipes and deterministically initializes `server/data/skillswap.db` with 14 users, skills, slots, starting grants (140 platform credits minted), booking histories, and pristine audit conservation:
   ```powershell
   npm run demo:reset
   ```

3. **Start Development Server**:
   Launches both the backend API (port 4000) and the Vite client (port 5173) concurrently:
   ```powershell
   npm run dev
   ```

4. Open your browser at [http://localhost:5173](http://localhost:5173).

> **Important Demo Notice**: Do **NOT** restart the backend server during a live session demo. Collaborative Yjs documents and room chat history live in server memory for the duration of the server process; restarting the server clears active in-memory editor states.

---

## Test Commands

Execute the test suites via plain Node test runners with zero external test framework bloat:

```powershell
# Run individual test suites
npm run test:db        # Database schema, foreign keys & uniqueness constraints
npm run test:bookings  # Booking lifecycle, status flow & credit reservation
npm run test:sockets   # Real-time Socket.io event delivery
npm run test:profile   # User profile data, skills & privacy boundaries
npm run test:room      # Live room entry & participant authorization
npm run test:ledger    # Double-entry settlement, atomicity & concurrency
npm run test:slice7    # Ratings, 5-star bonus minting, audit, leaderboard & notes

# Run all test suites in sequence
npm run test:all
```

All test scripts verify strict error conditions and guarantee an exit code of `1` upon assertion failure.

---

## Demo Walkthrough

Follow this step-by-step click path to demonstrate the entire platform flow:

1. **Open the Application**:
   Navigate to [http://localhost:5173](http://localhost:5173).
   The active user defaults to **Tanvi** (`usr_terminaltinkerer`, balance: 5 credits).

2. **Request a Mentorship Session**:
   - On the **Directory** page, search for **Priya** (`usr_pixelpriya`).
   - Click **"Book Session"** on Priya's card.
   - Enter topic: `"React State Management"`, note: `"Need help with context and reducers"`, pick an available time slot, and click **"Send Request"**.
   - Notice Tanvi's available balance adjusts dynamically to reflect the 5 reserved credits.

3. **Accept the Session as Mentor**:
   - In the top navigation bar, use the **User Switcher** dropdown to switch to **Priya** (`usr_pixelpriya`).
   - Go to the **Bookings** tab. Under **"Requests as Mentor"**, locate Tanvi's request.
   - Click **"Accept"**. The booking moves to **"Accepted & Upcoming"**.

4. **Join the Live Collaboration Room**:
   - Click **"Join Room"** on the accepted booking card.
   - The browser opens `/room/bok_...`.
   - Switch the User Switcher back to **Tanvi** (or open in a second browser window) and click **"Join Room"** from Tanvi's Bookings tab.
   - Notice both participants show as active in the room header presence indicator.

5. **Live Code & Ephemeral Chat**:
   - Select a language (e.g. `javascript`).
   - Type code into the Monaco editor — keystrokes replicate live between both participants via Yjs CRDTs.
   - Send messages in the live in-room chat panel.

6. **End Session & Atomic Settlement**:
   - Either participant clicks the red **"End Session"** button in the top bar.
   - Confirm the end session prompt.
   - The session terminates instantly. The settlement modal pops up:
     - Tanvi (learner): 5 credits transferred (`session_spend`).
     - Priya (mentor): 5 credits earned (`session_earn`).
     - Both balances update live across all open tabs via Socket.io.

7. **Rate 5 Stars & Mint Bonus Credit**:
   - As **Tanvi** (the learner), dismiss the settlement modal by clicking **"Done"**.
   - The **Rating Modal** appears immediately.
   - Select **5 Stars** (notice the glowing badge: `⭐ 5 Stars awards +1 bonus credit to your mentor!`).
   - Enter a brief review comment (e.g. `"Super clear explanation, solved my issue in 20 mins!"`) and click **"Submit Rating"**.
   - A success notification confirms: `⭐ Rating submitted! +1 bonus credit awarded to Priya!`.
   - Priya receives a live toast notification: `Tanvi rated you 5 stars (+1 bonus credit)`.

8. **Verify the Public Audit Page**:
   - Click **Audit** in the navigation bar (`/audit`).
   - The top banner flashes bright green: **"All 7 integrity checks passed — Credits fully conserved"**.
   - Check the **Minted vs. In-Circulation** card:
     - Grants: **140**
     - Bonuses: **1**
     - Total Minted: **141**
     - Total In Circulation: **141**
   - Review the **Recent Settlements** table: see the newest settlement entry with side-by-side matching proof (`-5 / +5`).

9. **Check Leaderboard & Session Notes**:
   - Click **Leaderboard** (`/leaderboard`) to view Priya rising on the podium with her updated session count and average rating.
   - Navigate to **Bookings** → Click **"📝 Notes"** on the completed booking (`/sessions/:bookingId`).
   - View the immutable read-only code archive, click **"Download code"**, and edit the collaborative session summary note.

---

## Future Ideas & Roadmap

- **Interactive Whiteboard**: Real-time canvas sharing for system design architecture diagrams using Excalidraw / HTML5 Canvas.
- **Peer-to-Peer Voice & Video**: WebRTC mesh audio/video calling integrated directly alongside Monaco code editing.
- **Production Authentication**: OAuth 2.0 (GitHub / Google) and session cookie tokens replacing the development User Switcher.
- **Reputation Staking & Escrow**: Configurable escrow release periods for larger project-based mentorship milestones.
- **Community Moderation & Reporting**: Flagging, review disputation, and peer moderation tools.
- **PostgreSQL / Distributed Database Migration**: Migration path from SQLite to PostgreSQL with row-level locking for enterprise multi-node scale.
- **Production Cloud Deployment**: Dockerized container deployment with automated CI/CD pipelines on AWS / GCP.

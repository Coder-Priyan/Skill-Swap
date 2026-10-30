# SkillSwap — Micro-Mentorship & Skill Exchange Hub (INNOVISTA Problem 05)

This file is the single source of truth. Read it fully before every task. If a prompt conflicts with this file, tell me instead of silently choosing.

## 1. What we are building
A web platform where students and early-career developers get short (about 30 min) one-to-one help from more experienced peers. Users **earn credits by helping** and **spend credits to get help**. Sessions happen in a **live shared code editor**. Credits move automatically and fairly when a session ends.

Judging priorities (build in this order of importance):
1. The full journey works end to end: search -> book -> accept -> live room -> end -> credits move.
2. Real-time is REAL: two browser windows show each other's edits instantly.
3. Credits are fair and fully auditable (ledger, no double spend, no double settlement).
4. Demo looks alive (rich sample data) and polished.
5. Bonus features only after 1-4 are solid.

## 2. Stack (fixed, do not change without asking)
- Client: React + Vite, plain CSS with CSS variables (no Tailwind), react-router-dom
- Editor: Monaco (@monaco-editor/react) + Yjs + y-monaco + y-websocket
- Server: Node.js + Express, Socket.io (events/presence), `ws` + y-websocket server utils (editor sync)
- DB: SQLite via better-sqlite3 (single file `server/data/skillswap.db`)
- Single server process serves: REST under `/api`, Socket.io under `/socket.io`, Yjs websocket under `/yjs`. Vite dev server proxies all three to the server (port 4000). Client runs on 5173.
- Pin `y-websocket` to a 1.5.x version on BOTH client and server so `y-websocket/bin/utils` (setupWSConnection) exists. Use matching `yjs`.
- Must work on Windows (PowerShell). No bash-only scripts. Use `concurrently` for `npm run dev` at repo root.
- Node 18+.

## 3. Repo layout
```
/package.json            (root scripts: dev, seed, test:ledger)
/server
  /src
    index.js             (express + socket.io + yjs ws, mounts routes)
    db.js                (connection + schema creation)
    seed.js              (resets DB and inserts sample data)
    ledger.js            (ALL credit logic lives here and only here)
    routes/ (users.js, peers.js, bookings.js, ledger.js, audit.js)
    sockets.js           (socket.io events)
    yjs.js               (yjs websocket setup)
  /data                  (sqlite file, gitignored)
  /tests/ledger.test.js
/client
  /src
    main.jsx, App.jsx, api.js, socket.js, styles.css
    /pages (Directory, Bookings, Room, Profile, Leaderboard, Audit)
    /components (UserSwitcher, PeerCard, BookingCard, LedgerTable, Toasts, ...)
/README.md
```

## 4. Core rules (non-negotiable)
- **Sample data only.** Anonymous/made-up users. No real personal data.
- **Credits never exist as a single mutable number.** Balance = SUM(delta) over `ledger_entries` for that user.
- **Ledger is append-only.** Never UPDATE or DELETE ledger rows. Corrections are new rows.
- **All credit logic is in `server/src/ledger.js`.** Routes call it; they never write ledger rows themselves.
- **Settlement is atomic and once-only.** Both ledger rows (learner debit, mentor credit) and the booking status change happen in ONE database transaction. A UNIQUE constraint on `(booking_id, kind)` makes a second settlement impossible even under double-clicks or retries.
- **No overspending.** Available credits = balance minus the cost of the learner's other bookings that are `accepted` or `in_progress` (reserved, not yet moved). A booking request or accept is rejected if available < cost.
- **Credits move only after the session is completed.** Never at request or accept time.
- **Numbers shown in UI come from the database/API**, never hardcoded.
- No passwords or API keys hardcoded. Use `.env` (with `.env.example`) for anything configurable.

## 5. Constants (in one config file, easy to change)
- `STARTING_CREDITS = 10` (written as a ledger entry kind=`grant`, reason "Welcome bonus")
- `SESSION_COST = 5` credits per session
- Level by number of sessions the user has COMPLETED AS MENTOR: Level 1 = 0-2, Level 2 = 3-9, Level 3 = 10+
- Badge names: "Newcomer" (L1), "Helper" (L2), "Mentor" (L3). Extra badges: "First Session" (1 session as mentor), "First 10 Sessions" (10 as mentor), "Quick Responder" (accepted 3 bookings).

## 6. Data model (SQLite)
```
users(id, name, handle, avatar_color, bio, experience, languages TEXT /*comma list*/, is_online INTEGER, created_at)
user_skills(id, user_id, topic)
availability_slots(id, user_id, day_of_week /*0-6*/, start_hour, end_hour)
bookings(id, learner_id, mentor_id, topic, problem_note, slot_label, status, cost, room_id, requested_at, accepted_at, started_at, completed_at, rating, rating_comment)
   status: requested | accepted | in_progress | completed | declined | cancelled
ledger_entries(id, user_id, delta /*+/- integer*/, kind, reason, booking_id /*nullable*/, created_at)
   kind: grant | session_spend | session_earn | bonus
   UNIQUE(booking_id, kind) WHERE booking_id IS NOT NULL   -- prevents double settlement
session_notes(id, booking_id, summary, final_code, language, saved_at)
```
Indexes on user_skills.topic, bookings.status, ledger_entries.user_id.

## 7. API (REST, JSON, all under /api)
The "current user" is sent in header `X-User-Id` (no login; see User Switcher). Server must validate it exists.
- `GET /users` — list users (summary)
- `GET /users/:id` — profile: balance, available credits, level, badge(s), skills, languages, slots, stats
- `GET /peers?q=&topic=&language=&day=&daypart=&onlineNow=&minLevel=` — directory search/filter. Results include level, skills, languages, availability, rating average. Excludes the current user. Case-insensitive, partial match on q (name, skills, bio).
- `POST /bookings` { mentorId, topic, problemNote, slotId } — creates `requested`. Validates: not self, mentor exists, topic in mentor's skills, problemNote 10-500 chars, slotId belongs to mentor (server stores readable slot_label), learner available credits >= cost, mentor level >= learner level, no duplicate open request.
- `GET /bookings?role=learner|mentor` — current user's bookings
- `POST /bookings/:id/accept` (mentor only) — re-checks learner available credits; sets `accepted`, creates room_id
- `POST /bookings/:id/decline` (mentor only), `POST /bookings/:id/cancel` (learner, only before in_progress)
- `POST /bookings/:id/start` (either participant) — `accepted` -> `in_progress` when first person joins
- `POST /bookings/:id/complete` (either participant) — runs settlement via ledger.js; idempotent (calling twice returns the same result, moves credits once)
- `POST /bookings/:id/rate` (learner) { rating 1-5, comment } — after completion
- `POST /bookings/:id/notes` { summary, finalCode, language }
- `GET /ledger/:userId` — entries newest first + running balance
- `GET /leaderboard` — top helpers by sessions completed as mentor and credits earned
- `GET /audit` — system integrity report (see section 10)

## 8. Real-time
**Socket.io** (client identifies with userId on connect, joins personal room `user:{id}`):
- `booking:requested` -> mentor gets a live toast + bookings list refreshes
- `booking:accepted` / `booking:declined` -> learner gets a live toast
- `room:join` / `room:leave` -> presence list inside a session room (`room:{roomId}`), shows who is online in the room
- `session:ended` -> everyone in the room is notified and shown the settlement summary
- `ledger:updated` -> navbar balance updates live for both users after settlement

**Yjs editor** at `/yjs/{roomId}`:
- One Y.Doc per room. Monaco bound with y-monaco. Show remote cursors/selection colors with user name via Yjs awareness.
- Language dropdown (JavaScript, Python, Java, C++, SQL, HTML/CSS) — synced via a shared Y.Map so both users see the same language.
- Persist the doc server-side in memory for the life of the process (fine for the hackathon).
- A "Run" feature is NOT required.

## 9. Pages / UX
App shell: top bar with logo, nav (Find Peers, My Bookings, Profile, Leaderboard, Audit), **User Switcher** dropdown, live credit balance chip, level badge.
- **User Switcher:** lets the demo person act as any sample user. Store the selected user id in **sessionStorage** (NOT localStorage) so two browser tabs/windows can be two different users at the same time. This is critical for the live demo.
- **Find Peers:** search box + filters (topic chips, language, day, day-part, online now, min level). Results update as the user types (debounce ~250 ms) and as filters change. Peer card: avatar, name, level badge, skills, languages, rating, next free slot, "Book session" button (disabled with a clear reason if not allowed, e.g. "Not enough credits").
- **Book modal:** topic (from mentor's skills), short description of the problem, slot choice, cost shown, learner's available credits shown.
- **My Bookings:** tabs for "I'm learning" / "I'm mentoring". Cards by status with the right action buttons (Accept/Decline, Cancel, Join room, End session, Rate).
- **Session Room:** header with topic, both participants + presence dots, timer, "End session" button. Left/center: Monaco editor. Right: small chat or notes panel (notes optional at first). On end: modal showing "5 credits moved from A to B", new balances.
- **Profile:** balance, available credits, level + progress to next level, badges, stats, skills, languages, and the full **Ledger table** (date, kind, reason, +/- delta, running balance, linked booking).
- **Leaderboard:** top helpers.
- **Audit:** integrity report.
Design: clean modern dark theme, consistent spacing, loading and empty states, friendly error toasts. Must look good at laptop width; reasonable on mobile.

## 10. Audit / integrity (our differentiator)
`GET /audit` and the Audit page must compute from real data:
- Total credits minted (sum of grant + bonus entries) vs total credits in all balances: must be equal.
- Every completed booking has exactly one session_spend and one session_earn with equal and opposite amounts.
- No user has a negative balance.
- No booking has more than one settlement.
Show green/red checks plus the numbers. This is what we show judges to prove the ledger is fair.

## 11. Sample data (seed.js)
- 14 anonymous users (fun handles, e.g. "ByteBender", "PixelPriya"). Mix of experience (student, junior, mid, senior), languages (English, Hindi, Tamil, Telugu, Bengali, Marathi), 2-4 skills each from: React, Node.js, Python, DSA, SQL/Database Design, System Design, WebGL/Three.js, Machine Learning, DevOps/Docker, Flutter, Git, TypeScript, Java, CSS/UI.
- Free slots across the week, some users `is_online=1`.
- Each user gets the starting grant. Also seed a believable history: several completed bookings with matching session_spend/session_earn rows, some ratings, so levels/badges/leaderboard/ledgers look real on first load. Seed must keep the audit all green.
- Make sure there are users at Level 1, 2 and 3, and one demo learner with exactly enough credits to book once (to demo the "not enough credits" block).
- `npm run seed` wipes and recreates everything deterministically.

## 12. Tests
`server/tests/ledger.test.js` run by `npm run test:ledger` (plain node, no heavy framework). Must verify: starting grant, booking blocked when credits insufficient, reserved credits counted, settlement moves exactly SESSION_COST once, second complete call does not move credits again, simultaneous complete calls move credits once, decline/cancel moves nothing, audit stays green.

## 13. Build slices (we build ONE at a time, in order)
1. Setup: repo, DB schema, seed, base API (users/profile), client shell + User Switcher.
2. Peer directory with live search/filters.
3. Booking flow (request/accept/decline/cancel) + socket notifications.
4. Ledger module, profile page, balances, levels, badges.
5. Live session room (Monaco + Yjs + presence).
6. Settlement on session end + live balance updates + tests.
7. Bonus + polish: ratings with bonus credits, leaderboard, session notes, audit page, UI polish.
8. Final QA, README, demo script.

## 14. Definition of done for every slice
- It runs with `npm run dev` from a clean clone (after `npm install` and `npm run seed`).
- No console errors in browser or server.
- Only the current slice's scope was built; nothing from later slices was half-started.
- A review report is returned (format defined in each prompt).

## 15. Decisions log
- **node:sqlite fallback**: When `better-sqlite3` native compilation/prebuilt binaries are unavailable (such as offline environments or machines without C++ build tools), the database engine seamlessly falls back to Node 22's native synchronous `node:sqlite` (`DatabaseSync`) with an identical synchronous interface and `SAVEPOINT`-based nested transaction support.
- **Booking level rule**: `mentor.level >= learner.level` is enforced during booking creation and peer eligibility checking.
- **Booking payload**: `POST /bookings` accepts `{ mentorId, topic, problemNote, slotId }`, and the server resolves and stores the human-readable `slot_label`.
- **Cancelled by column**: A nullable `cancelled_by TEXT` column is tracked on `bookings` to record whether the learner or mentor cancelled an accepted booking.
- **Socket.io event delivery**: Socket events (`booking:requested`, `booking:accepted`, `booking:declined`, `booking:cancelled`, `ledger:updated`) are dispatched immediately after database transactions commit.


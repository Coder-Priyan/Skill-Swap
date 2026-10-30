# SkillSwap — Micro-Mentorship & Skill Exchange Hub

SkillSwap is a peer-to-peer micro-mentorship and live code collaboration platform where developers get focused 1-on-1 assistance from experienced peers. Users earn credits by mentoring others and spend credits to receive help.

## Prerequisites

- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher
- Operating System: Windows (PowerShell compatible), macOS, or Linux

## Quick Setup

1. **Clone and Install Dependencies**:
   ```powershell
   npm install
   ```

2. **Configure Environment** (Optional):
   Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Seed Database**:
   Wipes and seeds the SQLite database deterministically with 14 anonymous users, skills, availability slots, starting grants, completed session histories, ratings, and audit-compliant ledger entries:
   ```powershell
   npm run seed
   ```

4. **Run Application**:
   Starts both the Express server (port 4000) and the Vite client (port 5173) concurrently:
   ```powershell
   npm run dev
   ```

5. Open your browser at [http://localhost:5173](http://localhost:5173).

## Available Scripts

- `npm run dev` — Runs both backend server (port 4000) and client dev server (port 5173) concurrently.
- `npm run seed` — Seeds `server/data/skillswap.db` with deterministic sample data.
- `npm run test:ledger` — Placeholder for ledger unit tests (added in Slice 6).

## Multi-User Testing with User Switcher

The top navigation bar includes a **User Switcher** dropdown. The selected user ID is stored in `sessionStorage` (not `localStorage`), allowing you to open two separate browser tabs or windows and interact as two distinct users simultaneously.

## Architecture

- **Backend**: Express on port 4000 serving REST endpoints under `/api`.
- **Database**: SQLite via `better-sqlite3` located at `server/data/skillswap.db`.
- **Append-Only Ledger**: User balances are never stored as mutable columns; balances are dynamically computed as `SUM(delta)` from `ledger_entries`.
- **Frontend**: React + Vite on port 5173 with client-side routing via `react-router-dom` and native dark theme CSS variables.

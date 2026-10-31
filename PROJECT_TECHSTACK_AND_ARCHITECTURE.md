# 🛠️ SkillSwap: Tech Stack & System Architecture Breakdown

> **Project:** SkillSwap (Problem Statement 05 — Micro-Mentorship & Skill Exchange Hub)  
> **Purpose:** Ek nazar me poora project samajhna — kya-kya use hua hai, kyun use hua hai, aur backend se frontend tak har cheez kaise connect hoti hai.

---

## 🏗️ 1. Complete Tech Stack Overview

| Category | Technology / Library | Version | Iska Asli Kaam (In Plain English) |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | `18.3.1` | Single-page reactive user interface aur reusable UI components. |
| **Build Tool & Bundler** | **Vite** | `5.4.11` | Ultra-fast local dev server, hot-module reload (HMR) aur proxy routing. |
| **Code Editor** | **Monaco Editor** | `0.57.0` | **VS Code ka internal editor** browser ke andar (syntax highlighting, line numbers, shortcuts). |
| **Collaborative Sync** | **Yjs + Y-Monaco** | `13.6.33` | **CRDT Engine** (Google Docs jaisa concurrency engine) jo dono screens pe simultaneous typing ko bina conflict sync karta hai. |
| **Client-Side Routing** | **React Router DOM** | `6.28.0` | Page navigation bina page reload kiye (`/directory`, `/room/:id`, `/leaderboard`, `/audit`, etc.). |
| **Backend Framework** | **Node.js + Express** | `4.21.2` | REST API routes, business logic, authorization headers aur static asset delivery. |
| **Database** | **Better-SQLite3** | `11.8.1` | Super-fast embedded SQL database. File-based, zero setup, ACID compliant. |
| **Real-Time Sockets** | **Socket.io** (Client & Server) | `4.8.4` | Live notifications, room presence (who joined/left), live chat, and WebRTC signaling. |
| **CRDT WebSocket Server**| **ws + y-websocket** | `1.5.4` | Monaco code synchronization ke liye binary WebSocket channel. |
| **Voice / Audio** | **WebRTC (Native APIs)** | Native | Browser-to-browser peer-to-peer encrypted real-time audio channel. |

---

## 🔍 2. Har Ek Tech Stack Kya Karta Hai? (Brief & Easy Explanation)

### 💻 Frontend Side

#### 1. React 18 & React Router DOM
* **Kya karta hai:** Poore web application ka UI manage karta hai.
* **Kyun zaroori hai:** Dashboard, Bookings list, Code Room, aur Leaderboard sab alag-alag tabs hain. React Router bina browser reload kiye fast SPA (Single Page Application) experience deta hai.

#### 2. Monaco Editor (`@monaco-editor/react`)
* **Kya karta hai:** Ye koi sadharan text-area nahi hai, ye **Microsoft VS Code ka real browser engine** hai.
* **Features:** JavaScript, Python, HTML/CSS syntax highlighting, line numbers, code folding, auto-indentation.

#### 3. Yjs & Y-Monaco (`yjs`, `y-monaco`, `y-websocket`)
* **Kya karta hai (The Real Magic):** Jab 2 log ek sath ek hi line pe code type karte hain, toh code overwrite nahi hota.
* **Technique:** Yjs **CRDT (Conflict-free Replicated Data Type)** use karta hai. Jaise Google Docs me multiple cursors ek sath likhte hain, waise hi yahan do log bina kisi lag ke ek sath code kar sakte hain.

#### 4. Socket.io-client
* **Kya karta hai:** Browser aur server ke beech open phone line (WebSocket).
* **Usage:** Jaise hi mentor "Accept" button dabata hai, learner ki screen pe bina refresh instant popup aa jata hai: *"Mentor accepted your booking!"*

---

### ⚙️ Backend Side

#### 5. Node.js + Express.js
* **Kya karta hai:** App ka central nervous system.
* **Key Endpoints:**
  * `/api/peers` $\rightarrow$ Mentors ki list search & filter karne ke liye.
  * `/api/bookings` $\rightarrow$ Session request bhejna, accept karna, complete karna.
  * `/api/ledger` $\rightarrow$ User ka credit balance aur transaction passbook dekhna.
  * `/api/leaderboard` $\rightarrow$ Top helpers aur badges ka ranking table.
  * `/api/audit` $\rightarrow$ System integrity aur transaction safety logs.

#### 6. Better-SQLite3
* **Kya karta hai:** Hamara local relational database.
* **Kyun chuna:** Hackathon me heavy database (PostgreSQL/MongoDB) connect karne me network lag aur connection string ke lafde hote hain. `better-sqlite3` local file me chalta hai aur microsecond speed pe ACID queries run karta hai.
* **Tables:** `users`, `skills`, `bookings`, `ledger_transactions`, `ratings`, `session_notes`.

#### 7. Socket.io Server + `ws` Server
* **Kya karta hai:** Server pe 2 alag WebSocket pipelines chal rahi hain:
  1. **Socket.io (Port 4000):** Chat messages, join/leave room alerts, booking requests, WebRTC SDP offer/answer exchange.
  2. **Y-WebSocket (Path `/yjs`):** Monaco code editor ki binary CRDT streams.

#### 8. WebRTC (Audio / Voice Support)
* **Kya karta hai:** Live room ke andar mentor aur learner bina kisi third-party call (Zoom/Discord) ke browser ke andar direct baatcheet kar sakte hain.

---

## 🔄 3. System Workflow: Data Flow Kahan Se Kahan Jata Hai?

```text
[ Learner (Browser) ]                        [ Backend (Express + SQLite) ]                    [ Mentor (Browser) ]
         |                                                 |                                            |
         | --- 1. POST /api/bookings (Request Session) --->|                                            |
         |                                                 | --- 2. Socket Event ('booking:new') ------>| (Notification Alert)
         |                                                 |                                            |
         |                                                 |<--- 3. POST /api/bookings/:id/accept ------|
         |<--- 4. Socket Event ('booking:accepted') -------|                                            |
         |                                                 |                                            |
         | ========================= [ JOIN LIVE ROOM #101 ] ========================================== |
         |                                                 |                                            |
         | <=========== 5. Monaco Editor Sync (via Y-WebSocket CRDT on /yjs) =========================> |
         | <=========== 6. Room Live Chat & Presence (via Socket.io) =================================> |
         | <=========== 7. Voice Channel (Peer-to-Peer WebRTC Audio) =================================> |
         |                                                 |                                            |
         | ========================= [ END SESSION & SETTLE ] ========================================= |
         |                                                 |                                            |
         | --- 8. POST /api/bookings/:id/complete -------->| (Escrow Released)                          |
         |                                                 | - Deduct 10 Credits from Learner           |
         |                                                 | - Add 10 Credits to Mentor                 |
         |                                                 | - Insert Transaction into Ledger Table     |
         |                                                 |                                            |
         |<--- 9. Settle Event & New Balances Updated ---->|<--- 9. Settle Event & New Balances Updated-|
```

---

## 💡 4. Hamare Project ke 4 Unique Architectural Highlights (Judges ko Batane ke Liye)

1. **Escrow Credit Model:**
   * Jab session book hota hai, credits turant nahi katte; wo **Escrow (Hold)** me chale jate hain.
   * Jab session successfully complete hota hai, tabhi credits release hokar mentor ke wallet me jate hain. (PDF rule: *"Credits move only after session is complete"*).

2. **Immutable Audit Ledger:**
   * Balances ko direct update karne ke bajaye har credit transaction ka ek alag record banta hai: `sender_id`, `receiver_id`, `amount`, `reason`, `timestamp`.

3. **Dual WebSocket Engine:**
   * Text/Events ke liye Socket.io aur high-frequency collaborative code typing ke liye specialized Yjs CRDT WebSocket. Zero conflict and zero lagging!

4. **Multi-User Session Emulation:**
   * Custom `sessionStorage` architecture ke zariye ek hi system ya multiple systems par bina cookie clash ke alag-alag users act kar sakte hain.

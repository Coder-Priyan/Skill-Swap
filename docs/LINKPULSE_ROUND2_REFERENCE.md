# LinkPulse (Round 2 Reference)

> High-velocity link management, telemetry, and guardrails cockpit with a tactile neo-brutalist aesthetic.

**Live demo:** https://linkpulse-url.vercel.app

**Team:** Code ASAP  
**Members:**
- `Sandeep Singh Mehta` (`Sandeep123-sys`)
- `Abhishek Dhapola` (`abdhapola20`)
- `Aditya Mehra` (`ADITYAMEHRA247`)
- `Deepak Kumar Kabi` (`deepakkabi`)
- `Priyanshu Dangi` (`Coder-Priyan`)

---

## Problem Statement

Standard URL shorteners are treated as dumb redirects. They offer no visitor-level access governance, lack enforceable expiration dates or click limits, and fail to prevent destination phishing or malicious link hijacking. Furthermore, traditional shortener analytics either rely on intrusive tracking cookies or fail to distinguish between legitimate human engagement, automated preview crawlers, and QR code scans.

---

## Solution

LinkPulse transforms short URLs into intelligent, rule-governed routing endpoints. Every redirect is evaluated in real time against multi-tier guardrails (activation status, platform-wide domain blocklists, expiration dates, strict click caps, and passcode challenges). With asynchronous non-blocking telemetry, privacy-preserving visitor hashing, server-side vector QR generation, and bulk CSV migration, LinkPulse delivers complete link management with a tactile "playful shell, calm data" design.

---

## Features

- **Custom Slugs & Brand Aliases:** Generate 6-character random slugs or claim custom aliases (3–32 chars) with real-time collision detection.
- **Rule-Governed Guardrails:**
  - *Passcode Protection:* Links gated by a bcrypt-hashed passcode.
  - *Atomic Click Limits:* Hard concurrency-safe caps enforced via atomic SQL increments (`$executeRaw`).
  - *Expiration Timestamps:* Time-bound links automatically route to informative status pages once expired.
  - *Instant Kill-Switch:* One-click deactivation and reactivation without deleting links.
- **Privacy-First Telemetry:**
  - *No Tracking Cookies for Visitors:* visitor metrics use salted SHA-256 hashes of client headers; raw IP addresses are never saved.
  - *Bot & Crawler Exclusion:* Automated user-agents and preview crawlers are filtered out so they never exhaust click caps.
  - *Multi-Period Trends:* Daily traffic graphs across 7-day, 30-day, and all-time windows with peak visit indicators.
  - *Channel Attribution:* Live breakdown between direct web traffic and physical QR code scans.
- **Server-Side QR Code Studio:** On-demand vector SVG and raster PNG export with embedded scan tracking and configurable dimensions.
- **Bulk CSV Importer:** RFC-4180 compliant batch upload (up to 200 links/file) with automatic spreadsheet formula injection defense (`=`, `+`, `-`, `@`).
- **Domain Governance & Safety:** Platform-wide blocklist with wildcard subdomain matching (`evil.com` intercepts `*.evil.com`) and cached evaluations.
- **Campaigns & Categorization:** Organize links with marketing campaigns, color-coded tags, and instant table search.

---

## Tech Stack

Exact package versions from package.json:

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | `^15.2.1` | App Router, Server Components, and Route Handlers |
| **React** | `^19.0.0` | UI component rendering |
| **React DOM** | `^19.0.0` | DOM bindings for React 19 |
| **TypeScript** | `^5.8.2` | Strict end-to-end type safety |
| **Prisma Client** | `^6.4.1` | Type-safe PostgreSQL ORM client |
| **Prisma CLI** | `^6.4.1` | Database migrations and schema management |
| **bcryptjs** | `^3.0.2` | Salted hashing for account passwords and link passcodes |
| **jose** | `^5.9.6` | Lightweight JWT signing and session validation |
| **qrcode** | `^1.5.4` | Server-side vector SVG and raster PNG QR code synthesis |
| **lucide-react** | `^1.16.0` | Neo-brutalist consistent interface iconography |
| **vitest** | `^5.0.5` | Fast automated unit and regression testing |
| **playwright** | `^1.64.1` | Browser automation and visual responsiveness benchmarking |
| **PostgreSQL (Neon)** | Serverless | Scalable relational database with connection pooling and branching |
| **Vercel** | Platform | Serverless hosting and continuous deployment |
| **tsx** | `^4.19.3` | Executable TypeScript environment for seeding |

---

## Live Demo

- **Application URL:** [https://linkpulse-url.vercel.app](https://linkpulse-url.vercel.app)

### Demo Access
- **Demo User:** `alex@techcorp.dev` / `HwDePUsi2a4rG5Jp`
- *Anyone can also register a fresh account directly from the `/register` page.*

---

## How It Works: High-Throughput Redirect Flow

When a visitor requests `GET /[code]`:

```
GET /{code}?src=...
│
├─ 1. Link Not Found?
│   └─ → Redirect to /link-status?code={code}&status=NOT_FOUND
│
├─ 2. Evaluate Guardrail Rules (evaluateLinkRules in link.service.ts)
│   ├─ [Rule 1] isActive === false        → /link-status?status=DISABLED
│   ├─ [Rule 2] isDomainBlocked(destUrl)  → /link-status?status=BLOCKED (checked via in-memory cache)
│   ├─ [Rule 3] expiresAt <= now          → /link-status?status=EXPIRED
│   ├─ [Rule 4] clicksCount >= clickLimit → /link-status?status=LIMIT_REACHED
│   └─ [Rule 5] passwordHash present      → /p/{code}?src=... (Passcode challenge prompt)
│
├─ 3. Bot Check (isBot in user-agent.ts)
│   └─ If crawler/bot: Skip tracking, do not increment limits, return HTTP 307
│
├─ 4. Atomic Counter Update ($executeRaw in link.service.ts)
│   └─ UPDATE "Link" SET "clicksCount" = "clicksCount" + 1 WHERE id = $id AND clicksCount < clickLimit
│      (Guarantees concurrent visits cannot exceed configured limits)
│
├─ 5. Asynchronous Telemetry Logging via Next.js after()
│   └─ Non-blocking execution records device, browser, OS, referrer, and hashed visitor ID
│
└─ 6. HTTP 307 Temporary Redirect
    └─ Cache-Control: private, no-cache, no-store, must-revalidate
```

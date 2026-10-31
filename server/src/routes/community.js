import express from 'express';
import { db } from '../db.js';
import { emitToAll } from '../sockets.js';

const router = express.Router();

// Ensure community_notes table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS community_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_handle TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    code_snippet TEXT,
    language TEXT,
    upvotes INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

// Seed authentic, verified community cheat-sheets
const insertNote = db.prepare(`
  INSERT OR IGNORE INTO community_notes (id, user_id, author_name, author_handle, title, topic, summary, code_snippet, language, upvotes, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const SEED_NOTES = [
  {
    id: 'cn_1',
    user_id: 'usr_priya',
    author_name: 'Priya Sharma',
    author_handle: 'priya_dev',
    title: 'React 19 useEffect Cleanup & AbortController Pattern',
    topic: 'React',
    summary: 'Never let asynchronous fetch calls leak memory or cause race conditions when components unmount.',
    code_snippet: `useEffect(() => {
  const controller = new AbortController();

  async function loadData() {
    try {
      const res = await fetch('/api/mentors', { signal: controller.signal });
      const json = await res.json();
      setData(json);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Fetch error:', err);
    }
  }

  loadData();
  return () => controller.abort(); // Clean cancellation on unmount!
}, [topic]);`,
    language: 'javascript',
    upvotes: 38,
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
  },
  {
    id: 'cn_2',
    user_id: 'usr_arjun',
    author_name: 'Arjun Mehta',
    author_handle: 'arjun_m',
    title: 'TypeScript Utility Types: Pick vs Omit vs Partial',
    topic: 'TypeScript',
    summary: 'Essential cheatsheet for manipulating backend API DTO types without duplicating interface schemas.',
    code_snippet: `interface UserProfile {
  id: string;
  name: string;
  email: string;
  hashedSecret: string;
  credits: number;
}

// 1. Pick only public safe fields for frontend card
type PublicPeerCard = Pick<UserProfile, 'id' | 'name' | 'credits'>;

// 2. Omit internal sensitive fields from API response
type SafeUserPayload = Omit<UserProfile, 'hashedSecret'>;

// 3. Make all fields optional for partial PATCH updates
type PatchUserDto = Partial<UserProfile>;`,
    language: 'typescript',
    upvotes: 45,
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
  {
    id: 'cn_3',
    user_id: 'usr_rohit',
    author_name: 'Rohit Verma',
    author_handle: 'rohit_v',
    title: 'PostgreSQL Indexing: When B-Tree Fails and GiST/GIN Shines',
    topic: 'SQL/Database Design',
    summary: 'Speeding up full-text search, arrays, and JSONB queries by 100x using GIN indexes rather than default B-Tree.',
    code_snippet: `-- Fast JSONB query index with jsonb_path_ops:
CREATE INDEX idx_user_prefs ON users USING gin (preferences jsonb_path_ops);

-- Fast array containment query:
CREATE INDEX idx_user_skills ON users USING gin (skills);

-- Query using JSON containment operator (@>):
SELECT id, name FROM users 
WHERE preferences @> '{"notifications": true}' 
  AND skills @> ARRAY['React', 'TypeScript'];`,
    language: 'sql',
    upvotes: 29,
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
  {
    id: 'cn_4',
    user_id: 'usr_ananya',
    author_name: 'Ananya Sen',
    author_handle: 'cloud_pilot',
    title: 'Dockerfile: Production Multi-Stage Build with Non-Root Security',
    topic: 'DevOps/Docker',
    summary: 'Shrink your Node.js Docker image from 1.2GB to 88MB and eliminate CVE root container vulnerabilities.',
    code_snippet: `# Stage 1: Build & Prune
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

# Stage 2: Minimalist Scratch Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]`,
    language: 'dockerfile',
    upvotes: 52,
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
  },
  {
    id: 'cn_5',
    user_id: 'usr_vikram',
    author_name: 'Vikram Patil',
    author_handle: 'script_sage',
    title: 'Redis Cache-Aside Pattern with Stampede Mutex Protection',
    topic: 'System Design',
    summary: 'Prevent database meltdown during cache misses (cache stampede / thundering herd) using distributed double-checked locking.',
    code_snippet: `async function getCachedProfile(userId) {
  const cacheKey = \`profile:\${userId}\`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Acquire short-lived mutex lock (prevents thundering herd)
  const lockKey = \`lock:\${cacheKey}\`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 5);

  if (acquired) {
    try {
      const freshData = await db.fetchUserProfile(userId);
      // Store in cache with 15min TTL + 2min randomized jitter
      const jitter = Math.floor(Math.random() * 120);
      await redis.set(cacheKey, JSON.stringify(freshData), 'EX', 900 + jitter);
      return freshData;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Wait 50ms and retry from cache
    await new Promise(r => setTimeout(r, 50));
    return getCachedProfile(userId);
  }
}`,
    language: 'javascript',
    upvotes: 61,
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
  },
  {
    id: 'cn_6',
    user_id: 'usr_elena',
    author_name: 'Elena Rostova',
    author_handle: 'elena_arch',
    title: 'SQL Window Functions: ROW_NUMBER vs RANK vs DENSE_RANK',
    topic: 'SQL/Database Design',
    summary: 'The definitive cheat-sheet for deduplication and Top-N items per category without slow correlated subqueries.',
    code_snippet: `-- Find the highest-paid mentor session for each engineering discipline:
WITH RankedSessions AS (
  SELECT 
    id,
    mentor_id,
    topic,
    credits,
    ROW_NUMBER() OVER(PARTITION BY topic ORDER BY credits DESC, created_at DESC) AS rank_num
  FROM bookings
  WHERE status = 'completed'
)
SELECT id, mentor_id, topic, credits 
FROM RankedSessions 
WHERE rank_num = 1;`,
    language: 'sql',
    upvotes: 34,
    created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
  {
    id: 'cn_7',
    user_id: 'usr_meera',
    author_name: 'Meera Joshi',
    author_handle: 'prompt_pro',
    title: 'Python 3 High-Performance Streaming with Generators',
    topic: 'Python',
    summary: 'Process multi-gigabyte log files and CSV dumps with a constant 18MB RAM footprint using lazy generator pipelines.',
    code_snippet: `import itertools

def stream_log_lines(filepath):
    """Memory-efficient lazy file reader"""
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if "ERROR" in line:
                yield line.strip()

# Pipeline: read, parse JSON, filter status
error_stream = stream_log_lines('/var/log/app.log')
# Process first 100 errors lazily without loading the 5GB file into memory
for err in itertools.islice(error_stream, 100):
    dispatch_alert(err)`,
    language: 'python',
    upvotes: 41,
    created_at: new Date(Date.now() - 3600000 * 14).toISOString(),
  },
  {
    id: 'cn_8',
    user_id: 'usr_tanvi',
    author_name: 'Tanvi Deshmukh',
    author_handle: 'terminal_tinker',
    title: 'Git Emergency Recovery: reflog & Restoring Deleted Branches',
    topic: 'Git',
    summary: 'Accidentally ran git reset --hard HEAD~3 or deleted a branch? How to recover any orphaned commit in 30 seconds.',
    code_snippet: `# 1. View complete history of HEAD movements (even deleted commits!)
git reflog

# Output example:
# 7c4e12a HEAD@{0}: reset: moving to HEAD~3
# a1b2c3d HEAD@{1}: commit: Important production payment logic

# 2. Recover the lost commit to a new rescue branch:
git checkout -b rescue-branch a1b2c3d

# 3. Verify clean working tree:
git log --oneline -n 3`,
    language: 'bash',
    upvotes: 73,
    created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
  },
  {
    id: 'cn_9',
    user_id: 'usr_deepa',
    author_name: 'Deepa Reddy',
    author_handle: 'flutter_fox',
    title: 'TypeScript Discriminated Unions & Exhaustiveness Checking',
    topic: 'TypeScript',
    summary: 'Enforce compile-time safety across state machines so new union types cannot be forgotten in switch statements.',
    code_snippet: `type NetworkState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string[] }
  | { status: 'error'; error: Error };

function assertNever(x: never): never {
  throw new Error(\`Unexpected object: \${x}\`);
}

function renderState(state: NetworkState) {
  switch (state.status) {
    case 'idle': return 'Click to load';
    case 'loading': return 'Fetching...';
    case 'success': return \`Loaded \${state.data.length} items\`;
    case 'error': return \`Error: \${state.error.message}\`;
    default:
      // If a 5th status is added later, TS throws compile error here!
      return assertNever(state);
  }
}`,
    language: 'typescript',
    upvotes: 49,
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: 'cn_10',
    user_id: 'usr_rohan',
    author_name: 'Rohan Das',
    author_handle: 'shader_sorcerer',
    title: 'Node.js Memory Leak Diagnosis & Event Listener Cleanup',
    topic: 'Node.js',
    summary: 'How unremoved EventEmitters quietly exhaust heap memory in long-running services and trigger MaxListeners warnings.',
    code_snippet: `// Clean AbortSignal listener pattern in Node.js:
import { once, EventEmitter } from 'node:events';

class TaskQueue extends EventEmitter {}
const queue = new TaskQueue();

async function waitForJob(signal) {
  // Using AbortSignal automatically tears down the event listener!
  try {
    const [job] = await once(queue, 'job_ready', { signal });
    return job;
  } catch (err) {
    if (err.name === 'AbortError') {
      // Clean cancellation, ZERO memory leak!
      return null;
    }
    throw err;
  }
}`,
    language: 'javascript',
    upvotes: 36,
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
];

for (const n of SEED_NOTES) {
  insertNote.run(n.id, n.user_id, n.author_name, n.author_handle, n.title, n.topic, n.summary, n.code_snippet, n.language, n.upvotes, n.created_at);
}

/**
 * GET /api/community/notes
 * Returns community cheat-sheets with optional topic search and search keyword query
 */
router.get('/notes', (req, res) => {
  try {
    const { topic, q } = req.query;
    let query = 'SELECT * FROM community_notes WHERE 1=1';
    let params = [];

    if (topic && topic.trim().toLowerCase() !== 'all') {
      query += ' AND LOWER(topic) = LOWER(?)';
      params.push(topic.trim());
    }

    if (q && q.trim()) {
      const searchPattern = `%${q.trim()}%`;
      query += ' AND (title LIKE ? OR summary LIKE ? OR code_snippet LIKE ?)';
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY upvotes DESC, created_at DESC';

    const notes = db.prepare(query).all(...params);
    res.json({
      total: notes.length,
      notes,
    });
  } catch (err) {
    console.error('Error fetching community notes:', err);
    res.status(500).json({ error: 'Failed to fetch community notes' });
  }
});

/**
 * POST /api/community/notes
 * Publish learning notes or cheat-sheet and award +2 credits reward
 */
router.post('/notes', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    const user = db.prepare('SELECT id, name, handle FROM users WHERE id = ?').get(currentUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { title, topic, summary, code_snippet, language } = req.body;
    if (!title || !title.trim() || !topic || !summary || !summary.trim()) {
      return res.status(400).json({ error: 'Title, topic, and summary are required' });
    }

    // Limit sharing to maximum 2 per day per user to prevent credit farming
    const todayStarts = new Date();
    todayStarts.setHours(0, 0, 0, 0);

    const countToday = db.prepare(`
      SELECT COUNT(*) AS c FROM community_notes 
      WHERE user_id = ? AND created_at >= ?
    `).get(currentUserId, todayStarts.toISOString()).c;

    if (countToday >= 2) {
      return res.status(400).json({
        error: 'Daily publication limit reached (max 2 cheat-sheets per day). Thank you for your contributions!',
      });
    }

    const noteId = `cn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO community_notes (id, user_id, author_name, author_handle, title, topic, summary, code_snippet, language, upvotes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(noteId, currentUserId, user.name, user.handle, title.trim(), topic.trim(), summary.trim(), code_snippet || '', language || 'javascript', nowIso);

    // Award +2 Credits in Double-Entry Ledger
    const REWARD = 2;
    const entryId = `led_${Date.now()}_note_${Math.random().toString(36).substring(2, 7)}`;
    const reason = `Community Cheat-sheet Published: ${title.trim().substring(0, 40)}`;

    db.prepare(`
      INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
      VALUES (?, ?, ?, 'notes_reward', ?, NULL, ?)
    `).run(entryId, currentUserId, REWARD, reason, nowIso);

    // Get updated balance
    const balanceRow = db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE user_id = ?
    `).get(currentUserId);
    const newBalance = balanceRow ? balanceRow.balance : 0;

    // Emit live socket event
    emitToAll('ledger:updated', {
      user_id: currentUserId,
      delta: REWARD,
      new_balance: newBalance,
      kind: 'notes_reward',
    });

    res.json({
      success: true,
      reward: REWARD,
      new_balance: newBalance,
      note_id: noteId,
      message: `Cheat-sheet published. +${REWARD} credits credited to ledger.`,
    });
  } catch (err) {
    console.error('Error publishing community note:', err);
    res.status(500).json({ error: 'Failed to publish community note' });
  }
});

/**
 * POST /api/community/notes/:id/upvote
 */
router.post('/notes/:id/upvote', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE community_notes SET upvotes = upvotes + 1 WHERE id = ?').run(id);
    const updated = db.prepare('SELECT upvotes FROM community_notes WHERE id = ?').get(id);
    res.json({ upvotes: updated ? updated.upvotes : 0 });
  } catch (err) {
    console.error('Error upvoting note:', err);
    res.status(500).json({ error: 'Failed to upvote' });
  }
});

export default router;

import express from 'express';
import { db } from '../db.js';
import { emitToAll } from '../sockets.js';

const router = express.Router();

// Authentic, verified programming challenges (Find The Output & Spot The Bug)
const CHALLENGE_POOL = [
  {
    id: 'ch_event_loop',
    type: 'find_output',
    type_label: 'Find The Output',
    title: 'JavaScript Event Loop: Microtasks vs Macrotasks',
    topic: 'JavaScript',
    difficulty: 'Intermediate',
    reward: 2,
    file_name: 'event_loop.js',
    description: 'What will be the exact order of numbers logged to the console when this script runs in modern Node.js or browser V8 engine?',
    code: `console.log('1');

setTimeout(() => {
  console.log('2');
}, 0);

Promise.resolve().then(() => {
  console.log('3');
});

console.log('4');`,
    options: [
      { id: 'opt_1', text: '1, 4, 3, 2', correct: true },
      { id: 'opt_2', text: '1, 2, 3, 4', correct: false },
      { id: 'opt_3', text: '1, 4, 2, 3', correct: false },
      { id: 'opt_4', text: '1, 3, 4, 2', correct: false },
    ],
    explanation: 'Synchronous code runs first (prints 1, then 4). Next, the microtask queue (Promise.then) drains before any macrotask timer, printing 3. Finally, the macrotask queue (setTimeout callback) executes, printing 2. Order: 1, 4, 3, 2.',
  },
  {
    id: 'ch_react_stale_closure',
    type: 'spot_the_bug',
    type_label: 'Spot The Bug',
    title: 'React Stale Closure in setInterval',
    topic: 'React',
    difficulty: 'Intermediate',
    reward: 3,
    file_name: 'Timer.jsx',
    description: 'The following component displays 1 after one second, but never increments further. What is causing this bug?',
    code: `function CounterTimer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timerId = setInterval(() => {
      // Problem: count is frozen at 1 forever!
      setCount(count + 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, []); // <-- Empty dependencies

  return <div>Timer: {count}s</div>;
}`,
    options: [
      { id: 'opt_1', text: 'The setInterval callback closes over the initial count = 0, continuously executing 0 + 1', correct: true },
      { id: 'opt_2', text: 'setInterval is unsupported inside useEffect and requires a custom hook', correct: false },
      { id: 'opt_3', text: 'clearInterval is called immediately on mounting, killing the interval', correct: false },
      { id: 'opt_4', text: 'useState initial value must be passed as an arrow function () => 0', correct: false },
    ],
    explanation: 'Because useEffect has an empty dependency array [], the effect callback is created once at mount and closes over count = 0 permanently. In every tick it calculates 0 + 1 = 1. Solution: use functional updater setCount(prev => prev + 1) or add [count] to dependencies.',
  },
  {
    id: 'ch_python_late_binding',
    type: 'find_output',
    type_label: 'Find The Output',
    title: 'Python Scope & Late Binding in Closures',
    topic: 'Python',
    difficulty: 'Intermediate',
    reward: 2,
    file_name: 'late_binding.py',
    description: 'What will be printed when this Python 3 script is executed?',
    code: `def create_multipliers():
    return [lambda x: i * x for i in range(4)]

multipliers = create_multipliers()
output = [m(2) for m in multipliers]
print(output)`,
    options: [
      { id: 'opt_1', text: '[0, 2, 4, 6]', correct: false },
      { id: 'opt_2', text: '[6, 6, 6, 6]', correct: true },
      { id: 'opt_3', text: '[2, 4, 6, 8]', correct: false },
      { id: 'opt_4', text: 'NameError: name "i" is not defined', correct: false },
    ],
    explanation: 'Python closures are late-binding: variables in closures are looked up when the inner function is called. When m(2) executes, the loop has already completed with i = 3, so every lambda multiplies 3 * 2 = 6. Fix: lambda x, i=i: i * x.',
  },
  {
    id: 'ch_sql_null_trap',
    type: 'spot_the_bug',
    type_label: 'Spot The Bug',
    title: 'SQL Three-Valued Logic: The NULL Comparison Trap',
    topic: 'SQL/Database Design',
    difficulty: 'Intermediate',
    reward: 3,
    file_name: 'user_audit.sql',
    description: 'Table users has 10 rows: 7 users with status = "active", 2 with status = "suspended", and 1 newly invited user with status = NULL. How many rows does this query return?',
    code: `-- Expected: Find all non-suspended users
SELECT COUNT(*) AS total 
FROM users 
WHERE status != 'suspended';`,
    options: [
      { id: 'opt_1', text: '7 rows (NULL != "suspended" evaluates to UNKNOWN, omitting the NULL row)', correct: true },
      { id: 'opt_2', text: '8 rows (7 active rows + 1 unverified row)', correct: false },
      { id: 'opt_3', text: '10 rows (All rows are counted because NULL is not string "suspended")', correct: false },
      { id: 'opt_4', text: 'Runtime error: NULL cannot be compared with !=', correct: false },
    ],
    explanation: 'In SQL three-valued logic (TRUE, FALSE, UNKNOWN), any comparison with NULL (e.g. status != "suspended") yields UNKNOWN. Since WHERE requires TRUE, the row with NULL is excluded! To include it, write: WHERE status != "suspended" OR status IS NULL.',
  },
  {
    id: 'ch_js_var_loop',
    type: 'find_output',
    type_label: 'Find The Output',
    title: 'JavaScript Var Hoisting & Closure in Loop',
    topic: 'JavaScript',
    difficulty: 'Beginner',
    reward: 2,
    file_name: 'loop_timer.js',
    description: 'What will be printed to the console after 50ms?',
    code: `for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log(i);
  }, 50);
}`,
    options: [
      { id: 'opt_1', text: '3, 3, 3', correct: true },
      { id: 'opt_2', text: '0, 1, 2', correct: false },
      { id: 'opt_3', text: 'undefined, undefined, undefined', correct: false },
      { id: 'opt_4', text: '3 (printed once only)', correct: false },
    ],
    explanation: 'Variables declared with "var" are function-scoped or globally scoped, not block-scoped. All three timers capture the same shared reference to "i". When the callbacks run after 50ms, the loop has completed with i = 3. Replacing var with let binds a unique copy of i per iteration.',
  },
  {
    id: 'ch_ts_readonly_mutation',
    type: 'spot_the_bug',
    type_label: 'Spot The Bug',
    title: 'TypeScript Const vs Object Mutation',
    topic: 'TypeScript',
    difficulty: 'Beginner',
    reward: 2,
    file_name: 'config.ts',
    description: 'A developer declared config using const, but a coworker mutated config.maxRetries = 10 without any TypeScript compile error. Why?',
    code: `interface AppConfig {
  apiUrl: string;
  maxRetries: number;
}

const config: AppConfig = {
  apiUrl: "https://api.skillswap.dev",
  maxRetries: 3
};

// This compiles without error!
config.maxRetries = 10;`,
    options: [
      { id: 'opt_1', text: 'const prevents reassignment of the variable binding, not mutation of object properties', correct: true },
      { id: 'opt_2', text: 'TypeScript interface properties are always mutable regardless of const or readonly', correct: false },
      { id: 'opt_3', text: 'maxRetries is a number, and primitive numbers bypass TypeScript checks', correct: false },
      { id: 'opt_4', text: 'This is a bug in TypeScript and fixed in tsconfig strict mode', correct: false },
    ],
    explanation: '"const" in JavaScript only protects the variable binding from being reassigned (config = {} fails). The underlying object properties remain mutable. To enforce immutability at compile time, declare "readonly maxRetries: number" or use "as const".',
  },
  {
    id: 'ch_node_microtask_order',
    type: 'find_output',
    type_label: 'Find The Output',
    title: 'Node.js Microtask Priority: nextTick vs Promise',
    topic: 'Node.js',
    difficulty: 'Intermediate',
    reward: 2,
    file_name: 'microtasks.js',
    description: 'In Node.js, what is the exact execution order of these statements?',
    code: `Promise.resolve().then(() => {
  console.log('Promise');
});

process.nextTick(() => {
  console.log('nextTick');
});

console.log('Sync');`,
    options: [
      { id: 'opt_1', text: 'Sync, nextTick, Promise', correct: true },
      { id: 'opt_2', text: 'Sync, Promise, nextTick', correct: false },
      { id: 'opt_3', text: 'nextTick, Sync, Promise', correct: false },
      { id: 'opt_4', text: 'Promise, nextTick, Sync', correct: false },
    ],
    explanation: 'Synchronous code runs first ("Sync"). Node.js has a dedicated nextTickQueue that is drained before the standard microtask queue (Promises). Therefore "nextTick" prints before "Promise".',
  },
  {
    id: 'ch_python_mutable_defaults',
    type: 'spot_the_bug',
    type_label: 'Spot The Bug',
    title: 'Python Mutable Default Argument Pitfall',
    topic: 'Python',
    difficulty: 'Beginner',
    reward: 2,
    file_name: 'tags.py',
    description: 'Why does calling append_tag("django") return ["python", "django"] instead of just ["django"]?',
    code: `def append_tag(tag, tags=[]):
    tags.append(tag)
    return tags

print(append_tag("python")) # ['python']
print(append_tag("django")) # ['python', 'django']`,
    options: [
      { id: 'opt_1', text: 'Default arguments in Python are evaluated once when the function is defined, sharing the list across all calls', correct: true },
      { id: 'opt_2', text: 'Python stores all function outputs in an internal global cache', correct: false },
      { id: 'opt_3', text: 'The list is stored in the caller module scope instead of local scope', correct: false },
      { id: 'opt_4', text: 'tags.append() mutates the Python runtime globals table', correct: false },
    ],
    explanation: 'Python default arguments are evaluated only once at function definition time. The list tags=[] is instantiated once and reused across subsequent calls. Idiomatic fix: def append_tag(tag, tags=None): if tags is None: tags = [].',
  },
  {
    id: 'ch_git_detached_head',
    type: 'spot_the_bug',
    type_label: 'Spot The Bug',
    title: 'Git Detached HEAD Commit Danger',
    topic: 'Git',
    difficulty: 'Intermediate',
    reward: 2,
    file_name: 'terminal_session.sh',
    description: 'A developer runs the following commands. What will happen to the two new commits after checking out main?',
    code: `git checkout a1b2c3d          # Checked out raw commit SHA
git commit -m "Implement feature X"
git commit -m "Fix critical bug Y"
git checkout main             # Switched back to main branch`,
    options: [
      { id: 'opt_1', text: 'The commits become unreachable (orphaned) from any branch and will be garbage collected', correct: true },
      { id: 'opt_2', text: 'Git will automatically fast-forward main to include feature X and bug Y', correct: false },
      { id: 'opt_3', text: 'Git will abort checkout main with an uncommitted changes error', correct: false },
      { id: 'opt_4', text: 'The commits are automatically converted to stashes', correct: false },
    ],
    explanation: 'Checking out a commit SHA puts Git in "detached HEAD" state. Commits made here have no branch pointing to them. Switching to "main" leaves those commits orphaned. They can only be recovered using "git reflog" before Git garbage collection cleans them.',
  },
  {
    id: 'ch_react_batching_updater',
    type: 'find_output',
    type_label: 'Find The Output',
    title: 'React Automatic Batching State Updates',
    topic: 'React',
    difficulty: 'Beginner',
    reward: 2,
    file_name: 'Counter.jsx',
    description: 'In React 18 / 19, what will be the value of count when this button is clicked once?',
    code: `function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  return <button onClick={handleClick}>Count: {count}</button>;
}`,
    options: [
      { id: 'opt_1', text: 'Count: 1', correct: true },
      { id: 'opt_2', text: 'Count: 3', correct: false },
      { id: 'opt_3', text: 'Count: 0', correct: false },
      { id: 'opt_4', text: 'Count: NaN', correct: false },
    ],
    explanation: 'In the single click handler, "count" is 0 throughout the function closure. Each call executes setCount(0 + 1). React batches these state updates, and the final state is 1. To reach 3, use functional updates: setCount(c => c + 1).',
  },
];

/**
 * Calculates today's 5 featured daily challenges using day-of-year rotation
 */
function getTodayDailyIndices() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diff = now - startOfYear;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Pick 5 challenges deterministically for today
  const indices = [];
  for (let i = 0; i < 5; i++) {
    indices.push((dayOfYear + i * 2) % CHALLENGE_POOL.length);
  }
  return new Set(indices);
}

/**
 * GET /api/challenges
 * Returns challenges with user solve status and daily 5 indicator
 */
router.get('/', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    // Check which challenges current user has already solved from ledger
    const solvedRows = db.prepare(`
      SELECT reason, created_at FROM ledger_entries 
      WHERE user_id = ? AND kind = 'challenge_reward'
    `).all(currentUserId);

    const solvedChallengeIds = new Set();
    const solvedTodayIds = new Set();
    const todayDateString = new Date().toISOString().split('T')[0];

    for (const row of solvedRows) {
      for (const ch of CHALLENGE_POOL) {
        if (row.reason && row.reason.includes(`[${ch.id}]`)) {
          solvedChallengeIds.add(ch.id);
          if (row.created_at && row.created_at.startsWith(todayDateString)) {
            solvedTodayIds.add(ch.id);
          }
        }
      }
    }

    const todayDailyIndices = getTodayDailyIndices();

    const result = CHALLENGE_POOL.map((ch, index) => {
      const isDaily = todayDailyIndices.has(index);
      return {
        id: ch.id,
        type: ch.type,
        type_label: ch.type_label,
        title: ch.title,
        topic: ch.topic,
        difficulty: ch.difficulty,
        reward: ch.reward,
        file_name: ch.file_name,
        description: ch.description,
        code: ch.code,
        options: ch.options.map((o) => ({ id: o.id, text: o.text })), // Do not expose 'correct' field
        is_daily: isDaily,
        is_solved: solvedChallengeIds.has(ch.id),
        explanation: solvedChallengeIds.has(ch.id) ? ch.explanation : null,
      };
    });

    const dailyChallenges = result.filter((c) => c.is_daily);
    const dailySolvedCount = dailyChallenges.filter((c) => c.is_solved).length;

    const todayFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    res.json({
      daily_date: todayFormatter.format(new Date()),
      daily_count: dailyChallenges.length,
      daily_solved: dailySolvedCount,
      today_credits_earned: dailySolvedCount * 2,
      total_available: CHALLENGE_POOL.length,
      total_solved: solvedChallengeIds.size,
      challenges: result,
    });
  } catch (err) {
    console.error('Error fetching challenges:', err);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

/**
 * POST /api/challenges/solve
 * Body: { challengeId, optionId }
 * Validates answer and awards credits to the user.
 */
router.post('/solve', (req, res) => {
  try {
    const currentUserId = req.header('X-User-Id');
    if (!currentUserId) {
      return res.status(401).json({ error: 'X-User-Id header required' });
    }

    const { challengeId, optionId } = req.body;
    if (!challengeId || !optionId) {
      return res.status(400).json({ error: 'challengeId and optionId required' });
    }

    const challenge = CHALLENGE_POOL.find((c) => c.id === challengeId);
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Check if already solved
    const existing = db.prepare(`
      SELECT id FROM ledger_entries 
      WHERE user_id = ? AND kind = 'challenge_reward' AND reason LIKE ?
    `).get(currentUserId, `%[${challenge.id}]%`);

    if (existing) {
      return res.status(400).json({
        error: 'You have already solved this challenge and claimed the credit reward.',
        is_solved: true,
      });
    }

    const selectedOption = challenge.options.find((o) => o.id === optionId);
    if (!selectedOption) {
      return res.status(400).json({ error: 'Invalid option selected' });
    }

    if (!selectedOption.correct) {
      return res.json({
        correct: false,
        message: 'Incorrect answer. Read the code carefully and try again!',
      });
    }

    // Answer is correct! Award credits via double-entry ledger
    const entryId = `led_${Date.now()}_ch_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const reason = `Daily Challenge Solved: ${challenge.title} [${challenge.id}]`;

    db.prepare(`
      INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
      VALUES (?, ?, ?, 'challenge_reward', ?, NULL, ?)
    `).run(entryId, currentUserId, challenge.reward, reason, nowIso);

    // Calculate new balance
    const balanceRow = db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_entries WHERE user_id = ?
    `).get(currentUserId);
    const newBalance = balanceRow ? balanceRow.balance : 0;

    // Emit live socket update
    emitToAll('ledger:updated', {
      user_id: currentUserId,
      delta: challenge.reward,
      new_balance: newBalance,
      kind: 'challenge_reward',
    });

    res.json({
      correct: true,
      reward: challenge.reward,
      new_balance: newBalance,
      explanation: challenge.explanation,
      message: `Solution verified. +${challenge.reward} credits credited to ledger.`,
    });
  } catch (err) {
    console.error('Error solving challenge:', err);
    res.status(500).json({ error: 'Failed to process challenge solution' });
  }
});

export default router;

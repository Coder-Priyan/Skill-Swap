import { db as defaultDb, initSchemaForDb } from './db.js';
import { STARTING_CREDITS, SESSION_COST } from './config.js';

export function runSeed(targetDb = defaultDb) {
  console.log('🌱 Starting deterministic database seed for SkillSwap...');

  // Ensure tables and indexes are initialized
  initSchemaForDb(targetDb);

  // Wipe all existing data in proper dependency order
  targetDb.exec(`
    DELETE FROM session_notes;
    DELETE FROM ledger_entries;
    DELETE FROM bookings;
    DELETE FROM availability_slots;
    DELETE FROM user_skills;
    DELETE FROM users;
  `);

  console.log('🧹 Cleared existing data.');

  // 14 anonymous users per SPEC.md Section 11
  const users = [
    {
      id: 'usr_pixelpriya',
      name: 'Priya Sharma',
      handle: 'PixelPriya',
      avatar_color: '#ec4899',
      bio: 'Staff Frontend Engineer passionate about React internals, design systems, and responsive CSS architecture.',
      experience: 'senior',
      languages: 'English, Hindi',
      is_online: 1,
      created_at: '2026-01-01T10:00:00.000Z',
      skills: ['React', 'CSS/UI', 'TypeScript', 'System Design'],
      slots: [
        { day_of_week: 1, start_hour: 14, end_hour: 18 },
        { day_of_week: 3, start_hour: 14, end_hour: 18 },
        { day_of_week: 5, start_hour: 10, end_hour: 13 },
      ],
    },
    {
      id: 'usr_bytebender',
      name: 'Arjun Verma',
      handle: 'ByteBender',
      avatar_color: '#3b82f6',
      bio: 'Backend systems engineer focused on high-throughput microservices, caching, and resilient Node.js backends.',
      experience: 'mid',
      languages: 'English, Hindi',
      is_online: 1,
      created_at: '2026-01-02T10:00:00.000Z',
      skills: ['Node.js', 'System Design', 'SQL/Database Design', 'Git'],
      slots: [
        { day_of_week: 2, start_hour: 15, end_hour: 19 },
        { day_of_week: 4, start_hour: 15, end_hour: 19 },
        { day_of_week: 6, start_hour: 11, end_hour: 15 },
      ],
    },
    {
      id: 'usr_algoace',
      name: 'Kavita Iyer',
      handle: 'AlgoAce',
      avatar_color: '#10b981',
      bio: 'Competitive programmer and CS undergrad. Love breaking down trees, graphs, dynamic programming, and clean Java/Python.',
      experience: 'student',
      languages: 'English, Tamil',
      is_online: 0,
      created_at: '2026-01-03T10:00:00.000Z',
      skills: ['DSA', 'Python', 'Java'],
      slots: [
        { day_of_week: 0, start_hour: 10, end_hour: 14 },
        { day_of_week: 2, start_hour: 18, end_hour: 21 },
        { day_of_week: 4, start_hour: 18, end_hour: 21 },
      ],
    },
    {
      id: 'usr_devdynamo',
      name: 'Rahul Nair',
      handle: 'DevDynamo',
      avatar_color: '#f59e0b',
      bio: 'Junior frontend dev eager to help peers get comfortable with modern React hooks, TypeScript, and clean Git workflows.',
      experience: 'junior',
      languages: 'English, Malayalam, Hindi',
      is_online: 1,
      created_at: '2026-01-04T10:00:00.000Z',
      skills: ['React', 'TypeScript', 'Git'],
      slots: [
        { day_of_week: 1, start_hour: 17, end_hour: 20 },
        { day_of_week: 3, start_hour: 17, end_hour: 20 },
      ],
    },
    {
      id: 'usr_cloudpilot',
      name: 'Ananya Sen',
      handle: 'CloudPilot',
      avatar_color: '#8b5cf6',
      bio: 'DevOps & Cloud architect. Big on Dockerizing apps, setting up CI/CD pipelines, and scalable backend infrastructure.',
      experience: 'senior',
      languages: 'English, Bengali',
      is_online: 0,
      created_at: '2026-01-05T10:00:00.000Z',
      skills: ['DevOps/Docker', 'System Design', 'Node.js'],
      slots: [
        { day_of_week: 2, start_hour: 12, end_hour: 16 },
        { day_of_week: 5, start_hour: 14, end_hour: 18 },
      ],
    },
    {
      id: 'usr_datadrifter',
      name: 'Siddharth Rao',
      handle: 'DataDrifter',
      avatar_color: '#06b6d4',
      bio: 'Machine learning practitioner. Excited about data pipelines, PyTorch/scikit-learn models, and SQL query tuning.',
      experience: 'mid',
      languages: 'English, Telugu',
      is_online: 0,
      created_at: '2026-01-06T10:00:00.000Z',
      skills: ['Machine Learning', 'Python', 'SQL/Database Design'],
      slots: [
        { day_of_week: 1, start_hour: 16, end_hour: 19 },
        { day_of_week: 6, start_hour: 10, end_hour: 14 },
      ],
    },
    {
      id: 'usr_scriptsage',
      name: 'Vikram Patil',
      handle: 'ScriptSage',
      avatar_color: '#6366f1',
      bio: 'Fullstack engineer. Loves TypeScript compiler wizardry, clean APIs, and teaching async patterns to learners.',
      experience: 'senior',
      languages: 'English, Marathi',
      is_online: 1,
      created_at: '2026-01-07T10:00:00.000Z',
      skills: ['TypeScript', 'Node.js', 'React'],
      slots: [
        { day_of_week: 3, start_hour: 13, end_hour: 17 },
        { day_of_week: 4, start_hour: 13, end_hour: 17 },
      ],
    },
    {
      id: 'usr_bughunter',
      name: 'Neha Gupta',
      handle: 'BugHunter',
      avatar_color: '#ef4444',
      bio: 'CS sophomore enthusiastic about troubleshooting tricky bugs, Python scripting, and learning DSA fundamentals.',
      experience: 'student',
      languages: 'English, Hindi',
      is_online: 0,
      created_at: '2026-01-08T10:00:00.000Z',
      skills: ['Python', 'Git', 'DSA'],
      slots: [
        { day_of_week: 0, start_hour: 14, end_hour: 17 },
        { day_of_week: 5, start_hour: 15, end_hour: 18 },
      ],
    },
    {
      id: 'usr_shadersorcerer',
      name: 'Rohan Das',
      handle: 'ShaderSorcerer',
      avatar_color: '#14b8a6',
      bio: 'Creative web developer specializing in WebGL, Three.js 3D animations, and eye-candy UI interactions.',
      experience: 'mid',
      languages: 'English, Bengali',
      is_online: 1,
      created_at: '2026-01-09T10:00:00.000Z',
      skills: ['WebGL/Three.js', 'CSS/UI', 'React'],
      slots: [
        { day_of_week: 2, start_hour: 16, end_hour: 20 },
        { day_of_week: 6, start_hour: 14, end_hour: 18 },
      ],
    },
    {
      id: 'usr_flutterfox',
      name: 'Deepa Reddy',
      handle: 'FlutterFox',
      avatar_color: '#f97316',
      bio: 'Mobile app developer crafting cross-platform experiences with Flutter, Dart, and clean mobile architecture.',
      experience: 'junior',
      languages: 'English, Telugu',
      is_online: 0,
      created_at: '2026-01-10T10:00:00.000Z',
      skills: ['Flutter', 'Git', 'TypeScript'],
      slots: [
        { day_of_week: 1, start_hour: 10, end_hour: 13 },
        { day_of_week: 4, start_hour: 10, end_hour: 13 },
      ],
    },
    {
      id: 'usr_queryqueen',
      name: 'Sunita Kulkarni',
      handle: 'QueryQueen',
      avatar_color: '#a855f7',
      bio: 'Database administrator and backend developer. Passionate about indexing strategies, query plans, and schema modeling.',
      experience: 'senior',
      languages: 'English, Marathi, Hindi',
      is_online: 0,
      created_at: '2026-01-11T10:00:00.000Z',
      skills: ['SQL/Database Design', 'Node.js', 'System Design'],
      slots: [
        { day_of_week: 3, start_hour: 15, end_hour: 19 },
        { day_of_week: 5, start_hour: 11, end_hour: 15 },
      ],
    },
    {
      id: 'usr_stackstar',
      name: 'Aman Khan',
      handle: 'StackStar',
      avatar_color: '#eab308',
      bio: 'Junior engineer building Spring Boot and Java services. Happy to pair on OOP principles and relational databases.',
      experience: 'junior',
      languages: 'English, Hindi',
      is_online: 0,
      created_at: '2026-01-12T10:00:00.000Z',
      skills: ['Java', 'DSA', 'SQL/Database Design'],
      slots: [
        { day_of_week: 0, start_hour: 16, end_hour: 19 },
        { day_of_week: 4, start_hour: 16, end_hour: 19 },
      ],
    },
    {
      id: 'usr_promptpro',
      name: 'Meera Joshi',
      handle: 'PromptPro',
      avatar_color: '#d946ef',
      bio: 'Applied AI engineer. Working on LLM prompts, embeddings, vector databases, and Python data pipelines.',
      experience: 'mid',
      languages: 'English, Hindi, Marathi',
      is_online: 1,
      created_at: '2026-01-13T10:00:00.000Z',
      skills: ['Machine Learning', 'Python', 'TypeScript'],
      slots: [
        { day_of_week: 2, start_hour: 11, end_hour: 14 },
        { day_of_week: 5, start_hour: 16, end_hour: 19 },
      ],
    },
    {
      id: 'usr_terminaltinkerer',
      name: 'Tanvi Deshmukh',
      handle: 'TerminalTinkerer',
      avatar_color: '#0ea5e9',
      bio: 'Enthusiastic beginner coder. Completed 1 booking and looking forward to booking my next session!',
      experience: 'student',
      languages: 'English, Marathi',
      is_online: 1,
      created_at: '2026-01-14T10:00:00.000Z',
      skills: ['Git', 'Python', 'CSS/UI'],
      slots: [
        { day_of_week: 1, start_hour: 15, end_hour: 18 },
        { day_of_week: 3, start_hour: 15, end_hour: 18 },
        { day_of_week: 6, start_hour: 10, end_hour: 13 },
      ],
    },
  ];

  // Prepared statements for insertion
  const insertUser = targetDb.prepare(`
    INSERT INTO users (id, name, handle, avatar_color, bio, experience, languages, is_online, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSkill = targetDb.prepare(`
    INSERT INTO user_skills (id, user_id, topic)
    VALUES (?, ?, ?)
  `);

  const insertSlot = targetDb.prepare(`
    INSERT INTO availability_slots (id, user_id, day_of_week, start_hour, end_hour)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertLedger = targetDb.prepare(`
    INSERT INTO ledger_entries (id, user_id, delta, kind, reason, booking_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBooking = targetDb.prepare(`
    INSERT INTO bookings (id, learner_id, mentor_id, topic, problem_note, slot_label, status, cost, room_id, requested_at, accepted_at, started_at, completed_at, rating, rating_comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Insert users, skills, slots, and starting grants
  const seedTransaction = targetDb.transaction(() => {
    let skillCount = 0;
    let slotCount = 0;

    for (const u of users) {
      insertUser.run(
        u.id,
        u.name,
        u.handle,
        u.avatar_color,
        u.bio,
        u.experience,
        u.languages,
        u.is_online,
        u.created_at
      );

      for (const skill of u.skills) {
        insertSkill.run(`skl_${u.handle.toLowerCase()}_${skillCount++}`, u.id, skill);
      }

      for (const slot of u.slots) {
        insertSlot.run(
          `slt_${u.handle.toLowerCase()}_${slotCount++}`,
          u.id,
          slot.day_of_week,
          slot.start_hour,
          slot.end_hour
        );
      }

      // Starting grant entry (SPEC.md Section 5: STARTING_CREDITS = 10, kind = 'grant', reason = 'Welcome bonus')
      insertLedger.run(
        `led_grant_${u.id}`,
        u.id,
        STARTING_CREDITS,
        'grant',
        'Welcome bonus',
        null,
        u.created_at
      );
    }

    // Now seed a believable history of completed bookings with matching session_spend/session_earn rows
    // Mentors:
    // PixelPriya (u1): 11 mentor sessions -> Level 3 (Mentor)
    // ByteBender (u2): 6 mentor sessions -> Level 2 (Helper)
    // AlgoAce (u3): 5 mentor sessions -> Level 2 (Helper)
    // CloudPilot (u5): 2 mentor sessions -> Level 1 (Newcomer)
    // DevDynamo (u4): 1 mentor session -> Level 1 (Newcomer)
    // Total mentor sessions = 25

    // Learners (each starts with 10 credits):
    // TerminalTinkerer (u14): 1 session as learner -> balance 10 - 5 = 5 credits (exact 1 booking capacity!)
    // u6, u7, u8, u9, u10, u11, u12, u13: 2 sessions each = 16 sessions -> balance 10 - 10 = 0 credits each.
    // u2, u3, u4, u5: 2 sessions each as learners = 8 sessions.
    // Total learner sessions = 1 + 16 + 8 = 25.

    const completedBookings = [
      // PixelPriya (u1) as mentor: 11 sessions
      { id: 'bok_01', mentor: 'usr_pixelpriya', learner: 'usr_terminaltinkerer', topic: 'React', note: 'Fixing re-rendering loop with useEffect and useCallback', slot: 'Mon 14:00-15:00', rating: 5, comment: 'Phenomenal mentor! Solved my infinite loop in 20 minutes.', dayOffset: 12 },
      { id: 'bok_02', mentor: 'usr_pixelpriya', learner: 'usr_datadrifter', topic: 'CSS/UI', note: 'Building accessible modal dialogs with focus trapping', slot: 'Wed 14:00-15:00', rating: 5, comment: 'Great eye for detail on CSS grid and flexbox.', dayOffset: 11 },
      { id: 'bok_03', mentor: 'usr_pixelpriya', learner: 'usr_scriptsage', topic: 'TypeScript', note: 'Typing polymorphic React button components', slot: 'Fri 10:00-11:00', rating: 5, comment: 'Masterful explanation of Generics in React props.', dayOffset: 10 },
      { id: 'bok_04', mentor: 'usr_pixelpriya', learner: 'usr_bughunter', topic: 'React', note: 'Zustand state management setup for dashboard', slot: 'Mon 15:00-16:00', rating: 5, comment: 'Very patient and friendly mentor!', dayOffset: 9 },
      { id: 'bok_05', mentor: 'usr_pixelpriya', learner: 'usr_shadersorcerer', topic: 'CSS/UI', note: 'Tailwind to pure CSS migration strategies', slot: 'Wed 15:00-16:00', rating: 4, comment: 'Clear explanations and clean code snippets.', dayOffset: 8 },
      { id: 'bok_06', mentor: 'usr_pixelpriya', learner: 'usr_flutterfox', topic: 'React', note: 'React 19 actions and optimistic UI updates', slot: 'Fri 11:00-12:00', rating: 5, comment: 'Top tier mentor. Highly recommend Priya!', dayOffset: 7 },
      { id: 'bok_07', mentor: 'usr_pixelpriya', learner: 'usr_queryqueen', topic: 'System Design', note: 'Micro-frontend architecture and module federation', slot: 'Mon 16:00-17:00', rating: 5, comment: 'Insightful discussion on scaling UI teams.', dayOffset: 6 },
      { id: 'bok_08', mentor: 'usr_pixelpriya', learner: 'usr_stackstar', topic: 'TypeScript', note: 'Setting up strict tsconfig and discriminating unions', slot: 'Wed 16:00-17:00', rating: 4, comment: 'Helped me understand tagged unions clearly.', dayOffset: 5 },
      { id: 'bok_09', mentor: 'usr_pixelpriya', learner: 'usr_promptpro', topic: 'React', note: 'Streaming AI chat responses into Markdown views', slot: 'Fri 12:00-13:00', rating: 5, comment: 'Awesome live debugging session!', dayOffset: 4 },
      { id: 'bok_10', mentor: 'usr_pixelpriya', learner: 'usr_bytebender', topic: 'React', note: 'SSR hydration error troubleshooting in Vite SSR', slot: 'Mon 17:00-18:00', rating: 5, comment: 'Pointed out the window reference issue instantly.', dayOffset: 3 },
      { id: 'bok_11', mentor: 'usr_pixelpriya', learner: 'usr_algoace', topic: 'System Design', note: 'Client-side offline caching with IndexedDB', slot: 'Wed 17:00-18:00', rating: 5, comment: '10/10 mentor. Clean architecture tips.', dayOffset: 2 },

      // ByteBender (u2) as mentor: 6 sessions
      { id: 'bok_12', mentor: 'usr_bytebender', learner: 'usr_datadrifter', topic: 'Node.js', note: 'Node.js Event loop lag analysis and worker threads', slot: 'Tue 15:00-16:00', rating: 5, comment: 'Deep understanding of libuv and async execution.', dayOffset: 12 },
      { id: 'bok_13', mentor: 'usr_bytebender', learner: 'usr_scriptsage', topic: 'SQL/Database Design', note: 'PostgreSQL connection pooling and pgbouncer tuning', slot: 'Thu 15:00-16:00', rating: 5, comment: 'Arjun knows backend inside out.', dayOffset: 11 },
      { id: 'bok_14', mentor: 'usr_bytebender', learner: 'usr_bughunter', topic: 'System Design', note: 'Designing rate limiter with Redis token bucket', slot: 'Sat 11:00-12:00', rating: 4, comment: 'Great real-world examples and edge cases discussed.', dayOffset: 9 },
      { id: 'bok_15', mentor: 'usr_bytebender', learner: 'usr_shadersorcerer', topic: 'Node.js', note: 'WebSocket connection scaling with Redis pub/sub', slot: 'Tue 16:00-17:00', rating: 5, comment: 'Fixed our cluster broadcasting bug.', dayOffset: 7 },
      { id: 'bok_16', mentor: 'usr_bytebender', learner: 'usr_flutterfox', topic: 'Git', note: 'Interactive git rebase and bisect walkthrough', slot: 'Thu 16:00-17:00', rating: 5, comment: 'No longer afraid of git merge conflicts!', dayOffset: 5 },
      { id: 'bok_17', mentor: 'usr_bytebender', learner: 'usr_queryqueen', topic: 'System Design', note: 'Event-driven architecture with RabbitMQ', slot: 'Sat 12:00-13:00', rating: 4, comment: 'Very practical advice on dead-letter queues.', dayOffset: 3 },

      // AlgoAce (u3) as mentor: 5 sessions
      { id: 'bok_18', mentor: 'usr_algoace', learner: 'usr_stackstar', topic: 'DSA', note: 'Graph traversal: Dijkstra and Bellman-Ford algorithm', slot: 'Sun 10:00-11:00', rating: 5, comment: 'Kavita makes difficult graph problems feel so intuitive.', dayOffset: 12 },
      { id: 'bok_19', mentor: 'usr_algoace', learner: 'usr_promptpro', topic: 'Python', note: 'Fast two-pointer and sliding window pattern mastery', slot: 'Tue 18:00-19:00', rating: 5, comment: 'Aced my mock interview round right after this!', dayOffset: 10 },
      { id: 'bok_20', mentor: 'usr_algoace', learner: 'usr_bytebender', topic: 'DSA', note: 'Trie data structure implementation with wildcard search', slot: 'Thu 18:00-19:00', rating: 5, comment: 'Brilliant session on prefix trees.', dayOffset: 8 },
      { id: 'bok_21', mentor: 'usr_algoace', learner: 'usr_devdynamo', topic: 'Python', note: 'Dynamic programming memoization vs tabulation', slot: 'Sun 11:00-12:00', rating: 4, comment: 'Finally understood knapsack DP!', dayOffset: 6 },
      { id: 'bok_22', mentor: 'usr_algoace', learner: 'usr_cloudpilot', topic: 'Java', note: 'Java Streams API and concurrency primitives', slot: 'Tue 19:00-20:00', rating: 5, comment: 'Super clear walk-through of ConcurrentHashMap.', dayOffset: 4 },

      // CloudPilot (u5) as mentor: 2 sessions
      { id: 'bok_23', mentor: 'usr_cloudpilot', learner: 'usr_devdynamo', topic: 'DevOps/Docker', note: 'Multi-stage Docker build optimization for Node.js app', slot: 'Tue 12:00-13:00', rating: 5, comment: 'Shrank our production container image from 1.2GB to 85MB!', dayOffset: 10 },
      { id: 'bok_24', mentor: 'usr_cloudpilot', learner: 'usr_algoace', topic: 'System Design', note: 'Reverse proxy configuration and SSL termination with Nginx', slot: 'Fri 14:00-15:00', rating: 5, comment: 'Very crisp and actionable advice on production Nginx.', dayOffset: 6 },

      // DevDynamo (u4) as mentor: 1 session
      { id: 'bok_25', mentor: 'usr_devdynamo', learner: 'usr_cloudpilot', topic: 'Git', note: 'Git commit conventions, signed commits, and PR reviews', slot: 'Mon 17:00-18:00', rating: 5, comment: 'Great tips on conventional commits and clean history.', dayOffset: 8 },
    ];

    const baseTimestamp = new Date('2026-01-20T12:00:00.000Z').getTime();

    for (const b of completedBookings) {
      const timeOffset = b.dayOffset * 86400000;
      const requestedAt = new Date(baseTimestamp - timeOffset).toISOString();
      const acceptedAt = new Date(baseTimestamp - timeOffset + 3600000).toISOString();
      const startedAt = new Date(baseTimestamp - timeOffset + 7200000).toISOString();
      const completedAt = new Date(baseTimestamp - timeOffset + 9000000).toISOString();
      const roomId = `room_${b.id}`;

      insertBooking.run(
        b.id,
        b.learner,
        b.mentor,
        b.topic,
        b.note,
        b.slot,
        'completed',
        SESSION_COST,
        roomId,
        requestedAt,
        acceptedAt,
        startedAt,
        completedAt,
        b.rating,
        b.comment
      );

      // Matching ledger rows for settlement:
      // 1. Learner session_spend (-SESSION_COST)
      insertLedger.run(
        `led_spend_${b.id}`,
        b.learner,
        -SESSION_COST,
        'session_spend',
        `Completed session on ${b.topic}`,
        b.id,
        completedAt
      );

      // 2. Mentor session_earn (+SESSION_COST)
      insertLedger.run(
        `led_earn_${b.id}`,
        b.mentor,
        SESSION_COST,
        'session_earn',
        `Mentored session on ${b.topic}`,
        b.id,
        completedAt
      );
    }
  });

  seedTransaction();

  // Validate seed numbers and print summary
  const userCount = targetDb.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const bookingCount = targetDb.prepare('SELECT COUNT(*) AS count FROM bookings').get().count;
  const ledgerCount = targetDb.prepare('SELECT COUNT(*) AS count FROM ledger_entries').get().count;
  const totalDelta = targetDb.prepare('SELECT SUM(delta) AS sum FROM ledger_entries').get().sum;

  console.log('✅ Seed completed successfully:');
  console.log(`   - Users: ${userCount}`);
  console.log(`   - Bookings: ${bookingCount}`);
  console.log(`   - Ledger Entries: ${ledgerCount}`);
  console.log(`   - Sum of all ledger deltas: ${totalDelta}`);

  return {
    userCount,
    bookingCount,
    ledgerCount,
    totalDelta,
  };
}

// Allow direct execution: node src/seed.js
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed();
}

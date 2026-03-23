const Database = require('better-sqlite3');

const db = new Database(
  'C:\\Users\\LENOVO\\APPS\\0-AI-Agents\\eureclaw\\store\\messages.db',
);

// Cancel all GitHub Trending cron jobs first
const cancel = db.prepare(
  "UPDATE scheduled_tasks SET status = 'cancelled' WHERE prompt LIKE '%github.com/trending%'",
);

// Count before
const before = db
  .prepare(
    "SELECT COUNT(*) as count FROM scheduled_tasks WHERE prompt LIKE '%github.com/trending%' AND status = 'active'",
  )
  .get();
console.log('Active GitHub Trending tasks before:', before.count);

// Cancel them
cancel.run();
console.log('Cancelled all GitHub Trending tasks');

// Insert the correct cron at 11h UTC (6h EST)
const insert = db.prepare(`
  INSERT INTO scheduled_tasks (id, workspace_folder, chat_jid, prompt, schedule_type, schedule_value, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const newId = 'task-github-trending-11h-utc';
const now = new Date().toISOString();
insert.run(
  newId,
  'main',
  'web:main',
  'Fetch https://github.com/trending for new trending AI repositories on GitHub, extract the names and descriptions of the top AI-related repositories, and send a message to the workspace with the list, including direct links to each repository.',
  'cron',
  '0 11 * * *',
  'active',
  now,
);

// Verify
const tasks = db
  .prepare(
    "SELECT id, schedule_type, schedule_value, status FROM scheduled_tasks WHERE status = 'active' AND schedule_type = 'cron'",
  )
  .all();
console.log('\nActive cron tasks after fix:');
tasks.forEach((t) => console.log(`- ${t.id}: ${t.schedule_value}`));

db.close();

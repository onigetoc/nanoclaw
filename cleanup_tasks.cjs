const Database = require('better-sqlite3');

const db = new Database(
  'C:\\Users\\LENOVO\\APPS\\0-AI-Agents\\eureclaw\\store\\messages.db',
);

// Cancel the two extra GitHub Trending cron jobs (keep only the 11h one)
const cancel1 = db.prepare(
  'UPDATE scheduled_tasks SET status = ? WHERE id = ?',
);
cancel1.run('cancelled', 'task-1774231128497-jye4qm');
cancel1.run('cancelled', 'task-1774231144698-bf4d3o');

// Also cancel the old one that was at 11h if it still exists
cancel1.run('cancelled', 'task-1773861098695-gyisrv');

// Verify
const tasks = db
  .prepare(
    "SELECT id, substr(prompt,1,60) as prompt, schedule_type, schedule_value, status FROM scheduled_tasks WHERE status = 'active'",
  )
  .all();
console.log('Active tasks after cleanup:');
console.log(JSON.stringify(tasks, null, 2));

db.close();

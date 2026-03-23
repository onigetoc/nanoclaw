import Database from 'better-sqlite3';

const db = new Database(
  'C:\\Users\\LENOVO\\APPS\\0-AI-Agents\\eureclaw\\store\\messages.db',
);
const tasks = db
  .prepare(
    'SELECT id, substr(prompt,1,60) as prompt, schedule_type, schedule_value, status FROM scheduled_tasks',
  )
  .all();
console.log(JSON.stringify(tasks, null, 2));
db.close();

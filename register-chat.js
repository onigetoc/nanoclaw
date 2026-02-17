// Script pour enregistrer un chat Telegram
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const chatJid = 'tg:1382389542';
const chatName = 'Personal';
const groupFolder = 'main';

// Créer le dossier store si nécessaire
const storeDir = path.join(process.cwd(), 'store');
fs.mkdirSync(storeDir, { recursive: true });

// Ouvrir la base de données
const dbPath = path.join(storeDir, 'messages.db');
const db = new Database(dbPath);

// Créer le schéma si nécessaire
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    jid TEXT PRIMARY KEY,
    name TEXT,
    last_message_time TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT,
    chat_jid TEXT,
    sender TEXT,
    sender_name TEXT,
    content TEXT,
    timestamp TEXT,
    is_from_me INTEGER,
    is_bot_message INTEGER DEFAULT 0,
    PRIMARY KEY (id, chat_jid),
    FOREIGN KEY (chat_jid) REFERENCES chats(jid)
  );
  CREATE TABLE IF NOT EXISTS router_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    group_folder TEXT PRIMARY KEY,
    session_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registered_groups (
    jid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    folder TEXT NOT NULL UNIQUE,
    trigger_pattern TEXT NOT NULL,
    added_at TEXT NOT NULL,
    container_config TEXT,
    requires_trigger INTEGER DEFAULT 1
  );
`);

// Créer le dossier du groupe
const groupDir = path.join(process.cwd(), 'groups', groupFolder);
fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

// Créer le fichier CLAUDE.md
const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
if (!fs.existsSync(claudeMdPath)) {
  fs.writeFileSync(claudeMdPath, `# Memory for ${chatName}

This is your personal chat memory. You can store information here that you want to remember across conversations.
`);
}

// Enregistrer le groupe dans la base de données
const registeredGroup = {
  name: chatName,
  folder: groupFolder,
  requiresTrigger: false, // Pas besoin de @Andy pour le chat principal
};

db.prepare(`
  INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger, container_config)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  chatJid,
  registeredGroup.name,
  registeredGroup.folder,
  '^@Andy\\b', // Pattern par défaut
  new Date().toISOString(),
  registeredGroup.requiresTrigger ? 1 : 0,
  null
);

// Enregistrer le chat dans la table chats
db.prepare(`
  INSERT OR REPLACE INTO chats (jid, name, last_message_time)
  VALUES (?, ?, ?)
`).run(chatJid, chatName, new Date().toISOString());

console.log(`✅ Chat enregistré avec succès !`);
console.log(`   JID: ${chatJid}`);
console.log(`   Nom: ${chatName}`);
console.log(`   Dossier: groups/${groupFolder}`);
console.log(`\nTu peux maintenant parler au bot sur Telegram !`);
console.log(`Envoie simplement un message (pas besoin de @Andy pour le chat principal)`);

db.close();

#!/usr/bin/env bun
/**
 * Clean XML/HTML pollution from SQLite messages database
 * 
 * This script:
 * 1. Finds messages containing <messages> or <message> tags
 * 2. Strips the XML tags while keeping the actual content
 * 3. Updates the database with cleaned content
 * 4. Shows before/after stats
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'store', 'messages.db');

function stripMessageXml(text: string): string {
  if (!text) return text;
  
  // Remove <messages> wrapper
  let cleaned = text.replace(/<\/?messages>/g, '');
  
  // Remove <message sender="..." time="...">content</message> tags
  // Keep only the content between tags
  cleaned = cleaned.replace(/<message\s+sender="[^"]*"\s+time="[^"]*">([^<]*)<\/message>/g, '$1');
  
  // Remove any remaining message tags
  cleaned = cleaned.replace(/<\/?message[^>]*>/g, '');
  
  return cleaned.trim();
}

function main() {
  console.log('🧹 Cleaning XML pollution from messages database...\n');
  
  const db = new Database(DB_PATH);
  
  // Find polluted messages
  const pollutedMessages = db.prepare(`
    SELECT id, chat_jid, sender_name, content, timestamp, length(content) as content_length
    FROM messages
    WHERE content LIKE '%<message%' OR content LIKE '%<messages>%'
    ORDER BY timestamp DESC
  `).all() as Array<{
    id: string;
    chat_jid: string;
    sender_name: string;
    content: string;
    timestamp: string;
    content_length: number;
  }>;
  
  if (pollutedMessages.length === 0) {
    console.log('✅ No XML pollution found! Database is clean.');
    db.close();
    return;
  }
  
  console.log(`Found ${pollutedMessages.length} polluted messages:\n`);
  
  // Show summary
  let totalCharsRemoved = 0;
  const updates: Array<{ id: string; cleaned: string; before: number; after: number }> = [];
  
  for (const msg of pollutedMessages) {
    const cleaned = stripMessageXml(msg.content);
    const charsSaved = msg.content.length - cleaned.length;
    totalCharsRemoved += charsSaved;
    
    updates.push({
      id: msg.id,
      cleaned,
      before: msg.content.length,
      after: cleaned.length,
    });
    
    console.log(`📝 ${msg.sender_name} (${msg.timestamp.slice(0, 10)})`);
    console.log(`   Before: ${msg.content.length.toLocaleString()} chars`);
    console.log(`   After:  ${cleaned.length.toLocaleString()} chars`);
    console.log(`   Saved:  ${charsSaved.toLocaleString()} chars`);
    console.log(`   Preview: ${cleaned.slice(0, 100)}${cleaned.length > 100 ? '...' : ''}`);
    console.log('');
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Messages to clean: ${pollutedMessages.length}`);
  console.log(`   Total chars removed: ${totalCharsRemoved.toLocaleString()}`);
  console.log(`   Average reduction: ${Math.round(totalCharsRemoved / pollutedMessages.length).toLocaleString()} chars/message`);
  
  // Ask for confirmation
  console.log('\n⚠️  This will UPDATE the database. Continue? (y/n)');
  
  // Read from stdin
  const answer = prompt('> ');
  
  if (answer?.toLowerCase() !== 'y') {
    console.log('❌ Cancelled. No changes made.');
    db.close();
    return;
  }
  
  // Perform updates
  console.log('\n🔧 Updating database...');
  
  const updateStmt = db.prepare(`
    UPDATE messages
    SET content = ?
    WHERE id = ?
  `);
  
  const transaction = db.transaction(() => {
    for (const update of updates) {
      updateStmt.run(update.cleaned, update.id);
    }
  });
  
  transaction();
  
  console.log(`✅ Successfully cleaned ${updates.length} messages!`);
  console.log(`💾 Saved ${totalCharsRemoved.toLocaleString()} characters of storage.`);
  
  db.close();
}

main();

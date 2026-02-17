/**
 * Minimal test script to understand OpenCode SDK behavior.
 * Run: node --import tsx/esm container/agent-runner/test-sdk.ts
 */
import { createOpencodeClient } from '@opencode-ai/sdk';

const client = createOpencodeClient({ baseUrl: 'http://localhost:4096' });

async function main() {
  console.log('=== OpenCode SDK Test ===\n');

  // 1. Create a session
  console.log('1. Creating session...');
  const sessionResp = await client.session.create();
  console.log('   Raw response keys:', Object.keys(sessionResp));
  console.log('   Raw response:', JSON.stringify(sessionResp).slice(0, 500));
  const sessionId = (sessionResp as any).data?.id ?? (sessionResp as any).id;
  console.log('   Session ID:', sessionId);

  // 2. Subscribe to events BEFORE sending message
  console.log('\n2. Subscribing to SSE events...');
  const abortController = new AbortController();
  const events = await client.event.subscribe({ signal: abortController.signal });
  console.log('   Events object keys:', Object.keys(events));
  console.log('   Has stream:', !!events.stream);

  // 3. Send a simple prompt
  console.log('\n3. Sending prompt...');
  const promptResp = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text: 'Say "hello world" and nothing else.' }]
    }
  });
  console.log('   Prompt response keys:', Object.keys(promptResp || {}));
  console.log('   Prompt response:', JSON.stringify(promptResp).slice(0, 300));

  // 4. Listen to events
  console.log('\n4. Listening to SSE events (max 60s)...');
  const timeout = setTimeout(() => {
    console.log('\n   TIMEOUT: No session.idle after 60s, aborting.');
    abortController.abort();
  }, 60000);

  let eventCount = 0;
  let assistantText = '';
  try {
    for await (const rawEvent of events.stream) {
      eventCount++;
      const event = (rawEvent as any)?.payload || rawEvent;
      const type = event?.type;
      const props = event?.properties;

      // Log every event (first 20 in detail, then just type)
      if (eventCount <= 20) {
        console.log(`   Event #${eventCount}: type="${type}"`);
        console.log(`     raw keys: ${Object.keys(rawEvent || {}).join(', ')}`);
        console.log(`     data: ${JSON.stringify(rawEvent).slice(0, 300)}`);
      } else {
        process.stdout.write(`   Event #${eventCount}: ${type}\r`);
      }

      // Filter for our session
      const eSid = props?.sessionID || props?.info?.sessionID || props?.part?.sessionID;
      if (eSid && eSid !== sessionId) continue;

      // Collect text
      if (type === 'message.part.updated' && props?.part?.type === 'text') {
        const delta = props.delta || '';
        if (delta) assistantText += delta;
        console.log(`     >> TEXT DELTA: "${delta.slice(0, 100)}"`);
      }

      // Done
      if (type === 'session.idle') {
        console.log(`\n   SESSION IDLE! Collected ${assistantText.length} chars of text.`);
        break;
      }

      if (type === 'session.error') {
        console.log(`\n   SESSION ERROR:`, JSON.stringify(props));
        break;
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      console.log('\n   Stream aborted.');
    } else {
      console.error('\n   Stream error:', err.message);
    }
  }

  clearTimeout(timeout);

  // 5. Fallback: fetch messages directly
  console.log('\n5. Fetching session messages as fallback...');
  try {
    const msgsResp = await client.session.messages({ path: { id: sessionId } });
    const msgs = (msgsResp as any).data || msgsResp;
    console.log('   Messages count:', Array.isArray(msgs) ? msgs.length : 'not array');
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        const role = m.info?.role || m.role;
        const parts = m.parts || [];
        const text = parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
        console.log(`   [${role}] ${text.slice(0, 200)}`);
      }
    } else {
      console.log('   Raw:', JSON.stringify(msgs).slice(0, 500));
    }
  } catch (err: any) {
    console.error('   Fetch error:', err.message);
  }

  // 6. Cleanup
  console.log('\n6. Deleting session...');
  try {
    await client.session.delete({ path: { id: sessionId } });
    console.log('   Deleted.');
  } catch { /* ignore */ }

  console.log('\n=== Done ===');
  console.log(`Total events: ${eventCount}`);
  console.log(`Assistant text from deltas: "${assistantText}"`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

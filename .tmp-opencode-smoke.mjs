import { createOpencodeClient } from '@opencode-ai/sdk';

const client = createOpencodeClient({ baseUrl: 'http://127.0.0.1:4100' });

try {
  const s = await client.session.create();
  const sid = s.data?.id ?? s.id;
  console.log('session', sid);
  const r = await client.session.prompt({
    path: { id: sid },
    body: { parts: [{ type: 'text', text: 'Reply exactly: OK' }] }
  });
  const data = r.data ?? r;
  console.log('prompt-ok', JSON.stringify(data.parts?.slice?.(0, 2) ?? []));
} catch (e) {
  console.error('sdk-error', e?.message || String(e));
  console.error(e);
  process.exit(1);
}

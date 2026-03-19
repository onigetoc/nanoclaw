#!/usr/bin/env node
/**
 * CLI pour récupérer un transcript YouTube.
 * Usage: node .opencode/skills/youtube-transcript/scripts/transcript.js <url|videoId> [--lang fr,en] [--timestamps] [--max 8000]
 */

import { YoutubeTranscript } from 'youtube-transcript-plus';

function decodeHtmlEntities(raw) {
  if (!raw || !raw.includes('&')) return raw;
  return raw
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; }
    });
}

function normalizeGlitches(text) {
  const patterns = [/ÔÖ¬+/g, /â™ª+/g, /â™«+/g, /Ã©/g, /Ã¨/g, /Ãª/g, /Ã«/g, /Ã /g, /Ã¹/g, /Ã´/g, /Ã®/g, /Ã¯/g, /Â·/g];
  let out = text;
  for (const p of patterns) out = out.replace(p, '♪');
  out = out.replace(/♪{2,}/g, '♪');
  return out.trim();
}

function extractVideoId(input) {
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input.trim());
    if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const m = url.pathname.match(/\/(embed|v)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {
    const m = input.match(/([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

async function fetchTranscript(videoId, languages) {
  if (languages && languages.length) {
    for (const lang of languages) {
      try {
        const t = await YoutubeTranscript.fetchTranscript(videoId, { lang });
        if (t && t.length) return t;
      } catch { /* try next */ }
    }
  }
  return YoutubeTranscript.fetchTranscript(videoId);
}

function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`
    : `[${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`;
}

function buildLines(segments, includeTimestamps) {
  return segments.map(seg => {
    const clean = normalizeGlitches(decodeHtmlEntities(seg.text || ''));
    if (!includeTimestamps) return clean;
    const startSec = seg.offset ?? seg.start ?? 0;
    return `${formatTimestamp(startSec)} ${clean}`;
  });
}

function chunkLines(lines, maxChars) {
  if (!maxChars || maxChars <= 0) return [lines];
  const max = Math.min(20000, Math.max(500, Math.floor(maxChars)));
  const chunks = [];
  let buf = [];
  let len = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    if (len > 0 && len + lineLen > max) {
      chunks.push(buf);
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += lineLen;
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

function parseFlags(argv) {
  const out = { timestamps: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--timestamps') {
      out.timestamps = true;
    } else if (a === '--max') {
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { out.max = Number(v); i++; }
    } else if (a.startsWith('--max=')) {
      out.max = Number(a.split('=', 2)[1]);
    } else if (a === '--lang') {
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { out.lang = v.split(',').map(s => s.trim()).filter(Boolean); i++; }
    } else if (a.startsWith('--lang=')) {
      out.lang = a.split('=', 2)[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--help') {
      out.urlOrId = '--help';
    } else if (!a.startsWith('--') && !out.urlOrId) {
      out.urlOrId = a;
    }
  }
  return out;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.urlOrId === '--help' || !flags.urlOrId) {
    console.log('Usage: node .opencode/skills/youtube-transcript/scripts/transcript.js <url|videoId> [--lang fr,en] [--timestamps] [--max 8000]');
    if (!flags.urlOrId) console.error('Error: URL or video ID is required.');
    process.exit(flags.urlOrId === '--help' ? 0 : 1);
  }

  const vid = extractVideoId(flags.urlOrId);
  if (!vid) {
    console.error('Invalid video ID.');
    process.exit(1);
  }

  try {
    const transcript = await fetchTranscript(vid, flags.lang);
    if (!transcript || !transcript.length) {
      console.error('Empty transcript.');
      process.exit(2);
    }
    const lines = buildLines(transcript, flags.timestamps);
    const chunks = chunkLines(lines, flags.max || 0);
    for (const chunk of chunks) {
      console.log(chunk.join('\n'));
    }
  } catch (e) {
    console.error('Error:', e instanceof Error ? e.message : String(e));
    process.exit(3);
  }
}

main();

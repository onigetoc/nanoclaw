/**
 * Convert @mentions and /commands into markdown links with special schemes
 * so ReactMarkdown renders them as clickable elements.
 *
 * Commands like /new, /sleep, /awake become [/new](command:new) etc.
 * Protected: code blocks, inline code, and existing markdown links.
 */
export function linkifyMentionsAndCommands(text: string): string {
  const protectedParts: [string, string][] = [];
  let idx = 0;

  // 1. Protect code blocks, inline code, and existing markdown links
  let processed = text.replace(/(```[\s\S]*?```|`[^`\n]+`|\[[^\]]*\]\([^)]*\))/g, (match) => {
    const placeholder = `\x00P${idx++}\x00`;
    protectedParts.push([placeholder, match]);
    return placeholder;
  });

  // 2. Linkify @mentions
  processed = processed.replace(/(^|[\s(])@(\w+)/gm, '$1[@$2](mention:$2)');

  // 3. Linkify /commands — match /word after start-of-line or any non-alphanumeric char
  //    This catches commands after colons, newlines, spaces, punctuation, etc.
  processed = processed.replace(/(^|[^a-zA-Z0-9])\/(\w[\w-]*)(?![^[]*\]\()/gm, '$1[/$2](command:$2)');

  // 4. Restore protected parts
  for (const [placeholder, original] of protectedParts) {
    processed = processed.replace(placeholder, original);
  }
  return processed;
}

export function extractReasoning(content: string): { visibleContent: string; reasoning: string | null } {
  const thinkTagMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkTagMatch) {
    return {
      visibleContent: content.replace(thinkTagMatch[0], '').trim(),
      reasoning: thinkTagMatch[1].trim(),
    };
  }

  const reasoningBlockMatch = content.match(/```(?:reasoning|thinking)\n([\s\S]*?)```/i);
  if (reasoningBlockMatch) {
    return {
      visibleContent: content.replace(reasoningBlockMatch[0], '').trim(),
      reasoning: reasoningBlockMatch[1].trim(),
    };
  }

  return { visibleContent: content, reasoning: null };
}

export function extractSources(content: string): Array<{ href: string; title: string }> {
  const matches = content.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const unique = Array.from(new Set(matches)).slice(0, 5);

  return unique.map((href) => {
    let title = href;
    try {
      const url = new URL(href);
      title = url.hostname.replace(/^www\./, '');
    } catch {
      // ignore invalid URL parsing
    }
    return { href, title };
  });
}

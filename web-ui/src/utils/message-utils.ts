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

  // 1. Protect code blocks, inline code, existing markdown links, and URLs
  let processed = text.replace(/(```[\s\S]*?```|`[^`\n]+`|\[[^\]]*\]\([^)]*\)|https?:\/\/[^\s)]+)/g, (match) => {
    const placeholder = `\x00P${idx++}\x00`;
    protectedParts.push([placeholder, match]);
    return placeholder;
  });

  // 2. Linkify @mentions
  processed = processed.replace(/(^|[\s(])@(\w+)/gm, '$1[@$2](mention:$2)');

  // 3. Linkify /commands — only match /word at start-of-line or preceded by whitespace
  //    This avoids matching slashes inside file paths, URLs, or other non-command contexts.
  processed = processed.replace(/(^|[\s])\/([a-zA-Z][\w-]*)(?![^[]*\]\()/gm, '$1[/$2](command:$2)');

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

/**
 * Preserve double newlines as paragraph breaks while converting single
 * newlines into markdown hard breaks (two trailing spaces).
 * This replaces remark-breaks which collapses everything into <br>.
 */
export function preserveParagraphBreaks(text: string): string {
  // Protect code blocks from transformation
  const codeBlocks: [string, string][] = [];
  let idx = 0;
  let result = text.replace(/(```[\s\S]*?```)/g, (match) => {
    const placeholder = `\x00CB${idx++}\x00`;
    codeBlocks.push([placeholder, match]);
    return placeholder;
  });

  // Split on double+ newlines (paragraph boundaries), preserve them
  result = result
    .split(/(\n{2,})/)
    .map((segment) => {
      // Keep paragraph separators as-is
      if (/^\n{2,}$/.test(segment)) return segment;
      // Convert single newlines to markdown hard breaks (two trailing spaces)
      return segment.replace(/(?<! {2})\n(?!\n)/g, '  \n');
    })
    .join('');

  // Restore code blocks
  for (const [placeholder, original] of codeBlocks) {
    result = result.replace(placeholder, original);
  }
  return result;
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

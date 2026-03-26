export function extractFrontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1];
}

export function getFrontmatterValue(frontmatter, key) {
  if (!frontmatter) return undefined;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = frontmatter.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
}

export function getMarkdownFrontmatterValue(content, key) {
  return getFrontmatterValue(extractFrontmatterBlock(content), key);
}
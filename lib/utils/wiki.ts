/** Extract unique [[Wiki Link]] titles from markdown content. */
export function extractWikiLinks(content: string): string[] {
  const titles = new Set<string>();
  const regex = /\[\[([^\[\]|]+)(?:\|[^\[\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const title = match[1].trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

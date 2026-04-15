/**
 * Lightweight markdown-to-HTML converter with XSS escaping.
 * Supports headings, bold, italic, inline code, links (http(s) only),
 * unordered/ordered lists, and paragraphs.
 */
export function markdownToHtml(md: string): string {
  // Escape HTML entities first to prevent XSS
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

  // Links: [text](url) — only allow http(s) URLs
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Unordered lists: lines starting with - or *
  html = html.replace(/^(?:[-*]) (.+)$/gm, "<ul-li>$1</ul-li>");
  html = html.replace(/(<ul-li>.*<\/ul-li>\n?)+/g, (match) => {
    const inner = match.replace(/<\/?ul-li>/g, (t) => t.replace("ul-li", "li"));
    return `<ul>${inner}</ul>`;
  });

  // Ordered lists: lines starting with 1. 2. etc.
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ol>${match}</ol>`);

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

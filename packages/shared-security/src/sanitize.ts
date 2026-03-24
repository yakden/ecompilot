/**
 * Input sanitization utilities.
 *
 * - sanitizeHtml:     strips dangerous HTML / XSS vectors
 * - sanitizeMarkdown: cleans user-generated markdown (community posts)
 * - escapeForLog:     neutralises log injection characters
 */

// ---------------------------------------------------------------------------
// HTML sanitization
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "code", "dd", "div", "dl", "dt",
  "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol",
  "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  "*": new Set(["class", "id"]),
};

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const XSS_PATTERNS: RegExp[] = [
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  /on\w+\s*=/gi,
  /<\s*\/?\s*script/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*['"]?\s*javascript/gi,
  /-moz-binding/gi,
  /<\s*\/?\s*iframe/gi,
  /<\s*\/?\s*object/gi,
  /<\s*\/?\s*embed/gi,
  /<\s*\/?\s*applet/gi,
  /<\s*\/?\s*form/gi,
  /<\s*\/?\s*textarea/gi,
  /<\s*\/?\s*input/gi,
  /<\s*\/?\s*button/gi,
  /<\s*\/?\s*select/gi,
  /<\s*\/?\s*link/gi,
  /<\s*\/?\s*meta/gi,
  /<\s*\/?\s*base/gi,
  /<\s*\/?\s*svg/gi,
  /<\s*\/?\s*math/gi,
  /<\s*\/?\s*style/gi,
];

function stripXssPatterns(input: string): string {
  let result = input;
  for (const pattern of XSS_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeAttribute(
  tagName: string,
  attrName: string,
  attrValue: string,
): string | null {
  const tagAttrs = ALLOWED_ATTRS[tagName];
  const globalAttrs = ALLOWED_ATTRS["*"];

  const isAllowed =
    (tagAttrs !== undefined && tagAttrs.has(attrName)) ||
    (globalAttrs !== undefined && globalAttrs.has(attrName));

  if (!isAllowed) {
    return null;
  }

  if (attrName === "href" || attrName === "src") {
    if (!isSafeUrl(attrValue)) {
      return null;
    }
  }

  return stripXssPatterns(attrValue);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Strip dangerous HTML while keeping safe markup intact.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  let html = stripXssPatterns(input);
  html = html.replace(/\0/g, "");

  html = html.replace(
    /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\s*((?:[^>"']*|"[^"]*"|'[^']*')*)\s*\/?>/g,
    (match, tagName: string, attrsRaw: string) => {
      const tag = tagName.toLowerCase();
      const isClosing = match.trimStart().startsWith("</");

      if (!ALLOWED_TAGS.has(tag)) {
        return "";
      }

      if (isClosing) {
        return `</${tag}>`;
      }

      const cleanAttrs: string[] = [];
      const attrRegex = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let attrMatch: RegExpExecArray | null;

      while ((attrMatch = attrRegex.exec(attrsRaw)) !== null) {
        const attrName = (attrMatch[1] as string).toLowerCase();
        const attrValue = (attrMatch[2] ?? attrMatch[3] ?? attrMatch[4]) as string;
        const sanitized = sanitizeAttribute(tag, attrName, attrValue);
        if (sanitized !== null) {
          cleanAttrs.push(`${attrName}="${escapeHtml(sanitized)}"`);
        }
      }

      if (tag === "a") {
        const hasRel = cleanAttrs.some((a) => a.startsWith("rel="));
        if (!hasRel) {
          cleanAttrs.push('rel="noopener noreferrer"');
        }
      }

      const isSelfClosing = match.trimEnd().endsWith("/>");
      const attrStr = cleanAttrs.length > 0 ? ` ${cleanAttrs.join(" ")}` : "";
      return isSelfClosing ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
    },
  );

  html = stripXssPatterns(html);
  return html.trim();
}

// ---------------------------------------------------------------------------
// Markdown sanitization
// ---------------------------------------------------------------------------

export function sanitizeMarkdown(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  let md = input;
  md = md.replace(/\0/g, "");
  md = md.replace(/<[^>]*>/g, "");
  md = md.replace(
    /\]\(\s*(javascript|vbscript|data)\s*:[^)]*\)/gi,
    "]()",
  );
  md = md.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
  md = md.replace(/^#{7,}/gm, "######");
  return md.trim();
}

// ---------------------------------------------------------------------------
// Log injection prevention
// ---------------------------------------------------------------------------

const LOG_DANGEROUS_CHARS: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\x1b": "\\x1b",
  "\x08": "\\b",
};

export function escapeForLog(input: string, maxLength = 1000): string {
  if (typeof input !== "string") {
    return "";
  }

  let escaped = input;
  for (const [char, replacement] of Object.entries(LOG_DANGEROUS_CHARS)) {
    escaped = escaped.split(char).join(replacement);
  }

  escaped = escaped.replace(
    /[\x00-\x07\x0b\x0c\x0e-\x1a\x1c-\x1f]/g,
    "",
  );

  if (escaped.length > maxLength) {
    escaped = `${escaped.substring(0, maxLength)}...[truncated]`;
  }

  return escaped;
}
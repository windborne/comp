import {
  convert,
  type FormatCallback,
  type HtmlToTextOptions,
} from 'html-to-text';

/**
 * Email boilerplate that adds nothing in a chat message: the "copy this URL"
 * fallback, unsubscribe links, the shared footer, and horizontal rules.
 */
const BOILERPLATE_LINE_PATTERNS: RegExp[] = [
  /^or copy and paste this URL into your browser/i,
  /manage your (email )?preferences/i,
  /^don'?t want to receive/i,
  /^AI that handles compliance for you/i,
  /^Comp AI \| \d/i,
  /^-{3,}$/,
];

function wrapInline(open: string, close: string): FormatCallback {
  return (elem, walk, builder) => {
    builder.addInline(open, { noWordTransform: true });
    walk(elem.children, builder);
    builder.addInline(close, { noWordTransform: true });
  };
}

const formatBoldBlock: FormatCallback = (elem, walk, builder) => {
  builder.openBlock({ leadingLineBreaks: 2 });
  builder.addInline('**', { noWordTransform: true });
  walk(elem.children, builder);
  builder.addInline('**', { noWordTransform: true });
  builder.closeBlock({ trailingLineBreaks: 2 });
};

/** `[text](href)` — Zulip's link syntax. Anchors without an href keep just their text. */
const formatLink: FormatCallback = (elem, walk, builder) => {
  const href = elem.attribs?.href?.trim() ?? '';
  if (!href || href.startsWith('#')) {
    walk(elem.children, builder);
    return;
  }
  builder.addInline('[', { noWordTransform: true });
  walk(elem.children, builder);
  builder.addInline(`](${href})`, { noWordTransform: true });
};

const CONVERT_OPTIONS: HtmlToTextOptions = {
  wordwrap: false,
  formatters: {
    zulipBold: wrapInline('**', '**'),
    zulipItalic: wrapInline('*', '*'),
    zulipHeading: formatBoldBlock,
    zulipLink: formatLink,
  },
  selectors: [
    { selector: 'a', format: 'zulipLink' },
    { selector: 'strong', format: 'zulipBold' },
    { selector: 'b', format: 'zulipBold' },
    { selector: 'em', format: 'zulipItalic' },
    { selector: 'i', format: 'zulipItalic' },
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({
      selector,
      format: 'zulipHeading',
    })),
    { selector: 'img', format: 'skip' },
    // react-email's <Preview> hides its text with display:none; skip it entirely.
    { selector: 'div[style*="display:none"]', format: 'skip' },
  ],
};

function isBoilerplate(line: string): boolean {
  return BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Turns a rendered notification email into Zulip markdown: the subject in bold,
 * then the body with links, emphasis and headings preserved and the email-only
 * boilerplate removed.
 */
export function emailHtmlToZulipMarkdown({
  subject,
  html,
}: {
  subject: string;
  html: string;
}): string {
  const text = convert(html, CONVERT_OPTIONS);
  const body = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isBoilerplate(line))
    .join('\n')
    // Whitespace that html-to-text kept inside `[ text ]` breaks Zulip's link syntax.
    .replace(/\[\s*([^\]]*?)\s*\]\(/g, '[$1](')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const heading = `**${subject.trim()}**`;
  return body ? `${heading}\n\n${body}` : heading;
}

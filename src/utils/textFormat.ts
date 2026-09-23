import { parse, print } from 'graphql';

// Both JSON bodies and GraphQL documents can contain {{variable}} placeholders,
// which aren't valid syntax on their own (or change a value's apparent type
// when quoted vs bare). Swap each occurrence for a unique, syntactically-safe
// string token before parsing, then restore the exact original text — quotes
// and all — after formatting, so pretty-printing never touches placeholders.
const PLACEHOLDER_RE = /"?\{\{[\w.$]+\}\}"?/g;

function withPlaceholdersSwapped(text: string, format: (sanitized: string) => string): string {
  const placeholders: string[] = [];
  const sanitized = text.replace(PLACEHOLDER_RE, (match) => {
    placeholders.push(match);
    return `"__PH_${placeholders.length - 1}__"`;
  });

  const formatted = format(sanitized);

  return formatted.replace(/"__PH_(\d+)__"/g, (whole, idx) => {
    const original = placeholders[Number(idx)];
    return original !== undefined ? original : whole;
  });
}

// Throws if `text` (with placeholders swapped out) isn't valid JSON.
export function formatJsonText(text: string): string {
  return withPlaceholdersSwapped(text, (sanitized) => {
    const parsed = JSON.parse(sanitized);
    return JSON.stringify(parsed, null, 2);
  });
}

// Throws if `text` (with placeholders swapped out) isn't a valid GraphQL document.
export function formatGraphqlQuery(text: string): string {
  return withPlaceholdersSwapped(text, (sanitized) => print(parse(sanitized)));
}

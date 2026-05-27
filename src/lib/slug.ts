// Slug helpers for container URLs.
//
// Container URLs are *position-numbered*, not name-slugged: names rewrite,
// positions don't. The Civil Code uses Roman numerals at the Book and Title
// level and Arabic numerals deeper; we normalize everything to Arabic for URLs.

const ROMAN: Record<string, number> = {
  I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
};

export function romanToInt(roman: string): number | null {
  if (!/^[IVXLCDM]+$/i.test(roman)) return null;
  const r = roman.toUpperCase();
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const cur = ROMAN[r[i]!]!;
    const next = i + 1 < r.length ? ROMAN[r[i + 1]!]! : 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

// Levels we use as URL segments. Top-level "preliminary_title" is special-cased.
// `code_*` variants are used by the LRS tree for embedded sub-codes (e.g.
// Code of Civil Procedure within the Revised Statutes).
export type ContainerLevel =
  | 'preliminary_title'
  | 'book'
  | 'title'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'paragraph'
  | 'part'
  | 'subpart'
  | 'subtitle'
  | 'subgroup'
  | 'code_book'
  | 'code_title'
  | 'code_preliminary_title';

export interface HierStep {
  level: string;
  number: string;
  name: string;
}

export function levelSlug(level: string): string {
  switch (level) {
    case 'preliminary_title': return 'preliminary-title';
    case 'book': return 'book';
    case 'title': return 'title';
    case 'chapter': return 'chapter';
    case 'section': return 'section';
    case 'subsection': return 'subsection';
    case 'paragraph': return 'paragraph';
    case 'part': return 'part';
    case 'subpart': return 'subpart';
    case 'subtitle': return 'subtitle';
    case 'subgroup': return 'subgroup';
    case 'code_book': return 'code-book';
    case 'code_title': return 'code-title';
    case 'code_preliminary_title': return 'code-preliminary-title';
    default: return level.replace(/_/g, '-');
  }
}

// Convert a container's `number` field to its URL-position digit.
// `"III"` → `3`, `"5"` → `5`, `"Preliminary Title"` → `""` (use bare slug).
export function positionDigit(level: string, number: string): string {
  if (level === 'preliminary_title') return '';
  // already-numeric (e.g. "3", "12", "5-A"): keep as-is, lowercase
  if (/^\d/.test(number)) return number.toLowerCase();
  // try roman
  const n = romanToInt(number);
  if (n !== null) return String(n);
  // last resort: lowercased + dash
  return number.toLowerCase().replace(/\s+/g, '-');
}

export function stepSlug(step: HierStep): string {
  if (step.level === 'preliminary_title') return 'preliminary-title';
  const digit = positionDigit(step.level, step.number);
  return `${levelSlug(step.level)}-${digit}`;
}

// Full container URL with a corpus prefix, e.g.
// `/cc/book-3/title-5/chapter-3` or `/rs/title-14/chapter-1`.
export function containerPath(
  prefix: string,
  ancestors: HierStep[],
  self: HierStep,
): string {
  const segments = [...ancestors, self].map(stepSlug);
  return `${prefix}/${segments.join('/')}`;
}

export function pathSegments(ancestors: HierStep[], self: HierStep): string[] {
  return [...ancestors, self].map(stepSlug);
}

// CC article URL: flat. `/cc/2315` or `/cc/103.1`.
export function ccArticlePath(articleNumber: string): string {
  return `/cc/${encodeArticleNumber(articleNumber)}`;
}

export function encodeArticleNumber(n: string): string {
  // Article numbers are like "2315" or "103.1". Keep dots; everything else is
  // already URL-safe.
  return n;
}

// LRS section URL: level-prefixed. `/rs/title-14/section-30` or
// `/rs/title-14/section-30.3`.
export function rsSectionPath(titleNumber: string, sectionNumber: string): string {
  return `/rs/title-${titleNumber}/section-${sectionNumber}`;
}

// Numeric ordering for prev/next. "103" < "103.1" < "104".
export function articleSortKey(num: string): [number, number] {
  const [whole, frac = '0'] = num.split('.');
  const w = Number.parseInt(whole!, 10);
  const f = Number.parseInt(frac, 10);
  if (Number.isNaN(w)) return [Number.MAX_SAFE_INTEGER, 0];
  return [w, Number.isNaN(f) ? 0 : f];
}

export function compareArticleNumbers(a: string, b: string): number {
  const ka = articleSortKey(a);
  const kb = articleSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  return ka[1] - kb[1];
}

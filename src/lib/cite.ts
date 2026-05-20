// Citation formatting helpers.
//
// Bluebook (current year, derived from manifest.generated_at):
//   La. Civ. Code art. 2315 (2026).
// Permalink: the canonical absolute URL on theusufruct.com.
// BibTeX: @misc with snapshot date as `note`.

import { release } from './corpus.ts';

const SITE_ORIGIN = 'https://theusufruct.com';

export interface CitationBundle {
  bluebook: string;
  permalink: string;
  bibtex: string;
}

export function citationFor(articleNumber: string): CitationBundle {
  const year = release.generatedYear;
  const permalink = `${SITE_ORIGIN}/cc/${articleNumber}`;
  const bluebook = `La. Civ. Code art. ${articleNumber} (${year}).`;
  const id = articleNumber.replace(/\./g, '-');
  const bibtex = [
    `@misc{lacivcode-art-${id},`,
    `  title        = {La. Civ. Code art. ${articleNumber}},`,
    `  howpublished = {Louisiana Civil Code},`,
    `  year         = {${year}},`,
    `  url          = {${permalink}},`,
    `  note         = {Snapshot ${release.tag}}`,
    '}',
  ].join('\n');
  return { bluebook, permalink, bibtex };
}

// Format a single acts_citations entry: `Acts 1986, No. 211, §1, eff. ...`.
export function formatActsCitation(c: {
  act_year: number | null;
  act_number: number | null;
  section: number | string | null;
  effective_date: string | null;
  effective_date_raw: string | null;
  role: string | null;
}): string {
  const parts: string[] = [];
  if (c.act_year !== null) parts.push(`Acts ${c.act_year}`);
  if (c.act_number !== null) parts.push(`No. ${c.act_number}`);
  if (c.section !== null && c.section !== '') parts.push(`§${c.section}`);
  let s = parts.join(', ');
  if (c.effective_date_raw) {
    s += `, eff. ${c.effective_date_raw}`;
  } else if (c.effective_date) {
    s += `, eff. ${c.effective_date}`;
  }
  return s;
}

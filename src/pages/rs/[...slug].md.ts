// Per-section Markdown endpoint:
//   /rs/title-{N}/section-{X}.md → markdown shipped in the corpus, with a
// synthesized fallback for blank/reserved slots.

import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { sections, sectionsByKey, rsMarkdownPath } from '../../lib/rs.ts';
import { ACTIVE_TAG } from '../../lib/corpus.ts';

export async function getStaticPaths() {
  return sections.map((s) => ({
    params: {
      slug: `title-${s.title_number}/section-${s.section_number}`,
    },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug!;
  // Slug shape: "title-{N}/section-{X}"
  const m = slug.match(/^title-([^/]+)\/section-(.+)$/);
  if (!m) return new Response('Not found', { status: 404 });
  const [, title, section] = m;
  const s = sectionsByKey.get(`${title}:${section}`);
  if (!s) return new Response('Not found', { status: 404 });

  let body: string;
  const mdPath = rsMarkdownPath(title!, section!);
  if (mdPath) {
    body = readFileSync(mdPath, 'utf8');
  } else {
    const head = s.heading ? ` — ${s.heading}` : '';
    const note = s.status === 'repealed'
      ? 'Repealed'
      : s.status === 'reserved'
      ? 'Slot reserved by the Title structure; no enacted text.'
      : s.status === 'blank'
      ? 'Slot blank in the current snapshot; no enacted text.'
      : 'No text recorded.';
    body = `---\ntitle_number: "${title}"\nsection_number: "${section}"\ncitation: "${s.citation}"\nstatus: ${s.status}\nsnapshot: ${ACTIVE_TAG}\n---\n\n# ${s.citation}${head}\n\n_${note}_\n\n${s.acts_citations_raw ?? ''}\n`;
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="rs-${title}-${(section ?? '').replace(/\./g, '_')}.md"`,
    },
  });
};

// Per-section JSON endpoint:
//   /rs/title-{N}/section-{X}.json → exact record from the corpus.

import type { APIRoute } from 'astro';
import { sections, sectionsByKey } from '../../lib/rs.ts';

export async function getStaticPaths() {
  return sections.map((s) => ({
    params: {
      slug: `title-${s.title_number}/section-${s.section_number}`,
    },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug!;
  const m = slug.match(/^title-([^/]+)\/section-(.+)$/);
  if (!m) return new Response('Not found', { status: 404 });
  const [, title, section] = m;
  const s = sectionsByKey.get(`${title}:${section}`);
  if (!s) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(s, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `inline; filename="rs-${title}-${(section ?? '').replace(/\./g, '_')}.json"`,
    },
  });
};

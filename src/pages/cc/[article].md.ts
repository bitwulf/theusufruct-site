// Per-article Markdown endpoint: /cc/{n}.md — serves the markdown shipped in
// the corpus, falling back to a synthesized version if the markdown file is
// absent (e.g. blank slots).

import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVE_TAG, articles, articlesByNumber, markdownPath } from '../../lib/corpus.ts';

export async function getStaticPaths() {
  return articles.map((a) => ({ params: { article: a.article_number } }));
}

export const GET: APIRoute = ({ params }) => {
  const num = params.article!;
  const a = articlesByNumber.get(num);
  if (!a) return new Response('Not found', { status: 404 });

  let body: string;
  const mdPath = markdownPath(num);
  if (mdPath) {
    body = readFileSync(mdPath, 'utf8');
  } else {
    const head = a.heading ? ` — ${a.heading}` : '';
    body = `---\narticle_number: "${num}"\nstatus: ${a.status}\nsnapshot: ${ACTIVE_TAG}\n---\n\n# La. Civ. Code art. ${num}${head}\n\n_${a.status === 'repealed' ? 'Repealed' : a.status === 'blank' ? 'Slot reserved by Code structure; no enacted text.' : 'No text recorded.'}_\n\n${a.acts_citations_raw ?? ''}\n`;
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="art-${num}.md"`,
    },
  });
};

// Per-article JSON endpoint: /cc/{n}.json — serves the exact record from the
// corpus so consumers can fetch single articles without downloading the release.

import type { APIRoute } from 'astro';
import { articles, articlesByNumber } from '../../lib/corpus.ts';

export async function getStaticPaths() {
  return articles.map((a) => ({ params: { article: a.article_number } }));
}

export const GET: APIRoute = ({ params }) => {
  const num = params.article!;
  const a = articlesByNumber.get(num);
  if (!a) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(a, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `inline; filename="art-${num}.json"`,
    },
  });
};

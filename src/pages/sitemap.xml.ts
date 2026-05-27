// Sitemap covering all static pages, CC articles + containers, and LRS
// sections + containers.

import type { APIRoute } from 'astro';
import { articles, allContainers } from '../lib/cc.ts';
import { sections, rsAllContainers } from '../lib/rs.ts';
import { release } from '../lib/corpus.ts';

const ORIGIN = 'https://theusufruct.com';

export const GET: APIRoute = async () => {
  const lastmod = (release.generatedAt || new Date().toISOString()).slice(0, 10);

  const urls: Array<{ loc: string; priority?: string; changefreq?: string }> = [
    { loc: '/', priority: '1.0', changefreq: 'monthly' },
    { loc: '/cc', priority: '0.9', changefreq: 'monthly' },
    { loc: '/rs', priority: '0.9', changefreq: 'monthly' },
    { loc: '/search', priority: '0.7', changefreq: 'monthly' },
    { loc: '/data', priority: '0.7', changefreq: 'monthly' },
    { loc: '/about', priority: '0.5', changefreq: 'yearly' },
    { loc: '/roadmap', priority: '0.4', changefreq: 'yearly' },
    { loc: '/colophon', priority: '0.3', changefreq: 'yearly' },
  ];

  for (const c of allContainers) {
    urls.push({ loc: c.url, priority: '0.6', changefreq: 'monthly' });
  }

  for (const a of articles) {
    urls.push({
      loc: `/cc/${a.article_number}`,
      priority: a.status === 'active' ? '0.8' : '0.3',
      changefreq: 'monthly',
    });
  }

  for (const c of rsAllContainers) {
    urls.push({ loc: c.url, priority: '0.6', changefreq: 'monthly' });
  }

  for (const s of sections) {
    urls.push({
      loc: `/rs/title-${s.title_number}/section-${s.section_number}`,
      priority: s.status === 'active' ? '0.8' : '0.3',
      changefreq: 'monthly',
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${ORIGIN}${u.loc}</loc><lastmod>${lastmod}</lastmod>` +
      (u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : '') +
      (u.priority ? `<priority>${u.priority}</priority>` : '') +
      `</url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

// Atom feed: one entry per corpus release snapshot we know about.
// At v1 the live snapshot is the only one we publish — the upstream releases
// list grows over time and any future builds will include past snapshots
// automatically by querying the GitHub API at build time (kept simple for now
// by emitting just the current release plus a self link to the API endpoint
// so consumers can subscribe and we won't drift if we forget to update).

import type { APIRoute } from 'astro';
import { release, manifest } from '../lib/corpus.ts';

const ORIGIN = 'https://theusufruct.com';

export const GET: APIRoute = async () => {
  const updated = manifest.generated_at || new Date().toISOString();
  const id = `${ORIGIN}/feed.xml`;
  const releaseEntryId = `tag:theusufruct.com,${release.tag}:snapshot/${release.tag}`;
  const entryUpdated = manifest.generated_at || updated;
  const summary = `Snapshot ${release.tag}: ${manifest.totals.articles_emitted.toLocaleString()} article records, ${manifest.totals.containers} containers. Schema ${manifest.schema_version}.`;
  const totals = manifest.totals.by_status ?? {};
  const totalsLine = Object.entries(totals)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Usufruct — Civil Code snapshots</title>
  <subtitle>Corpus releases of the Louisiana Civil Code.</subtitle>
  <link href="${ORIGIN}/" />
  <link rel="self" href="${id}" type="application/atom+xml" />
  <id>${id}</id>
  <updated>${updated}</updated>
  <generator uri="https://astro.build">Astro</generator>
  <rights>Code text: public domain.</rights>

  <entry>
    <id>${releaseEntryId}</id>
    <title>Snapshot ${release.tag}</title>
    <link href="${ORIGIN}/cc" />
    <link rel="alternate" type="application/zip" href="${release.archiveUrl}" />
    <updated>${entryUpdated}</updated>
    <published>${entryUpdated}</published>
    <author><name>The Usufruct</name></author>
    <summary>${summary}</summary>
    <content type="html">${escapeXml(`
      <p>${summary}</p>
      <p>${totalsLine}</p>
      <p><a href="${release.archiveUrl}">Download</a> · <a href="${release.releasePage}">Release notes</a></p>
    `)}</content>
  </entry>
</feed>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

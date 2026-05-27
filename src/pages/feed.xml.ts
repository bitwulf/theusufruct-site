// Atom feed: one entry per corpus release snapshot.
// LRS rollout: we emit a single entry per snapshot summarizing both corpora
// (CC + LRS). Per-section entries would bloat the feed unusably (~45K items).

import type { APIRoute } from 'astro';
import { manifest } from '../lib/cc.ts';
import { rsManifest } from '../lib/rs.ts';
import { release } from '../lib/corpus.ts';

const ORIGIN = 'https://theusufruct.com';

export const GET: APIRoute = async () => {
  const updated = manifest.generated_at || new Date().toISOString();
  const id = `${ORIGIN}/feed.xml`;
  const releaseEntryId = `tag:theusufruct.com,${release.tag}:snapshot/${release.tag}`;
  const entryUpdated = manifest.generated_at || updated;
  const summary = `Snapshot ${release.tag}: ${manifest.totals.articles_emitted.toLocaleString()} Civil Code article records (${manifest.totals.containers} containers) and ${rsManifest.totals.sections_emitted.toLocaleString()} Revised Statutes section records (${rsManifest.totals.containers} containers). Schema ${manifest.schema_version}.`;
  const ccTotals = manifest.totals.by_status ?? {};
  const ccTotalsLine = 'CC: ' + Object.entries(ccTotals)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
  const rsTotals = rsManifest.totals.by_status ?? {};
  const rsTotalsLine = 'LRS: ' + Object.entries(rsTotals)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Usufruct — corpus snapshots</title>
  <subtitle>Corpus releases of the Louisiana Civil Code and Revised Statutes.</subtitle>
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
    <author><name>Usufruct</name></author>
    <summary>${summary}</summary>
    <content type="html">${escapeXml(`
      <p>${summary}</p>
      <p>${ccTotalsLine}</p>
      <p>${rsTotalsLine}</p>
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

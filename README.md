# theusufruct.com

The Louisiana Civil Code as a readable, linkable, searchable web artifact.

This repository builds a static site that consumes the
[Usufruct corpus](https://github.com/bitwulf/Usufruct) and renders every Civil
Code article — active, repealed, and blank — as its own page, with stable short
URLs, full-text search, dark mode, print stylesheet, and zero runtime tracking.

The Civil Code text is public domain. The site is a downstream consumer of the
public corpus: anyone running `npm run build` on a fresh clone gets the same
output.

## Stack

| | |
| --- | --- |
| Framework | [Astro 5](https://astro.build) — static output, zero JS by default |
| Search | [Pagefind](https://pagefind.app) — index built at build time, runs in-browser |
| Typography | Source Serif 4, JetBrains Mono — self-hosted via Fontsource |
| Hosting | Cloudflare Pages (free tier) |
| Data | GitHub Releases of the Usufruct corpus, SHA-256 verified at fetch time |

## Local development

Requirements: Node 20+, `curl`, `unzip`, `shasum`.

```sh
npm install
npm run build    # one-time: builds the Pagefind index so /search works in dev
npm run dev      # fetches latest corpus, then starts Astro dev on :4321
```

The first `npm run build` is needed once because Pagefind only runs at build
time. It writes its index to `dist/_pagefind/` *and* mirrors a copy into
`public/_pagefind/` (gitignored), which is what `astro dev` actually serves.
After that, plain `npm run dev` is enough until you ship a new corpus snapshot.

Or, to pin a snapshot:

```sh
USUFRUCT_TAG=2026-05-20 npm run dev
USUFRUCT_FORCE=1 npm run dev     # bypass cached download
```

## Building

```sh
npm run build
```

This runs:

1. `scripts/fetch-corpus.sh` — downloads the corpus release zip, verifies the
   SHA-256 sidecar, and unpacks into `tmp/corpus/`. **Fails loudly** on any
   network or hash error.
2. `astro build` — renders ~4,000 static pages from the corpus.
3. `pagefind --site dist` — builds the in-browser search index into
   `dist/_pagefind/`.

Output lands in `dist/`. Total artifact: ~90 MB (most of it is per-article HTML
and the Pagefind index).

The corpus is gitignored. The build never reads from a stale cache: a missing
or mismatched archive is a hard failure, not a fallback to the previous run.

## Deploying to Cloudflare Pages

Cloudflare Pages settings:

| | |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Build root | repo root |
| Node version | `20` (set `NODE_VERSION=20` env var, or commit `.nvmrc`) |
| Required env vars | _none_ — the GitHub release URL is public |

After the first deploy, configure a **deploy hook** in Pages so future
Usufruct release publications can trigger a rebuild without a manual click.
A simple GitHub Action in the corpus repo can `POST` to the hook on each
release tag.

No `_headers` or `_redirects` files are required for v1.

## Routes

| | |
| --- | --- |
| `/` | Home — one-screen pitch |
| `/cc` | Civil Code root — Preliminary Title + Books I–IV |
| `/cc/{book-N}/{title-M}/{chapter-K}/...` | Container browse pages (~410), position-numbered |
| `/cc/{article_number}` | Article page (~3,623), flat citable URL |
| `/cc/{n}.json` | Article record as JSON |
| `/cc/{n}.md` | Article markdown (from the corpus) |
| `/search` | Pagefind UI; ⌘K from anywhere |
| `/data` | Downloads + schema reference |
| `/about` | Project story, methodology, citation |
| `/roadmap` | Forward-looking plan |
| `/colophon` | Build info, typography, schema version |
| `/feed.xml` | Atom feed — one entry per release snapshot |
| `/sitemap.xml` | Full sitemap |
| `/robots.txt` | Permissive |
| `/404` | Special-case missing article numbers — shows existing neighbors |

**Flat article URLs are stable forever.** Container URLs use position numbers
(`/cc/book-3/title-5`, not `/cc/book-3/obligations`) because names rewrite and
positions don't.

## Repo layout

```
.
├── scripts/
│   └── fetch-corpus.sh         # pull + verify + unpack corpus release
├── src/
│   ├── components/             # Breadcrumb, StatusPill, ArticleBody, CiteDialog, …
│   ├── layouts/Base.astro      # site shell, header/footer, theme toggle, ⌘K
│   ├── lib/
│   │   ├── corpus.ts           # typed loader for tmp/corpus/usufruct-<tag>/
│   │   ├── slug.ts             # URL slug helpers (Roman → Arabic, etc.)
│   │   └── cite.ts             # Bluebook / permalink / BibTeX formatters
│   ├── pages/
│   │   ├── cc/
│   │   │   ├── index.astro        # /cc — root browser
│   │   │   ├── [...slug].astro    # both article and container pages
│   │   │   ├── [article].json.ts  # /cc/{n}.json
│   │   │   └── [article].md.ts    # /cc/{n}.md
│   │   ├── index.astro            # /
│   │   ├── about.astro, data.astro, roadmap.astro, colophon.astro, search.astro
│   │   ├── 404.astro
│   │   ├── feed.xml.ts, sitemap.xml.ts, robots.txt.ts
│   └── styles/
│       ├── global.css           # palette, type scale, layout primitives
│       └── print.css            # print stylesheet — body + history only
├── public/favicon.svg
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

## Things that need to be flagged, not changed silently

These are constraints baked into v1 by design:

- **Article URLs (`/cc/{article_number}`) are stable forever.** Anything that
  breaks this is a citation contract break and should be discussed before
  merging.
- The site is editorial-serif, bone-and-ink, with one accent. Departing from
  that aesthetic is a design call, not a styling cleanup.
- No runtime tracking, no third-party scripts, no external font loads. Server-side
  analytics via Cloudflare's own anonymized counters are OK; nothing client-side.
- Multi-corpus support (LRS, Children's Code, etc.) is planned but **not
  enabled in v1**. The IA is generic enough that mounting `/rs/...` later is a
  data-plumbing task, not a redesign. Don't pre-implement it.

## License

- Civil Code text: public domain.
- Corpus pipeline (upstream): see [bitwulf/Usufruct](https://github.com/bitwulf/Usufruct).
- This site's code: same repo, same license.

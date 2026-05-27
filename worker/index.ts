// Cloudflare Worker that serves theusufruct.com from R2.
//
// Lookup rules:
//   /                       → index.html
//   /foo/                   → 308 redirect to /foo (canonical, no trailing slash)
//   /foo.ext                → foo.ext
//   /foo                    → try foo, then foo/index.html
//   miss                    → 404.html with status 404
//
// Per-data-center edge caching via the Cache API; browsers + downstream
// CDNs honor the Cache-Control header we attach.

export interface Env {
  ASSETS: R2Bucket;
}

const NOT_FOUND_KEY = '404.html';

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  map: 'application/json; charset=utf-8',
};

function contentTypeFor(key: string): string {
  const idx = key.lastIndexOf('.');
  if (idx < 0) return 'application/octet-stream';
  const ext = key.slice(idx + 1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

function cacheControlFor(key: string): string {
  if (key.startsWith('_astro/')) return 'public, max-age=31536000, immutable';
  if (key.startsWith('fonts/')) return 'public, max-age=31536000, immutable';
  if (key.startsWith('_pagefind/')) return 'public, max-age=3600';
  if (/^(favicon-|apple-touch-icon|usufruct-icon)/.test(key)) {
    return 'public, max-age=2592000';
  }
  if (key === 'sitemap.xml' || key === 'robots.txt' || key === 'feed.xml') {
    return 'public, max-age=86400';
  }
  if (key.endsWith('.json') || key.endsWith('.md')) {
    return 'public, max-age=300, stale-while-revalidate=86400';
  }
  if (
    key.endsWith('.html') ||
    key.startsWith('cc/') ||
    key.startsWith('rs/')
  ) {
    return 'public, max-age=60, stale-while-revalidate=86400';
  }
  return 'public, max-age=300';
}

async function serve(
  env: Env,
  key: string,
  status: number,
): Promise<Response | null> {
  const obj = await env.ASSETS.get(key);
  if (!obj) return null;

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentTypeFor(key));
  }
  headers.set('Cache-Control', cacheControlFor(key));
  headers.set('ETag', obj.httpEtag);

  return new Response(obj.body, { status, headers });
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Strip trailing slash (except root) → 308 redirect to canonical.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const canonical = pathname.replace(/\/+$/, '') + url.search;
    return Response.redirect(url.origin + canonical, 308);
  }

  // R2 keys never have a leading slash.
  const key = pathname === '/' ? 'index.html' : pathname.slice(1);

  // 1. Try the literal key (matches files with extensions and direct hits).
  let response = await serve(env, key, 200);
  if (response) return response;

  // 2. Try key + '/index.html' for directory-style URLs (/cc, /rs/title-14, …).
  //    Only attempt if the URL didn't already look like a file.
  if (!key.includes('.')) {
    response = await serve(env, `${key}/index.html`, 200);
    if (response) return response;
  }

  // 3. Fall through to the 404 page.
  const notFound = await serve(env, NOT_FOUND_KEY, 404);
  if (notFound) {
    notFound.headers.set('Cache-Control', 'public, max-age=60');
    return notFound;
  }
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Per-data-center edge cache, keyed by full request URL.
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await handle(request, env);

    // Cache successful responses at the edge; honor Cache-Control we set.
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      (response.status === 200 || response.status === 308)
    ) {
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  },
};

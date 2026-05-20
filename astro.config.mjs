import { defineConfig } from 'astro/config';

// theusufruct.com — static site published to Cloudflare Pages.
// No integrations: sitemap, feed, and search index are written by route handlers
// or by `pagefind` as a postbuild step.
export default defineConfig({
  site: 'https://theusufruct.com',
  trailingSlash: 'ignore',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    defaultStrategy: 'hover',
    prefetchAll: false,
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});

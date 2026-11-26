import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import site from './data/site.json' with { type: 'json' };

export default defineConfig({
  site: site.url,
  trailingSlash: 'always',
  integrations: [sitemap()],
});

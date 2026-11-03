// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://nfrancinelli.github.io',
  trailingSlash: 'always',
  integrations: [mdx()],
  // About used to be its own page; it is now a section of the home page.
  redirects: {
    '/about/': '/#about',
    '/fr/about/': '/fr/#about',
  },
});

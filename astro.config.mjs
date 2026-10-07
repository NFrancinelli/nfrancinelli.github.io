// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://nfrancinelli.github.io',
  trailingSlash: 'always',
  integrations: [mdx()],
});

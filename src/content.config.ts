import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One folder per project, one file per language:
//   src/content/projects/<slug>/en.mdx   (required)
//   src/content/projects/<slug>/fr.mdx   (optional, falls back to English)
const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      status: z.enum(['complete', 'in-progress']),
      // When the project was finished, or started if still in progress.
      // Projects are listed newest first.
      date: z.coerce.date(),
      thumbnail: image(),
      thumbnailAlt: z.string(),
      role: z.string(),
      team: z.string().optional(),
      stack: z.array(z.string()),
      hardware: z.array(z.string()).optional(),
      links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    }),
});

export const collections = { projects };

import { getCollection, type CollectionEntry } from 'astro:content';
import { defaultLocale, type Locale } from './i18n';

export type Project = {
  slug: string;
  entry: CollectionEntry<'projects'>;
  /** True when the requested language is missing and English is shown instead. */
  isFallback: boolean;
};

/** Every project, in the requested language where it exists, else in English. */
export async function getProjects(locale: Locale): Promise<Project[]> {
  const entries = await getCollection('projects');
  const bySlug = new Map<string, Partial<Record<Locale, CollectionEntry<'projects'>>>>();

  for (const entry of entries) {
    const [slug, lang] = entry.id.split('/') as [string, Locale];
    const versions = bySlug.get(slug) ?? {};
    versions[lang] = entry;
    bySlug.set(slug, versions);
  }

  const projects: Project[] = [];
  for (const [slug, versions] of bySlug) {
    const entry = versions[locale] ?? versions[defaultLocale];
    if (!entry) throw new Error(`Project "${slug}" has no English version (en.mdx).`);
    projects.push({ slug, entry, isFallback: !versions[locale] });
  }

  return projects.sort((a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime());
}

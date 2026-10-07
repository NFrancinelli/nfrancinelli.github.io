import fs from 'node:fs';
import type { Locale } from './i18n';
import { site } from './site';

/** URL of the public CV for this language (English if no translation), or null until a PDF is added. */
export function cvUrl(locale: Locale): string | null {
  for (const file of [site.cv[locale], site.cv.en]) {
    if (fs.existsSync(`public/${file}`)) return `/${file}`;
  }
  return null;
}

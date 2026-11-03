import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Locale } from './i18n';
import { site } from './site';

/**
 * URL of the public CV for this language (English if no translation), or null until a PDF is added.
 * The `?v=` part changes whenever the PDF changes, so browsers never show an old cached copy.
 * It doesn't change the file name people get when they download it.
 */
export function cvUrl(locale: Locale): string | null {
  for (const file of [site.cv[locale], site.cv.en]) {
    const path = `public/${file}`;
    if (!fs.existsSync(path)) continue;
    const version = createHash('sha256').update(fs.readFileSync(path)).digest('hex').slice(0, 8);
    return `/${file}?v=${version}`;
  }
  return null;
}

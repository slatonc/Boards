import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Publish an explicit storefront allowlist. Never copy the repository root:
// it also contains fulfillment code, credentials, recordings and private output.
const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pages = ['index.html', 'privacy.html', 'terms.html', 'about.html', '404.html', 'book-intro.html'];
const files = [...pages, 'style.css', 'script.js', 'guides.css', 'book-intro.css', 'book-intro.js', '_headers', '_redirects', 'robots.txt', 'sitemap.xml'];
const assets = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon.svg', 'logo.svg', 'hero.jpg', 'feature-presentation-first.svg', 'feature-beside-qbank.svg', 'feature-your-book.svg', 'video-cardiology.png', 'video-pulmonology.png', 'video-nephrology.png', 'video-gim.png', 'video-cover.png', 'book-intro-narration.m4a', 'Cardiology_preview.pdf', 'Pulm_preview.pdf', 'Neph_preview.pdf'];
for (const file of files) await cp(new URL(file, import.meta.url), new URL(file, output));
await mkdir(new URL('assets/', output));
for (const file of assets) await cp(new URL('assets/' + file, import.meta.url), new URL('assets/' + file, output));
await mkdir(new URL('study-guides/', output));
const htmlFiles = [...pages];
for (const file of await readdir(new URL('./study-guides/', import.meta.url))) {
  if (file.endsWith('.html')) {
    await cp(new URL('study-guides/' + file, import.meta.url), new URL('study-guides/' + file, output));
    htmlFiles.push('study-guides/' + file);
  }
}
// New page markup must load its matching styles, even when the browser has
// cached a previous deployment's CSS for several hours.
for (const stylesheet of ['style.css', 'guides.css']) {
  const hash = createHash('sha256').update(await readFile(new URL(stylesheet, output))).digest('hex').slice(0, 12);
  for (const file of htmlFiles) {
    const path = new URL(file, output);
    const html = await readFile(path, 'utf8');
    const updated = html.replaceAll(`href="${stylesheet}"`, `href="${stylesheet}?v=${hash}"`)
      .replaceAll(`href="/${stylesheet}"`, `href="/${stylesheet}?v=${hash}"`);
    if (updated !== html) await writeFile(path, updated);
  }
}
console.log('Built public storefront in dist/');

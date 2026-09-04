import { cp, mkdir, readdir, rm } from 'node:fs/promises';

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
for (const file of await readdir(new URL('./study-guides/', import.meta.url))) {
  if (file.endsWith('.html')) await cp(new URL('study-guides/' + file, import.meta.url), new URL('study-guides/' + file, output));
}
console.log('Built public storefront in dist/');

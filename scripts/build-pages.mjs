import { readFileSync, writeFileSync } from 'node:fs';
import { pageMetadata, siteOrigin } from '../src/metadata.ts';

const template = readFileSync('dist/index.html','utf8');
const escape = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for (const [path,file] of [['/','index'],['/vote','vote'],['/register','register'],['/peserta','peserta'],['/admin','admin'],['/tiket/verifikasi/token','ticket']]) {
  const meta = pageMetadata(path);
  const heroPreload = path === '/' ? '<link rel="preload" as="image" href="/assets/register-awards-wallpaper-v2.webp" fetchpriority="high" />' : '';
  const html = template.replace('<head>', `<head>\n    ${heroPreload}`).replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(meta.description)}" />`).replace('</head>', `
    <link rel="canonical" href="${meta.canonical}" />
    <meta name="robots" content="${meta.robots}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="id_ID" />
    <meta property="og:site_name" content="LCC Awards 2026" />
    <meta property="og:title" content="${escape(meta.title)}" />
    <meta property="og:description" content="${escape(meta.description)}" />
    <meta property="og:url" content="${meta.canonical}" />
    <meta property="og:image" content="${meta.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="LCC NTB Awards 2026 — Merayakan karya, mengangkat cerita." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(meta.title)}" />
    <meta name="twitter:description" content="${escape(meta.description)}" />
    <meta name="twitter:image" content="${meta.image}" />
  </head>`);
  writeFileSync(`dist/${file}.html`,html);
}
writeFileSync('dist/robots.txt',`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /peserta\nDisallow: /tiket/\nDisallow: /receipts/\nSitemap: ${siteOrigin}/sitemap.xml\n`);
writeFileSync('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/register','/vote'].map(path=>`<url><loc>${siteOrigin}${path}</loc></url>`).join('')}</urlset>`);
console.log('Page titles, Open Graph covers, canonical links, and sitemap generated.');

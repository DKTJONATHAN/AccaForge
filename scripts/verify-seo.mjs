import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../src/site-origin.ts', import.meta.url), 'utf8');
const origin = config.match(/SITE_ORIGIN\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!origin) throw new Error('Could not read SITE_ORIGIN from src/site-origin.ts');

function stripTags(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capture(html, pattern) {
  return html.match(pattern)?.[1]?.trim() ?? '';
}

async function main() {
  const sitemapResponse = await fetch(new URL('/sitemap.xml', origin));
  if (!sitemapResponse.ok) throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}`);
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, '&'))
    .slice(0, 10);
  if (!urls.length) throw new Error('Sitemap did not contain any <loc> URLs.');

  console.log(`SEO verification for ${origin} — checking ${urls.length} sitemap URLs\n`);
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'SiteSeoVerifier/1.0' } });
      const html = await response.text();
      const mainHtml = capture(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i) || capture(html, /<body\b[^>]*>([\s\S]*?)<\/body>/i) || html;
      const title = stripTags(capture(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
      const h1 = stripTags(capture(mainHtml, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
      const canonical = capture(html, /<link\b[^>]*rel=['"]canonical['"][^>]*href=['"]([^'"]+)['"]/i)
        || capture(html, /<link\b[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]canonical['"]/i);
      const robots = capture(html, /<meta\b[^>]*name=['"]robots['"][^>]*content=['"]([^'"]+)['"]/i)
        || capture(html, /<meta\b[^>]*content=['"]([^'"]+)['"][^>]*name=['"]robots['"]/i);
      const jsonLd = [...html.matchAll(/<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)]
        .flatMap((match) => { try { const data = JSON.parse(match[1]); const values = Array.isArray(data) ? data : data['@graph'] ?? [data]; return values.map((entry) => entry['@type']).flat().filter(Boolean); } catch { return ['INVALID_JSON']; } });
      const words = stripTags(mainHtml).split(/\s+/).filter(Boolean).length;
      console.log(JSON.stringify({ status: response.status, finalUrl: response.url, canonical, robots, title, h1, initialHtmlWords: words, jsonLdTypes: [...new Set(jsonLd)] }));
    } catch (error) {
      console.log(JSON.stringify({ requestedUrl: url, error: error.message }));
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

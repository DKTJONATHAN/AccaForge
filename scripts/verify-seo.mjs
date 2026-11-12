import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../src/site-origin.ts', import.meta.url), 'utf8');
const origin = config.match(/SITE_ORIGIN\\s*=\\s*['"]([^'"]+)['"]/)?.[1];
if (!origin) throw new Error('Could not read SITE_ORIGIN from src/site-origin.ts');

const headers = { 'user-agent': 'SiteSeoVerifier/2.0' };
const concurrency = 8;

function stripTags(value) {
  return value.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\\d+;|&[a-z]+;/gi, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function capture(html, pattern) {
  return html.match(pattern)?.[1]?.trim() ?? '';
}

function unique(values) {
  return [...new Set(values)];
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }));
  return results;
}

async function request(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', headers });
    return { url, status: response.status, finalUrl: response.url, html: await response.text() };
  } catch (error) {
    return { url, status: 0, error: error.message, html: '' };
  }
}

async function main() {
  const sitemapResponse = await fetch(new URL('/sitemap.xml', origin), { headers });
  if (!sitemapResponse.ok) throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}`);
  const sitemap = await sitemapResponse.text();
  const urls = unique([...sitemap.matchAll(/<loc>\\s*([^<]+)\\s*<\\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, '&')));
  if (!urls.length) throw new Error('Sitemap did not contain any <loc> URLs.');

  console.log(`SEO verification for ${origin} — checking all ${urls.length} sitemap URLs`);

  const pageResults = await mapLimit(urls, concurrency, async (url) => {
    const result = await request(url);
    if (!result.status || result.status < 200 || result.status >= 300) {
      return { ...result, issues: [`Sitemap page returned HTTP ${result.status || 'network error'}`], links: [] };
    }

    const html = result.html;
    const mainHtml = capture(html, /<main\\b[^>]*>([\\s\\S]*?)<\\/main>/i)
      || capture(html, /<body\\b[^>]*>([\\s\\S]*?)<\\/body>/i) || html;
    const title = stripTags(capture(html, /<title\\b[^>]*>([\\s\\S]*?)<\\/title>/i));
    const h1 = stripTags(capture(mainHtml, /<h1\\b[^>]*>([\\s\\S]*?)<\\/h1>/i));
    const canonical = capture(html, /<link\\b[^>]*rel=['"]canonical['"][^>]*href=['"]([^'"]+)['"]/i)
      || capture(html, /<link\\b[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]canonical['"]/i);
    const jsonLdMatches = [...html.matchAll(/<script\\b[^>]*type=['"]application\\/ld\\+json['"][^>]*>([\\s\\S]*?)<\\/script>/gi)];
    const invalidJsonLd = jsonLdMatches.some((match) => {
      try { JSON.parse(match[1]); return false; } catch { return true; }
    });
    const links = [...html.matchAll(/<a\\b[^>]*href=['"]([^'"#]+)['"]/gi)]
      .map((match) => {
        try {
          const target = new URL(match[1], result.finalUrl);
          return target.origin === new URL(origin).origin && !target.pathname.startsWith('/api/')
            ? target.href : null;
        } catch { return null; }
      }).filter(Boolean);
    const issues = [];
    if (!title) issues.push('Missing title');
    if (!h1) issues.push('Missing H1');
    if (!canonical) issues.push('Missing canonical URL');
    if (invalidJsonLd) issues.push('Invalid JSON-LD');
    return {
      ...result,
      title,
      h1,
      canonical,
      words: stripTags(mainHtml).split(/\\s+/).filter(Boolean).length,
      jsonLdBlocks: jsonLdMatches.length,
      issues,
      links
    };
  });

  const internalLinks = unique(pageResults.flatMap((page) => page.links || []))
    .filter((url) => !urls.includes(url));
  const linkResults = await mapLimit(internalLinks, concurrency, async (url) => {
    const result = await request(url);
    return { url, status: result.status, finalUrl: result.finalUrl, error: result.error };
  });

  const brokenLinks = linkResults.filter((item) => !item.status || item.status < 200 || item.status >= 400);
  const pagesWithIssues = pageResults.filter((page) => page.issues?.length);
  for (const page of pageResults) {
    console.log(JSON.stringify({
      url: page.url,
      status: page.status,
      title: page.title || '',
      h1: page.h1 || '',
      canonical: page.canonical || '',
      words: page.words || 0,
      jsonLdBlocks: page.jsonLdBlocks || 0,
      issues: page.issues || []
    }));
  }
  console.log(JSON.stringify({
    sitemapPagesChecked: pageResults.length,
    internalLinksChecked: linkResults.length,
    pagesWithIssues: pagesWithIssues.length,
    brokenInternalLinks: brokenLinks.length,
    brokenLinks
  }, null, 2));

  if (pagesWithIssues.length || brokenLinks.length) {
    throw new Error('SEO verification found page metadata issues or broken internal links.');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

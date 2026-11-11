#!/usr/bin/env bash
set -euo pipefail

ORIGIN="$(sed -n "s/.*SITE_ORIGIN = '\([^']*\)'.*/\1/p" src/site-origin.ts)"
if [[ -z "$ORIGIN" ]]; then
  echo "Could not read SITE_ORIGIN from src/site-origin.ts" >&2
  exit 1
fi

SITEMAP="$(curl -fsSL "$ORIGIN/sitemap.xml")"
mapfile -t URLS < <(printf '%s' "$SITEMAP" | sed -n 's:.*<loc>\([^<]*\)</loc>.*:\1:p' | head -n 10)
if [[ "${#URLS[@]}" -eq 0 ]]; then
  echo "No URLs found in sitemap." >&2
  exit 1
fi

echo "SEO verification for $ORIGIN — checking ${#URLS[@]} sitemap URLs"
for URL in "${URLS[@]}"; do
  HTML_FILE="$(mktemp)"
  META="$(curl -sSL -o "$HTML_FILE" -w '%{http_code}|%{url_effective}' "$URL" || true)"
  node - "$HTML_FILE" "$META" "$URL" <<'NODE'
const fs = require('node:fs');
const [file, meta, requestedUrl] = process.argv.slice(2);
const html = fs.readFileSync(file, 'utf8');
const [status, finalUrl] = meta.split('|');
const clean = (s = '') => s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#\d+;|&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();
const capture = (re) => html.match(re)?.[1]?.trim() || '';
const main = capture(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || capture(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
const title = clean(capture(/<title\b[^>]*>([\s\S]*?)<\/title>/i));
const h1 = clean(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
const canonical = capture(/<link\b[^>]*rel=['"]canonical['"][^>]*href=['"]([^'"]+)['"]/i) ||
  capture(/<link\b[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]canonical['"]/i);
const robots = capture(/<meta\b[^>]*name=['"]robots['"][^>]*content=['"]([^'"]+)['"]/i) ||
  capture(/<meta\b[^>]*content=['"]([^'"]+)['"][^>]*name=['"]robots['"]/i);
const types = [...html.matchAll(/<script\b[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi)]
  .flatMap((m) => { try { const v = JSON.parse(m[1]); const entries = Array.isArray(v) ? v : v['@graph'] || [v]; return entries.map((x) => x['@type']).flat().filter(Boolean); } catch { return ['INVALID_JSON']; } });
const words = clean(main).split(/\s+/).filter(Boolean).length;
console.log(JSON.stringify({ status, requestedUrl, finalUrl, canonical, robots, title, h1, initialHtmlWords: words, jsonLdTypes: [...new Set(types)] }));
NODE
  rm -f "$HTML_FILE"
done

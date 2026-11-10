export interface ContentEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
}
export interface CachedNews {
  id: string; title: string; url: string; source: string; published_at: string;
  image_url: string; image_credit: string;
}
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function ensureContentTables(env: ContentEnv) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS content_news (id TEXT PRIMARY KEY,title TEXT NOT NULL,url TEXT NOT NULL UNIQUE,source TEXT NOT NULL,published_at TEXT NOT NULL,image_key TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS content_media (key TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,source_url TEXT NOT NULL,credit TEXT NOT NULL,license TEXT NOT NULL,license_url TEXT NOT NULL,description_url TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS team_badges (team_name TEXT PRIMARY KEY,normalized_name TEXT NOT NULL,image_key TEXT NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sports_leagues (sport_key TEXT PRIMARY KEY,league_id INTEGER NOT NULL,season INTEGER NOT NULL,league_name TEXT NOT NULL,country TEXT NOT NULL DEFAULT '',logo_url TEXT NOT NULL DEFAULT '',logo_key TEXT NOT NULL DEFAULT '',standings_json TEXT NOT NULL DEFAULT '[]',last_attempt_date TEXT NOT NULL DEFAULT '',last_enriched_date TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  ]);
}
async function cacheCommonsPhoto(env: ContentEnv, term: string) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.search = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: term,
    gsrnamespace: "6", gsrlimit: "20", prop: "imageinfo",
    iiprop: "url|extmetadata", iiurlwidth: "1200",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription",
    format: "json"
  }).toString();
  const response = await fetch(api, { headers: { "User-Agent": "AccaForge/1.0 (info@jonathanmwaniki.co.ke)" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Wikimedia Commons search failed: " + response.status);
  const data = await response.json() as any;
  const pages = Object.values(data.query?.pages || {}) as any[];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const license = clean(meta.LicenseShortName?.value).toLowerCase();
    const allowed = /^(cc0|public domain|cc by 4\.0|cc by-sa 4\.0|cc by 3\.0|cc by-sa 3\.0)$/.test(license);
    if (!allowed || !info?.thumburl || !info?.descriptionurl) continue;
    const imageResponse = await fetch(info.thumburl, { headers: { "User-Agent": "AccaForge/1.0 (info@jonathanmwaniki.co.ke)" }, signal: AbortSignal.timeout(12000) });
    if (!imageResponse.ok) continue;
    const type = imageResponse.headers.get("content-type") || "";
    if (!type.startsWith("image/")) continue;
    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength < 12000 || bytes.byteLength > 5_000_000) continue;
    const key = "photos/" + await hash(page.title + info.thumburl) + "." + (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");
    const credit = clean(meta.Artist?.value || meta.Credit?.value || "Wikimedia Commons contributor");
    const licenseUrl = clean(meta.LicenseUrl?.value || "");
    const title = clean(page.title.replace(/^File:/, ""));
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { title, credit, license, licenseUrl, descriptionUrl: info.descriptionurl } });
    await env.DB.prepare("INSERT OR REPLACE INTO content_media (key,kind,title,source_url,credit,license,license_url,description_url) VALUES (?,'photo',?,?,?,?,?,?)")
      .bind(key, title, info.thumburl, credit, license, licenseUrl, info.descriptionurl).run();
    return { key, credit, title, license, licenseUrl, descriptionUrl: info.descriptionurl };
  }
  return null;
}
async function cacheTeamBadge(env: ContentEnv, team: string) {
  const existing = await env.DB.prepare("SELECT image_key FROM team_badges WHERE team_name=?").bind(team).first<{image_key:string}>();
  if (existing?.image_key) return;
  const api = new URL("https://www.thesportsdb.com/api/v1/json/123/searchteams.php");
  api.searchParams.set("t", team);
  const response = await fetch(api, { headers: { "User-Agent": "AccaForge/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return;
  const data = await response.json() as any;
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const normalized = (value: string) => value.toLowerCase().replace(/\b(fc|afc|cf|sc)\b/g, "").replace(/[^a-z0-9]/g, "");
  const match = teams.find((item: any) => normalized(item.strTeam || "") === normalized(team));
  if (!match?.strTeamBadge) return;
  const imageResponse = await fetch(match.strTeamBadge, { headers: { "User-Agent": "AccaForge/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!imageResponse.ok) return;
  const type = imageResponse.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return;
  const bytes = await imageResponse.arrayBuffer();
  if (bytes.byteLength < 500 || bytes.byteLength > 2_000_000) return;
  const key = "teams/" + await hash(normalized(team)) + (type.includes("png") ? ".png" : ".jpg");
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  await env.DB.prepare("INSERT OR REPLACE INTO team_badges (team_name,normalized_name,image_key,source_url,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(team, normalized(team), key, match.strTeamBadge).run();
}
export async function refreshDailyContent(env: ContentEnv) {
  await ensureContentTables(env);
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const newsUrl = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  newsUrl.search = new URLSearchParams({
    query: '(football OR soccer) AND (Premier League OR Champions League OR La Liga OR Bundesliga OR Serie A OR football)',
    mode: "artlist", format: "json", maxrecords: "30", sort: "datedesc",
    startdatetime: stamp(start), enddatetime: stamp(now)
  }).toString();
  const newsResponse = await fetch(newsUrl, { headers: { "User-Agent": "AccaForge/1.0 (info@jonathanmwaniki.co.ke)" }, signal: AbortSignal.timeout(15000) });
  if (!newsResponse.ok) throw new Error("GDELT news refresh failed: " + newsResponse.status);
  const newsPayload = await newsResponse.json() as any;
  const articles = (Array.isArray(newsPayload.articles) ? newsPayload.articles : [])
    .filter((item: any) => item.url && item.title && /^https?:\/\//i.test(item.url))
    .slice(0, 24);

  // Save headlines before requesting artwork. A slow or unavailable image provider
  // must never prevent the daily news feed from appearing.
  const articleIds: string[] = [];
  for (const item of articles) {
    const id = await hash(item.url);
    articleIds.push(id);
    const published = String(item.seendate || now.toISOString());
    const parsed = /^\d{14}$/.test(published)
      ? published.slice(0,4)+"-"+published.slice(4,6)+"-"+published.slice(6,8)+"T"+published.slice(8,10)+":"+published.slice(10,12)+":"+published.slice(12,14)+"Z"
      : now.toISOString();
    await env.DB.prepare("INSERT INTO content_news (id,title,url,source,published_at,image_key) VALUES (?,?,?,?,?,'') ON CONFLICT(url) DO UPDATE SET title=excluded.title,source=excluded.source,published_at=excluded.published_at")
      .bind(id, clean(item.title).slice(0, 240), item.url, clean(item.domain || new URL(item.url).hostname), parsed).run();
  }

  const photoTerms = ["association football stadium", "football match action", "football supporters crowd", "soccer player in action", "football pitch stadium"];
  const photos: any[] = [];
  for (const term of photoTerms) {
    try { const photo = await cacheCommonsPhoto(env, term); if (photo) photos.push(photo); }
    catch (error) { console.error("Commons photo cache failed", term, error); }
    await wait(500);
  }
  if (photos.length && articleIds.length) {
    for (let index = 0; index < articleIds.length; index++) {
      await env.DB.prepare("UPDATE content_news SET image_key=? WHERE id=? AND image_key=''")
        .bind(photos[index % photos.length].key, articleIds[index]).run();
    }
  }
  const rows = await env.DB.prepare("SELECT s.home_team,s.away_team FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' AND datetime(s.commence_time) >= datetime('now','-1 day') AND datetime(s.commence_time) <= datetime('now','+30 days') ORDER BY s.commence_time ASC LIMIT 60").all<{home_team:string;away_team:string}>();
  const names = [...new Set((rows.results || []).flatMap(row => [row.home_team,row.away_team]).filter(Boolean))];
  let checked = 0;
  for (const team of names) {
    const exists = await env.DB.prepare("SELECT 1 AS found FROM team_badges WHERE team_name=?").bind(team).first();
    if (exists) continue;
    if (checked >= 24) break;
    try { await cacheTeamBadge(env, team); } catch (error) { console.error("Team badge cache failed", team, error); }
    checked++;
    await wait(2100);
  }
  await env.DB.prepare("DELETE FROM content_news WHERE published_at < datetime('now','-14 days')").run();
  const expiredPhotos = await env.DB.prepare("SELECT key FROM content_media WHERE kind='photo' AND created_at < datetime('now','-14 days')").all<{key:string}>();
  for (const photo of expiredPhotos.results || []) await env.MEDIA.delete(photo.key);
  await env.DB.prepare("DELETE FROM content_media WHERE kind='photo' AND created_at < datetime('now','-14 days')").run();
  return { news: articles.length, photos: photos.length, teams_checked: checked, refreshed_at: now.toISOString() };
}
export async function cacheSportsArtwork(env: ContentEnv) {
  await ensureContentTables(env);
  const [teams, leagues] = await Promise.all([
    env.DB.prepare("SELECT team_name,source_url FROM team_badges WHERE image_key='' AND source_url LIKE 'https://%' LIMIT 40").all<{team_name:string;source_url:string}>(),
    env.DB.prepare("SELECT sport_key,logo_url FROM sports_leagues WHERE logo_key='' AND logo_url LIKE 'https://%' LIMIT 20").all<{sport_key:string;logo_url:string}>()
  ]);
  let teamsCached = 0;
  let leaguesCached = 0;
  const cacheImage = async (sourceUrl: string, folder: "teams" | "leagues") => {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "AccaForge/1.0 (+https://accaforge.eu.cc)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("Artwork download returned HTTP " + response.status);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "";
    if (!extension) throw new Error("Unsupported artwork content type: " + contentType);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 100 || bytes.byteLength > 2_000_000) throw new Error("Artwork size outside the allowed range.");
    const key = folder + "/" + await hash(sourceUrl) + "." + extension;
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }
    });
    return key;
  };
  for (const item of teams.results || []) {
    try {
      const key = await cacheImage(item.source_url, "teams");
      await env.DB.prepare("UPDATE team_badges SET image_key=?,updated_at=CURRENT_TIMESTAMP WHERE team_name=? AND image_key=''")
        .bind(key, item.team_name).run();
      teamsCached++;
    } catch (error) {
      console.warn("Team crest R2 cache failed for " + item.team_name, error);
    }
  }
  for (const item of leagues.results || []) {
    try {
      const key = await cacheImage(item.logo_url, "leagues");
      await env.DB.prepare("UPDATE sports_leagues SET logo_key=?,updated_at=CURRENT_TIMESTAMP WHERE sport_key=? AND logo_key=''")
        .bind(key, item.sport_key).run();
      leaguesCached++;
    } catch (error) {
      console.warn("Competition logo R2 cache failed for " + item.sport_key, error);
    }
  }
  return { teamsCached, leaguesCached, teamsPending: teams.results?.length || 0, leaguesPending: leagues.results?.length || 0 };
}

export async function getCachedContent(env: ContentEnv) {
  await ensureContentTables(env);
  const [newsResult, mediaResult, badgesResult, sportsResult] = await Promise.all([
    env.DB.prepare("SELECT n.id,n.title,n.url,n.source,n.published_at,n.image_key,m.credit AS stored_credit,m.license AS stored_license,m.license_url AS stored_license_url,m.description_url AS stored_description_url FROM content_news n LEFT JOIN content_media m ON m.key=n.image_key ORDER BY n.published_at DESC LIMIT 12").all<any>(),
    env.DB.prepare("SELECT key,title,credit,license,license_url,description_url FROM content_media WHERE kind='photo' ORDER BY created_at DESC LIMIT 6").all<any>(),
    env.DB.prepare("SELECT team_name,image_key,source_url FROM team_badges").all<any>(),
    env.DB.prepare("SELECT sport_key,logo_key,standings_json,league_name,updated_at FROM sports_leagues WHERE last_enriched_date<>''").all<any>()
  ]);
  const photos = mediaResult.results || [];
  const news = (newsResult.results || []).map((item: any, index: number) => ({
    id: item.id, title: item.title, url: item.url, source: item.source, published_at: item.published_at,
    image_url: item.image_key ? "/media-cache/" + encodeURIComponent(item.image_key) : photos[index % Math.max(photos.length,1)] ? "/media-cache/" + encodeURIComponent(photos[index % photos.length].key) : "",
    image_credit: item.stored_credit || photos[index % Math.max(photos.length,1)]?.credit || "",
    image_license: item.stored_license || photos[index % Math.max(photos.length,1)]?.license || "",
    image_license_url: item.stored_license_url || photos[index % Math.max(photos.length,1)]?.license_url || "",
    image_source_url: item.stored_description_url || photos[index % Math.max(photos.length,1)]?.description_url || ""
  }));
  const teamBadges: Record<string,string> = {};
  for (const badge of badgesResult.results || []) teamBadges[badge.team_name] = badge.image_key ? "/media-cache/" + encodeURIComponent(badge.image_key) : (badge.source_url || "");
  const sportsRows=sportsResult.results||[];
  const leagueBadges:Record<string,string>={};
  const leagueTables:Record<string,Array<{position:number;team:string;played:number;won:number;drawn:number;lost:number;goalsFor:number;goalsAgainst:number;goalDifference:number;points:number;form:string}>>={};
  for(const league of sportsRows){
    leagueBadges[league.sport_key]=league.logo_key?"/media-cache/"+encodeURIComponent(league.logo_key):(league.logo_url||"");
    try{leagueTables[league.sport_key]=JSON.parse(league.standings_json||"[]");}catch{leagueTables[league.sport_key]=[];}
  }
  const hero = photos[0] ? { image_url: "/media-cache/" + encodeURIComponent(photos[0].key), title: photos[0].title, credit: photos[0].credit, license: photos[0].license, license_url: photos[0].license_url, source_url: photos[0].description_url } : null;
  return { news, photos: photos.map((photo: any) => ({ image_url: "/media-cache/" + encodeURIComponent(photo.key), title: photo.title, credit: photo.credit, license: photo.license, license_url: photo.license_url, source_url: photo.description_url })), teamBadges, leagueBadges, leagueTables, hero, updatedAt: news[0]?.published_at || null };
}
export async function serveCachedMedia(env: ContentEnv, key: string) {
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
export async function cachedContentResponse(env: ContentEnv) {
  try { return Response.json(await getCachedContent(env), { headers: jsonHeaders }); }
  catch (error) { console.error("AccaForge content cache read failed", error); return Response.json({ news: [], photos: [], teamBadges: {}, leagueBadges: {}, leagueTables: {}, hero: null, updatedAt: null }, { headers: jsonHeaders }); }
}

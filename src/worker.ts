import { onRequestGet as getAccas } from "../functions/api/accas";
import { onRequestGet as getHealth } from "../functions/api/health";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToReadableStream } from "react-dom/server";
import App from "./App";
import type { AccasResponse } from "./types";
import { cachedContentResponse, getCachedContent, refreshDailyContent, serveCachedMedia } from "./content";
import { refreshYesterdayResults, resultsApi } from "./results";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  ODDSAPI_KEY?: string;
  ODDSAPI_KEY1?: string;
  ODDSAPI_KEY2?: string;
  ODDSAPI_KEY3?: string;
  ODDS_API_KEY?: string;
}
interface AccaRow {
  id:string; target_odds:number; actual_odds:number; status:string;
  headline:string; analysis_note:string; publish_date:string; created_at:string;
}
interface SelectionRow {
  id:string; acca_id:string; event_id:string; sport_key:string; commence_time:string;
  home_team:string; away_team:string; market_key:string; market_name:string;
  selection_name:string; odds:number; bookmaker:string; note:string; sort_order:number;
}
interface MatchRow extends SelectionRow {
  edition_id:string; target_odds:number; actual_odds:number;
  publish_date:string; headline:string;
}

const htmlEntities:Record<string,string> = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const xmlEntities:Record<string,string> = {"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"};
const escapeHtml = (value:unknown) => String(value ?? "").replace(/[&<>"']/g, char => htmlEntities[char] || char);
const escapeXml = (value:string) => value.replace(/[<>&'"]/g, char => xmlEntities[char] || char);
const safeJson = (value:unknown) => String(JSON.stringify(value ?? null)).replace(/</g,"\\u003c");
const competitionName = (key:string) => ({
  soccer_epl:"English Premier League",
  soccer_uefa_champs_league:"UEFA Champions League",
  soccer_uefa_europa_league:"UEFA Europa League",
  soccer_spain_la_liga:"Spanish La Liga",
  soccer_germany_bundesliga:"German Bundesliga",
  soccer_italy_serie_a:"Italian Serie A",
  soccer_france_ligue_one:"French Ligue 1",
  soccer_netherlands_eredivisie:"Dutch Eredivisie",
  soccer_portugal_primeira_liga:"Portuguese Primeira Liga",
  soccer_usa_mls:"Major League Soccer"
} as Record<string,string>)[key] || "Football";
const dateTime = (value:string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})+" EAT";
};
const siteStyles = [
  ":root{color-scheme:light;--page:#f5f7fa;--surface:#fff;--raised:#edf1f5;--ink:#152231;--secondary:#465568;--muted:#667487;--line:#d9e0e8;--navy:#07111f;--green:#087b4a;font-family:'DM Sans',Arial,sans-serif}",
  "*{box-sizing:border-box}html{background:var(--page)}body{margin:0;background:var(--page);color:var(--ink);line-height:1.65;font-size:15px}a{color:var(--green);text-underline-offset:3px}a:hover{color:#075f3a}",
  ".shell{max-width:1280px;margin:0 auto;padding:0 40px}.top{height:68px;border-bottom:1px solid var(--line);background:var(--page)}.topin{height:100%;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{font-family:'Barlow Condensed','DM Sans',sans-serif;font-size:28px;font-weight:600;letter-spacing:-.3px;color:var(--ink);text-decoration:none}.brand span{color:var(--green)}nav{display:flex;gap:20px;flex-wrap:wrap}.desktop-nav a{font-size:12px;color:var(--secondary);text-decoration:none}.desktop-nav a:hover{color:var(--green)}",
  "main{padding-top:42px;padding-bottom:64px;max-width:940px}main h1{font:500 clamp(36px,5vw,54px)/1.05 'Barlow Condensed','DM Sans',sans-serif;letter-spacing:-.3px;color:var(--navy);margin:0 0 18px;max-width:20ch}h2{font:500 29px/1.15 'Barlow Condensed','DM Sans',sans-serif;color:var(--navy);margin:34px 0 10px}h3{font:600 17px 'DM Sans',sans-serif;color:var(--ink);margin:0 0 8px}p,li{color:var(--secondary);font-size:14px}p{max-width:78ch}ul{padding-left:22px}.lead{font-size:17px;line-height:1.65;max-width:70ch;color:var(--secondary)}",
  ".crumb{font-size:11px;color:var(--muted);margin-bottom:25px}.crumb a{color:var(--green)}.panel{border:1px solid var(--line);background:var(--surface);padding:22px;margin:24px 0}.facts{display:flex;gap:22px;flex-wrap:wrap;color:var(--secondary);font-size:12px}.facts strong{color:var(--ink)}.list{padding:0;list-style:none}.list li{padding:16px 0;border-top:1px solid var(--line)}.list li:first-child{border-top:0}.list a{display:block;text-decoration:none;color:var(--ink);font-weight:600}.list small{display:block;color:var(--muted);font-size:11px;margin-top:6px}.price{float:right;color:var(--green);font:500 13px 'IBM Plex Mono',monospace}.button{display:inline-flex;align-items:center;justify-content:center;background:var(--navy);color:#fff;padding:12px 18px;border-radius:7px;text-decoration:none;font-weight:600;font-size:12px;min-height:42px}.button:hover{background:#14283d;color:#fff}.notice{background:var(--raised);padding:15px 18px;margin:24px 0;color:var(--secondary)}.feature-photo{display:flex;gap:24px;align-items:center;background:var(--raised);padding:20px;margin:24px 0}.feature-photo img{width:180px;height:230px;object-fit:cover;object-position:center 25%}.footer{border-top:1px solid var(--line);padding:22px 0 32px;color:var(--muted);font-size:11px}.footer nav{margin:13px 0;gap:10px 17px}.footer nav a{font-size:11px;color:var(--secondary);text-decoration:none}.footer strong{font:600 25px 'Barlow Condensed','DM Sans',sans-serif;color:var(--navy)}.footer p{font-size:11px;margin-bottom:0}.mobile-dock{display:none}",
  "@media(max-width:760px){.shell{padding-left:17px;padding-right:17px}.top{height:60px}.topin nav{display:none}main{padding-top:30px;padding-bottom:40px}.lead{font-size:15px}p,li{font-size:13px}.feature-photo{gap:14px;padding:14px}.feature-photo img{width:110px;height:150px}main h1{font-size:40px}.mobile-dock{position:fixed;left:0;right:0;bottom:0;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);min-height:64px;padding:7px 8px max(7px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line)}.mobile-dock a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:11px;text-decoration:none;min-height:48px}.mobile-dock a.active{color:var(--green);font-weight:600}body{padding-bottom:72px}}"
].join("");

const staticPages:Record<string,{title:string;description:string;body:string}> = {
  "/about":{
    title:"About AccaForge | Football Accumulator Analysis",
    description:"Learn about AccaForge, its owner Jonathan Mwaniki and the Za Ndani Tipsters football editorial team.",
    body:"<h1>About AccaForge</h1><p class='lead'>AccaForge is a football analysis and accumulator information website built to make daily selections, fixtures and decimal odds easier to review.</p><h2>Who is behind AccaForge?</h2><p>AccaForge is owned by <strong>Jonathan Mwaniki</strong>. Football tips and editorial selections are published by <strong>Za Ndani Tipsters</strong>, the tipster team from the owners of <a href='https://zandani.co.ke/' rel='noopener'>Za Ndani (zandani.co.ke)</a>.</p><h2>What the website publishes</h2><p>The daily board presents three football accumulator odds targets: 10.00, 15.00 and 20.00. Each published edition shows its fixtures, selected markets, individual decimal prices and calculated combined odds. Recent editions are available for a limited archive period.</p><h2>What AccaForge is not</h2><p>AccaForge is an information and entertainment publication. It is not a bookmaker, betting exchange, gambling operator or payment service. It does not accept stakes, place bets or guarantee match outcomes or returns.</p><p>For questions about the website or its published material, visit the <a href='/contact'>contact page</a>.</p>"
  },
  "/contact":{
    title:"Contact AccaForge | Jonathan Mwaniki and Za Ndani Tipsters",
    description:"Contact AccaForge owner Jonathan Mwaniki and the Za Ndani Tipsters editorial team.",
    body:"<h1>Contact AccaForge</h1><p class='lead'>For website enquiries, corrections, editorial feedback or privacy requests, contact the AccaForge team by email.</p><div class='panel'><h2>Website owner</h2><p><strong>Jonathan Mwaniki</strong></p><h2>Football tipster team</h2><p><strong>Za Ndani Tipsters</strong> — from the owners of <a href='https://zandani.co.ke/' rel='noopener'>zandani.co.ke</a>.</p><h2>Email</h2><p><a class='button' href='mailto:info@jonathanmwaniki.co.ke'>Email info@jonathanmwaniki.co.ke</a></p><p>When reporting a fixture or published selection, include the page URL and the edition date so the team can identify the item.</p></div><p>AccaForge does not provide betting account support, accept deposits or process withdrawals.</p>"
  },
  "/terms":{
    title:"Terms of Service and Conditions | AccaForge",
    description:"Read the AccaForge terms of service, website conditions, information disclaimer and user responsibilities.",
    body:"<h1>Terms of Service and Conditions</h1><p><strong>Effective date: 8 November 2026</strong></p><p class='lead'>These terms govern your access to AccaForge. By using this website, you agree to these terms. If you do not agree, please stop using the website.</p><h2>1. Information and entertainment only</h2><p>AccaForge publishes football fixture information, market selections and accumulator calculations for general information and entertainment. Nothing on this website is financial advice, investment advice, a personal recommendation or a promise of profit.</p><h2>2. No betting service</h2><p>AccaForge is not a bookmaker, betting exchange, gambling operator or intermediary. We do not accept wagers, stakes, deposits or withdrawals, and we do not open or manage betting accounts. Any decision to use an independently operated betting service is yours and is subject to that service's terms and the laws that apply to you.</p><h2>3. Odds and match information</h2><p>Fixtures, markets and odds are displayed as information available when an edition is prepared. Prices, markets, fixture times and availability can change, differ between providers or become unavailable. Always verify current information independently. Accumulator odds are calculated from the individual prices displayed; actual returns, where applicable through a separate provider, may differ.</p><h2>4. No guarantees</h2><p>Football is uncertain. Every selection can lose, and an accumulator can lose in full if one or more selections fail. Past selections do not predict future outcomes. We make no guarantee about accuracy, availability, winning probability or financial results.</p><h2>5. Age and lawful use</h2><p>This website is intended only for people aged 18 or older. Do not use gambling-related information if you are under the legal age in your location. You are responsible for understanding and complying with laws that apply where you live. Do not use the website where doing so would be unlawful.</p><h2>6. Responsible use</h2><p>Never gamble with money needed for essentials, never borrow to gamble and never chase losses. You can read our <a href='/responsible-gambling'>responsible gambling guidance</a> for further information.</p><h2>7. Intellectual property and permitted use</h2><p>Website text, design and original editorial material belong to their respective owners or licensors. You may link to public pages for personal, non-commercial reference. Do not copy, republish, scrape or commercially exploit substantial website content without permission, except where the law permits.</p><h2>8. Availability and third-party services</h2><p>We may update, suspend or remove content or website features. Third-party websites and services are independent; links do not mean that AccaForge endorses or controls them. We are not responsible for their content, odds, services or privacy practices.</p><h2>9. Liability</h2><p>To the extent permitted by applicable law, AccaForge and its owner are not liable for losses arising from reliance on displayed odds, selections, fixture information, third-party services or temporary website interruptions. Nothing in these terms excludes liability that cannot lawfully be excluded.</p><h2>10. Changes and governing law</h2><p>These terms may be updated by publishing a revised version on this page. The laws of Kenya govern these terms, subject to any mandatory consumer protections or laws that apply to you.</p><h2>11. Contact</h2><p>Questions about these terms can be sent to <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a>.</p>"
  },
  "/privacy":{
    title:"Privacy Policy | AccaForge",
    description:"Learn what information AccaForge processes, how browser storage and hosting logs are used, and how to contact the website owner.",
    body:"<h1>Privacy Policy</h1><p><strong>Effective date: 8 November 2026</strong></p><p class='lead'>This policy explains how AccaForge handles information when you visit the website or contact the team.</p><h2>Information you provide</h2><p>AccaForge does not currently require account registration and does not ask visitors to submit payment details. If you email us, we receive the information you choose to include in your message, such as your email address and enquiry.</p><h2>Information processed when you visit</h2><p>The website is delivered through Cloudflare infrastructure. Like most websites, the hosting and security provider may process technical request information such as IP address, browser and device details, requested pages, timestamps and security events to deliver, protect and troubleshoot the service.</p><h2>Browser storage</h2><p>AccaForge uses browser local storage to remember that a visitor has confirmed the 18+ notice. This is stored on your device and is not an account profile. You can clear it through your browser settings; doing so may cause the age notice to appear again.</p><h2>Cookies and analytics</h2><p>The current AccaForge website code does not set advertising or analytics cookies. Hosting and security infrastructure may use strictly necessary technologies for delivery and protection. See our <a href='/cookies'>Cookie Policy</a> for more detail.</p><h2>How information is used</h2><p>Information is used to operate and secure the website, respond to enquiries, investigate technical issues and meet applicable legal obligations. We do not sell personal information.</p><h2>Sharing</h2><p>Technical information may be processed by our hosting and infrastructure providers to deliver the website. Email providers process messages when you contact us. We do not give personal information to advertisers for their own marketing.</p><h2>Retention and security</h2><p>Enquiries are retained only as long as reasonably needed to respond, keep relevant records or meet legal requirements. Technical logs are handled under the hosting provider's retention practices. We use reasonable safeguards, but no internet transmission or storage system can be guaranteed completely secure.</p><h2>Your choices and requests</h2><p>You can clear local storage in your browser and contact us to ask about personal information contained in an email you sent. Applicable rights depend on the law that applies to your request.</p><h2>Children</h2><p>AccaForge is intended for adults aged 18 and older and is not designed for children.</p><h2>Contact</h2><p>For privacy questions or requests, email <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a>.</p>"
  },
  "/cookies":{
    title:"Cookie Policy | AccaForge",
    description:"Understand cookies and local browser storage used by AccaForge, including the 18+ confirmation preference.",
    body:"<h1>Cookie Policy</h1><p><strong>Effective date: 8 November 2026</strong></p><p class='lead'>This page explains the browser technologies currently used by AccaForge.</p><h2>Cookies</h2><p>The current AccaForge website code does not set advertising, profiling or analytics cookies. Cloudflare, as the website delivery and security provider, may use strictly necessary technical mechanisms to protect or deliver the service. Those technologies are controlled by the relevant provider and are not used by AccaForge for behavioural advertising.</p><h2>Local storage for the age notice</h2><p>AccaForge stores an 18+ confirmation in your browser's local storage so that the age notice does not need to be shown on every visit. Local storage is not a cookie. It stays in your browser until it is cleared or removed by the browser.</p><h2>Your choices</h2><p>You can clear website data or local storage through your browser settings. If you clear it, the age confirmation may be requested again. Blocking essential browser technologies or security controls may affect how the website works.</p><h2>Changes</h2><p>If AccaForge adds analytics, advertising or other optional tracking technologies, this policy will be updated to describe them before or when they are introduced.</p><h2>Contact</h2><p>Questions can be sent to <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a>.</p>"
  },
  "/responsible-gambling":{
    title:"Responsible Gambling | AccaForge 18+",
    description:"AccaForge is an 18+ football information website. Read the risks of accumulators and practical responsible gambling guidance.",
    body:"<h1>Responsible gambling</h1><p class='lead'>AccaForge is for adults aged 18 and older. Football accumulators are high-risk: one unsuccessful selection can cause the entire accumulator to lose.</p><div class='notice'><strong>18+ only. No selection is guaranteed. Never gamble with money you cannot afford to lose.</strong></div><h2>Keep gambling in perspective</h2><ul><li>Set a strict limit before you start and do not exceed it.</li><li>Do not borrow money or use funds intended for rent, food, bills or family needs.</li><li>Do not chase losses or increase stakes to recover money.</li><li>Take breaks and stop if gambling affects your mood, relationships or finances.</li><li>Do not gamble while distressed, under pressure or impaired by alcohol or drugs.</li></ul><h2>Understand accumulator risk</h2><p>An accumulator combines multiple selections. Even if individual events appear plausible, the chance that every selection succeeds is lower than the chance of each one succeeding on its own. Displayed odds are not a promise or a forecast of certain returns.</p><h2>Get support</h2><p>If gambling is causing harm, stop and seek help from a qualified local support service or health professional. Use blocking tools and self-exclusion options offered by any gambling operator you use. If you are under 18, do not use betting services.</p><h2>Our position</h2><p>AccaForge does not accept bets, deposits or withdrawals and does not encourage anyone to gamble. Our football content is published for information and entertainment only.</p><p>Questions about this notice: <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a>.</p>"
  },
  "/editorial-policy":{
    title:"Editorial Policy | Za Ndani Tipsters on AccaForge",
    description:"Read how Za Ndani Tipsters present football accumulator selections, odds, corrections and uncertainty on AccaForge.",
    body:"<h1>Editorial policy</h1><p class='lead'>AccaForge aims to present football accumulator information in a clear, consistent and responsible format.</p><h2>Editorial responsibility</h2><p>AccaForge is owned by Jonathan Mwaniki. Football selections and tipster commentary are published by Za Ndani Tipsters, from the owners of <a href='https://zandani.co.ke/' rel='noopener'>zandani.co.ke</a>.</p><h2>What is published</h2><p>Daily editions display upcoming football fixtures, the selected market and outcome, the individual decimal odds, the bookmaker label supplied with the price and the calculated combined odds. The site may retain a short rolling archive of recent editions.</p><h2>Accuracy and updates</h2><p>Selections and prices are based on information available when an edition is prepared. Markets, odds and kick-off times can change. The published page should be treated as a time-stamped information snapshot, not a live bookmaker quote. Visitors should independently verify current details.</p><h2>Independence and conflicts</h2><p>Where editorial relationships or commercial arrangements materially affect a published recommendation, they should be disclosed on the relevant page. AccaForge does not claim that a bookmaker endorses its selections.</p><h2>Corrections</h2><p>If you identify an incorrect team name, fixture time, market label or other factual detail, email the page URL and a description of the issue to <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a>. Verified corrections may be made to the page.</p><h2>No certainty or guaranteed returns</h2><p>Football outcomes are uncertain. AccaForge does not promise winning tips, guaranteed odds or profits. Content is intended for adults aged 18 and older and for information and entertainment only.</p>"
  }
  ,
  "/image-credits":{
    title:"Image Credits and Licences | AccaForge",
    description:"Sources and licence information for football club crests, competition logos and player photographs used by AccaForge.",
    body:"<h1>Image credits and licences</h1><p class='lead'>AccaForge caches sports photographs and team crests for editorial football coverage. Individual image credits and licence details are displayed alongside cached photographs.</p><h2>Daily football photographs</h2><p>Sports photographs are sourced from <a href='https://commons.wikimedia.org/' rel='noopener'>Wikimedia Commons</a>. The daily refresh accepts only images whose machine-readable licence is CC0, Public Domain, CC BY or CC BY-SA (versions 3.0 or 4.0). Creator, source page and licence information are retained and shown with the photograph.</p><h2>Team badges and competition crests</h2><p>Team badge discovery uses <a href='https://www.thesportsdb.com/' rel='noopener'>TheSportsDB</a>. Club badges and competition marks remain the property of their respective rights holders and are displayed only to identify teams and competitions; no club or league endorsement is implied. Existing competition crest assets are sourced from the <a href='https://github.com/JoseArroyave/football-logos' rel='noopener'>JoseArroyave/football-logos repository</a>.</p><h2>News links</h2><p>Football headline discovery is powered by the <a href='https://www.gdeltproject.org/' rel='noopener'>GDELT Project</a>. AccaForge stores headline metadata, publisher names and links to original publishers. It does not republish full articles or copy publisher photographs.</p><h2>Existing player photographs</h2><p><strong>Lionel Messi</strong> — photograph by Hossein Zohrevand, published by Tasnim News Agency, via <a href='https://commons.wikimedia.org/wiki/File:Lionel_Messi_playing_in_Argentina_2022_FIFA_World_Cup.jpg' rel='noopener'>Wikimedia Commons</a>. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).</p><p><strong>Cristiano Ronaldo</strong> — photograph by Hossein Zohrevand, published by Tasnim News Agency, via <a href='https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_WC2022_-_01.jpg' rel='noopener'>Wikimedia Commons</a>. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).</p><p>Licence: <a href='https://creativecommons.org/licenses/by/4.0/' rel='noopener'>Creative Commons Attribution 4.0 International</a>. The photographs are used with attribution; no endorsement by the players or agency is implied.</p><h2>Corrections and rights enquiries</h2><p>For attribution corrections or rights enquiries, contact <a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a> and include the image filename and page URL.</p>"
  },
  "/sure-tips":{title:"Sure Tips Today | Football Tips and Match Analysis | AccaForge",description:"Explore today's football sure tips search picks, match previews, accumulator selections and odds. No football prediction is guaranteed. 18+ only.",body:"<h1>Sure Tips Today: Football Picks and Match Analysis</h1><p class='lead'>Searching for sure tips today, 254 sure tips or daily football predictions? AccaForge publishes football selections with fixture details, markets and decimal odds so readers can review the information behind each pick.</p><h2>Today's sure tips and football predictions</h2><p>The daily AccaForge board groups selected matches into accumulator targets. Open an edition to review the fixtures, market names, individual prices and combined odds. Availability depends on the matches and markets published for that day.</p><h2>What people mean by sure tips</h2><p>“Sure tips” is a popular search phrase used by football followers looking for predictions. It does not mean a result is certain. Football matches are unpredictable, and every selection can lose. Be cautious of anyone promising fixed matches, guaranteed wins or risk-free returns.</p><h2>Explore more football tips</h2><ul><li><a href='/football-betting-tips'>Football betting tips today</a></li><li><a href='/accumulator-tips'>Daily accumulator tips</a></li><li><a href='/premier-league-tips'>Premier League betting tips</a></li></ul><p class='notice'>18+ only. Information and entertainment, not a guarantee or a betting service. Never stake money you cannot afford to lose.</p>"},
  "/football-betting-tips":{title:"Football Betting Tips Today | Free Football Predictions | AccaForge",description:"Read football betting tips today, match predictions, BTTS, over 2.5 goals, double chance and daily football analysis from AccaForge.",body:"<h1>Football Betting Tips Today</h1><p class='lead'>AccaForge brings together daily football betting tips, match predictions and accumulator analysis. Review upcoming fixtures, selected markets and decimal odds in one place.</p><h2>Today's football tips and predictions</h2><p>Our daily football tips board presents selected fixtures and markets when an edition is available. Each selection includes the teams, competition, kick-off time, market and listed price. Open a match to see the editions in which it appears.</p><h2>Football markets covered</h2><ul><li><strong>1X2 tips:</strong> home win, draw or away win.</li><li><strong>Double chance:</strong> home or draw, away or draw, or either team to win.</li><li><strong>BTTS tips:</strong> both teams to score, yes or no.</li><li><strong>Over and under goals:</strong> including over 1.5 and over 2.5 goals.</li><li><strong>Accumulator tips:</strong> combined selections and decimal odds.</li></ul><h2>Leagues and competitions</h2><p>AccaForge follows major competitions including the English Premier League, UEFA Champions League, Europa League, La Liga, Bundesliga, Serie A, Ligue 1 and Eredivisie when fixtures and markets are available.</p><h2>Explore daily picks</h2><p>Visit the <a href='/'>AccaForge daily football tips board</a>, read our <a href='/sure-tips'>sure tips guide</a> or explore <a href='/accumulator-tips'>accumulator tips</a>.</p><p class='notice'>Football predictions are opinions, not certainties. No tip is guaranteed. 18+ only.</p>"},
  "/accumulator-tips":{title:"Daily Accumulator Tips Today | Football Accas and Odds | AccaForge",description:"Explore daily football accumulator tips, acca selections, combined odds, match details and responsible betting information from AccaForge.",body:"<h1>Daily Football Accumulator Tips</h1><p class='lead'>Looking for accumulator tips today? AccaForge publishes selected football accumulators with individual fixtures, markets, decimal odds and combined prices.</p><h2>How to use the accumulator tips</h2><p>Choose a daily edition to review each leg. Check the competition, match time, market and individual price before making your own assessment. Combined odds are calculated from the displayed individual prices and can change as markets move.</p><h2>10, 15 and 20 odds accumulator targets</h2><p>The daily board is organised around three combined-odds targets: 10.00, 15.00 and 20.00. The actual combined price may differ from the target depending on the available selections.</p><h2>Understand accumulator risk</h2><p>An accumulator requires every included selection to be successful for the full combination to win. One unsuccessful leg can cause the entire accumulator to lose. Higher combined odds do not mean a higher likelihood of winning.</p><p>See the <a href='/'>latest football accumulator tips</a>, <a href='/football-betting-tips'>football betting tips</a> and <a href='/responsible-gambling'>responsible gambling guidance</a>.</p><p class='notice'>18+ only. No guaranteed wins, fixed matches or guaranteed returns.</p>"},
  "/premier-league-tips":{title:"Premier League Betting Tips Today | EPL Predictions | AccaForge",description:"Follow English Premier League betting tips, EPL match predictions, fixture analysis and accumulator selections on AccaForge.",body:"<h1>Premier League Betting Tips and EPL Predictions</h1><p class='lead'>Follow English Premier League football tips, EPL match analysis and selected markets on AccaForge. This page helps readers find Premier League fixtures featured in our daily football editions.</p><h2>Premier League tips today</h2><p>When Premier League fixtures and markets are included in the daily board, open the relevant match link to review its kick-off time, market selection and listed odds. The available fixtures change throughout the season.</p><h2>Popular Premier League clubs</h2><p>Explore dedicated club information for <a href='/teams/arsenal'>Arsenal</a>, <a href='/teams/chelsea'>Chelsea</a>, <a href='/teams/manchester-united'>Manchester United</a> and <a href='/teams/liverpool'>Liverpool</a>.</p><h2>More football predictions</h2><p>Visit <a href='/football-betting-tips'>football betting tips</a>, <a href='/sure-tips'>sure tips</a> and the <a href='/'>AccaForge daily accumulator board</a>.</p><p class='notice'>Predictions are not guarantees. Football outcomes are uncertain. 18+ only.</p>"},
  "/players/lionel-messi":{title:"Lionel Messi | Player Spotlight and Football Analysis | AccaForge",description:"Lionel Messi player spotlight on AccaForge. Explore football analysis, featured fixtures and daily match predictions.",body:"<h1>Lionel Messi</h1><div class='panel'><img src='/media/lionel-messi.jpg' alt='Lionel Messi' style='float:right;width:150px;height:170px;object-fit:contain;margin:0 0 12px 18px'><p class='lead'>Lionel Messi is one of football's most recognisable players. This AccaForge player spotlight is an editorial discovery page, not a live player-statistics feed.</p><p>Explore current football fixtures and match analysis on the <a href='/'>AccaForge daily tips board</a>.</p><div style='clear:both'></div></div><h2>Related football coverage</h2><p>Browse <a href='/football-betting-tips'>football betting tips</a>, <a href='/accumulator-tips'>accumulator tips</a> and <a href='/premier-league-tips'>Premier League tips</a>.</p>"},
  "/players/cristiano-ronaldo":{title:"Cristiano Ronaldo | Player Spotlight and Football Analysis | AccaForge",description:"Cristiano Ronaldo player spotlight on AccaForge. Explore football analysis, featured fixtures and daily match predictions.",body:"<h1>Cristiano Ronaldo</h1><div class='panel'><img src='/media/cristiano-ronaldo.jpg' alt='Cristiano Ronaldo' style='float:right;width:150px;height:170px;object-fit:contain;margin:0 0 12px 18px'><p class='lead'>Cristiano Ronaldo is one of football's most recognisable players. This AccaForge player spotlight is an editorial discovery page, not a live player-statistics feed.</p><p>Explore current football fixtures and match analysis on the <a href='/'>AccaForge daily tips board</a>.</p><div style='clear:both'></div></div><h2>Related football coverage</h2><p>Browse <a href='/football-betting-tips'>football betting tips</a>, <a href='/accumulator-tips'>accumulator tips</a> and <a href='/premier-league-tips'>Premier League tips</a>.</p>"}
};

function renderPage(input:{title:string;description:string;path:string;body:string;schema?:unknown;robots?:string},origin:string,status=200){
  const canonical=new URL(input.path,origin).toString();
  const schema=input.schema || {
    "@context":"https://schema.org",
    "@type":"Organization",
    "name":"AccaForge",
    "url":origin,
    "founder":{"@type":"Person","name":"Jonathan Mwaniki"},
    "email":"info@jonathanmwaniki.co.ke"
  };
  const footer="<footer class='footer'><strong>AccaForge</strong> · Owned by Jonathan Mwaniki · Football tipsters: Za Ndani Tipsters<nav><a href='/about'>About</a><a href='/contact'>Contact</a><a href='/terms'>Terms</a><a href='/privacy'>Privacy</a><a href='/cookies'>Cookies</a><a href='/editorial-policy'>Editorial policy</a><a href='/image-credits'>Image credits</a><a href='/responsible-gambling'>Responsible play</a><a href='/sure-tips'>Sure tips</a><a href='/football-betting-tips'>Football tips</a><a href='/accumulator-tips'>Accumulator tips</a><a href='/premier-league-tips'>Premier League tips</a></nav><a href='mailto:info@jonathanmwaniki.co.ke'>info@jonathanmwaniki.co.ke</a><p>18+ only · Information and entertainment only · No guaranteed outcomes</p></footer>";
  const html="<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='theme-color' content='#f5f7fa'><meta name='description' content='"+escapeHtml(input.description)+"'><meta name='robots' content='"+escapeHtml(input.robots||"index,follow")+"'><link rel='canonical' href='"+escapeHtml(canonical)+"'><link rel='icon' type='image/svg+xml' href='/favicon.svg'><meta property='og:type' content='website'><meta property='og:site_name' content='AccaForge'><meta property='og:title' content='"+escapeHtml(input.title)+"'><meta property='og:description' content='"+escapeHtml(input.description)+"'><meta property='og:url' content='"+escapeHtml(canonical)+"'><meta name='twitter:card' content='summary'><link rel='preconnect' href='https://fonts.googleapis.com'><link rel='preconnect' href='https://fonts.gstatic.com' crossorigin><link href='https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap' rel='stylesheet'><title>"+escapeHtml(input.title)+"</title><script type='application/ld+json'>"+safeJson(schema)+"</script><style>"+siteStyles+"</style></head><body><header class='top'><div class='shell topin'><a class='brand' href='/'>Acca<span>Forge</span></a><nav class='desktop-nav' aria-label='Main navigation'><a href='/'>Home</a><a href='/daily'>Daily board</a><a href='/recent'>Recent editions</a><a href='/competitions'>Competitions</a><a href='/football-betting-tips'>Guides</a></nav></div></header><nav class='mobile-dock' aria-label='Main mobile navigation'><a href='/'>Home</a><a href='/daily'>Daily</a><a href='/recent'>Archive</a><a href='/competitions'>Leagues</a></nav><main class='shell'><div class='crumb'><a href='/'>Home</a> / "+escapeHtml(input.title.split("|")[0].trim())+"</div>"+input.body+"</main><div class='shell'>"+footer+"</div></body></html>";
  return new Response(html,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":status===200?"public, max-age=0, s-maxage=120, stale-while-revalidate=300":"public, max-age=60","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"}});
}

async function sitemap(env:Env,origin:string){
  const accas=(await env.DB.prepare("SELECT id,publish_date FROM accas WHERE status='published' ORDER BY publish_date DESC").all<{id:string;publish_date:string}>()).results||[];
  const matches=(await env.DB.prepare("SELECT s.event_id,MAX(a.publish_date) AS lastmod FROM selections s JOIN accas a ON a.id=s.acca_id WHERE a.status='published' GROUP BY s.event_id ORDER BY lastmod DESC").all<{event_id:string;lastmod:string}>()).results||[];
  const urls:Array<{path:string;lastmod?:string}>=[
    {path:"/"},{path:"/daily"},{path:"/recent"},{path:"/results"},{path:"/competitions"},{path:"/safe-picks"},{path:"/super-5"},{path:"/super-10"},{path:"/all-matches"},{path:"/about"},{path:"/contact"},{path:"/terms"},{path:"/privacy"},
    {path:"/cookies"},{path:"/responsible-gambling"},{path:"/editorial-policy"},{path:"/image-credits"},{path:"/sure-tips"},{path:"/football-betting-tips"},{path:"/accumulator-tips"},{path:"/premier-league-tips"},{path:"/players/lionel-messi"},{path:"/players/cristiano-ronaldo"},{path:"/teams/chelsea"},{path:"/teams/arsenal"},{path:"/teams/manchester-united"},{path:"/teams/liverpool"},{path:"/leagues/soccer_epl"},{path:"/leagues/soccer_uefa_champs_league"},{path:"/leagues/soccer_uefa_europa_league"},{path:"/leagues/soccer_spain_la_liga"},{path:"/leagues/soccer_germany_bundesliga"},{path:"/leagues/soccer_italy_serie_a"},{path:"/leagues/soccer_france_ligue_one"},{path:"/leagues/soccer_netherlands_eredivisie"}
  ];
  for(const item of accas)urls.push({path:"/accumulators/"+encodeURIComponent(item.id),lastmod:item.publish_date});
  for(const item of matches)urls.push({path:"/matches/"+encodeURIComponent(item.event_id),lastmod:item.lastmod});
  const xml='<?xml version="1.0" encoding="UTF-8"?>'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
    urls.map(item=>"<url><loc>"+escapeXml(new URL(item.path,origin).toString())+"</loc>"+(item.lastmod?"<lastmod>"+escapeXml(item.lastmod)+"</lastmod>":"")+"</url>").join("")+
    "</urlset>";
  return new Response(xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=300","X-Content-Type-Options":"nosniff"}});
}

async function accumulatorPage(id:string,env:Env,origin:string){
  const acca=await env.DB.prepare("SELECT * FROM accas WHERE id=? AND status='published'").bind(id).first<AccaRow>();
  if(!acca)return renderPage({title:"Accumulator edition not found | AccaForge",description:"This football accumulator edition is no longer available.",path:"/accumulators/"+encodeURIComponent(id),robots:"noindex,follow",body:"<h1>Edition not found</h1><p>This accumulator may have expired from the recent-editions archive. Visit the <a href='/'>AccaForge daily football tips page</a> for the latest published selections.</p>"},origin,404);
  const selections=(await env.DB.prepare("SELECT * FROM selections WHERE acca_id=? ORDER BY sort_order ASC").bind(id).all<SelectionRow>()).results||[];
  const legs=selections.map(item=>"<li><a href='/matches/"+encodeURIComponent(item.event_id)+"'>"+escapeHtml(item.home_team)+" vs "+escapeHtml(item.away_team)+"</a><small>"+escapeHtml(dateTime(item.commence_time))+" · "+escapeHtml(competitionName(item.sport_key))+" · "+escapeHtml(item.market_name)+" · "+escapeHtml(item.selection_name)+" · "+escapeHtml(item.bookmaker)+" <span class='price'>"+Number(item.odds).toFixed(2)+"</span></small></li>").join("");
  const body="<h1>"+escapeHtml(acca.headline)+"</h1><p class='lead'>Football accumulator analysis for "+escapeHtml(acca.publish_date)+". Review every fixture, market and listed decimal price below.</p><div class='panel'><div class='facts'><span>Target odds: <strong>"+Number(acca.target_odds).toFixed(2)+"</strong></span><span>Combined odds: <strong>"+Number(acca.actual_odds).toFixed(2)+"</strong></span><span>Selections: <strong>"+selections.length+"</strong></span><span>Published: <strong>"+escapeHtml(acca.publish_date)+"</strong></span></div><p>"+escapeHtml(acca.analysis_note)+"</p></div><h2>Fixture and market breakdown</h2><ul class='list'>"+(legs||"<li>No selections are available for this edition.</li>")+"</ul><p class='notice'>Information and entertainment only. Odds can change and every selection can lose. No outcome or return is guaranteed. 18+ only.</p><p><a class='button' href='/'>View the latest AccaForge football tips</a></p>";
  const schema={"@context":"https://schema.org","@type":"WebPage","name":acca.headline,"description":"Football accumulator selections and combined odds for "+acca.publish_date,"url":new URL("/accumulators/"+encodeURIComponent(id),origin).toString(),"publisher":{"@type":"Organization","name":"AccaForge","url":origin}};
  return renderPage({title:acca.headline+" | Football Accumulator "+Number(acca.target_odds).toFixed(2)+" Odds | AccaForge",description:"Review the "+Number(acca.target_odds).toFixed(2)+" target football accumulator published "+acca.publish_date+": "+selections.map(item=>item.home_team+" vs "+item.away_team).join(", ")+".",path:"/accumulators/"+encodeURIComponent(id),body,schema},origin);
}

async function matchPage(eventId:string,env:Env,origin:string){
  const rows=(await env.DB.prepare("SELECT s.*,a.id AS edition_id,a.target_odds,a.actual_odds,a.publish_date,a.headline FROM selections s JOIN accas a ON a.id=s.acca_id WHERE s.event_id=? AND a.status='published' ORDER BY a.publish_date DESC,a.target_odds ASC").bind(eventId).all<MatchRow>()).results||[];
  if(!rows.length)return renderPage({title:"Match page not found | AccaForge",description:"This match is not available in the current AccaForge published editions.",path:"/matches/"+encodeURIComponent(eventId),robots:"noindex,follow",body:"<h1>Match page not found</h1><p>This fixture may have left the recent-editions archive. Visit the <a href='/'>latest AccaForge football tips</a> to explore current selections.</p>"},origin,404);
  const first=rows[0];
  const name=first.home_team+" vs "+first.away_team;
  const competition=competitionName(first.sport_key);
  const editionLinks=rows.map(item=>"<li><a href='/accumulators/"+encodeURIComponent(item.edition_id)+"'>"+escapeHtml(item.headline)+"</a><small>"+escapeHtml(item.publish_date)+" · "+Number(item.target_odds).toFixed(2)+" target · "+Number(item.actual_odds).toFixed(2)+" combined odds · "+escapeHtml(item.market_name)+": "+escapeHtml(item.selection_name)+"</small></li>").join("");
  const body="<h1>"+escapeHtml(name)+"</h1><p class='lead'>Football match information and published accumulator selections for "+escapeHtml(name)+", listed in the "+escapeHtml(competition)+".</p><div class='panel'><div class='facts'><span>Competition: <strong>"+escapeHtml(competition)+"</strong></span><span>Kick-off: <strong>"+escapeHtml(dateTime(first.commence_time))+"</strong></span></div></div><h2>AccaForge selections featuring this fixture</h2><ul class='list'>"+editionLinks+"</ul><p class='notice'>These are editorial market selections, not a live score or a guaranteed prediction. Match details and odds may change. 18+ only; information and entertainment only.</p><p><a class='button' href='/'>Explore daily football accumulators</a></p>";
  const schema={"@context":"https://schema.org","@type":"SportsEvent","name":name,"startDate":first.commence_time,"sport":"Soccer","homeTeam":{"@type":"SportsTeam","name":first.home_team},"awayTeam":{"@type":"SportsTeam","name":first.away_team},"url":new URL("/matches/"+encodeURIComponent(eventId),origin).toString(),"organizer":{"@type":"Organization","name":"AccaForge","url":origin}};
  return renderPage({title:name+" | "+competition+" Match Analysis and Accumulator Tips | AccaForge",description:"View "+name+" match information, kick-off time and published AccaForge football accumulator markets and odds.",path:"/matches/"+encodeURIComponent(eventId),body,schema},origin);
}

async function renderHome(request:Request,env:Env){
  const dataUrl=new URL("/api/accas?days=3",request.url);
  const dataRequest=new Request(dataUrl,{headers:request.headers});
  const dataResponse=await getAccas({request:dataRequest,env});
  let initialData:AccasResponse={accas:[],updatedAt:null};
  let initialContent:Awaited<ReturnType<typeof getCachedContent>>={news:[],photos:[],teamBadges:{},hero:null,updatedAt:null};
  try {
    const payload=await dataResponse.json() as AccasResponse;
    if(Array.isArray(payload.accas))initialData=payload;
  } catch(error) {
    console.error("AccaForge SSR data response could not be parsed.",error);
  }
  try { initialContent=await getCachedContent(env); } catch(error) { console.error("AccaForge cached media could not be read during SSR.",error); }
  const client=new QueryClient({defaultOptions:{queries:{staleTime:60000,refetchOnWindowFocus:false,refetchInterval:300000,retry:1}}});
  const todayLabel=new Date().toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
  const pathname=new URL(request.url).pathname.replace(/\/$/,"")||"/";
  const app=createElement(QueryClientProvider,{client},createElement(App,{initialData,initialContent,todayLabel,pathname}));
  const stream=await renderToReadableStream(app);
  await stream.allReady;
  const rendered=await new Response(stream).text();
  const assetUrl=new URL("/index.html",request.url);
  const shell=await env.ASSETS.fetch(new Request(assetUrl,{headers:request.headers}));
  if(!shell.ok)throw new Error("The built AccaForge HTML shell could not be loaded.");
  let html=await shell.text();
  const routeMeta:Record<string,{title:string;description:string}>={
    "/":{title:"AccaForge | Daily Football Fixtures, Selections and Odds",description:"Review daily football selections, fixtures, markets and decimal odds on AccaForge. Clear match details and published accumulator editions. 18+ only."},
    "/daily":{title:"Daily Football Board | AccaForge",description:"Browse the AccaForge daily football board and open each published selection format."},
    "/recent":{title:"Recent Football Editions | AccaForge",description:"Browse recent published AccaForge football editions, fixtures and combined odds."},
    "/results":{title:"Yesterday’s Football Results | AccaForge",description:"Review yesterday’s published AccaForge football selections, final scores and won, lost or pending outcomes."},
    "/competitions":{title:"Football Competitions | AccaForge",description:"Browse football leagues covered by the AccaForge daily football board."},
    "/safe-picks":{title:"Safe Picks | AccaForge Football Selections",description:"Review the published Safe Picks football accumulator, fixtures, markets and listed odds."},
    "/super-5":{title:"Super 5 | AccaForge Football Selections",description:"Review the Super 5 football accumulator, five researched matches, markets and listed odds."},
    "/super-10":{title:"Super 10 | AccaForge Football Selections",description:"Review the Super 10 football accumulator and its combined odds target."},
    "/all-matches":{title:"All-Matches Challenge | AccaForge",description:"Review eligible football fixtures and the published match-by-match selections."}
  };
  const meta=routeMeta[pathname]||routeMeta["/"];
  html=html.replace(/<title>[\s\S]*?<\/title>/,"<title>"+escapeHtml(meta.title)+"</title>")
    .replace(/<meta name="description" content="[^"]*"/,'<meta name="description" content="'+escapeHtml(meta.description)+'"')
    .replace(/<meta property="og:title" content="[^"]*"/,'<meta property="og:title" content="'+escapeHtml(meta.title)+'"')
    .replace(/<meta property="og:description" content="[^"]*"/,'<meta property="og:description" content="'+escapeHtml(meta.description)+'"')
    .replace(/<meta property="og:url" content="[^"]*"/,'<meta property="og:url" content="'+escapeHtml(new URL(pathname,request.url).toString())+'"')
    .replace(/<link rel="canonical" href="[^"]*"/,'<link rel="canonical" href="'+escapeHtml(new URL(pathname,request.url).toString())+'"');
  const rootMarkup="<div id=\"root\">"+rendered+"</div><script id=\"accaforge-ssr-data\" type=\"application/json\">"+safeJson({initialData,initialContent,todayLabel,pathname})+"</script>";
  if(!/<div id="root">\s*<\/div>/.test(html))throw new Error("The built HTML shell is missing the React root element.");
  html=html.replace(/<div id="root">\s*<\/div>/,rootMarkup);
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=0, s-maxage=60, stale-while-revalidate=120","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"}});
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/accas") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      return getAccas({ request, env });
    }
    if (url.pathname === "/api/results") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      return resultsApi(env);
    }
    if (url.pathname === "/api/content") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      return cachedContentResponse(env);
    }
    if (url.pathname.startsWith("/media-cache/")) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      const key = decodeURIComponent(url.pathname.slice("/media-cache/".length));
      if (!/^(photos|teams)\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(key)) return new Response("Not found", { status: 404 });
      return serveCachedMedia(env, key);
    }
    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
      return getHealth({ request, env });
    }
    if (url.pathname.startsWith("/api/")) return Response.json({ error: "Not found." }, { status: 404 });
    if (url.pathname === "/sitemap.xml") return sitemap(env,url.origin);
    if (url.pathname === "/robots.txt") {
      const body="User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: "+url.origin+"/sitemap.xml\n";
      return new Response(body,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=300"}});
    }
    const staticPage=staticPages[url.pathname.replace(/\/$/,"") || "/"];
    if (staticPage) return renderPage({...staticPage,path:url.pathname.replace(/\/$/,"")},url.origin);
    const leagueMatch=url.pathname.match(/^\/leagues\/(soccer_[a-z0-9_]+)\/?$/);
    if(leagueMatch){
      const competitions:Record<string,{name:string;crest:string}> = {
        soccer_epl:{name:"English Premier League",crest:"premier-league.svg"},
        soccer_uefa_champs_league:{name:"UEFA Champions League",crest:"champions-league.svg"},
        soccer_uefa_europa_league:{name:"UEFA Europa League",crest:"europa-league.svg"},
        soccer_spain_la_liga:{name:"Spanish La Liga",crest:"la-liga.svg"},
        soccer_germany_bundesliga:{name:"German Bundesliga",crest:"bundesliga.svg"},
        soccer_italy_serie_a:{name:"Italian Serie A",crest:"serie-a.svg"},
        soccer_france_ligue_one:{name:"French Ligue 1",crest:"ligue-1.svg"},
        soccer_netherlands_eredivisie:{name:"Dutch Eredivisie",crest:"eredivisie.svg"}
      };
      const competition=competitions[leagueMatch[1]];
      if(competition){
        const body="<h1>"+escapeHtml(competition.name)+" Football Tips and Match Analysis</h1><div class='panel'><img src='/media/"+competition.crest+"' alt='"+escapeHtml(competition.name)+" logo' style='width:110px;height:110px;object-fit:contain;float:right;margin:0 0 12px 18px'><p class='lead'>Explore "+escapeHtml(competition.name)+" fixtures, football betting tips and accumulator selections when matches from this competition are included in an AccaForge daily edition.</p><p>Open the latest <a href='/'>daily football tips</a> to review published fixtures and markets. Individual match pages show the editions in which a fixture appears.</p><div style='clear:both'></div></div><h2>Related football predictions</h2><p><a href='/football-betting-tips'>Football betting tips</a> · <a href='/sure-tips'>Sure tips</a> · <a href='/accumulator-tips'>Accumulator tips</a></p><p class='notice'>Football predictions are not guarantees. 18+ only.</p>";
        return renderPage({title:competition.name+" Tips Today | Football Predictions and Accumulators | AccaForge",description:"Find "+competition.name+" football tips, match predictions, fixtures and accumulator analysis on AccaForge.",path:url.pathname,body},url.origin);
      }
    }
    const teamMatch=url.pathname.match(/^\/teams\/(chelsea|arsenal|manchester-united|liverpool)\/?$/);
    if(teamMatch){
      const teams:Record<string,{name:string;crest:string}> = {chelsea:{name:"Chelsea FC",crest:"chelsea.svg"},arsenal:{name:"Arsenal FC",crest:"arsenal.svg"},"manchester-united":{name:"Manchester United FC",crest:"manchester-united.svg"},liverpool:{name:"Liverpool FC",crest:"liverpool.svg"}};
      const team=teams[teamMatch[1]];
      const body="<h1>"+escapeHtml(team.name)+"</h1><div class='panel'><img src='/media/"+team.crest+"' alt='"+escapeHtml(team.name)+" crest' style='width:110px;height:110px;object-fit:contain;float:right;margin:0 0 12px 18px'><p class='lead'>Explore "+escapeHtml(team.name)+" fixture discovery and football match analysis on AccaForge.</p><p>Visit the <a href='/'>daily football tips board</a> to see whether upcoming fixtures featuring this club appear in a published edition.</p><div style='clear:both'></div></div><h2>Related football tips</h2><p><a href='/premier-league-tips'>Premier League tips</a> · <a href='/football-betting-tips'>Football betting tips</a> · <a href='/accumulator-tips'>Accumulator tips</a></p>";
      return renderPage({title:team.name+" | Football Fixtures and Match Analysis | AccaForge",description:team.name+" club spotlight, fixture discovery and football match analysis on AccaForge.",path:url.pathname,body},url.origin);
    }
    const accumulatorMatch=url.pathname.match(/^\/accumulators\/([^/]+)\/?$/);
    if (accumulatorMatch) return accumulatorPage(decodeURIComponent(accumulatorMatch[1]),env,url.origin);
    const matchMatch=url.pathname.match(/^\/matches\/([^/]+)\/?$/);
    if (matchMatch) return matchPage(decodeURIComponent(matchMatch[1]),env,url.origin);
    const appPath=url.pathname.replace(/\/+$/,"")||"/";
    if (["/","/daily","/recent","/results","/competitions","/safe-picks","/super-5","/super-10","/all-matches"].includes(appPath)) return renderHome(request,env);
    if (url.pathname.includes(".") || url.pathname.startsWith("/assets/")) {
      return env.ASSETS.fetch(request);
    }
    return renderPage({
      title:"Page not found | AccaForge",
      description:"The page you requested could not be found on AccaForge.",
      path:url.pathname,
      robots:"noindex,follow",
      body:"<h1>Page not found</h1><p>This address may have changed or the page may no longer be available. Visit the <a href='/'>AccaForge daily football tips</a> homepage.</p>"
    },url.origin,404);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "0 6 * * *") {
      ctx.waitUntil(refreshDailyContent(env).then(result => console.log("AccaForge daily content refresh complete", result)).catch(error => console.error("AccaForge daily content refresh failed", error)));
      ctx.waitUntil(refreshYesterdayResults(env).then(result => console.log("AccaForge results refresh complete", result)).catch(error => console.error("AccaForge results refresh failed", error)));
    }
  }
} satisfies ExportedHandler<Env>;

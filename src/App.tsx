import React, {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Activity,ArrowUpRight,CalendarDays,Check,ChevronDown,Clock3,Home,Menu,ShieldCheck,Target,Trophy,X,CalendarRange,ClipboardCheck} from "lucide-react";
import type {Acca,AccasResponse,ProductType,Selection} from "./types";

const products:[ProductType,string,string,string][]=[
 ["safe_picks","Safe Picks","High-confidence picks · 10.00+ odds","/safe-picks"],
 ["super_5","Super 5","Five researched matches","/super-5"],
 ["super_10","Super 10","Combined odds 9.50–10.50","/super-10"],
 ["all_matches","All-Matches Challenge","Every eligible fixture","/all-matches"]
];
const productLabel=(type:ProductType)=>products.find(item=>item[0]===type)?.[1]||"Football picks";
const productPath=(type:ProductType)=>products.find(item=>item[0]===type)?.[3]||"/daily";
const leagues=[
 {key:"soccer_epl",name:"Premier League",logo:"/media/premier-league.svg"},
 {key:"soccer_uefa_champs_league",name:"Champions League",logo:"/media/champions-league.svg"},
 {key:"soccer_uefa_europa_league",name:"Europa League",logo:"/media/europa-league.svg"},
 {key:"soccer_spain_la_liga",name:"La Liga",logo:"/media/la-liga.svg"},
 {key:"soccer_germany_bundesliga",name:"Bundesliga",logo:"/media/bundesliga.svg"},
 {key:"soccer_italy_serie_a",name:"Serie A",logo:"/media/serie-a.svg"},
 {key:"soccer_france_ligue_one",name:"Ligue 1",logo:"/media/ligue-1.svg"},
 {key:"soccer_netherlands_eredivisie",name:"Eredivisie",logo:"/media/eredivisie.svg"}
];
const leagueFor=(key:string)=>leagues.find(item=>item.key===key);
const localTeamLogos:Record<string,string>={"Arsenal":"/media/arsenal.svg","Arsenal FC":"/media/arsenal.svg","Chelsea":"/media/chelsea.svg","Chelsea FC":"/media/chelsea.svg","Liverpool":"/media/liverpool.svg","Liverpool FC":"/media/liverpool.svg","Manchester United":"/media/manchester-united.svg","Manchester United FC":"/media/manchester-united.svg"};
const kenyaTime=(value:string)=>new Date(value).toLocaleString("en-KE",{timeZone:"Africa/Nairobi",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
export type SiteContent = { news:Array<{id:string;title:string;url:string;source:string;published_at:string;image_url:string;image_credit:string;image_license:string;image_license_url:string;image_source_url:string}>; photos:Array<{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}>; teamBadges:Record<string,string>; leagueBadges:Record<string,string>; leagueTables:Record<string,Array<{position:number;team:string;played:number;won:number;drawn:number;lost:number;goalsFor:number;goalsAgainst:number;goalDifference:number;points:number;form:string}>>; hero?:{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}|null; updatedAt:string|null };
async function loadContent():Promise<SiteContent>{
 const response=await fetch("/api/content");
 if(!response.ok)throw new Error("Could not load cached sports coverage.");
 return response.json();
}
type ResultsPayload={date:string;needsOddsApiSecret?:boolean;rows:Array<{selection_id:string;product_type:string;headline:string;publish_date:string;event_id:string;commence_time:string;home_team:string;away_team:string;market_name:string;selection_name:string;odds:number;home_score:number|null;away_score:number|null;outcome:string;result_note:string}>;summary:{total:number;won:number;lost:number;pending:number;void:number;pass:number};accuracy:number|null};
async function loadResults():Promise<ResultsPayload>{const response=await fetch("/api/results");if(!response.ok)throw new Error("Could not load yesterday’s results.");return response.json();}
async function loadAccas():Promise<AccasResponse>{
 const response=await fetch("/api/accas?days=3");
 if(!response.ok)throw new Error("Could not load the latest football editions.");
 return response.json();
}
function PageHeading({title,description,aside}:{title:string;description:string;aside?:React.ReactNode}){
 return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{aside&&<div className="page-heading-aside">{aside}</div>}</div>;
}
function SiteHeader({pathname}:{pathname:string}){
 const [menuOpen,setMenuOpen]=useState(false);
 const links=[["/","Home"],["/daily","Daily board"],["/recent","Recent editions"],["/results","Results"],["/competitions","Competitions"],["/football-betting-tips","Guides"]];
 return <>
  <header className="site-header">
   <a className="brand" href="/" aria-label="AccaForge home"><img className="brand-logo" src="/logo%20(4).png" alt="AccaForge" /></a>
   <nav className="desktop-nav" aria-label="Main navigation">{links.map(([href,label])=><a key={href} className={pathname===href?"nav-active":""} href={href}>{label}</a>)}</nav>
   <button className="icon-button mobile-menu-button" onClick={()=>setMenuOpen(value=>!value)} aria-label="Toggle navigation menu" aria-expanded={menuOpen}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button>
   {menuOpen&&<nav className="mobile-menu" aria-label="Mobile navigation">{links.map(([href,label])=><a key={href} href={href} onClick={()=>setMenuOpen(false)}>{label}</a>)}<a href="/responsible-gambling" onClick={()=>setMenuOpen(false)}>Responsible play</a></nav>}
  </header>
  <nav className="mobile-dock" aria-label="Main mobile navigation">
   <a className={pathname==="/"?"active":""} href="/"><Home size={18}/><span>Home</span></a>
   <a className={pathname==="/daily"||products.some(item=>item[3]===pathname)?"active":""} href="/daily"><Target size={18}/><span>Daily</span></a>
   <a className={pathname==="/recent"?"active":""} href="/recent"><CalendarRange size={18}/><span>Archive</span></a>
   <a className={pathname==="/results"?"active":""} href="/results"><ClipboardCheck size={18}/><span>Results</span></a>
  </nav>
 </>;
}
function SiteFooter(){
 return <footer className="site-footer">
  <div className="footer-brand-group"><a className="footer-brand" href="/">AccaForge</a><span>Football analysis, fixtures and daily editions.</span></div>
  <nav className="footer-links" aria-label="Company and legal links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/editorial-policy">Editorial policy</a><a href="/responsible-gambling">Responsible play</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/image-credits">Image credits</a></nav>
  <span className="footer-note">18+ · Information and entertainment only · Gamble responsibly</span>
 </footer>;
}
function EditionLink({acca}:{acca:Acca}){
 const isAll=acca.product_type==="all_matches";
 return <a className="edition-link" href={productPath(acca.product_type)}>
  <span className="edition-link-copy"><strong>{productLabel(acca.product_type)}</strong><small>{acca.selections.length} {isAll?"fixtures":"selections"} · {dateLabel(acca.publish_date)}</small></span>
  <span className="edition-link-value">{isAll?acca.selections.length:acca.actual_odds.toFixed(2)}<small>{isAll?"fixtures":"combined odds"}</small></span>
  <ArrowUpRight size={17}/>
 </a>;
}
function AccaDetail({acca,badges,leagueBadges}:{acca:Acca;badges:Record<string,string>;leagueBadges:Record<string,string>}){
 const [expanded,setExpanded]=useState(false);
 const isAll=acca.product_type==="all_matches";
 const picks=acca.selections.filter(item=>item.selection_status!=="PASS");
 return <article className="acca-detail">
  <div className="acca-topline"><span className="published"><i/> Published edition</span><span>{productLabel(acca.product_type)} · {dateLabel(acca.publish_date)}</span></div>
  <div className="acca-summary">
   <div className="acca-summary-copy"><h2>{acca.headline}</h2><p>{acca.analysis_note}</p></div>
   <div className="combined-odds"><span>{isAll?"Fixtures listed":"Combined odds"}</span><strong>{isAll?acca.selections.length:acca.actual_odds.toFixed(2)}</strong><small>{isAll?"Eligible fixtures":"Target "+acca.target_odds.toFixed(2)}</small></div>
  </div>
  <div className="selection-heading"><span>{isAll?"Fixture coverage":"Match and selection details"}</span><span>{picks.length} picks · {acca.selections.length-picks.length} passes</span></div>
  <div className="selection-list">{acca.selections.map((selection,index)=><SelectionRow key={selection.id} selection={selection} index={index} badges={badges} leagueBadges={leagueBadges}/>)}</div>
  <button className="details-toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?"Hide edition notes":"Read edition notes"} <ChevronDown size={16} className={expanded?"rotate":""}/></button>
  {expanded&&<div className="edition-details"><p>Displayed probabilities are estimates based on the available research. They are not guarantees. Bookmaker implied probability is calculated as 1 ÷ decimal odds and does not remove bookmaker margin. Prices may change before kick-off. A PASS means no sufficiently defensible market was identified.</p><span><Trophy size={15}/> {picks.length} picks across {acca.selections.length} listed fixtures</span></div>}
  <div className="acca-bottomline"><span><ShieldCheck size={15}/> Information only</span><span>Updated {kenyaTime(acca.created_at)} EAT</span><a href={"/accumulators/"+encodeURIComponent(acca.id)}>Open shareable edition <ArrowUpRight size={14}/></a></div>
 </article>;
}
function readablePick(selection:Selection){
 const market=(selection.market_key+" "+selection.market_name).toLowerCase();
 const raw=selection.selection_name.trim();
 const value=raw.toLowerCase();
 if(/btts|both teams to score|gg/.test(market)){
  const yes=/^(yes|gg yes|both teams to score - yes)$/i.test(raw)||value.includes("yes");
  const no=/^(no|gg no|both teams to score - no)$/i.test(raw)||value.includes("no");
  if(yes)return {label:"GG YES",tone:"gg-yes"};
  if(no)return {label:"GG NO",tone:"gg-no"};
 }
 if(/(^|\W)(h2h|1x2|moneyline|match result|full time result)(\W|$)/.test(market)){
  if(value==="home"||value==="1"||value.includes("home win")||value===selection.home_team.toLowerCase())
   return {label:selection.home_team.toUpperCase()+" WIN",tone:"pick-home"};
  if(value==="away"||value==="2"||value.includes("away win")||value===selection.away_team.toLowerCase())
   return {label:selection.away_team.toUpperCase()+" WIN",tone:"pick-away"};
  if(value==="draw"||value==="x")return {label:"DRAW",tone:"pick-draw"};
 }
 return {label:raw||"Selection",tone:"pick-default"};
}
function SelectionRow({selection,index,badges,leagueBadges}:{selection:Selection;index:number;badges:Record<string,string>;leagueBadges:Record<string,string>}){
 const isPass=selection.selection_status==="PASS";
 const pick=readablePick(selection);
 return <div className={"selection-row "+(isPass?"selection-pass":"")}>
  <span className="selection-index">{String(index+1).padStart(2,"0")}</span>
  <div className="selection-fixture"><a className="fixture-title" href={"/matches/"+encodeURIComponent(selection.event_id)}><span className="team-side">{(badges[selection.home_team]||localTeamLogos[selection.home_team])?<img src={badges[selection.home_team]||localTeamLogos[selection.home_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.home_team.slice(0,1).toUpperCase()}</i>}<b>{selection.home_team}</b></span><span className="versus">vs</span><span className="team-side">{(badges[selection.away_team]||localTeamLogos[selection.away_team])?<img src={badges[selection.away_team]||localTeamLogos[selection.away_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.away_team.slice(0,1).toUpperCase()}</i>}<b>{selection.away_team}</b></span></a><span className="fixture-meta">{leagueBadges[selection.sport_key]&&<img className="league-mini-logo" src={leagueBadges[selection.sport_key]} alt="" loading="lazy"/>}{leagueFor(selection.sport_key)?.name||"Football"} <i/> {kenyaTime(selection.commence_time)} EAT</span></div>
  <div className="selection-market"><span className="field-label">Market</span><strong>{selection.market_name}</strong><span className={"pick-label "+(isPass?"pick-default":pick.tone)}>{isPass?"PASS":pick.label}</span>{selection.note&&<small>{selection.note}</small>}</div>
  <div className="selection-estimate"><span className="field-label">Estimated chance</span><strong>{isPass?"Not listed":selection.probability.toFixed(1)+"%"}</strong><small>{isPass?"No supported selection":"Bookmaker: "+selection.implied_probability.toFixed(1)+"%"}</small></div>
  <div className="selection-price"><span className="field-label">Odds</span><strong>{isPass?"PASS":selection.odds.toFixed(2)}</strong><small>{isPass?"":selection.bookmaker}</small></div>
 </div>;
}
function ProductCard({type,acca}:{type:ProductType;acca?:Acca}){
 const product=products.find(item=>item[0]===type)!;
 return <a className="product-row" href={product[3]}><span className="product-row-main"><strong>{product[1]}</strong><small>{product[2]}</small></span><span className="product-row-result">{acca?(type==="all_matches"?acca.selections.length+" fixtures":acca.actual_odds.toFixed(2)+" odds"):"No edition published"}</span><ArrowUpRight size={17}/></a>;
}
export default function App({initialData,initialContent,todayLabel,pathname="/"}:{initialData?:AccasResponse;initialContent?:SiteContent;todayLabel?:string;pathname?:string}){
 void React;
 const [ageOk,setAgeOk]=useState(false);
 const [archiveDate,setArchiveDate]=useState("all");
 const [notice,setNotice]=useState(false);
 const [resultsMounted,setResultsMounted]=useState(false);
 const displayDate=todayLabel||new Date().toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
 useEffect(()=>{setAgeOk(localStorage.getItem("accaforge-18plus")==="yes");},[]);
 useEffect(()=>{setResultsMounted(true);},[]);
 const {data,isLoading,isError,refetch,isFetching}=useQuery({queryKey:["accas"],queryFn:loadAccas,initialData});
 const {data:contentData}=useQuery({queryKey:["site-content"],queryFn:loadContent,initialData:initialContent,staleTime:300000,refetchOnWindowFocus:false});
 const {data:resultsData,isLoading:resultsLoading,isError:resultsError,refetch:refetchResults}=useQuery({queryKey:["yesterday-results"],queryFn:loadResults,enabled:pathname==="/results" && resultsMounted,staleTime:60000,refetchOnWindowFocus:false});
 const teamBadges=contentData?.teamBadges||{};
 const leagueBadges=contentData?.leagueBadges||{};
 const leagueTables=contentData?.leagueTables||{};
 const accas=data?.accas||[];
 const todayISO=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Nairobi"});
 const todaysAccas=accas.filter(item=>item.publish_date===todayISO);
 const currentProduct=products.find(item=>item[3]===pathname)?.[0];
 const dates=useMemo(()=>Array.from(new Set(accas.map(item=>item.publish_date))).sort((a,b)=>b.localeCompare(a)),[accas]);
 const filteredArchive=archiveDate==="all"?accas:accas.filter(item=>item.publish_date===archiveDate);
 const current=currentProduct?accas.find(item=>item.product_type===currentProduct):undefined;
 const confirmAge=()=>{localStorage.setItem("accaforge-18plus","yes");setAgeOk(true);};
 const status=isLoading?<div className="state-panel"><span className="loader"/><p>Loading published football editions</p></div>:isError?<div className="state-panel"><Activity size={25}/><h2>We could not load the board</h2><p>Check your connection and try again.</p><button className="button button-secondary" onClick={()=>refetch()}>Try again</button></div>:null;
 let page:React.ReactNode;
 if(pathname==="/"){
  page=<main className="page-shell home-page">
   <section className="home-hero">
    <div className="home-copy"><span className="home-kicker">FOOTBALL PICKS · EAST AFRICA TIME</span><h1>Today’s football picks, without the guesswork.</h1><p>See the fixtures, markets and odds behind every published AccaForge selection. Open the board and judge each pick for yourself.</p><div className="hero-actions"><a className="button button-primary" href="/daily">View today’s picks <ArrowUpRight size={16}/></a><a className="text-link" href="/results">Check yesterday’s results</a></div><div className="home-date"><CalendarDays size={15}/><strong>{displayDate}</strong><span className={todaysAccas.length?"home-live":"home-awaiting"}><i/>{todaysAccas.length?todaysAccas.length+" editions published":"Waiting for today’s editions"}</span></div></div>
    <div className="home-board-preview"><div className="board-card-top"><div><span className="board-eyebrow">THE DAILY BOARD</span><h2>What’s published today</h2></div><span className={todaysAccas.length?"board-status is-live":"board-status"}><i/>{todaysAccas.length?"LIVE":"NOT YET LIVE"}</span></div><p className="board-card-note">{data?.updatedAt?"Last refreshed "+kenyaTime(data.updatedAt)+" EAT":"Published editions appear here after the daily update."}</p>{products.map(([type,label,caption,path])=>{const item=todaysAccas.find(acca=>acca.product_type===type);return <a className="preview-row" href={path} key={type}><span><strong>{label}</strong><small>{item?item.selections.length+(type==="all_matches"?" fixtures":" selections"):caption}</small></span><b>{item?(type==="all_matches"?item.selections.length+" fixtures":item.actual_odds.toFixed(2)):"—"}</b><ArrowUpRight size={15}/></a>;})}<a className="preview-all" href="/daily">See all today’s picks <ArrowUpRight size={15}/></a></div>
   </section>
   <section className="home-latest"><div className="section-heading"><div><h2>Latest published editions</h2><p>Choose a format to inspect its fixtures and selections</p></div><a className="text-link" href="/recent">Browse archive <ArrowUpRight size={15}/></a></div>{status||<div className="edition-links">{todaysAccas.slice(0,4).map(acca=><EditionLink key={acca.id} acca={acca}/>)}{!todaysAccas.length&&<p className="muted-copy">No editions have been published yet. Check the daily board later.</p>}</div>}</section>
   <section className="home-news"><div className="section-heading"><div><h2>Latest football news</h2><p>Daily headlines from football publishers, saved to the AccaForge cache</p></div><span className="news-updated">Daily update</span></div>{contentData?.news?.length?<div className="news-grid">{contentData.news.slice(0,6).map(item=><article className="news-card" key={item.id}><a className="news-card-link" href={item.url} target="_blank" rel="noopener noreferrer">{item.image_url&&<img src={item.image_url} alt="" loading="lazy"/>}<div className="news-card-copy"><span>{item.source} · {new Date(item.published_at).toLocaleDateString("en-KE",{day:"numeric",month:"short"})}</span><strong>{item.title}</strong><small>Read original story <ArrowUpRight size={13}/></small></div></a>{item.image_credit&&<div className="news-image-credit">Photo: {item.image_credit}{item.image_source_url&&<> · <a href={item.image_source_url} target="_blank" rel="noopener noreferrer">Source</a></>}{item.image_license_url&&<> · <a href={item.image_license_url} target="_blank" rel="noopener noreferrer">{item.image_license||"Licence"}</a></>}</div>}</article>)}</div>:<div className="news-empty">Football headlines will appear after the first scheduled daily refresh.</div>}</section>
   <section className="home-seo" aria-labelledby="football-predictions-guide">
    <div className="home-seo-intro"><span className="eyebrow">THE ACCAFORGE APPROACH</span><h2 id="football-predictions-guide">Football predictions and betting tips, with the details left in</h2><p>AccaForge is a football predictions and odds-analysis platform built around disciplined selection and transparent reasoning. Our AI-assisted analysis weighs available match data, market prices and estimated probabilities. Safe Picks applies strict filters and is published only when the required quality threshold is met; the goal is to surface the strongest available opportunities, not to force a daily list.</p></div>
    <div className="home-seo-grid">
     <article><h3>Today’s football tips</h3><p>Open each edition to see its fixtures, kick-off times, markets and individual odds. All times are shown in East Africa Time.</p><a href="/daily">Open today’s board <ArrowUpRight size={14}/></a></article>
     <article><h3>Markets and accumulators</h3><p>Understand 1X2, BTTS, goals and other markets, then compare the Safe Picks, Super 5, Super 10 and All-Matches formats.</p><a href="/football-betting-tips">Read the football tips guide <ArrowUpRight size={14}/></a></article>
     <article><h3>Results, not just predictions</h3><p>Review yesterday’s published selections alongside available final scores and recorded win, loss or pending outcomes.</p><a href="/results">View yesterday’s results <ArrowUpRight size={14}/></a></article>
    </div>
    <div className="home-seo-faq"><h2>AccaForge: frequently asked questions</h2>
     <details><summary>How does AccaForge identify high-confidence picks?</summary><p>AccaForge focuses on high-confidence selections supported by available match data, market prices and AI-assisted probability analysis. Safe Picks applies strict filters and publishes only when the required selection criteria are met. No football outcome is certain, so every pick remains subject to match-day risk.</p></details>
     <details><summary>What is included in a daily AccaForge edition?</summary><p>Each published edition lists the fixture, competition, kick-off time, market, selection and individual decimal odds. Combined odds are shown for accumulator formats; All-Matches also identifies fixtures marked PASS.</p></details>
     <details><summary>Does AccaForge publish yesterday's results?</summary><p>Yes. The results page lists selections from the previous day's published editions alongside available final scores and their recorded outcomes. Pending matches are not counted as settled wins or losses.</p></details>
     <details><summary>Which football competitions does AccaForge cover?</summary><p>Coverage includes competitions such as the English Premier League, UEFA Champions League, Europa League, La Liga, Bundesliga, Serie A, Ligue 1 and Eredivisie when eligible fixtures and markets are available.</p></details>
    </div>
    <p className="home-seo-responsible">18+ only. AccaForge is an information and entertainment website, not a bookmaker. Odds can change and no prediction guarantees a result. Never stake money you cannot afford to lose. <a href="/responsible-gambling">Read responsible-play guidance</a>.</p>
   </section>
  </main>;
 }else if(pathname==="/daily"){
  page=<main className="page-shell"><PageHeading title="Daily football board" description="Four publication formats, each with its own page and complete fixture breakdown." aside={<span className="updated"><Clock3 size={15}/>{data?.updatedAt?"Updated "+kenyaTime(data.updatedAt)+" EAT":"Awaiting an edition"}</span>}/>{status||<section className="product-list">{products.map(([type])=><ProductCard key={type} type={type} acca={accas.find(item=>item.product_type===type)}/>)}</section>}</main>;
 }else if(currentProduct){
  page=<main className="page-shell product-page"><PageHeading title={productLabel(currentProduct)} description={products.find(item=>item[0]===currentProduct)?.[2]||"Football selections and match information."} aside={<a className="text-link" href="/daily">All daily formats <ArrowUpRight size={15}/></a>}/>{status||<>{current?<AccaDetail acca={current} badges={teamBadges} leagueBadges={leagueBadges}/>:<div className="state-panel"><Target size={26}/><h2>No {productLabel(currentProduct)} edition published</h2><p>This format appears when its selection rules and available research are satisfied. We do not add unsupported picks to fill a list.</p><button className="button button-secondary" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Checking":"Refresh edition"}</button></div>}</>}<nav className="product-switcher" aria-label="Other daily formats">{products.filter(item=>item[0]!==currentProduct).map(([type,label,,path])=><a key={type} href={path}>{label}<ArrowUpRight size={14}/></a>)}</nav></main>;
 }else if(pathname==="/recent"){
  page=<main className="page-shell"><PageHeading title="Recent editions" description="Browse the published football selections retained in the recent archive." aside={<label className="archive-select"><CalendarDays size={15}/><select value={archiveDate} onChange={event=>setArchiveDate(event.target.value)}><option value="all">All dates</option>{dates.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select><ChevronDown size={14}/></label>}/>{status||<div className="archive-list">{filteredArchive.length?filteredArchive.map(item=><a key={item.id} className="archive-row" href={"/accumulators/"+encodeURIComponent(item.id)}><span className="archive-date">{dateLabel(item.publish_date)}</span><span className="archive-target">{productLabel(item.product_type)}</span><span className="archive-legs">{item.selections.length} {item.product_type==="all_matches"?"fixtures":"selections"}</span><strong className="archive-price">{item.product_type==="all_matches"?"—":item.actual_odds.toFixed(2)}</strong><span className="archive-open">Open <ArrowUpRight size={14}/></span></a>):<p className="muted-copy">No recent editions are available for this date.</p>}</div>}</main>;
 }else if(pathname==="/results"){
  const rows=resultsData?.rows||[];const summary=resultsData?.summary;
  const grouped=products.map(([type,label])=>({type,label,rows:rows.filter(row=>row.product_type===type)})).filter(group=>group.rows.length);
  page=<main className="page-shell results-page"><PageHeading title="Yesterday’s results" description="Every selection from yesterday’s published editions, settled against confirmed match scores." aside={<span className="updated"><Clock3 size={15}/>Daily score update</span>}/>{(resultsLoading||!resultsMounted)?<div className="state-panel"><span className="loader"/><p>Loading yesterday’s results…</p></div>:resultsError?<div className="state-panel"><h2>Results are temporarily unavailable</h2><button className="button button-secondary" onClick={()=>refetchResults()}>Try again</button></div>:<>{resultsData?.needsOddsApiSecret&&<div className="results-setup-notice">The results feed needs the Odds API key added as a Cloudflare Worker secret. Predictions are saved, but match outcomes will remain pending until the key is configured.</div>}<div className="results-summary"><div><strong>{summary?.total||0}</strong><span>Selections</span></div><div className="result-won"><strong>{summary?.won||0}</strong><span>Won</span></div><div className="result-lost"><strong>{summary?.lost||0}</strong><span>Lost</span></div><div className="result-pending"><strong>{summary?.pending||0}</strong><span>Pending</span></div><div><strong>{resultsData?.accuracy===null||resultsData?.accuracy===undefined?"—":resultsData.accuracy+"%"}</strong><span>Accuracy</span></div></div>{grouped.length?grouped.map(group=><section className="results-group" key={group.type}><div className="section-heading"><div><h2>{group.label}</h2><p>{group.rows.length} selections · {group.rows.filter(row=>row.outcome==="WON").length} won · {group.rows.filter(row=>row.outcome==="LOST").length} lost</p></div></div><div className="results-list">{group.rows.map(row=><article className="result-card" key={row.selection_id}><div className="result-fixture"><strong>{row.home_team}</strong><span className="result-score">{row.home_score===null||row.away_score===null?"vs":row.home_score+" – "+row.away_score}</span><strong>{row.away_team}</strong></div><div className="result-pick"><span>{row.market_name}</span><strong>{row.selection_name}</strong><small>Odds {Number(row.odds).toFixed(2)}</small></div><span className={"result-status status-"+row.outcome.toLowerCase()}>{row.outcome}</span>{row.result_note&&<small className="result-note">{row.result_note}</small>}</article>)}</div></section>):<div className="state-panel"><Trophy size={27}/><h2>No published predictions for yesterday</h2><p>When yesterday’s editions are available, every selection will appear here with its result.</p></div>}</>}</main>;
 }else if(pathname==="/competitions"){
  page=<main className="page-shell"><PageHeading title="Football competitions" description="Browse the leagues followed by the AccaForge daily football board."/><div className="league-directory">{leagues.map(league=><a href={"/leagues/"+league.key} className="league-directory-row" key={league.key}><img src={leagueBadges[league.key]||league.logo} alt=""/><span>{league.name}</span><ArrowUpRight size={16}/></a>)}</div>
   <section className="standings-section"><div className="section-heading"><div><h2>League tables</h2><p>Latest standings saved from the daily sports-data refresh.</p></div></div><div className="standings-grid">{leagues.map(league=>{const table=leagueTables[league.key]||[];if(!table.length)return null;return <article className="standings-card" key={league.key}><header><img src={leagueBadges[league.key]||league.logo} alt=""/><div><strong>{league.name}</strong><small>Current season · {table.length} clubs</small></div></header><div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>{table.slice(0,8).map(row=><tr key={row.position}><td>{row.position}</td><td><span className="standing-team">{teamBadges[row.team]&&<img src={teamBadges[row.team]} alt="" loading="lazy"/>}{row.team}</span></td><td>{row.played}</td><td>{row.goalDifference>0?"+"+row.goalDifference:row.goalDifference}</td><td><strong>{row.points}</strong></td></tr>)}</tbody></table></div></article>})}</div></section></main>;
 }else{
  page=<main className="page-shell"><PageHeading title="Page not found" description="The page you requested is not part of the AccaForge daily board."/><a className="button button-primary" href="/">Return home</a></main>;
 }
 return <div className="app theme-light"><SiteHeader pathname={pathname}/>{page}<SiteFooter/>{(!ageOk||notice)&&<div className="modal-backdrop"><section className="age-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-mark"><ShieldCheck size={24}/></div><h2 id="modal-title">{ageOk?"A responsible-play reminder":"Are you 18 or older?"}</h2><p>AccaForge provides football information for entertainment only. Betting involves risk and you may lose your entire stake. No prediction is certain.</p><div className="modal-notice"><strong>18+ only</strong><span>By continuing, you confirm that you are at least 18 years old.</span></div><div className="modal-actions">{ageOk?<button className="button button-primary" onClick={()=>setNotice(false)}>I understand</button>:<><button className="button button-primary" onClick={confirmAge}><Check size={16}/> I am 18 or older</button><button className="button button-secondary" onClick={()=>window.location.assign("https://www.begambleaware.org/")}>I am under 18</button></>}</div>{ageOk&&<button className="modal-close" aria-label="Close notice" onClick={()=>setNotice(false)}><X size={17}/></button>}</section></div>}</div>;
}

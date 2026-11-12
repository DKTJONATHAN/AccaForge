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
const leagueNameFor=(key:string)=>leagueFor(key)?.name||key.replace(/^soccer_/,"").split("_").map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ");
const localTeamLogos:Record<string,string>={"Arsenal":"/media/arsenal.svg","Arsenal FC":"/media/arsenal.svg","Chelsea":"/media/chelsea.svg","Chelsea FC":"/media/chelsea.svg","Liverpool":"/media/liverpool.svg","Liverpool FC":"/media/liverpool.svg","Manchester United":"/media/manchester-united.svg","Manchester United FC":"/media/manchester-united.svg"};
const kenyaTime=(value:string)=>new Date(value).toLocaleString("en-KE",{timeZone:"Africa/Nairobi",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
export type SiteContent = { news:Array<{id:string;title:string;url:string;source:string;published_at:string;image_url:string;image_credit:string;image_license:string;image_license_url:string;image_source_url:string}>; photos:Array<{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}>; teamBadges:Record<string,string>; leagueBadges:Record<string,string>; leagueTables:Record<string,Array<{position:number;team:string;played:number;won:number;drawn:number;lost:number;goalsFor:number;goalsAgainst:number;goalDifference:number;points:number;form:string}>>; hero?:{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}|null; updatedAt:string|null };
async function loadContent():Promise<SiteContent>{
 const response=await fetch("/api/content");
 if(!response.ok)throw new Error("Could not load cached sports coverage.");
 return response.json();
}
type ResultsPayload={date:string;windowDays?:number;needsOddsApiSecret?:boolean;marketSummary?:Array<{market_key:string;market_name:string;total:number;won:number;lost:number;pending:number}>;rows:Array<{selection_id:string;product_type:string;headline:string;publish_date:string;event_id:string;sport_key:string;commence_time:string;home_team:string;away_team:string;market_name:string;selection_name:string;odds:number;home_score:number|null;away_score:number|null;outcome:string;result_note:string}>;summary:{total:number;won:number;lost:number;pending:number;void:number;pass:number};accuracy:number|null};
async function loadResults():Promise<ResultsPayload>{const response=await fetch("/api/results");if(!response.ok)throw new Error("Could not load the published results archive.");return response.json();}
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
 const links=[["/","Home"],["/daily","Daily board"],["/recent","Recent editions"],["/results","Results"],["/competitions","Competitions"],["/guides","Guides"]];
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
  <div className="selection-fixture"><a className="fixture-title" href={"/matches/"+encodeURIComponent(selection.event_id)}><span className="team-side">{(badges[selection.home_team]||localTeamLogos[selection.home_team])?<img src={badges[selection.home_team]||localTeamLogos[selection.home_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.home_team.slice(0,1).toUpperCase()}</i>}<b>{selection.home_team}</b></span><span className="versus">vs</span><span className="team-side">{(badges[selection.away_team]||localTeamLogos[selection.away_team])?<img src={badges[selection.away_team]||localTeamLogos[selection.away_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.away_team.slice(0,1).toUpperCase()}</i>}<b>{selection.away_team}</b></span></a><span className="fixture-meta">{leagueBadges[selection.sport_key]&&<img className="league-mini-logo" src={leagueBadges[selection.sport_key]} alt="" loading="lazy"/>}{leagueNameFor(selection.sport_key)} <i/> {kenyaTime(selection.commence_time)} EAT</span></div>
  <div className="selection-market"><span className="field-label">Market</span><strong>{selection.market_name}</strong><span className={"pick-label "+(isPass?"pick-default":pick.tone)}>{isPass?"PASS":pick.label}</span>{selection.note&&<small>{selection.note}</small>}</div>
  <div className="selection-estimate"><span className="field-label">Estimated chance</span><strong>{isPass?"Not listed":selection.probability.toFixed(1)+"%"}</strong><small>{isPass?"No supported selection":"Bookmaker: "+selection.implied_probability.toFixed(1)+"%"}</small></div>
  <div className="selection-price"><span className="field-label">Odds</span><strong>{isPass?"PASS":selection.odds.toFixed(2)}</strong><small>{isPass?"":selection.bookmaker}</small></div>
 </div>;
}
function FormatGuide({type}:{type:ProductType}){
 const content:Record<ProductType,{title:string;intro:string;sections:Array<[string,string]>}> = {
  safe_picks:{title:"How Safe Picks works",intro:"Safe Picks is a selective format. Its purpose is to publish only fixtures that meet the configured price and selection requirements, rather than filling a list when the available evidence is weak.",sections:[["What we assess","We review fixture and competition context, recent team performance, opponent strength, home and away patterns, relevant scoring and defensive indicators, verified availability information, tactical match-ups and the exact market price. The depth of information varies by fixture."],["Selection discipline","A fixture needs an identifiable market, a usable price and enough supporting information to pass the relevant checks. An edition may be withheld when the required conditions are not met. Safe is the format name; it does not mean risk-free or guaranteed."],["Why a fixture may be absent","Team news may be uncertain, a market may be unavailable, the price may fall outside the configured range or the evidence may not support a defensible selection. Omitting a fixture is preferable to presenting an unsupported choice."],["How to read the figures","The bookmaker-implied percentage is derived from the listed decimal price. Any estimated chance is a separate assessment. Both are estimates, not promises of a result."]]},
  super_5:{title:"Super 5: five-selection format",intro:"Super 5 is organised around five selected football fixtures. Its page presents each fixture and market separately so the individual case and the combined price can be reviewed.",sections:[["How combined odds work","Multiply the five decimal prices to obtain the combined decimal price, subject to the applicable settlement rules. If any leg loses, a standard accumulator loses."],["How fixtures are assessed","We review recent performance in context, opponent strength, home and away patterns, relevant scoring and defensive indicators, verified team availability, tactical match-ups and the exact market price."],["Why five legs still carry risk","Every leg is another outcome that must succeed. The chance of all five landing is lower than the chance of any one leg landing. Correlation between selections can also affect the combined probability."],["When no edition appears","The format is not intended to force five choices regardless of conditions. If eligible fixtures, markets or supporting information are insufficient, publication may be delayed or withheld."]]},
  super_10:{title:"Super 10: combined odds and ten-leg risk",intro:"Super 10 is organised around its configured combined-odds target. The edition displays the selected fixtures, markets and individual prices so the overall figure can be checked rather than viewed in isolation.",sections:[["How the combined price is calculated","Multiply the decimal odds of every included leg. The displayed combined price is a mathematical product of the listed prices, not a guarantee of return."],["What we assess","Our analysis reviews competition and fixture context, team form and opponent quality, home and away performance, relevant goal and defensive indicators, verified team news, tactical match-ups, market definition and available price."],["Why the number of legs matters","Ten selections create ten separate conditions for a standard accumulator to satisfy. A selection with a high individual estimated chance can still fail, and adding legs compounds the challenge."],["Publication discipline","The target guides the format, but it does not justify adding unsupported fixtures. If the available matches and prices do not support a defensible edition, publication may be delayed or withheld."]]},
  all_matches:{title:"All-Matches Challenge: fixture-by-fixture analysis",intro:"The All-Matches Challenge makes the eligible fixture board easier to review. It lists the matches considered for the edition and distinguishes a selected market from a fixture marked PASS.",sections:[["What the board covers","The edition includes eligible fixtures available for its selected competitions and time window. Coverage depends on fixture data, market availability and the quality of information available at the time; it is not every football match worldwide."],["What PASS means","PASS means no selection is published for that fixture. The available evidence, price, market or team information may not support a sufficiently clear assessment. PASS is not a prediction of a draw or any other result."],["How we review a fixture","We consider recent results in context, opponent strength, home and away performance, relevant scoring and defensive statistics, verified team availability, tactical match-up, market rules and listed price."],["Reading each row","Check the teams, competition, kick-off time, market name, exact selection and odds. A PASS row has no selected odds or estimated chance."]]}
 };
 const item=content[type];
 return <section className="home-seo format-guide"><div className="home-seo-intro"><span className="eyebrow">FORMAT GUIDE</span><h2>{item.title}</h2><p>{item.intro}</p></div><div className="home-seo-grid">{item.sections.map(([heading,copy])=><article key={heading}><h3>{heading}</h3><p>{copy}</p></article>)}</div><p>Learn more: <a href="/guides">football analysis guides</a> · <a href="/guides/decimal-odds-explained">decimal odds</a> · <a href="/guides/implied-probability">implied probability</a> · <a href="/results">yesterday’s results</a>.</p><p className="home-seo-responsible">18+ only. Accumulators carry a risk of loss. No selection or combined price guarantees a result.</p></section>;
}
function ProductCard({type,acca}:{type:ProductType;acca?:Acca}){
 const product=products.find(item=>item[0]===type)!;
 return <a className="product-row" href={product[3]}><span className="product-row-main"><strong>{product[1]}</strong><small>{product[2]}</small></span><span className="product-row-result">{acca?(type==="all_matches"?acca.selections.length+" fixtures":acca.actual_odds.toFixed(2)+" odds"):"No edition published"}</span><ArrowUpRight size={17}/></a>;
}
export default function App({initialData,initialContent,todayLabel,pathname="/"}:{initialData?:AccasResponse;initialContent?:SiteContent;todayLabel?:string;pathname?:string}){
 void React;
 const [ageOk,setAgeOk]=useState<boolean|null>(null);
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
 const leagueDirectory=[...leagues,...Object.keys(leagueTables).filter(key=>!leagues.some(item=>item.key===key)).map(key=>({key,name:leagueNameFor(key),logo:leagueBadges[key]||""}))];
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
    <div className="home-copy"><span className="home-kicker">FOOTBALL PICKS · EAST AFRICA TIME</span><h1>Today’s football picks. Clear reasoning.</h1><p>See the fixtures, markets and odds behind every published AccaForge selection. Open the board and judge each pick for yourself.</p><div className="hero-actions"><a className="button button-primary" href="/daily">View today’s picks <ArrowUpRight size={16}/></a><a className="text-link" href="/results">Check yesterday’s results</a></div><div className="home-date"><CalendarDays size={15}/><strong>{displayDate}</strong><span className={todaysAccas.length?"home-live":"home-awaiting"}><i/>{todaysAccas.length?todaysAccas.length+" editions published":"Waiting for today’s editions"}</span></div></div>
    <div className="home-board-preview"><div className="board-card-top"><div><span className="board-eyebrow">THE DAILY BOARD</span><h2>What’s published today</h2></div><span className={todaysAccas.length?"board-status is-live":"board-status"}><i/>{todaysAccas.length?"LIVE":"NOT YET LIVE"}</span></div><p className="board-card-note">{data?.updatedAt?"Last refreshed "+kenyaTime(data.updatedAt)+" EAT":"Published editions appear here after the daily update."}</p>{products.map(([type,label,caption,path])=>{const item=todaysAccas.find(acca=>acca.product_type===type);return <a className="preview-row" href={path} key={type}><span><strong>{label}</strong><small>{item?item.selections.length+(type==="all_matches"?" fixtures":" selections"):caption}</small></span><b>{item?(type==="all_matches"?item.selections.length+" fixtures":item.actual_odds.toFixed(2)):"—"}</b><ArrowUpRight size={15}/></a>;})}<a className="preview-all" href="/daily">See all today’s picks <ArrowUpRight size={15}/></a></div>
   </section>
   <section className="home-latest"><div className="section-heading"><div><h2>Latest published editions</h2><p>Choose a format to inspect its fixtures and selections</p></div><a className="text-link" href="/recent">Browse archive <ArrowUpRight size={15}/></a></div>{status||<div className="edition-links">{todaysAccas.slice(0,4).map(acca=><EditionLink key={acca.id} acca={acca}/>)}{!todaysAccas.length&&<p className="muted-copy">No editions have been published yet. Check the daily board later.</p>}</div>}</section>
   <section className="home-news"><div className="section-heading"><div><h2>Latest football news</h2><p>Daily headlines from football publishers, saved to the AccaForge cache</p></div><span className="news-updated">Daily update</span></div>{contentData?.news?.length?<div className="news-grid">{contentData.news.slice(0,6).map(item=><article className="news-card" key={item.id}><a className="news-card-link" href={item.url} target="_blank" rel="noopener noreferrer">{item.image_url&&<img src={item.image_url} alt="" loading="lazy"/>}<div className="news-card-copy"><span>{item.source} · {new Date(item.published_at).toLocaleDateString("en-KE",{day:"numeric",month:"short"})}</span><strong>{item.title}</strong><small>Read original story <ArrowUpRight size={13}/></small></div></a>{item.image_credit&&<div className="news-image-credit">Photo: {item.image_credit}{item.image_source_url&&<> · <a href={item.image_source_url} target="_blank" rel="noopener noreferrer">Source</a></>}{item.image_license_url&&<> · <a href={item.image_license_url} target="_blank" rel="noopener noreferrer">{item.image_license||"Licence"}</a></>}</div>}</article>)}</div>:<div className="news-empty">Football headlines will appear after the first scheduled daily refresh.</div>}</section>
   <section className="home-seo" aria-labelledby="football-predictions-guide">
    <div className="home-seo-intro"><span className="eyebrow">THE ACCAFORGE APPROACH</span><h2 id="football-predictions-guide">Football analysis built on evidence, context and clear reasoning</h2><p>We assess each fixture on its merits: competition context, recent team performance, opponent strength, home and away records, relevant statistics, verified team news, tactical match-ups, market definitions and listed prices. We distinguish confirmed information from uncertainty, compare the available price with our assessment, and avoid forcing a selection when the evidence is not strong enough. No method can remove the uncertainty of football.</p></div>
    <div className="home-seo-grid">
     <article><h3>Today’s football tips</h3><p>Open each edition to see its fixtures, kick-off times, markets and individual odds. All times are shown in East Africa Time.</p><a href="/daily">Open today’s board <ArrowUpRight size={14}/></a></article>
     <article><h3>Markets and accumulators</h3><p>Understand 1X2, BTTS, goals and other markets, then compare the Safe Picks, Super 5, Super 10 and All-Matches formats.</p><a href="/guides">Explore the football analysis guides <ArrowUpRight size={14}/></a></article>
     <article><h3>Results, not just predictions</h3><p>Review yesterday’s published selections alongside available final scores and recorded win, loss or pending outcomes.</p><a href="/results">View yesterday’s results <ArrowUpRight size={14}/></a></article>
    </div>
    <div className="home-seo-grid">
     <article><h3>Safe Picks</h3><p>A selective format with defined filters. A fixture is included only when its market, price and available evidence meet the publication criteria.</p><a href="/safe-picks">How Safe Picks works <ArrowUpRight size={14}/></a></article>
     <article><h3>Super 5 and Super 10</h3><p>Five-selection and combined-odds formats with individual fixture details and a visible combined price. Every additional leg carries risk.</p><a href="/super-5">Explore Super 5 <ArrowUpRight size={14}/></a> · <a href="/super-10">Super 10 <ArrowUpRight size={14}/></a></article>
     <article><h3>All-Matches Challenge</h3><p>Eligible fixtures are reviewed individually. PASS is shown when the available information does not support a sufficiently defensible selection.</p><a href="/all-matches">How the challenge works <ArrowUpRight size={14}/></a></article>
    </div>
    <div className="home-seo-grid">
     <article><h3>Understand odds and probability</h3><p>Learn how decimal odds translate into implied probability, and why a market price is not a guarantee.</p><a href="/guides/decimal-odds-explained">Decimal odds explained <ArrowUpRight size={14}/></a> · <a href="/guides/implied-probability">Implied probability <ArrowUpRight size={14}/></a></article>
     <article><h3>Understand football markets</h3><p>Explore 1X2, double chance, goals totals and both-teams-to-score markets with clear examples and settlement notes.</p><a href="/guides">Browse all football guides <ArrowUpRight size={14}/></a></article>
     <article><h3>Assess form with context</h3><p>Recent results matter, but opponent strength, home and away performance, team availability and match conditions matter too.</p><a href="/guides/football-form-analysis">Read the form analysis guide <ArrowUpRight size={14}/></a></article>
    </div>
    <div className="home-seo-faq"><h2>AccaForge: frequently asked questions</h2>
     <details><summary>How does AccaForge identify high-confidence picks?</summary><p>We assess fixtures using available match information, competition context, team performance, relevant statistics, verified team news and market prices. Safe Picks applies strict filters and publishes only when the required selection criteria are met. No football outcome is certain, so every pick remains subject to match-day risk.</p></details>
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
  page=<main className="page-shell product-page"><PageHeading title={productLabel(currentProduct)} description={products.find(item=>item[0]===currentProduct)?.[2]||"Football selections and match information."} aside={<a className="text-link" href="/daily">All daily formats <ArrowUpRight size={15}/></a>}/>{status||<>{current?<AccaDetail acca={current} badges={teamBadges} leagueBadges={leagueBadges}/>:<div className="state-panel"><Target size={26}/><h2>No {productLabel(currentProduct)} edition published</h2><p>This format appears when its selection rules and available research are satisfied. We do not add unsupported picks to fill a list.</p><button className="button button-secondary" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Checking":"Refresh edition"}</button></div>}</>}<nav className="product-switcher" aria-label="Other daily formats">{products.filter(item=>item[0]!==currentProduct).map(([type,label,,path])=><a key={type} href={path}>{label}<ArrowUpRight size={14}/></a>)}</nav><FormatGuide type={currentProduct}/></main>;
 }else if(pathname==="/recent"){
  page=<main className="page-shell"><PageHeading title="Recent editions" description="Browse the published football selections retained in the recent archive." aside={<label className="archive-select"><CalendarDays size={15}/><select value={archiveDate} onChange={event=>setArchiveDate(event.target.value)}><option value="all">All dates</option>{dates.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select><ChevronDown size={14}/></label>}/>{status||<div className="archive-list">{filteredArchive.length?filteredArchive.map(item=><a key={item.id} className="archive-row" href={"/accumulators/"+encodeURIComponent(item.id)}><span className="archive-date">{dateLabel(item.publish_date)}</span><span className="archive-target">{productLabel(item.product_type)}</span><span className="archive-legs">{item.selections.length} {item.product_type==="all_matches"?"fixtures":"selections"}</span><strong className="archive-price">{item.product_type==="all_matches"?"—":item.actual_odds.toFixed(2)}</strong><span className="archive-open">Open <ArrowUpRight size={14}/></span></a>):<p className="muted-copy">No recent editions are available for this date.</p>}</div>}</main>;
 }else if(pathname==="/results"){
  const rows=resultsData?.rows||[];const summary=resultsData?.summary;
  const grouped=products.map(([type,label])=>({type,label,rows:rows.filter(row=>row.product_type===type)})).filter(group=>group.rows.length);
  page=<main className="page-shell results-page"><PageHeading title="Yesterday’s match results" description={resultsData?.date?dateLabel(resultsData.date)+" · Only selections published yesterday (East Africa Time). Accuracy excludes pending and void selections.":"Only selections published yesterday (East Africa Time). Accuracy excludes pending and void selections."} aside={<span className="updated"><Clock3 size={15}/>Daily score update</span>}/>{(resultsLoading||!resultsMounted)?<div className="state-panel"><span className="loader"/><p>Loading the published results archive…</p></div>:resultsError?<div className="state-panel"><h2>Results are temporarily unavailable</h2><button className="button button-secondary" onClick={()=>refetchResults()}>Try again</button></div>:<>{resultsData?.needsOddsApiSecret&&<div className="results-setup-notice">The results feed needs the Odds API key added as a Cloudflare Worker secret. Predictions are saved, but match outcomes will remain pending until the key is configured.</div>}<div className="results-summary"><div><strong>{summary?.total||0}</strong><span>Selections</span></div><div className="result-won"><strong>{summary?.won||0}</strong><span>Won</span></div><div className="result-lost"><strong>{summary?.lost||0}</strong><span>Lost</span></div><div className="result-pending"><strong>{summary?.pending||0}</strong><span>Pending</span></div><div><strong>{resultsData?.accuracy===null||resultsData?.accuracy===undefined?"—":resultsData.accuracy+"%"}</strong><span>Accuracy</span></div></div>{resultsData?.marketSummary?.length?<section className="results-group"><div className="section-heading"><div><h2>Results by market</h2><p>Settled outcomes are shown separately from pending selections.</p></div></div><div className="results-list">{resultsData.marketSummary.map(market=><article className="result-card" key={market.market_key+"-"+market.market_name}><div className="result-pick"><strong>{market.market_name}</strong><small>{market.total} recorded selections</small></div><span className="result-status status-won">{market.won} won</span><span className="result-status status-lost">{market.lost} lost</span><small className="result-note">{market.pending} pending</small></article>)}</div></section>:null}{grouped.length?grouped.map(group=><section className="results-group" key={group.type}><div className="section-heading"><div><h2>{group.label}</h2><p>{group.rows.length} selections · {group.rows.filter(row=>row.outcome==="WON").length} won · {group.rows.filter(row=>row.outcome==="LOST").length} lost</p></div></div><div className="results-list">{group.rows.map(row=><article className="result-card" key={row.selection_id}><div className="result-fixture">{teamBadges[row.home_team]&&<img className="result-team-logo" src={teamBadges[row.home_team]} alt="" loading="lazy"/>}<strong>{row.home_team}</strong><span className="result-score">{row.home_score===null||row.away_score===null?"vs":row.home_score+" – "+row.away_score}</span>{teamBadges[row.away_team]&&<img className="result-team-logo" src={teamBadges[row.away_team]} alt="" loading="lazy"/>}<strong>{row.away_team}</strong></div><div className="result-pick"><span className="result-competition">{leagueBadges[row.sport_key]&&<img src={leagueBadges[row.sport_key]} alt="" loading="lazy"/>}{leagueNameFor(row.sport_key)} · {row.market_name}</span><strong>{row.selection_name}</strong><small>Odds {Number(row.odds).toFixed(2)}</small></div><span className={"result-status status-"+row.outcome.toLowerCase()}>{row.outcome}</span>{row.result_note&&<small className="result-note">{row.result_note}</small>}</article>)}</div></section>):<div className="state-panel"><Trophy size={27}/><h2>No matches published yesterday</h2><p>Yesterday’s published selections will appear here when available, including losses and void outcomes.</p></div>}</>}</main>;
 }else if(pathname==="/competitions"){
  page=<main className="page-shell"><PageHeading title="Football competitions" description="Browse the leagues followed by the AccaForge daily football board."/><div className="league-directory">{leagueDirectory.map(league=><a href={leagues.some(item=>item.key===league.key)?"/leagues/"+league.key:"#standings-"+league.key} className="league-directory-row" key={league.key}>{leagueBadges[league.key]||league.logo?<img src={leagueBadges[league.key]||league.logo} alt=""/>:<span className="league-mark">{league.name.slice(0,2).toUpperCase()}</span>}<span>{league.name}</span><ArrowUpRight size={16}/></a>)}</div>
   <section className="standings-section"><div className="section-heading"><div><h2>League tables</h2><p>Latest standings saved from the daily sports-data refresh.</p></div></div><div className="standings-grid">{Object.entries(leagueTables).map(([sportKey,table])=>{if(!table.length)return null;const logo=leagueBadges[sportKey]||leagueFor(sportKey)?.logo||"";const name=leagueNameFor(sportKey);return <article className="standings-card" id={"standings-"+sportKey} key={sportKey}><header>{logo?<img src={logo} alt=""/>:<span className="league-mark">{name.slice(0,2).toUpperCase()}</span>}<div><strong>{name}</strong><small>Current season · {table.length} clubs</small></div></header><div className="standings-table-wrap"><table className="standings-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>{table.map(row=><tr key={row.position}><td>{row.position}</td><td><span className="standing-team">{teamBadges[row.team]&&<img src={teamBadges[row.team]} alt="" loading="lazy"/>}{row.team}</span></td><td>{row.played}</td><td>{row.goalDifference>0?"+"+row.goalDifference:row.goalDifference}</td><td><strong>{row.points}</strong></td></tr>)}</tbody></table></div></article>})}</div></section></main>;
 }else{
  page=<main className="page-shell"><PageHeading title="Page not found" description="The page you requested is not part of the AccaForge daily board."/><a className="button button-primary" href="/">Return home</a></main>;
 }
 return <div className="app theme-light"><SiteHeader pathname={pathname}/>{page}<SiteFooter/>{(ageOk===false||notice)&&<div className="modal-backdrop"><section className="age-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-mark"><ShieldCheck size={24}/></div><h2 id="modal-title">{ageOk?"A responsible-play reminder":"Are you 18 or older?"}</h2><p>AccaForge provides football information for entertainment only. Betting involves risk and you may lose your entire stake. No prediction is certain.</p><div className="modal-notice"><strong>18+ only</strong><span>By continuing, you confirm that you are at least 18 years old.</span></div><div className="modal-actions">{ageOk?<button className="button button-primary" onClick={()=>setNotice(false)}>I understand</button>:<><button className="button button-primary" onClick={confirmAge}><Check size={16}/> I am 18 or older</button><button className="button button-secondary" onClick={()=>window.location.assign("https://www.begambleaware.org/")}>I am under 18</button></>}</div>{ageOk&&<button className="modal-close" aria-label="Close notice" onClick={()=>setNotice(false)}><X size={17}/></button>}</section></div>}</div>;
}

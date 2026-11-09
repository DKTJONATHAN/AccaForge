import React, {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Activity,ArrowUpRight,CalendarDays,Check,ChevronDown,Clock3,Home,Menu,ShieldCheck,Target,Trophy,X,Layers,CalendarRange} from "lucide-react";
import type {Acca,AccasResponse,ProductType,Selection} from "./types";

const products:[ProductType,string,string,string][]=[
 ["safe_picks","Safe Picks","10.00+ combined odds","/safe-picks"],
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
type SiteContent = { news:Array<{id:string;title:string;url:string;source:string;published_at:string;image_url:string;image_credit:string}>; photos:Array<{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}>; teamBadges:Record<string,string>; hero?:{image_url:string;title:string;credit:string;license:string;license_url:string;source_url:string}|null; updatedAt:string|null };
async function loadContent():Promise<SiteContent>{
 const response=await fetch("/api/content");
 if(!response.ok)throw new Error("Could not load cached sports coverage.");
 return response.json();
}
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
 const links=[["/","Home"],["/daily","Daily board"],["/recent","Recent editions"],["/competitions","Competitions"],["/football-betting-tips","Guides"]];
 return <>
  <header className="site-header">
   <a className="brand" href="/" aria-label="AccaForge home"><span className="brand-mark"><Activity size={18}/></span><span className="brand-name">Acca<span>Forge</span></span></a>
   <nav className="desktop-nav" aria-label="Main navigation">{links.map(([href,label])=><a key={href} className={pathname===href?"nav-active":""} href={href}>{label}</a>)}</nav>
   <button className="icon-button mobile-menu-button" onClick={()=>setMenuOpen(value=>!value)} aria-label="Toggle navigation menu" aria-expanded={menuOpen}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button>
   {menuOpen&&<nav className="mobile-menu" aria-label="Mobile navigation">{links.map(([href,label])=><a key={href} href={href} onClick={()=>setMenuOpen(false)}>{label}</a>)}<a href="/responsible-gambling" onClick={()=>setMenuOpen(false)}>Responsible play</a></nav>}
  </header>
  <nav className="mobile-dock" aria-label="Main mobile navigation">
   <a className={pathname==="/"?"active":""} href="/"><Home size={18}/><span>Home</span></a>
   <a className={pathname==="/daily"||products.some(item=>item[3]===pathname)?"active":""} href="/daily"><Target size={18}/><span>Daily</span></a>
   <a className={pathname==="/recent"?"active":""} href="/recent"><CalendarRange size={18}/><span>Archive</span></a>
   <a className={pathname==="/competitions"?"active":""} href="/competitions"><Layers size={18}/><span>Leagues</span></a>
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
function AccaDetail({acca,badges}:{acca:Acca;badges:Record<string,string>}){
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
  <div className="selection-list">{acca.selections.map((selection,index)=><SelectionRow key={selection.id} selection={selection} index={index} badges={badges}/>)}</div>
  <button className="details-toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?"Hide edition notes":"Read edition notes"} <ChevronDown size={16} className={expanded?"rotate":""}/></button>
  {expanded&&<div className="edition-details"><p>Displayed probabilities are estimates based on the available research. They are not guarantees. Bookmaker implied probability is calculated as 1 ÷ decimal odds and does not remove bookmaker margin. Prices may change before kick-off. A PASS means no sufficiently defensible market was identified.</p><span><Trophy size={15}/> {picks.length} picks across {acca.selections.length} listed fixtures</span></div>}
  <div className="acca-bottomline"><span><ShieldCheck size={15}/> Information only</span><span>Updated {kenyaTime(acca.created_at)} EAT</span><a href={"/accumulators/"+encodeURIComponent(acca.id)}>Open shareable edition <ArrowUpRight size={14}/></a></div>
 </article>;
}
function SelectionRow({selection,index,badges}:{selection:Selection;index:number;badges:Record<string,string>}){
 const isPass=selection.selection_status==="PASS";
 return <div className={"selection-row "+(isPass?"selection-pass":"")}>
  <span className="selection-index">{String(index+1).padStart(2,"0")}</span>
  <div className="selection-fixture"><a className="fixture-title" href={"/matches/"+encodeURIComponent(selection.event_id)}><span className="team-side">{(badges[selection.home_team]||localTeamLogos[selection.home_team])?<img src={badges[selection.home_team]||localTeamLogos[selection.home_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.home_team.slice(0,1).toUpperCase()}</i>}<b>{selection.home_team}</b></span><span className="versus">vs</span><span className="team-side">{(badges[selection.away_team]||localTeamLogos[selection.away_team])?<img src={badges[selection.away_team]||localTeamLogos[selection.away_team]} alt="" loading="lazy"/>:<i className="team-initial">{selection.away_team.slice(0,1).toUpperCase()}</i>}<b>{selection.away_team}</b></span></a><span className="fixture-meta">{leagueFor(selection.sport_key)?.name||"Football"} <i/> {kenyaTime(selection.commence_time)} EAT</span></div>
  <div className="selection-market"><span className="field-label">Market</span><strong>{selection.market_name}</strong><small>{selection.selection_name}{selection.note?" · "+selection.note:""}</small></div>
  <div className="selection-estimate"><span className="field-label">Estimated chance</span><strong>{isPass?"Not listed":selection.probability.toFixed(1)+"%"}</strong><small>{isPass?"No supported selection":"Bookmaker: "+selection.implied_probability.toFixed(1)+"%"}</small></div>
  <div className="selection-price"><span className="field-label">Odds</span><strong>{isPass?"PASS":selection.odds.toFixed(2)}</strong><small>{isPass?"":selection.bookmaker}</small></div>
 </div>;
}
function ProductCard({type,acca}:{type:ProductType;acca?:Acca}){
 const product=products.find(item=>item[0]===type)!;
 return <a className="product-row" href={product[3]}><span className="product-row-main"><strong>{product[1]}</strong><small>{product[2]}</small></span><span className="product-row-result">{acca?(type==="all_matches"?acca.selections.length+" fixtures":acca.actual_odds.toFixed(2)+" odds"):"No edition published"}</span><ArrowUpRight size={17}/></a>;
}
export default function App({initialData,todayLabel,pathname="/"}:{initialData?:AccasResponse;todayLabel?:string;pathname?:string}){
 void React;
 const [ageOk,setAgeOk]=useState(false);
 const [archiveDate,setArchiveDate]=useState("all");
 const [notice,setNotice]=useState(false);
 const displayDate=todayLabel||new Date().toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
 useEffect(()=>{setAgeOk(localStorage.getItem("accaforge-18plus")==="yes");},[]);
 const {data,isLoading,isError,refetch,isFetching}=useQuery({queryKey:["accas"],queryFn:loadAccas,initialData});
 const {data:contentData}=useQuery({queryKey:["site-content"],queryFn:loadContent,staleTime:300000,refetchOnWindowFocus:false});
 const teamBadges=contentData?.teamBadges||{};
 const accas=data?.accas||[];
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
    <div className="home-copy"><h1>Football fixtures, markets and odds in one clear view</h1><p>AccaForge publishes researched football selections with match details and prices shown plainly. Open an edition, review every leg and make your own assessment.</p><div className="hero-actions"><a className="button button-primary" href="/daily">View today’s board <ArrowUpRight size={16}/></a><a className="text-link" href="/editorial-policy">How selections are presented</a></div><div className="home-date"><CalendarDays size={15}/>{displayDate} · East Africa Time</div></div>
    <div className="home-board-preview"><div className="hero-photo-wrap"><img src={contentData?.hero?.image_url||"/media/lionel-messi.jpg"} alt={contentData?.hero?.image_url?"Football action":"Lionel Messi playing football"} fetchPriority="high"/><span>Football, every day</span><small>Photo: {contentData?.hero?.credit||"Hossein Zohrevand / Tasnim News Agency, CC BY 4.0"}</small></div><div className="preview-head"><span>Daily editions</span><span>{data?.updatedAt?"Updated "+kenyaTime(data.updatedAt):"Latest published"}</span></div>{products.map(([type,label,caption,path])=>{const item=accas.find(acca=>acca.product_type===type);return <a className="preview-row" href={path} key={type}><span><strong>{label}</strong><small>{caption}</small></span><b>{item?(type==="all_matches"?item.selections.length+" fixtures":item.actual_odds.toFixed(2)):"—"}</b><ArrowUpRight size={15}/></a>;})}<a className="preview-all" href="/daily">Open daily board <ArrowUpRight size={15}/></a></div>
   </section>
   <section className="home-latest"><div className="section-heading"><div><h2>Latest published editions</h2><p>Choose a format to inspect its fixtures and selections</p></div><a className="text-link" href="/recent">Browse archive <ArrowUpRight size={15}/></a></div>{status||<div className="edition-links">{accas.slice(0,4).map(acca=><EditionLink key={acca.id} acca={acca}/>)}{!accas.length&&<p className="muted-copy">No editions have been published yet. Check the daily board later.</p>}</div>}</section>
   <section className="home-news"><div className="section-heading"><div><h2>Latest football news</h2><p>Daily headlines from football publishers, saved to the AccaForge cache</p></div><span className="news-updated">Daily update</span></div>{contentData?.news?.length?<div className="news-grid">{contentData.news.slice(0,6).map(item=><a className="news-card" href={item.url} key={item.id} target="_blank" rel="noopener noreferrer">{item.image_url&&<img src={item.image_url} alt="" loading="lazy"/>}<div className="news-card-copy"><span>{item.source} · {new Date(item.published_at).toLocaleDateString("en-KE",{day:"numeric",month:"short"})}</span><strong>{item.title}</strong><small>Read original story <ArrowUpRight size={13}/></small>{item.image_credit&&<em className="news-image-credit">Photo: {item.image_credit}</em>}</div></a>)}</div>:<div className="news-empty">Football headlines will appear after the first scheduled daily refresh.</div>}</section>
  </main>;
 }else if(pathname==="/daily"){
  page=<main className="page-shell"><PageHeading title="Daily football board" description="Four publication formats, each with its own page and complete fixture breakdown." aside={<span className="updated"><Clock3 size={15}/>{data?.updatedAt?"Updated "+kenyaTime(data.updatedAt)+" EAT":"Awaiting an edition"}</span>}/>{status||<section className="product-list">{products.map(([type])=><ProductCard key={type} type={type} acca={accas.find(item=>item.product_type===type)}/>)}</section>}</main>;
 }else if(currentProduct){
  page=<main className="page-shell product-page"><PageHeading title={productLabel(currentProduct)} description={products.find(item=>item[0]===currentProduct)?.[2]||"Football selections and match information."} aside={<a className="text-link" href="/daily">All daily formats <ArrowUpRight size={15}/></a>}/>{status||<>{current?<AccaDetail acca={current} badges={teamBadges}/>:<div className="state-panel"><Target size={26}/><h2>No {productLabel(currentProduct)} edition published</h2><p>This format appears when its selection rules and available research are satisfied. We do not add unsupported picks to fill a list.</p><button className="button button-secondary" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Checking":"Refresh edition"}</button></div>}</>}<nav className="product-switcher" aria-label="Other daily formats">{products.filter(item=>item[0]!==currentProduct).map(([type,label,,path])=><a key={type} href={path}>{label}<ArrowUpRight size={14}/></a>)}</nav></main>;
 }else if(pathname==="/recent"){
  page=<main className="page-shell"><PageHeading title="Recent editions" description="Browse the published football selections retained in the recent archive." aside={<label className="archive-select"><CalendarDays size={15}/><select value={archiveDate} onChange={event=>setArchiveDate(event.target.value)}><option value="all">All dates</option>{dates.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select><ChevronDown size={14}/></label>}/>{status||<div className="archive-list">{filteredArchive.length?filteredArchive.map(item=><a key={item.id} className="archive-row" href={"/accumulators/"+encodeURIComponent(item.id)}><span className="archive-date">{dateLabel(item.publish_date)}</span><span className="archive-target">{productLabel(item.product_type)}</span><span className="archive-legs">{item.selections.length} {item.product_type==="all_matches"?"fixtures":"selections"}</span><strong className="archive-price">{item.product_type==="all_matches"?"—":item.actual_odds.toFixed(2)}</strong><span className="archive-open">Open <ArrowUpRight size={14}/></span></a>):<p className="muted-copy">No recent editions are available for this date.</p>}</div>}</main>;
 }else if(pathname==="/competitions"){
  page=<main className="page-shell"><PageHeading title="Football competitions" description="Browse the leagues followed by the AccaForge daily football board."/><div className="league-directory">{leagues.map(league=><a href={"/leagues/"+league.key} className="league-directory-row" key={league.key}><img src={league.logo} alt=""/><span>{league.name}</span><ArrowUpRight size={16}/></a>)}</div></main>;
 }else{
  page=<main className="page-shell"><PageHeading title="Page not found" description="The page you requested is not part of the AccaForge daily board."/><a className="button button-primary" href="/">Return home</a></main>;
 }
 return <div className="app theme-light"><SiteHeader pathname={pathname}/>{page}<SiteFooter/>{(!ageOk||notice)&&<div className="modal-backdrop"><section className="age-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-mark"><ShieldCheck size={24}/></div><h2 id="modal-title">{ageOk?"A responsible-play reminder":"Are you 18 or older?"}</h2><p>AccaForge provides football information for entertainment only. Betting involves risk and you may lose your entire stake. No prediction is certain.</p><div className="modal-notice"><strong>18+ only</strong><span>By continuing, you confirm that you are at least 18 years old.</span></div><div className="modal-actions">{ageOk?<button className="button button-primary" onClick={()=>setNotice(false)}>I understand</button>:<><button className="button button-primary" onClick={confirmAge}><Check size={16}/> I am 18 or older</button><button className="button button-secondary" onClick={()=>window.location.assign("https://www.begambleaware.org/")}>I am under 18</button></>}</div>{ageOk&&<button className="modal-close" aria-label="Close notice" onClick={()=>setNotice(false)}><X size={17}/></button>}</section></div>}</div>;
}

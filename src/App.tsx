import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Activity,ArrowUpRight,CalendarDays,Check,ChevronDown,Clock3,Menu,Moon,ShieldCheck,Sun,Target,Trophy,X} from "lucide-react";
import type {Acca,AccasResponse} from "./types";

const targets=[10,15,20];
const leagues=[{key:"soccer_epl",name:"Premier League",logo:"39"},{key:"soccer_uefa_champs_league",name:"Champions League",logo:"2"},{key:"soccer_uefa_europa_league",name:"Europa League",logo:"3"},{key:"soccer_spain_la_liga",name:"La Liga",logo:"140"},{key:"soccer_germany_bundesliga",name:"Bundesliga",logo:"78"},{key:"soccer_italy_serie_a",name:"Serie A",logo:"135"},{key:"soccer_france_ligue_one",name:"Ligue 1",logo:"61"},{key:"soccer_netherlands_eredivisie",name:"Eredivisie",logo:"88"}];
const leagueFor=(key:string)=>leagues.find(item=>item.key===key);
const leagueLogo=(key:string)=>{const league=leagueFor(key);return league?"https://media.api-sports.io/football/leagues/"+league.logo+".png":"";};
const kenyaTime=(value:string)=>new Date(value).toLocaleString("en-KE",{timeZone:"Africa/Nairobi",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
async function loadAccas():Promise<AccasResponse>{
 const response=await fetch("/api/accas?days=3");
 if(!response.ok)throw new Error("Could not load the latest football analysis.");
 return response.json();
}

export default function App(){
 const [theme,setTheme]=useState<"dark"|"light">("dark");
 const [target,setTarget]=useState(10);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [archiveDate,setArchiveDate]=useState("all");
 const [ageOk,setAgeOk]=useState(()=>localStorage.getItem("accaforge-18plus")==="yes");
 const [notice,setNotice]=useState(false);
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 const {data,isLoading,isError,refetch,isFetching}=useQuery({queryKey:["accas"],queryFn:loadAccas});
 const accas=data?.accas||[];
 const dates=useMemo(()=>Array.from(new Set(accas.map(item=>item.publish_date))),[accas]);
 const visible=archiveDate==="all"?accas:accas.filter(item=>item.publish_date===archiveDate);
 const current=visible.find(item=>item.target_odds===target);
 const confirmAge=()=>{localStorage.setItem("accaforge-18plus","yes");setAgeOk(true);};
 return <div className={"app "+(theme==="dark"?"theme-dark":"theme-light")}>
  <header className="site-header">
   <a className="brand" href="/" aria-label="AccaForge home"><span className="brand-mark"><Activity size={19}/></span><span className="brand-name">Acca<span>Forge</span></span></a>
   <nav className="desktop-nav" aria-label="Main navigation"><a className="nav-active" href="#daily">Daily tips</a><a href="#archive">Recent editions</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
   <div className="header-actions"><span className="live-label"><i/> Daily edition</span><button className="icon-button mobile-menu-button" onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={mobileMenuOpen}><Menu size={17}/></button><button className="icon-button" onClick={()=>setTheme(theme==="dark"?"light":"dark")} aria-label="Toggle colour theme">{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</button></div>
   {mobileMenuOpen&&<nav className="mobile-menu" aria-label="Mobile navigation"><a href="#daily" onClick={()=>setMobileMenuOpen(false)}>Daily football tips</a><a href="#archive" onClick={()=>setMobileMenuOpen(false)}>Recent editions</a><a href="/about">About AccaForge</a><a href="/contact">Contact</a><a href="/responsible-gambling">Responsible gambling</a></nav>}
  </header>
  <main>
   <section className="intro" id="daily">
    <div className="intro-copy"><h1>Daily football accumulators<br/><em>and match analysis</em></h1><p className="intro-text">Explore today’s football accumulator tips, upcoming fixtures, individual market prices and combined odds. Every published selection is listed clearly so you can review the match and make your own informed decision.</p><div className="intro-meta"><span><CalendarDays size={14}/>{new Date().toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"})}</span><span><ShieldCheck size={14}/>18+ only</span></div></div>
    <aside className="intro-aside"><div className="aside-rule"><span>THE DAILY BOARD</span><span>AF · 001</span></div><div className="aside-stat"><span>Daily accumulator odds targets</span><strong>10 <small>/</small> 15 <small>/</small> 20</strong><span>Combined decimal odds, shown transparently</span></div><div className="aside-foot"><i className="signal-dot"/> Updated daily at 02:00 EAT</div></aside>
   </section>
   <section className="league-strip" aria-label="Football leagues and competitions covered"><div className="league-strip-heading">Football competitions</div><div className="league-strip-list">{leagues.map(league=><a className="league-chip" href="#daily" key={league.key} title={league.name+" football analysis"}><img src={"https://media.api-sports.io/football/leagues/"+league.logo+".png"} alt={league.name+" logo"} loading="lazy"/><span>{league.name}</span></a>)}</div></section>
   <section className="board-section">
    <div className="section-heading"><div><h2>Today’s football accumulator tips</h2></div><div className="updated"><Clock3 size={14}/>{data?.updatedAt?"Updated "+kenyaTime(data.updatedAt)+" EAT":"Awaiting today's edition"}</div></div>
    <div className="target-tabs" role="tablist" aria-label="Accumulator target">{targets.map(value=>{const item=visible.find(a=>a.target_odds===value);return <button key={value} role="tab" aria-selected={target===value} className={"target-tab "+(target===value?"active":"")} onClick={()=>setTarget(value)}><span className="target-label">{value} Odds Acca</span><strong>{item?item.actual_odds.toFixed(2):value.toFixed(2)}</strong><span className="target-caption">{item?item.selections.length+" selections":"Target combined odds"}</span></button>;})}</div>
    {isLoading?<div className="loading-panel"><span className="loader"/><p>Preparing the daily board</p></div>:isError?<div className="empty-panel"><Activity size={24}/><h3>Results could not load</h3><p>We couldn't reach the latest board. Please try again shortly.</p><button className="button button-secondary" onClick={()=>refetch()}>Try again</button></div>:current?<AccaDetail acca={current} expanded={expanded} setExpanded={setExpanded}/>:<div className="empty-panel"><Target size={24}/><h3>No published accumulator yet</h3><p>The next edition will appear here once the daily analysis is complete. Incomplete selections are not published.</p><button className="button button-secondary" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Checking…":"Refresh results"}</button></div>}
   </section>
   <section className="archive-section" id="archive">
    <div className="section-heading"><div><h2>Recent football accumulator editions</h2></div><label className="archive-select"><CalendarDays size={15}/><select value={archiveDate} onChange={event=>setArchiveDate(event.target.value)}><option value="all">All recent editions</option>{dates.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select><ChevronDown size={14}/></label></div>
    {visible.length?<div className="archive-list">{visible.map(item=><button key={item.id} className="archive-row" onClick={()=>{setArchiveDate(item.publish_date);setTarget(item.target_odds);setExpanded(expanded===item.id?null:item.id);}}><span className="archive-date">{dateLabel(item.publish_date)}</span><span className="archive-target">{item.target_odds} Odds Acca</span><span className="archive-legs">{item.selections.length} selections</span><strong className="archive-price">{item.actual_odds.toFixed(2)}</strong><span className="archive-open">View <ArrowUpRight size={14}/></span></button>)}</div>:<p className="archive-empty">No recent editions available.</p>}
   </section>
   <section className="editorial-section"><div><h2>How to read the AccaForge football tips</h2><p>Each edition groups selected football markets into three combined-odds targets. Open any fixture to see its match details and the accumulator editions where it appears. Individual odds are indicative and can change before kick-off.</p></div><a className="text-button" href="/editorial-policy">Our editorial approach <ArrowUpRight size={14}/></a></section>
   <section className="responsible-section" id="responsible"><div className="responsible-icon"><ShieldCheck size={22}/></div><div><h2>Football is unpredictable</h2><p>AccaForge is for information and entertainment only. Accumulators carry a high risk of losing your entire stake. Odds can change, and no selection or return is guaranteed. Only adults aged 18 and over may use this service. Please gamble responsibly.</p></div><a className="text-button" href="/responsible-gambling">Responsible gambling guidance <ArrowUpRight size={14}/></a></section>
  </main>
  <footer className="site-footer"><div className="footer-brand-group"><a className="footer-brand" href="/">AccaForge</a><span>Football accumulator tips and match analysis</span></div><nav className="footer-links" aria-label="Legal and company links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/editorial-policy">Editorial policy</a><a href="/responsible-gambling">Responsible play</a></nav><span>18+ · Information and entertainment only · Gamble responsibly</span></footer>
  {(!ageOk||notice)&&<div className="modal-backdrop"><section className="age-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-mark"><ShieldCheck size={25}/></div><h2 id="modal-title">{ageOk?"Know the risk":"Are you 18 or older?"}</h2><p>AccaForge provides football accumulator analysis for entertainment only. Betting involves risk and you may lose your entire stake. No prediction is certain. Please never gamble with money you cannot afford to lose.</p><div className="modal-notice"><strong>18+ only</strong><span>By continuing, you confirm that you are at least 18 years old and accept this responsible-play notice.</span></div><div className="modal-actions">{ageOk?<button className="button button-primary" onClick={()=>setNotice(false)}>I understand</button>:<><button className="button button-primary" onClick={confirmAge}><Check size={16}/> I am 18 or older</button><button className="button button-secondary" onClick={()=>window.location.assign("https://www.begambleaware.org/")}>I am under 18</button></>}</div>{ageOk&&<button className="modal-close" aria-label="Close notice" onClick={()=>setNotice(false)}><X size={17}/></button>}</section></div>}
 </div>;
}

function AccaDetail({acca,expanded,setExpanded}:{acca:Acca;expanded:string|null;setExpanded:(value:string|null)=>void}){
 const open=expanded===acca.id;
 const variance=((acca.actual_odds-acca.target_odds)/acca.target_odds)*100;
 return <article className="acca-detail">
  <div className="acca-topline"><span className="published"><i/> Published edition</span><span>{dateLabel(acca.publish_date)}</span></div>
  <div className="acca-summary"><div><h3>{acca.headline}</h3><p>{acca.analysis_note}</p></div><div className="combined-odds"><span>Combined odds</span><strong>{acca.actual_odds.toFixed(2)}</strong><small className={Math.abs(variance)<=8?"within-range":"outside-range"}>{variance>0?"+":""}{variance.toFixed(1)}% vs target</small></div></div>
  <div className="acca-progress"><span style={{width:Math.min(100,acca.actual_odds/acca.target_odds*100)+"%"}}/></div>
  <div className="selection-header"><span>Selection breakdown</span><span>{acca.selections.length} legs · decimal odds</span></div>
  <div className="selection-list">{acca.selections.map((selection,index)=><div className="selection-row" key={selection.id}><span className="selection-index">{String(index+1).padStart(2,"0")}</span><div className="selection-main"><div className="fixture-title">{leagueLogo(selection.sport_key)&&<img src={leagueLogo(selection.sport_key)} alt={(leagueFor(selection.sport_key)?.name||"Football competition")+" logo"} loading="lazy"/>}<a href={"/matches/"+encodeURIComponent(selection.event_id)} title={"View "+selection.home_team+" vs "+selection.away_team+" match details"}>{selection.home_team} <span>vs</span> {selection.away_team}</a></div><small>{kenyaTime(selection.commence_time)} EAT · {leagueFor(selection.sport_key)?.name||"Football"} · {selection.market_name}</small><p>{selection.selection_name}{selection.note?" · "+selection.note:""}</p></div><div className="selection-price"><strong>{selection.odds.toFixed(2)}</strong><small>{selection.bookmaker}</small></div></div>)}</div>
  <button className="details-toggle" onClick={()=>setExpanded(open?null:acca.id)}>{open?"Hide edition details":"About this edition"} <ChevronDown size={15} className={open?"rotate":""}/></button>
  {open&&<div className="edition-details"><p>Combined odds are calculated from the listed individual prices. Prices may move or become unavailable with bookmakers. Always check current market terms before making any decision.</p><span><Trophy size={14}/> {acca.selections.length} fixtures in this accumulator</span></div>}
  <div className="acca-bottomline"><span><ShieldCheck size={14}/> Entertainment only</span><span>Updated {kenyaTime(acca.created_at)} EAT</span><a href={"/accumulators/"+encodeURIComponent(acca.id)}>Open shareable edition <ArrowUpRight size={13}/></a></div>
 </article>;
}
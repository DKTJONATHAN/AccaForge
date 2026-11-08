import {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Activity,ArrowUpRight,CalendarDays,Check,ChevronDown,Clock3,Menu,ShieldCheck,Target,Trophy,X} from "lucide-react";
import type {Acca,AccasResponse,ProductType} from "./types";

const products:[ProductType,string,string][]=[["safe_picks","Safe Picks","10 researched selections"],["super_5","Super 5","Five researched matches"],["super_10","Super 10","Combined odds 9.50–10.50"],["all_matches","All-Matches Challenge","Every eligible fixture"]];
const productLabel=(type:ProductType)=>products.find(item=>item[0]===type)?.[1]||"Football picks";
const leagues=[{key:"soccer_epl",name:"Premier League",logo:"PL.png"},{key:"soccer_uefa_champs_league",name:"Champions League",logo:"CL.png"},{key:"soccer_uefa_europa_league",name:"Europa League",logo:"EL.png"},{key:"soccer_spain_la_liga",name:"La Liga",logo:"PD.png"},{key:"soccer_germany_bundesliga",name:"Bundesliga",logo:"BL1.png"},{key:"soccer_italy_serie_a",name:"Serie A",logo:"SA.png"},{key:"soccer_france_ligue_one",name:"Ligue 1",logo:"FL1.png"},{key:"soccer_netherlands_eredivisie",name:"Eredivisie",logo:"DED.png"}];
const leagueFor=(key:string)=>leagues.find(item=>item.key===key);
const leagueLogo=(key:string)=>({soccer_epl:"/media/premier-league.svg",soccer_uefa_champs_league:"/media/champions-league.svg",soccer_uefa_europa_league:"/media/europa-league.svg",soccer_spain_la_liga:"/media/la-liga.svg",soccer_germany_bundesliga:"/media/bundesliga.svg",soccer_italy_serie_a:"/media/serie-a.svg",soccer_france_ligue_one:"/media/ligue-1.svg",soccer_netherlands_eredivisie:"/media/eredivisie.svg"} as Record<string,string>)[key]||"/media/football-mark.svg";
const heroSlides=[
 {name:"Lionel Messi",kind:"player",caption:"A generational talent. A game that never stands still.",club:"Inter Miami · Argentina",image:"/media/lionel-messi.jpg",href:"/players/lionel-messi",eyebrow:"PLAYER PROFILE"},
 {name:"Cristiano Ronaldo",kind:"player",caption:"Goals, records and a career built for the big stage.",club:"Al Nassr · Portugal",image:"/media/cristiano-ronaldo.jpg",href:"/players/cristiano-ronaldo",eyebrow:"PLAYER PROFILE"},
 {name:"Arsenal",kind:"club",caption:"North London. A storied badge and a demanding standard.",club:"English Premier League",image:"/media/arsenal.svg",href:"/teams/arsenal",eyebrow:"CLUB FOCUS"},
 {name:"Chelsea",kind:"club",caption:"West London football, history and ambition.",club:"English Premier League",image:"/media/chelsea.svg",href:"/teams/chelsea",eyebrow:"CLUB FOCUS"},
 {name:"Manchester United",kind:"club",caption:"One of the most followed clubs in world football.",club:"English Premier League",image:"/media/manchester-united.svg",href:"/teams/manchester-united",eyebrow:"CLUB FOCUS"},
 {name:"Liverpool",kind:"club",caption:"A famous Anfield atmosphere and a global following.",club:"English Premier League",image:"/media/liverpool.svg",href:"/teams/liverpool",eyebrow:"CLUB FOCUS"}
];
const kenyaTime=(value:string)=>new Date(value).toLocaleString("en-KE",{timeZone:"Africa/Nairobi",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const dateLabel=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"});
async function loadAccas():Promise<AccasResponse>{
 const response=await fetch("/api/accas?days=3");
 if(!response.ok)throw new Error("Could not load the latest football analysis.");
 return response.json();
}

export default function App(){
 const [product,setProduct]=useState<ProductType>("safe_picks");
 const [expanded,setExpanded]=useState<string|null>(null);
 const [archiveDate,setArchiveDate]=useState("all");
 const [ageOk,setAgeOk]=useState(()=>localStorage.getItem("accaforge-18plus")==="yes");
 const [notice,setNotice]=useState(false);
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 const [heroIndex,setHeroIndex]=useState(0);
 const hero=heroSlides[heroIndex];
 useEffect(()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const timer=window.setInterval(()=>setHeroIndex(current=>{let next=current;while(next===current)next=Math.floor(Math.random()*heroSlides.length);return next;}),7000);return ()=>window.clearInterval(timer);},[]);
 const {data,isLoading,isError,refetch,isFetching}=useQuery({queryKey:["accas"],queryFn:loadAccas});
 const accas=data?.accas||[];
 const dates=useMemo(()=>Array.from(new Set(accas.map(item=>item.publish_date))),[accas]);
 const visible=archiveDate==="all"?accas:accas.filter(item=>item.publish_date===archiveDate);
 const current=visible.find(item=>item.product_type===product);
 const confirmAge=()=>{localStorage.setItem("accaforge-18plus","yes");setAgeOk(true);};
 return <div className="app theme-light">
  <header className="site-header">
   <a className="brand" href="/" aria-label="AccaForge home"><span className="brand-mark"><Activity size={19}/></span><span className="brand-name">Acca<span>Forge</span></span></a>
   <nav className="desktop-nav" aria-label="Main navigation"><a className="nav-active" href="#daily">Daily tips</a><a href="#archive">Recent editions</a><a href="/football-betting-tips">Football tips</a><a href="/accumulator-tips">Accumulators</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
   <div className="header-actions"><span className="live-label">Football, without the noise.</span><button className="icon-button mobile-menu-button" onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={mobileMenuOpen}><Menu size={17}/></button></div>
   {mobileMenuOpen&&<nav className="mobile-menu" aria-label="Mobile navigation"><a href="#daily" onClick={()=>setMobileMenuOpen(false)}>Daily football tips</a><a href="#archive" onClick={()=>setMobileMenuOpen(false)}>Recent editions</a><a href="/about">About AccaForge</a><a href="/contact">Contact</a><a href="/sure-tips">Sure tips</a><a href="/football-betting-tips">Football tips</a><a href="/accumulator-tips">Accumulator tips</a><a href="/responsible-gambling">Responsible gambling</a></nav>}
  </header>
  <main>
   <section className="intro" id="daily">
    <div className="intro-copy">
     <p className="eyebrow"><span className="eyebrow-line"/> THE DAILY FOOTBALL DESK</p>
     <h1>Read the game.<br/><em>Know the fixtures.</em></h1>
     <p className="intro-text">Daily football research across Safe Picks, Super 5, Super 10 and the All-Matches Challenge — with fixtures, markets, estimated probabilities and bookmaker odds in plain view. No guaranteed wins. Just the reasoning behind each pick.</p>
     <div className="intro-meta"><span><CalendarDays size={14}/>{new Date().toLocaleDateString("en-KE",{timeZone:"Africa/Nairobi",weekday:"long",day:"numeric",month:"long"})}</span><span><ShieldCheck size={14}/>Adults 18+ only</span></div>
     <a className="hero-primary-link" href="#board">See today’s football tips <ArrowUpRight size={16}/></a>
    </div>
    <div className={"hero-visual "+(hero.kind==="player"?"is-player":"is-club")} key={hero.name}>
     <a href={hero.href} className="hero-image-link" aria-label={"Read about "+hero.name}>
      <img className="hero-image" src={hero.image} alt={hero.name+(hero.kind==="club"?" football club crest":" footballer")} onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src="/media/football-mark.svg";}}/>
      <span className="hero-image-shade"/>
      <span className="hero-caption"><small>{hero.eyebrow}</small><strong>{hero.name}</strong><span>{hero.caption}</span><em>{hero.club}</em></span>
     </a>
     <div className="hero-controls" aria-label="Featured football profiles">{heroSlides.map((slide,index)=><button key={slide.name} className={index===heroIndex?"active":""} onClick={()=>setHeroIndex(index)} aria-label={"Show "+slide.name} aria-current={index===heroIndex?"true":undefined}/>)}</div>
     <span className="hero-rotation-note">FEATURE ROTATES EVERY 7 SECONDS</span>
    </div>
   </section>
   <section className="league-strip" aria-label="Football leagues and competitions covered"><div className="league-strip-heading">Football competitions</div><div className="league-strip-list">{leagues.map(league=><a className="league-chip" href={"/leagues/"+league.key} key={league.key} title={league.name+" football analysis"}><img src={leagueLogo(league.key)} alt={league.name+" logo"} loading="lazy"/><span>{league.name}</span></a>)}</div></section>
   <section className="board-section" id="board">
    <div className="section-heading"><div><h2>Today’s evidence-led football picks</h2></div><div className="updated"><Clock3 size={14}/>{data?.updatedAt?"Updated "+kenyaTime(data.updatedAt)+" EAT":"Awaiting today's edition"}</div></div>
    <div className="target-tabs product-tabs" role="tablist" aria-label="Daily football products">{products.map(([type,label,caption])=>{const item=visible.find(a=>a.product_type===type);return <button key={type} role="tab" aria-selected={product===type} className={"target-tab "+(product===type?"active":"")} onClick={()=>setProduct(type)}><span className="target-label">{label}</span><strong>{item?(type==="all_matches"?item.selections.length:item.actual_odds.toFixed(2)):(type==="safe_picks"?"10":type==="super_5"?"5":type==="super_10"?"10.00":"—")}</strong><span className="target-caption">{item?(type==="all_matches"?"fixtures covered":item.selections.length+" selections"):caption}</span></button>;})}</div>
    {isLoading?<div className="loading-panel"><span className="loader"/><p>Preparing the daily board</p></div>:isError?<div className="empty-panel"><Activity size={24}/><h3>Results could not load</h3><p>We couldn't reach the latest board. Please try again shortly.</p><button className="button button-secondary" onClick={()=>refetch()}>Try again</button></div>:current?<AccaDetail acca={current} expanded={expanded} setExpanded={setExpanded}/>:<div className="empty-panel"><Target size={24}/><h3>No published {productLabel(product)} edition yet</h3><p>This product appears only when its evidence and selection rules are satisfied. The system will not force weak picks to fill a list.</p><button className="button button-secondary" disabled={isFetching} onClick={()=>refetch()}>{isFetching?"Checking…":"Refresh results"}</button></div>}
   </section>
   <section className="archive-section" id="archive">
    <div className="section-heading"><div><h2>Recent football editions</h2></div><label className="archive-select"><CalendarDays size={15}/><select value={archiveDate} onChange={event=>setArchiveDate(event.target.value)}><option value="all">All recent editions</option>{dates.map(date=><option key={date} value={date}>{dateLabel(date)}</option>)}</select><ChevronDown size={14}/></label></div>
    {visible.length?<div className="archive-list">{visible.map(item=><button key={item.id} className="archive-row" onClick={()=>{setArchiveDate(item.publish_date);setProduct(item.product_type);setExpanded(expanded===item.id?null:item.id);}}><span className="archive-date">{dateLabel(item.publish_date)}</span><span className="archive-target">{productLabel(item.product_type)}</span><span className="archive-legs">{item.product_type==="all_matches"?item.selections.length+" fixtures":item.selections.length+" selections"}</span><strong className="archive-price">{item.product_type==="all_matches"?"—":item.actual_odds.toFixed(2)}</strong><span className="archive-open">View <ArrowUpRight size={14}/></span></button>)}</div>:<p className="archive-empty">No recent editions available.</p>}
   </section>
   <section className="keyword-hub"><h2>Football betting tips, sure tips and accumulator analysis</h2><p>Looking for <a href="/sure-tips">sure tips</a>, <a href="/football-betting-tips">football betting tips</a>, <a href="/accumulator-tips">accumulator tips</a> or <a href="/premier-league-tips">Premier League tips</a>? AccaForge publishes daily football predictions and match previews with selected markets, decimal odds and clear fixture information. Explore today’s football tips, BTTS (both teams to score), over 2.5 goals, double chance and match-by-match analysis. “Sure tips” is a common search phrase, not a promise: football outcomes are uncertain and no tip is guaranteed.</p></section><section className="editorial-section"><div><h2>How to read the AccaForge football tips</h2><p>Safe Picks contains exactly ten researched selections, each priced 1.01–1.50. Super 5 contains five researched fixtures without a combined-odds target. Super 10 targets combined odds from 9.50 to 10.50 and may use different markets from the same fixture. All-Matches Challenge lists every eligible fixture and marks unsupported matches PASS. Probabilities are model estimates, not guarantees. Individual bookmaker prices can change before kick-off.</p></div><a className="text-button" href="/editorial-policy">Our editorial approach <ArrowUpRight size={14}/></a></section>
   <section className="responsible-section" id="responsible"><div className="responsible-icon"><ShieldCheck size={22}/></div><div><h2>Football is unpredictable</h2><p>AccaForge is for information and entertainment only. Accumulators carry a high risk of losing your entire stake. Odds can change, and no selection or return is guaranteed. Only adults aged 18 and over may use this service. Please gamble responsibly.</p></div><a className="text-button" href="/responsible-gambling">Responsible gambling guidance <ArrowUpRight size={14}/></a></section>
  </main>
  <footer className="site-footer"><div className="footer-brand-group"><a className="footer-brand" href="/">AccaForge</a><span>Football analysis, fixtures and daily tips.</span></div><nav className="footer-links" aria-label="Legal and company links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/editorial-policy">Editorial policy</a><a href="/image-credits">Image credits</a><a href="/responsible-gambling">Responsible play</a><a href="/sure-tips">Sure tips</a><a href="/football-betting-tips">Football tips</a><a href="/accumulator-tips">Accumulator tips</a><a href="/premier-league-tips">Premier League tips</a></nav><span>18+ · Information and entertainment only · Gamble responsibly</span></footer>
  {(!ageOk||notice)&&<div className="modal-backdrop"><section className="age-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-mark"><ShieldCheck size={25}/></div><h2 id="modal-title">{ageOk?"Know the risk":"Are you 18 or older?"}</h2><p>AccaForge provides football accumulator analysis for entertainment only. Betting involves risk and you may lose your entire stake. No prediction is certain. Please never gamble with money you cannot afford to lose.</p><div className="modal-notice"><strong>18+ only</strong><span>By continuing, you confirm that you are at least 18 years old and accept this responsible-play notice.</span></div><div className="modal-actions">{ageOk?<button className="button button-primary" onClick={()=>setNotice(false)}>I understand</button>:<><button className="button button-primary" onClick={confirmAge}><Check size={16}/> I am 18 or older</button><button className="button button-secondary" onClick={()=>window.location.assign("https://www.begambleaware.org/")}>I am under 18</button></>}</div>{ageOk&&<button className="modal-close" aria-label="Close notice" onClick={()=>setNotice(false)}><X size={17}/></button>}</section></div>}
 </div>;
}

function AccaDetail({acca,expanded,setExpanded}:{acca:Acca;expanded:string|null;setExpanded:(value:string|null)=>void}){
 const open=expanded===acca.id;
 const isAll=acca.product_type==="all_matches";
 const picks=acca.selections.filter(item=>item.selection_status!=="PASS");
 return <article className="acca-detail">
  <div className="acca-topline"><span className="published"><i/> Published edition</span><span>{productLabel(acca.product_type)} · {dateLabel(acca.publish_date)}</span></div>
  <div className="acca-summary"><div><h3>{acca.headline}</h3><p>{acca.analysis_note}</p></div>{!isAll&&<div className="combined-odds"><span>Combined odds</span><strong>{acca.actual_odds.toFixed(2)}</strong><small>Calculated from current listed prices</small></div>}</div>
  <div className="selection-header"><span>{isAll?"Full fixture coverage":"Selection breakdown"}</span><span>{isAll?acca.selections.length+" fixtures":acca.selections.length+" selections"} · {picks.length} picks · {acca.selections.length-picks.length} passes</span></div>
  <div className="selection-list">{acca.selections.map((selection,index)=><div className={"selection-row "+(selection.selection_status==="PASS"?"selection-pass":"")} key={selection.id}><span className="selection-index">{String(index+1).padStart(2,"0")}</span><div className="selection-main"><div className="fixture-title">{leagueLogo(selection.sport_key)&&<img src={leagueLogo(selection.sport_key)} alt={(leagueFor(selection.sport_key)?.name||"Football competition")+" logo"} loading="lazy"/>}<a href={"/matches/"+encodeURIComponent(selection.event_id)} title={"View "+selection.home_team+" vs "+selection.away_team+" match details"}>{selection.home_team} <span>vs</span> {selection.away_team}</a></div><small>{kenyaTime(selection.commence_time)} EAT · {leagueFor(selection.sport_key)?.name||"Football"} · {selection.market_name}</small><p>{selection.selection_name}{selection.note?" · "+selection.note:""}</p>{selection.selection_status!=="PASS"&&<small className="probability-line">AI-estimated probability: {selection.probability.toFixed(1)}% · bookmaker implied probability: {selection.implied_probability.toFixed(1)}%</small>}</div><div className="selection-price">{selection.selection_status==="PASS"?<strong className="pass-label">PASS</strong>:<><strong>{selection.odds.toFixed(2)}</strong><small>{selection.bookmaker}</small></>}</div></div>)}</div>
  <button className="details-toggle" onClick={()=>setExpanded(open?null:acca.id)}>{open?"Hide edition details":"About this edition"} <ChevronDown size={15} className={open?"rotate":""}/></button>
  {open&&<div className="edition-details"><p>Probabilities are AI-generated estimates based on available research, not measured guarantees or certainty. Bookmaker implied probability is a simple 1 ÷ decimal odds calculation and does not remove bookmaker margin. Prices may change before kick-off. A PASS means no sufficiently defensible market was identified.</p><span><Trophy size={14}/> {picks.length} picks across {acca.selections.length} listed fixtures</span></div>}
  <div className="acca-bottomline"><span><ShieldCheck size={14}/> Entertainment only</span><span>Updated {kenyaTime(acca.created_at)} EAT</span><a href={"/accumulators/"+encodeURIComponent(acca.id)}>Open shareable edition <ArrowUpRight size={13}/></a></div>
 </article>;
}
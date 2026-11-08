import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = join(process.cwd(), "public", "media");
const headers = {"User-Agent":"AccaForge/1.0 (https://accaforge.jonathanmwaniki07.workers.dev; info@jonathanmwaniki.co.ke)"};
const logos = {
 "arsenal.svg":"logos/england/Arsenal.svg",
 "chelsea.svg":"logos/england/Chelsea.svg",
 "liverpool.svg":"logos/england/Liverpool_FC.svg",
 "manchester-united.svg":"logos/england/Manchester_United.svg",
 "premier-league.svg":"logos/england/English_Premier_League.svg",
 "champions-league.svg":"logos/tournaments/UEFA_Champions_League.svg",
 "europa-league.svg":"logos/tournaments/UEFA_Europa_League.svg",
 "la-liga.svg":"logos/spain/La_Liga.svg",
 "bundesliga.svg":"logos/germany/Bundesliga.svg",
 "serie-a.svg":"logos/italy/Serie_A.svg",
 "ligue-1.svg":"logos/france/Ligue_1.svg",
 "eredivisie.svg":"logos/netherlands/Eredivisie.svg"
};

async function fetchWithRetry(url, options = {}, attempts = 3) {
 let lastError;
 for (let attempt=1; attempt<=attempts; attempt+=1) {
  try {
   const response=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
   if(!response.ok) throw new Error("HTTP "+response.status+" for "+url);
   return response;
  } catch(error) {
   lastError=error;
   if(attempt<attempts) await new Promise(resolve=>setTimeout(resolve,attempt*900));
  }
 }
 throw lastError;
}
async function saveRemoteFile(name,url,expectedType) {
 const response=await fetchWithRetry(url,{headers});
 const contentType=response.headers.get("content-type")||"";
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<1000) throw new Error(name+" download was unexpectedly small ("+bytes.length+" bytes).");
 if(expectedType==="svg"&&!new TextDecoder().decode(bytes.slice(0,500)).includes("<svg")) throw new Error(name+" did not contain a valid SVG image.");
 if(expectedType==="image"&&!contentType.startsWith("image/")) throw new Error(name+" returned unexpected content type: "+contentType);
 await writeFile(join(output,name),bytes);
 console.log("Saved "+name+" ("+bytes.length+" bytes)");
}
async function commonsImage(fileTitle,filename) {
 const api=new URL("https://commons.wikimedia.org/w/api.php");
 api.search=new URLSearchParams({action:"query",titles:"File:"+fileTitle,prop:"imageinfo",iiprop:"url",iiurlwidth:"1000",format:"json",origin:"*"}).toString();
 const response=await fetchWithRetry(api,{headers});
 const data=await response.json();
 const page=Object.values(data.query?.pages||{})[0];
 const info=page?.imageinfo?.[0];
 if(!info?.thumburl&&!info?.url) throw new Error("Wikimedia Commons did not return an image for "+fileTitle);
 await saveRemoteFile(filename,info.thumburl||info.url,"image");
}
await mkdir(output,{recursive:true});
for(const [filename,path] of Object.entries(logos)) {
 await saveRemoteFile(filename,"https://raw.githubusercontent.com/JoseArroyave/football-logos/main/"+path,"svg");
}
await commonsImage("Lionel Messi playing in Argentina 2022 FIFA World Cup.jpg","lionel-messi.jpg");
await commonsImage("Cristiano Ronaldo WC2022 - 01.jpg","cristiano-ronaldo.jpg");
const fallback='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><rect width="640" height="640" fill="#e8e2d5"/><circle cx="320" cy="320" r="190" fill="none" stroke="#1d4937" stroke-width="16"/><path d="M320 130v380M130 320h380" stroke="#1d4937" stroke-width="8" opacity=".35"/><path d="M320 230l68 49-26 80h-84l-26-80z" fill="#1d4937"/><text x="320" y="565" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#1d4937">ACCAFORGE</text></svg>';
await writeFile(join(output,"football-mark.svg"),fallback);
await writeFile(join(output,"credits.txt"),[
 "Club and competition crest source: JoseArroyave/football-logos (https://github.com/JoseArroyave/football-logos).",
 "The repository describes its collection as free for personal and commercial use. Club and competition marks remain the property of their respective rights holders and are used for identification.",
 "Lionel Messi photograph: Hossein Zohrevand / Tasnim News Agency, CC BY 4.0, via Wikimedia Commons.",
 "Cristiano Ronaldo photograph: Hossein Zohrevand / Tasnim News Agency, CC BY 4.0, via Wikimedia Commons.",
 "See https://creativecommons.org/licenses/by/4.0/ for the Creative Commons Attribution 4.0 licence."
].join("\n")+"\n");
console.log("AccaForge local football media library is ready.");

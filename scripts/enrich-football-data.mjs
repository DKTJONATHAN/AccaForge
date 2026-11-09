const base=(process.env.ACCAFORGE_WORKER_URL||"https://accaforge.eu.cc").replace(/\/$/,"");
const token=(process.env.ACCAFORGE_SCHEDULER_TOKEN||"").trim();
if(!token)throw new Error("Missing ACCAFORGE_SCHEDULER_TOKEN GitHub secret.");
async function post(payload){
 const response=await fetch(base+"/__scheduler/enrich",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const body=await response.text();let data;try{data=JSON.parse(body)}catch{data={error:body.slice(0,500)}}
 if(!response.ok)throw new Error("Sports enrichment request failed (HTTP "+response.status+"): "+JSON.stringify(data));
 return data;
}
console.log("Starting the one-time post-publication club crest and league-table enrichment.");
const prepared=await post({action:"prepare"});
if(prepared.alreadyCompleted){console.log("Sports data already enriched for "+prepared.date+"; skipping all API calls.");process.exit(0);}
if(!prepared.sportKeys?.length){console.log("No published fixtures found for "+prepared.date+"; nothing to enrich.");await post({action:"finish",date:prepared.date});process.exit(0);}
console.log("Published competitions to enrich: "+prepared.sportKeys.join(", "));
const results=[];
for(const sportKey of prepared.sportKeys){
 const result=await post({action:"league",sport_key:sportKey,date:prepared.date});
 results.push(result);
 console.log(JSON.stringify(result));
}
const summary=await post({action:"finish",date:prepared.date});
console.log("Sports enrichment summary: "+JSON.stringify(summary));
console.log("Club crests and league tables are saved in D1/R2. Website visitors will not make sports API calls.");

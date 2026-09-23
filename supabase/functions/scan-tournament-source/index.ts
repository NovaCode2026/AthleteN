import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESERVED = new Set(["accounts","about","explore","direct","reels","reel","p","tv","stories","web","developer","privacy","legal","challenge"]);

function decode(v:string){
  return String(v||"")
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#([0-9]+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/\s+/g," ").trim();
}
const clean=(v:any)=>decode(String(v||"")).slice(0,2000);
function meta(html:string,key:string){
  const re=/<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  let m; while((m=re.exec(html))) if(String(m[1]).toLowerCase()===key.toLowerCase()) return clean(m[2]);
  return "";
}
function pageTitle(html:string){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return clean(m&&m[1]);}
function bodyText(html:string){
  return clean(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," "));
}
function abs(href:string,base:string){try{return new URL(href,base).toString()}catch{return href}}
function instagramPostLinks(html:string,source:string){
  const out:string[]=[];
  const re=/(?:href|content)=["']([^"']*(?:instagram\.com)\/(?:p|reel|tv)\/[^"'?#]+[^"']*)["']/gi;
  let m;
  while((m=re.exec(html))&&out.length<12){
    const u=abs(m[1],source).split("?")[0];
    if(!out.includes(u)) out.push(u);
  }
  return out;
}
function instagramProfileFromHtml(html:string,source:string){
  const patterns=[
    /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\/?(?:["'?&#]|$)/gi,
    /href=["']\/([A-Za-z0-9._]{2,30})\/?["']/gi
  ];
  const candidates:string[]=[];
  for(const re of patterns){
    let m;
    while((m=re.exec(html))&&candidates.length<50){
      const u=String(m[1]||"").toLowerCase();
      if(!RESERVED.has(u)&&!/^\d+$/.test(u)&&!candidates.includes(u)) candidates.push(u);
    }
  }
  const current=(source.match(/instagram\.com\/(?:p|reel|tv)\/[^/?#]+/i));
  if(current && candidates.length) return "https://www.instagram.com/"+candidates[0]+"/";
  try{
    const p=new URL(source).pathname.split("/").filter(Boolean)[0];
    if(p&&!RESERVED.has(p.toLowerCase())&&!["p","reel","tv"].includes(p.toLowerCase())) return "https://www.instagram.com/"+p+"/";
  }catch{}
  return candidates.length ? "https://www.instagram.com/"+candidates[0]+"/" : "";
}
function getPdfs(html:string,source:string){
  const out:string[]=[];const re=/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;let m;
  while((m=re.exec(html))&&out.length<20){const u=abs(m[1],source);if(!out.includes(u))out.push(u)}
  return out;
}
function getLinks(html:string,source:string){
  const out:string[]=[];const re=/href=["']([^"']+)["'][^>]*>([^<]{0,160})</gi;let m;
  while((m=re.exec(html))&&out.length<20){
    const t=clean(m[2]).toLowerCase();
    if(/schedule|draw|result|fixture|weigh|registration|entry/.test(t)){
      const u=abs(m[1],source);if(!out.includes(u))out.push(u);
    }
  }
  return out;
}
function normalizeDate(raw:string){
  const s=clean(raw); if(!s)return "";
  const yearMatch=s.match(/\b(20(?:2[6-9]|30))\b/); if(!yearMatch)return "";
  const d=new Date(s); if(Number.isNaN(d.getTime()))return "";
  const y=d.getUTCFullYear(); if(y<2026||y>2030)return "";
  return d.toISOString().slice(0,10);
}
function findDate(text:string){
  const focused=(text.match(/(?:tournament|championship|cup|open|games|taekwondo)[\s\S]{0,600}/i)?.[0]||text.slice(0,16000));
  const fullPatterns=[
    /\b(?:[0-3]?\d)(?:st|nd|rd|th)?[\s,&-]+(?:[0-3]?\d)?(?:st|nd|rd|th)?[\s,&-]+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+20(?:2[6-9]|30)\b/i,
    /\b(?:[0-3]?\d)(?:st|nd|rd|th)?[\s,]+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+20(?:2[6-9]|30)\b/i,
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-3]?\d(?:st|nd|rd|th)?(?:,?\s+)20(?:2[6-9]|30)\b/i,
    /\b20(?:2[6-9]|30)[-\/]\d{1,2}[-\/]\d{1,2}\b/
  ];
  for(const p of fullPatterns){const m=focused.match(p);if(m){const d=normalizeDate(m[0]);if(d)return d;}}

  // Instagram captions commonly omit the year: "3rd & 4th October".
  const noYear=focused.match(/\b([0-3]?\d)(?:st|nd|rd|th)?(?:\s*&\s*[0-3]?\d(?:st|nd|rd|th)?)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
  if(noYear){
    const day=Number(noYear[1]);
    const monthName=noYear[2];
    const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month=months.findIndex(m=>monthName.toLowerCase().startsWith(m))+1;
    if(day>=1&&day<=31&&month>=1){
      const explicitYear=focused.match(/\b20(?:2[6-9]|30)\b/);
      let year=explicitYear?Number(explicitYear[0]):new Date().getUTCFullYear();
      const candidate=new Date(Date.UTC(year,month-1,day));
      if(!explicitYear && candidate.getTime()+86400000*30 < Date.now()) year++;
      if(candidate.getUTCFullYear()===year)return candidate.toISOString().slice(0,10);
      return new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10);
    }
  }
  return "";
}
function findVenue(text:string){
  const fallback=text.match(/\b(Ranikhet|Delhi|Noida|Kanpur|Lucknow|Jaipur|Mumbai|Pune|Chandigarh|Bengaluru|Hyderabad|Kolkata|Gurugram|Gurgaon|Dehradun|Uttarakhand|Uttar Pradesh|Rajasthan|Maharashtra|Punjab|Haryana)\b(?:,\s*[A-Z][A-Za-z .'-]+)?/i);
  if(fallback)return clean(fallback[0]);
  const m=text.match(/(?:venue|location|held at|hosted at)[\s:,-]{0,30}([A-Z][A-Za-z .'-]{2,80})/i);
  if(m){
    const candidate=clean(m[1]);
    if(candidate && !/popular instagram|instagram lite|meta ai|threads|contact|uploading/i.test(candidate))return candidate;
  }
  return "";
}
function findDeadline(text:string){
  const m=text.match(/(?:registration|entry|last date|deadline)[^.!?]{0,120}?((?:[0-3]?\d)(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20(?:2[6-9]|30))/i);
  return m?normalizeDate(m[1]):"";
}
function findCompetitionName(name:string,text:string){
  const candidates=[name,...(text.match(/(?:\d+(?:st|nd|rd|th)?\s+[^.]{0,120}(?:Taekwondo|Championship|Cup|Open|Games)[^.]{0,120})/gi)||[])];
  const best=candidates.find(x=>/Taekwondo|Championship|Cup|Open|Games/i.test(x)&&x.length>12);
  return clean(best||name);
}
async function hash(text:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function fetchPage(sourceUrl:string){
  try{
    const res=await fetch(sourceUrl,{redirect:"follow",headers:{"User-Agent":"AthleteN-Scanner/2.0","Accept":"text/html,application/xhtml+xml"}});
    return {res};
  }catch(error){return {error:String(error)}}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("Authorization");
    if(!auth?.startsWith("Bearer "))return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const token=auth.slice(7),url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}}});
    const authResult=await userClient.auth.getUser();const user=authResult.data.user;
    if(authResult.error||!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const admin=createClient(url,service);const body=await req.json();
    const scanId=String(body.scan_id||"");const sourceUrl=String(body.source_url||"").trim();
    if(!scanId||!sourceUrl)return new Response(JSON.stringify({error:"scan_id and source_url are required"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
    const found=await admin.from("tournament_scans").select("*").eq("id",scanId).eq("user_id",user.id).maybeSingle();
    if(!found.data)return new Response(JSON.stringify({error:"Scan record not found"}),{status:404,headers:{...cors,"Content-Type":"application/json"}});
    const first=await fetchPage(sourceUrl);
    if(!first.res){
      await admin.from("tournament_scans").update({status:"failed",detected_changes:"Unable to fetch source: "+first.error,last_checked_at:new Date().toISOString()}).eq("id",scanId).eq("user_id",user.id);
      return new Response(JSON.stringify({status:"failed"}),{headers:{...cors,"Content-Type":"application/json"}});
    }
    const firstRes=first.res;
    if([401,403,429].includes(firstRes.status)){
      await admin.from("tournament_scans").update({status:"blocked",detected_changes:"Source blocked automated access (HTTP "+firstRes.status+").",last_checked_at:new Date().toISOString()}).eq("id",scanId).eq("user_id",user.id);
      return new Response(JSON.stringify({status:"blocked",http_status:firstRes.status}),{headers:{...cors,"Content-Type":"application/json"}});
    }
    if(!firstRes.ok){
      await admin.from("tournament_scans").update({status:"failed",detected_changes:"Source returned HTTP "+firstRes.status+".",last_checked_at:new Date().toISOString()}).eq("id",scanId).eq("user_id",user.id);
      return new Response(JSON.stringify({status:"failed",http_status:firstRes.status}),{headers:{...cors,"Content-Type":"application/json"}});
    }

    const checked=new Date().toISOString();
    const firstHtml=await firstRes.text();
    const isInstagram=/instagram\.com/i.test(sourceUrl);
    let monitoredUrls=[sourceUrl];
    let accountUrl="";
    const pages:{url:string,html:string}[]=[{url:sourceUrl,html:firstHtml}];
    if(isInstagram){
      accountUrl=instagramProfileFromHtml(firstHtml,sourceUrl);
      if(accountUrl && accountUrl!==sourceUrl){
        const profileFetch=await fetchPage(accountUrl);
        if(profileFetch.res?.ok)pages.push({url:accountUrl,html:await profileFetch.res.text()});
      }
      const discoveryHtml=pages.map(p=>p.html).join("\n");
      const discoveredPosts=instagramPostLinks(discoveryHtml,sourceUrl);
      monitoredUrls=[sourceUrl,...(accountUrl?[accountUrl]:[]),...discoveredPosts]
        .map(u=>u.split("?")[0])
        .filter((v,i,a)=>a.indexOf(v)===i)
        .slice(0,13);
    }
    for(const u of monitoredUrls){
      if(pages.some(p=>p.url===u))continue;
      const fetched=await fetchPage(u);
      if(fetched.res?.ok)pages.push({url:u,html:await fetched.res.text()});
    }

    const combinedHtml=pages.map(p=>p.html).join("\n");
    const primaryText=pages[0] ? bodyText(pages[0].html) : "";
    const accountText=pages.find(p=>p.url===accountUrl)?.html||"";
    const allText=pages.map(p=>bodyText(p.html)).join(" ");
    const name=meta(firstHtml,"og:title")||pageTitle(firstHtml);
    const desc=meta(firstHtml,"og:description")||meta(firstHtml,"description");
    const date=findDate(allText);
    const venue=findVenue(allText);
    const deadline=findDeadline(allText);
    const competitionName=findCompetitionName(name,allText);
    const pdfs=[...new Set(pages.flatMap(p=>getPdfs(p.html,p.url)))].slice(0,20);
    const links=[...new Set(pages.flatMap(p=>getLinks(p.html,p.url)))].slice(0,20);
    const contentHash=await hash(pages.map(p=>p.url+"\n"+p.html).join("\n---\n"));
    const oldHash=String(found.data.source_hash||"");
    const changed=!!oldHash&&oldHash!==contentHash;
    const previousDetails=found.data.details&&typeof found.data.details==="object"?found.data.details:{};
    const oldUrls=Array.isArray(previousDetails.monitored_urls)?previousDetails.monitored_urls:[];
    const changedUrls=changed?monitoredUrls.filter(u=>!oldUrls.includes(u)||u===accountUrl):[];
    const detected=changed
      ? "Monitored source content changed. Checked "+pages.length+" public source pages"+(changedUrls.length?": "+changedUrls.slice(0,5).join(", "):".")
      : oldHash
        ? "No monitored source changes detected. Checked "+pages.length+" public source pages."
        : "Baseline created. Future scans will compare the monitored account/source and its recent public posts.";
    const details={
      ...previousDetails,
      scan_version:2,
      source_type:isInstagram?(accountUrl?"instagram_account":"instagram_source"):"web_source",
      original_source_url:previousDetails.original_source_url||sourceUrl,
      account_url:accountUrl||previousDetails.account_url||null,
      monitored_urls:monitoredUrls,
      checked_urls:pages.map(p=>p.url),
      changed_urls:changedUrls,
      account_hash:accountUrl?await hash(accountText||firstHtml):null,
      public_page_count:pages.length,
      scanned_at:checked
    };
    const update={
      source_url:accountUrl||sourceUrl,
      tournament_name:competitionName||null,
      tournament_date:date||null,
      venue:venue||null,
      registration_deadline:deadline||null,
      notices:clean(desc)||"Public source scanned successfully. Open the source for complete details.",
      pdfs,
      schedules_results:links.join("\n")||null,
      source_hash:contentHash,
      detected_changes:detected,
      status:"checked",
      last_checked_at:checked,
      next_check_at:new Date(Date.now()+86400000).toISOString(),
      details
    };
    const updated=await admin.from("tournament_scans").update(update).eq("id",scanId).eq("user_id",user.id);
    if(updated.error)throw updated.error;
    return new Response(JSON.stringify({
      status:"checked",
      mode:accountUrl?"account":"source",
      monitored_count:pages.length,
      result:update
    }),{headers:{...cors,"Content-Type":"application/json"}});
  }catch(e){
    return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
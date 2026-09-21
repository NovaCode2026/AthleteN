import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const clean=(v:any)=>String(v||"").replace(/\s+/g," ").trim().slice(0,2000);
function meta(html:string,key:string){const re=/<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;let m;while((m=re.exec(html))){if(String(m[1]).toLowerCase()===key.toLowerCase())return clean(m[2]);}return "";}
function title(html:string){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return clean(m&&m[1]);}
function abs(href:string,base:string){try{return new URL(href,base).toString();}catch{return href;}}
function getPdfs(html:string,source:string){const out:string[]=[];const re=/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;let m;while((m=re.exec(html))&&out.length<20){const u=abs(m[1],source);if(!out.includes(u))out.push(u);}return out;}
function getLinks(html:string,source:string){const out:string[]=[];const re=/href=["']([^"']+)["'][^>]*>([^<]{0,120})</gi;let m;while((m=re.exec(html))&&out.length<20){const t=clean(m[2]).toLowerCase();if(/schedule|draw|result|fixture|weigh|registration/.test(t)){const u=abs(m[1],source);if(!out.includes(u))out.push(u);}}return out;}
async function hash(text:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
  const token=auth.slice(7),url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}}});const authResult=await userClient.auth.getUser();const user=authResult.data.user;if(authResult.error||!user)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
  const admin=createClient(url,service);const body=await req.json();const scanId=String(body.scan_id||"");const sourceUrl=String(body.source_url||"").trim();
  if(!scanId||!sourceUrl)return new Response(JSON.stringify({error:"scan_id and source_url are required"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
  const found=await admin.from("tournament_scans").select("id,user_id,source_url,source_hash").eq("id",scanId).eq("user_id",user.id).maybeSingle();if(!found.data)return new Response(JSON.stringify({error:"Scan record not found"}),{status:404,headers:{...cors,"Content-Type":"application/json"}});
  let res:Response;try{res=await fetch(sourceUrl,{redirect:"follow",headers:{"User-Agent":"AthleteN-Scanner/1.0"}});}catch(e){await admin.from("tournament_scans").update({status:"failed",detected_changes:"Unable to fetch source: "+String(e).slice(0,300),last_checked_at:new Date().toISOString()}).eq("id",scanId).eq("user_id",user.id);return new Response(JSON.stringify({status:"failed"}),{headers:{...cors,"Content-Type":"application/json"}});}
  const checked=new Date().toISOString();
  if([401,403,429].includes(res.status)){await admin.from("tournament_scans").update({status:"blocked",detected_changes:"Source returned HTTP "+res.status+". The site may require login or block automated access.",last_checked_at:checked}).eq("id",scanId).eq("user_id",user.id);return new Response(JSON.stringify({status:"blocked",http_status:res.status}),{headers:{...cors,"Content-Type":"application/json"}});}
  if(!res.ok){await admin.from("tournament_scans").update({status:"failed",detected_changes:"Source returned HTTP "+res.status+".",last_checked_at:checked}).eq("id",scanId).eq("user_id",user.id);return new Response(JSON.stringify({status:"failed",http_status:res.status}),{headers:{...cors,"Content-Type":"application/json"}});}
  const html=await res.text();const name=meta(html,"og:title")||title(html);const desc=meta(html,"og:description")||meta(html,"description");const hashValue=await hash(html);const changed=!!found.data.source_hash&&found.data.source_hash!==hashValue;
  const update={tournament_name:name||null,notices:desc||"Source fetched successfully. Review the official page for full details.",pdfs:getPdfs(html,sourceUrl),schedules_results:getLinks(html,sourceUrl).join("\n")||null,source_hash:hashValue,detected_changes:changed?"Source content changed since the previous scan.":"No source change detected.",status:"checked",last_checked_at:checked,next_check_at:new Date(Date.now()+86400000).toISOString()};
  const updated=await admin.from("tournament_scans").update(update).eq("id",scanId).eq("user_id",user.id);if(updated.error)throw updated.error;
  return new Response(JSON.stringify({status:"checked",result:update}),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});}
});
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { Header } from '@/components/mobile-ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const c=Colors.dark;
type SourceType='website'|'instagram';
type ScanDetails={description?:string;fields?:Record<string,any>;important_facts?:Record<string,any>;sections?:Array<{title:string;content:string;source_url?:string}>;key_highlights?:string[];pages_scanned?:number;source_pages?:string[];pdfs?:Array<{href:string;label:string}>;conflicts?:Array<{field:string;candidates:Array<{value:string;source_url?:string}>}>;tournament_group?:{name:string}};
type Scan={id:string;source_url:string;tournament_name?:string|null;tournament_date?:string|null;venue?:string|null;registration_deadline?:string|null;weigh_in_information?:string|null;categories?:string|null;notices?:string|null;schedules_results?:string|null;pdfs?:Array<{href:string;label:string}>|null;details?:ScanDetails|null;status?:string|null;detected_changes?:string|null;last_checked_at?:string|null;next_check_at?:string|null};

const clean=(v:any)=>String(v??'').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\\s+/g,' ').trim();
const isInstagram=(u:string)=>/instagram\.com/i.test(u);
const labelize=(v:string)=>v.replace(/_/g,' ').replace(/\\b\\w/g,x=>x.toUpperCase());
const fmt=(v?:string|null)=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString();};
const validInstagram=(u:string)=>{try{const x=new URL(u);const p=x.pathname.split('/').filter(Boolean);return /(^|\\.)instagram\.com$/i.test(x.hostname)&&!!p[1]&&(p[0]==='p'||p[0]==='reel'||p[0]==='reels')}catch{return false}};

export default function ScannerScreen(){
 const {session}=useAuth();
 const [kind,setKind]=useState<SourceType>('website');
 const [url,setUrl]=useState('');
 const [scans,setScans]=useState<Scan[]>([]);
 const [selected,setSelected]=useState<Scan|null>(null);
 const [busy,setBusy]=useState(false);
 const [scanning,setScanning]=useState<string|null>(null);
 const [message,setMessage]=useState('');

 const load=useCallback(async()=>{
  if(!session)return;
  const {data,error}=await supabase.from('tournament_scans').select('id,source_url,tournament_name,tournament_date,venue,registration_deadline,weigh_in_information,categories,notices,schedules_results,pdfs,details,status,detected_changes,last_checked_at,next_check_at').eq('user_id',session.user.id).order('last_checked_at',{ascending:false}).limit(20);
  if(error){setMessage(error.message);return}
  const rows=(data||[]) as Scan[];setScans(rows);setSelected(s=>s?rows.find(x=>x.id===s.id)||s:rows[0]||null);
 },[session]);
 useEffect(()=>{void load()},[load]);

 async function runScan(sourceUrl:string,id?:string|null){
  if(!session)return;
  if(isInstagram(sourceUrl)&&!validInstagram(sourceUrl)){setMessage('Paste a public Instagram tournament post or reel URL.');return}
  setScanning(id||'new');setMessage('Scanning with the full AthleteN tournament scanner…');
  try{
   const endpoint=isInstagram(sourceUrl)?'https://athleten.netlify.app/.netlify/functions/instagram-tournament-scan':'https://athleten.netlify.app/.netlify/functions/tournament-scan';
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({sourceUrl})});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(String(payload?.error||'Tournament scanner request failed.'));
   if(payload?.scan){const row=payload.scan as Scan;setSelected(row);setScans(old=>old.some(x=>x.id===row.id)?old.map(x=>x.id===row.id?{...x,...row}:x):[row,...old])}
   setMessage('Scan complete. Full tournament intelligence was extracted.');await load();
  }catch(e){setMessage(e instanceof Error?e.message:'Tournament scan failed.')}finally{setScanning(null)}
 }
 async function saveAndScan(){
  if(!session||!url.trim()){setMessage('Enter a source link first.');return}
  const source=url.trim();try{new URL(source)}catch{setMessage('Enter a valid URL.');return}
  if(kind==='instagram'&&!validInstagram(source)){setMessage('Paste a public Instagram tournament post or reel URL.');return}
  setBusy(true);setMessage('');
  try{
   const {data,error}=await supabase.from('tournament_scans').upsert({user_id:session.user.id,source_url:source,status:'pending'},{onConflict:'user_id,source_url'}).select('id,source_url').single();
   if(error)throw error;setUrl('');await load();await runScan(source,data?.id);
  }catch(e){setMessage(e instanceof Error?e.message:'Could not save scan source.')}finally{setBusy(false)}
 }
 async function remove(id:string){setBusy(true);const {error}=await supabase.from('tournament_scans').delete().eq('id',id).eq('user_id',session?.user.id);setBusy(false);if(error)setMessage(error.message);else{if(selected?.id===id)setSelected(null);await load()}}
 const details=selected?.details||{};const fields=details.fields||{};const facts=details.important_facts||{};
 const primary=useMemo(()=>Object.entries(fields).filter(([k,v])=>k!=='description'&&clean(v)),[fields]);
 const pdfs=selected?.pdfs?.length?selected.pdfs:details.pdfs||[];
 const poster=[['Sport',fields.poster_sport],['Disciplines',fields.poster_disciplines],['Events / divisions',fields.poster_events],['Age categories',fields.poster_age_categories],['Weight categories',fields.poster_weight_categories],['Gender categories',fields.poster_gender_categories],['Eligibility',fields.poster_eligibility],['City',fields.poster_city],['State',fields.poster_state],['Country',fields.poster_country],['Organizer',fields.organizer],['Host',fields.poster_host],['Reporting date',fields.reporting_date_text],['Reporting time',fields.reporting_time],['Registration',fields.poster_registration],['Registration deadline',fields.poster_registration_deadline],['Registration link',fields.poster_registration_link],['Fees',fields.fees],['Contact',fields.poster_contact],['Phone',fields.poster_phone],['Email',fields.poster_email],['Website',fields.poster_website],['Rules',fields.poster_rules],['Scoring system',fields.poster_scoring_system],['Competition system',fields.poster_competition_system],['Rounds',fields.poster_rounds],['Equipment',fields.poster_equipment],['Schedule',fields.poster_schedule],['Weigh-in',fields.poster_weigh_in],['Medals',fields.poster_medals],['Prizes',fields.poster_prizes],['Accommodation',fields.poster_accommodation],['Transport',fields.poster_transport],['Documents',fields.poster_documents],['Notices',fields.poster_notices],['Highlights',fields.poster_highlights],['Hashtags',fields.poster_hashtags],['Reel transcript',fields.reel_transcript]].filter(x=>clean(x[1]));

 return <SafeAreaView style={s.screen} edges={['top']}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
  <Header back eyebrow="ATHLETEN INTELLIGENCE" title="Tournament Scanner" subtitle="Scan tournament websites, notices, schedules, results, PDFs and public Instagram tournament posts." right={<View style={s.aiBadge}><Text style={s.aiBadgeText}>AI</Text></View>}/>
  <View style={s.tabs}>
   <Pressable onPress={()=>setKind('website')} style={[s.tab,kind==='website'&&s.activeTab]}><Text style={[s.tabTitle,kind==='website'&&s.activeText]}>WEBSITE</Text><Text style={s.tabSub}>Site, notice, schedule or PDF</Text></Pressable>
   <Pressable onPress={()=>setKind('instagram')} style={[s.tab,kind==='instagram'&&s.activeTab]}><Text style={[s.tabTitle,kind==='instagram'&&s.activeText]}>INSTAGRAM</Text><Text style={s.tabSub}>Public tournament post or reel</Text></Pressable>
  </View>
  <View style={s.hero}><Text style={s.kicker}>SOURCE INTELLIGENCE</Text><Text style={s.heroTitle}>Scan once. Track changes.</Text><Text style={s.heroText}>{kind==='website'?'The scanner follows relevant same-site pages, notices, schedules, results, rules, equipment, registration pages and linked PDFs.':'The scanner extracts tournament evidence from the public post/reel and preserves poster intelligence when available.'}</Text><TextInput value={url} onChangeText={setUrl} placeholder={kind==='website'?'https://example.com/tournament':'https://instagram.com/p/... or /reel/...'} placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="url" style={s.input}/><Pressable onPress={()=>void saveAndScan()} disabled={busy||!!scanning} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>SCAN</Text>}</Pressable></View>
  {message?<View style={s.messageBox}><Text style={s.message}>{message}</Text></View>:null}

  {selected?<><View style={s.panel}><View style={s.panelHead}><View style={{flex:1}}><Text style={s.eyebrow}>LATEST INTELLIGENCE</Text><Text style={s.panelTitle}>{clean(isInstagram(selected.source_url)?facts.tournament_name:selected.tournament_name)||'Tournament information'}</Text><Text style={s.panelSub}>{clean(details.description)||'Information extracted from the source and relevant pages.'}</Text></View><Text style={s.status}>{String(selected.status||'checked').toUpperCase()}</Text></View>
   <View style={s.grid}><Summary label={isInstagram(selected.source_url)?'TOURNAMENT DATES':'DATE'} value={clean(isInstagram(selected.source_url)?facts.tournament_dates:selected.tournament_date)}/><Summary label="VENUE" value={clean(facts.venue||selected.venue)}/><Summary label="REGISTRATION" value={clean(facts.registration_deadline||selected.registration_deadline)}/>{details.pages_scanned?<Summary label="PAGES SCANNED" value={String(details.pages_scanned)}/>:null}</View></View>

   {isInstagram(selected.source_url)?<Section title="Tournament intelligence" subtitle="Only valuable facts supported by accessible tournament evidence are shown.">{[['City / State',facts.city_state],['Age categories',facts.age_categories],['Weight categories',facts.weight_categories],['Registration fee',facts.registration_fee],['Registration deadline',facts.registration_deadline],['Registration link',facts.registration_link],['Official contact',facts.official_contact],['Organizer',facts.organizer],['Scoring / equipment',facts.equipment_and_scoring],['Medals / prizes',facts.medals_prizes],['Important highlights',facts.important_highlights],['Important notice',facts.important_notice],['Evidence conflicts',facts.evidence_conflicts]].filter(x=>clean(x[1])).map(x=><Detail key={String(x[0])} label={String(x[0])} value={x[1]}/>)}</Section>:<Section title="All available tournament information" subtitle="Structured facts plus relevant source information, not just date and venue.">{primary.length?primary.map(x=><Detail key={x[0]} label={labelize(x[0])} value={x[1]}/>):<Text style={s.emptyText}>No labeled fields were detected.</Text>}</Section>}

   {poster.length?<Section title="Complete poster intelligence" subtitle="Readable tournament information supported by the accessible poster.">{poster.map(x=><Detail key={String(x[0])} label={String(x[0])} value={x[1]}/>)}{fields.poster_image?<LinkRow label="OPEN ANALYZED POSTER IMAGE" url={String(fields.poster_image)}/>:null}</Section>:null}

   {!isInstagram(selected.source_url)&&(selected.weigh_in_information||selected.categories||selected.schedules_results||selected.notices)?<Section title="Tournament essentials"><Detail label="Weigh-in / weight check" value={selected.weigh_in_information}/><Detail label="Categories / divisions" value={selected.categories}/><Detail label="Schedule / results" value={selected.schedules_results}/><Detail label="Notices" value={selected.notices}/></Section>:null}

   {details.conflicts?.length?<Section title="Evidence conflicts" subtitle="Conflicting values are shown instead of choosing one silently.">{details.conflicts.map((x,i)=><Detail key={x.field+String(i)} label={labelize(x.field)} value={x.candidates.map(v=>v.value+(v.source_url?' — '+v.source_url:'')).join('\\n')}/>)}</Section>:null}
   {fields.raw_source_text||fields.source_caption?<Section title="Raw source information"><Detail label="Instagram caption" value={fields.source_caption}/><Detail label="Accessible source text" value={fields.raw_source_text}/><Detail label="Images found" value={fields.source_image_count}/><Detail label="Scan time" value={fields.scan_elapsed_seconds?String(fields.scan_elapsed_seconds)+'s':''}/></Section>:null}
   {details.sections?.length?<Section title="Source sections discovered">{details.sections.map((x,i)=><Detail key={x.title+String(i)} label={x.title} value={x.content+(x.source_url?'\\n'+x.source_url:'')}/>)}</Section>:null}
   {details.key_highlights?.length?<Section title="Key source highlights">{details.key_highlights.map((x,i)=><Detail key={x+String(i)} label="Detected" value={x}/>)}</Section>:null}
   {pdfs.length?<Section title="Official documents / PDFs found" subtitle="Official links are preserved.">{pdfs.map(x=><LinkRow key={x.href} label={x.label||x.href} url={x.href}/>)}</Section>:null}
   {details.source_pages?.length?<Section title="Pages actually scanned">{details.source_pages.map(x=><LinkRow key={x} label={x} url={x}/>)}</Section>:null}
   <Section title="Scan status"><Detail label="Last checked" value={fmt(selected.last_checked_at)}/><Detail label="Next check" value={fmt(selected.next_check_at)}/><Detail label="Change detection" value={selected.detected_changes}/><Detail label="Source" value={selected.source_url}/></Section>
   <View style={s.actions}><Pressable onPress={()=>void runScan(selected.source_url,selected.id)} disabled={!!scanning} style={s.buttonSmall}>{scanning===selected.id?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>SCAN AGAIN</Text>}</Pressable><Pressable onPress={()=>void Linking.openURL(selected.source_url)} style={s.secondary}><Text style={s.secondaryText}>OPEN SOURCE</Text></Pressable></View>
  </>:<View style={s.empty}><Text style={s.emptyTitle}>No tournament intelligence yet</Text><Text style={s.emptyText}>Choose Website or Instagram above and run your first scan.</Text></View>}

  <View style={s.sectionHead}><Text style={s.sectionLabel}>SAVED SCANS</Text><Text style={s.count}>{scans.length}</Text></View>
  {scans.map(row=><View key={row.id} style={s.saved}><Text style={s.savedTitle}>{clean(row.tournament_name)||'Tournament source'}</Text><Text style={s.savedUrl} numberOfLines={1}>{row.source_url}</Text><Text style={s.savedMeta}>{clean(row.tournament_date)||'Date not detected'} · {clean(row.venue)||'Venue not detected'}</Text>{row.details?.tournament_group?.name?<Text style={s.group}>GROUP · {row.details.tournament_group.name}</Text>:null}<View style={s.savedActions}><Pressable onPress={()=>setSelected(row)} style={s.secondary}><Text style={s.secondaryText}>OPEN</Text></Pressable><Pressable onPress={()=>void runScan(row.source_url,row.id)} disabled={!!scanning} style={s.buttonTiny}><Text style={s.buttonText}>{scanning===row.id?'...':'SCAN'}</Text></Pressable><Pressable onPress={()=>void remove(row.id)} disabled={busy} style={s.delete}><Text style={s.deleteText}>DELETE</Text></Pressable></View></View>)}
 </ScrollView></SafeAreaView>
}

function Summary({label,value}:{label:string;value:string}){if(!value)return null;return <View style={s.summary}><Text style={s.summaryLabel}>{label}</Text><Text style={s.summaryValue}>{clean(value)}</Text></View>}
function Detail({label,value}:{label:string;value:any}){const v=clean(value);if(!v)return null;return <View style={s.detail}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{v}</Text></View>}
function Section({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){return <View style={s.panel}><Text style={s.panelTitle}>{title}</Text>{subtitle?<Text style={s.panelSub}>{subtitle}</Text>:null}<View>{children}</View></View>}
function LinkRow({label,url}:{label:string;url:string}){return <Pressable onPress={()=>void Linking.openURL(url)} style={s.link}><Text style={s.linkText} numberOfLines={3}>{label}</Text><Text style={s.open}>OPEN</Text></Pressable>}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{paddingHorizontal:18,paddingTop:8,paddingBottom:50,gap:13},
 aiBadge:{width:44,height:44,borderRadius:14,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,alignItems:'center',justifyContent:'center'},aiBadgeText:{color:c.accentBright,fontWeight:'900'},
 tabs:{flexDirection:'row',gap:8},tab:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:12},activeTab:{borderColor:c.accent,backgroundColor:c.accentSoft},tabTitle:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1},activeText:{color:c.accentBright},tabSub:{color:c.muted,fontSize:9,lineHeight:14,marginTop:4},
 hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:23,padding:16,gap:10},kicker:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.2},heroTitle:{color:c.text,fontSize:20,fontWeight:'900'},heroText:{color:c.muted,fontSize:11,lineHeight:17},input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,padding:13,fontSize:13},button:{backgroundColor:c.accent,borderRadius:13,padding:14,alignItems:'center',justifyContent:'center'},buttonSmall:{flex:1,backgroundColor:c.accent,borderRadius:11,padding:12,alignItems:'center',justifyContent:'center'},buttonTiny:{backgroundColor:c.accent,borderRadius:10,paddingHorizontal:13,paddingVertical:9,alignItems:'center'},buttonText:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:.8},
 messageBox:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:14,padding:12},message:{color:c.accentBright,fontSize:10,lineHeight:16},
 panel:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:15,gap:10},panelHead:{flexDirection:'row',gap:10,alignItems:'flex-start'},eyebrow:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.3},panelTitle:{color:c.text,fontSize:17,fontWeight:'900'},panelSub:{color:c.muted,fontSize:10,lineHeight:16,marginTop:3},status:{color:c.success,fontSize:8,fontWeight:'900',letterSpacing:1,backgroundColor:c.background,paddingHorizontal:8,paddingVertical:5,borderRadius:8},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},summary:{width:'48%',backgroundColor:c.background,borderRadius:12,padding:10},summaryLabel:{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:.8},summaryValue:{color:c.text,fontSize:10,fontWeight:'800',marginTop:4},
 detail:{borderTopWidth:1,borderTopColor:c.border,paddingVertical:10,gap:4},detailLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:.7},detailValue:{color:c.textSecondary,fontSize:10,lineHeight:16},empty:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:18,gap:6},emptyTitle:{color:c.text,fontSize:14,fontWeight:'800'},emptyText:{color:c.muted,fontSize:10,lineHeight:16},
 link:{flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderTopColor:c.border,paddingVertical:11},linkText:{color:c.accentBright,fontSize:9,lineHeight:14,flex:1},open:{color:c.text,fontSize:8,fontWeight:'900'},actions:{flexDirection:'row',gap:8},secondary:{borderWidth:1,borderColor:c.borderStrong,borderRadius:10,paddingHorizontal:13,paddingVertical:10,alignItems:'center',justifyContent:'center'},secondaryText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:.7},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:2},sectionLabel:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},count:{color:c.accentBright,fontSize:9,fontWeight:'900'},saved:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:18,padding:13,gap:6},savedTitle:{color:c.text,fontSize:14,fontWeight:'900'},savedUrl:{color:c.accentBright,fontSize:8},savedMeta:{color:c.muted,fontSize:9},group:{color:c.warning,fontSize:8,fontWeight:'900'},savedActions:{flexDirection:'row',gap:6,justifyContent:'flex-end'},delete:{borderWidth:1,borderColor:'#61303A',borderRadius:10,paddingHorizontal:10,paddingVertical:9,alignItems:'center'},deleteText:{color:c.danger,fontSize:8,fontWeight:'900'}
});

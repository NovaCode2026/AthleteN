import { useCallback,useEffect,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,Text,TextInput,View,StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/theme';
import { AI_LIMITS,PlanId } from '@/lib/entitlements';

const c=Colors.dark;
const TOPICS=['Training Coach','Tournament Preparation','Match Analysis','Goal Suggestions','Performance Reports','Motivational Feedback','Recovery Advice'] as const;
const QUICK_QUESTIONS=['What should I focus on in my next practice?','Help me prepare for my next competition.','How can I review a recent match?'];

export default function AICoachScreen(){
 const {session,profile}=useAuth();const router=useRouter();
 const [busy,setBusy]=useState(false);const [loadingUsage,setLoadingUsage]=useState(true);
 const [topic,setTopic]=useState<(typeof TOPICS)[number]>('Training Coach');
 const [prompt,setPrompt]=useState('');const [answer,setAnswer]=useState('');
 const [error,setError]=useState('');const [usage,setUsage]=useState({used:0,limit:AI_LIMITS[(profile?.plan_id||'free') as PlanId]||0});
 const planId=String(profile?.plan_id||'free') as PlanId;
 const planLimit=AI_LIMITS[planId]??0;
 const remaining=Math.max(0,usage.limit-usage.used);

 const loadUsage=useCallback(async()=>{
  if(!session){setUsage({used:0,limit:planLimit});setLoadingUsage(false);return}
  setLoadingUsage(true);setError('');
  try{
   const {data,error:usageError}=await supabase.from('subscription_usage').select('ai_requests_used,ai_requests_limit').eq('user_id',session.user.id).order('usage_month',{ascending:false}).limit(1).maybeSingle();
   if(usageError)throw usageError;
   const savedLimit=Number(data?.ai_requests_limit);
   setUsage({used:Math.max(0,Number(data?.ai_requests_used)||0),limit:planLimit>0&&Number.isFinite(savedLimit)&&savedLimit>0?Math.min(planLimit,savedLimit):planLimit});
  }catch(e){
   console.warn('[AthleteN] AI Coach usage could not be loaded',e);
   setUsage({used:0,limit:planLimit});
   setError('Your AI usage could not be checked. Refresh before sending a request.');
  }finally{setLoadingUsage(false)}
 },[session,planLimit]);
 useEffect(()=>{void loadUsage()},[loadUsage]);

 async function ask(value?:string){
  const question=(value??prompt).trim();
  if(!question){setError('Enter a question first.');return}
  if(!session){setError('Sign in to use AI Coach.');return}
  if(!usage.limit){setError('AI Coach is not included in the Free plan. View Plans & Usage for available allowances.');return}
  if(remaining<=0){setError('You have reached this plan’s monthly AI request limit.');return}
  setBusy(true);setError('');setAnswer('');
  try{
   const baseUrl=(process.env.EXPO_PUBLIC_ATHLETEN_API_URL||'https://athleten.netlify.app').replace(/\/$/,'');
   const response=await fetch(baseUrl+'/.netlify/functions/ai-coach',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({topic,prompt:question})
   });
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload?.error||'AI Coach is unavailable right now. Please try again later.');
   if(typeof payload?.answer!=='string'||!payload.answer.trim())throw new Error('AI Coach returned an empty response. Please try again.');
   setAnswer(payload.answer.trim());setPrompt('');
   await loadUsage();
   if(payload.usageRecorded===false)setError('Your answer arrived, but usage metering did not confirm. Contact support before sending repeated requests.');
  }catch(e){
   setError(e instanceof Error?e.message:'AI Coach could not complete the request.');
  }finally{setBusy(false)}
 }

 return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View>
   <Text style={s.kicker}>ATHLETEN AI COACH · CONVERSATION</Text>
   <Text style={s.title}>Ask. Review. Improve.</Text>
   <Text style={s.sub}>This is the conversational coaching tool. Ask a Taekwondo or athlete-development question and receive an AI-generated response when your plan and the protected AI service are available.</Text>
  </View>
  <View style={s.usageCard}>
   <View style={s.usageTop}><View><Text style={s.usageLabel}>MONTHLY AI REQUESTS</Text><Text style={s.usageValue}>{loadingUsage?'Checking…':usage.used+' / '+usage.limit+' used'}</Text></View><Text style={s.remaining}>{loadingUsage?'—':remaining+' left'}</Text></View>
   <View style={s.track}><View style={[s.fill,{width:usage.limit?Math.min(100,usage.used/usage.limit*100)+'%':'0%'}]}/></View>
   <Text style={s.hint}>Your current plan: {planId.replace('_',' ').toUpperCase()}. Free includes 0 AI requests.</Text>
  </View>
  <View style={s.card}>
   <Text style={s.section}>CHOOSE A COACHING TOPIC</Text>
   <View style={s.topicWrap}>{TOPICS.map(x=><Pressable key={x} onPress={()=>setTopic(x)} style={[s.topic,topic===x&&s.topicActive]}><Text style={[s.topicText,topic===x&&s.topicTextActive]}>{x}</Text></Pressable>)}</View>
   <Text style={s.section}>YOUR QUESTION</Text>
   <TextInput value={prompt} onChangeText={setPrompt} placeholder="Describe your training question, match situation or goal…" placeholderTextColor={c.muted} style={s.input} multiline maxLength={4000} textAlignVertical="top"/>
   <View style={s.quickHead}><Text style={s.section}>QUICK QUESTIONS</Text></View>
   {QUICK_QUESTIONS.map(q=><Pressable key={q} onPress={()=>{setPrompt(q);setError('')}} style={s.quick}><Text style={s.quickText}>{q}</Text></Pressable>)}
   <Pressable onPress={()=>void ask()} disabled={busy||loadingUsage||usage.limit<=0||remaining<=0} style={[s.ask,(busy||loadingUsage||usage.limit<=0||remaining<=0)&&s.disabled]}>
    {busy?<ActivityIndicator color="#fff"/>:<Text style={s.askText}>ASK AI COACH</Text>}
   </Pressable>
   {error?<View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>:null}
   {answer?<View style={s.answer}><Text style={s.answerLabel}>ATHLETEN AI COACH</Text><Text style={s.answerText}>{answer}</Text></View>:null}
  </View>
  <View style={s.distinction}>
   <Text style={s.distinctionTitle}>AI COACH ≠ ATHLETE INTELLIGENCE</Text>
   <Text style={s.distinctionText}>AI Coach answers the question you type. Athlete Intelligence is the separate dashboard that calculates charts, trends and summaries from records saved in your account.</Text>
   <Pressable onPress={()=>router.push('/ai')}><Text style={s.link}>OPEN ATHLETE INTELLIGENCE →</Text></Pressable>
  </View>
  <Text style={s.disclaimer}>AI guidance is general sports support, not medical advice or a replacement for your qualified coach or healthcare professional. The server may pause AI requests when account, subscription or budget checks are not ready.</Text>
 </ScrollView>;
}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},content:{padding:18,paddingBottom:42,gap:14},
 kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:30,fontWeight:'900',marginTop:5},sub:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4},
 usageCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:14,gap:9},usageTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},usageLabel:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1},usageValue:{color:c.text,fontSize:17,fontWeight:'900',marginTop:4},remaining:{color:c.accentBright,fontSize:10,fontWeight:'900'},track:{height:7,borderRadius:7,backgroundColor:c.background,overflow:'hidden'},fill:{height:7,borderRadius:7,backgroundColor:c.accent},hint:{color:c.muted,fontSize:9,lineHeight:14},
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:15,gap:11},section:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.3},topicWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},topic:{borderWidth:1,borderColor:c.border,borderRadius:999,paddingHorizontal:10,paddingVertical:8},topicActive:{backgroundColor:c.accentSoft,borderColor:c.accent},topicText:{color:c.muted,fontSize:9,fontWeight:'800'},topicTextActive:{color:c.text},
 input:{minHeight:116,backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,lineHeight:18},quickHead:{marginTop:2},quick:{borderWidth:1,borderColor:c.border,borderRadius:11,padding:10},quickText:{color:c.textSecondary,fontSize:10,fontWeight:'700'},ask:{minHeight:46,backgroundColor:c.accent,borderRadius:12,alignItems:'center',justifyContent:'center'},askText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},disabled:{opacity:.45},
 errorBox:{backgroundColor:'#321B22',borderWidth:1,borderColor:'#7A3545',borderRadius:12,padding:12},errorText:{color:c.danger,fontSize:10,fontWeight:'800',lineHeight:16},answer:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:14,padding:14,gap:7},answerLabel:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},answerText:{color:c.text,fontSize:12,lineHeight:19},
 distinction:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:14,gap:7},distinctionTitle:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},distinctionText:{color:c.muted,fontSize:10,lineHeight:17},link:{color:c.accentBright,fontSize:9,fontWeight:'900',marginTop:4},disclaimer:{color:c.muted,fontSize:9,lineHeight:15}
});
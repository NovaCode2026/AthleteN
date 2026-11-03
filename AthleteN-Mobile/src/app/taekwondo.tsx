import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Screen, Header, Section, Card, c } from '@/components/mobile-ui';
import { PerformanceLine, PerformanceBars } from '@/components/performance-chart';

type Discipline = 'kyorugi' | 'poomsae';
type EntryMode = 'practice' | 'performance' | null;

const POOMSAE_FORMS = [
  'Taegeuk 1 Jang','Taegeuk 2 Jang','Taegeuk 3 Jang','Taegeuk 4 Jang',
  'Taegeuk 5 Jang','Taegeuk 6 Jang','Taegeuk 7 Jang','Taegeuk 8 Jang',
  'Koryo','Keumgang','Taebaek','Pyongwon','Sipjin','Jitae','Cheonkwon','Hansu','Ilyeo'
];
const CATEGORIES = ['Individual','Pair','Team','Freestyle','Other'];
const FOCUS_OPTIONS = ['Stance & balance','Technique accuracy','Timing & rhythm','Power & control','Presentation','Freestyle choreography'];
const today = () => new Date().toISOString().slice(0,10);
const normalizeDiscipline = (value: unknown): Discipline =>
  String(value || '').toLowerCase() === 'poomsae' ? 'poomsae' : 'kyorugi';

export default function TaekwondoScreen() {
  const { session, profile, syncVersion } = useAuth();
  const discipline = normalizeDiscipline(profile?.discipline);
  const [bouts,setBouts] = useState<any[]>([]);
  const [performances,setPerformances] = useState<any[]>([]);
  const [training,setTraining] = useState<any[]>([]);
  const [mode,setMode] = useState<EntryMode>(null);
  const [form,setForm] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const trainingQuery = supabase.from('taekwondo_training_logs')
      .select('id,title,session_date,focus,poomsae_name,category,rounds,repetitions,notes')
      .eq('user_id',uid).eq('discipline',discipline)
      .order('session_date',{ascending:false}).limit(50);
    if (discipline === 'poomsae') {
      const [p,t] = await Promise.all([
        supabase.from('taekwondo_poomsae_performances').select('*')
          .eq('user_id',uid).order('event_date',{ascending:false}).limit(50),
        trainingQuery
      ]);
      if (p.error || t.error) setMessage(p.error?.message || t.error?.message || 'Poomsae records could not be loaded.');
      else setMessage('');
      setPerformances(p.data || []);
      setTraining(t.data || []);
      setBouts([]);
    } else {
      const [b,t] = await Promise.all([
        supabase.from('taekwondo_kyorugi_bouts').select('*')
          .eq('user_id',uid).order('event_date',{ascending:false}).limit(50),
        trainingQuery
      ]);
      if (b.error || t.error) setMessage(b.error?.message || t.error?.message || 'Kyorugi records could not be loaded.');
      else setMessage('');
      setBouts(b.data || []);
      setTraining(t.data || []);
      setPerformances([]);
    }
  },[session,discipline,syncVersion]);

  useEffect(() => { void load(); },[load]);

  const scorePoints = useMemo(() =>
    performances.slice().reverse().filter(x => x.score !== null && x.score !== undefined)
      .slice(-10).map(x => ({label:String(x.event_date || '').slice(5,10),value:Number(x.score)})),
    [performances]
  );
  const wins = bouts.filter(x => String(x.result || '').toLowerCase() === 'win').length;
  const losses = bouts.filter(x => String(x.result || '').toLowerCase() === 'loss').length;
  const medals = performances.filter(x => ['gold','silver','bronze'].includes(String(x.result || '').toLowerCase())).length;

  function open(modeValue: Exclude<EntryMode,null>) {
    setMessage('');
    setForm({date:today(),poomsae:POOMSAE_FORMS[0],category:'Individual',focus:FOCUS_OPTIONS[0]});
    setMode(modeValue);
  }

  async function savePractice() {
    if (!session || !form.poomsae || !form.date) { setMessage('Choose a Poomsae and practice date.'); return; }
    const reps = form.repetitions ? Number(form.repetitions) : null;
    if (reps !== null && (!Number.isInteger(reps) || reps < 0)) { setMessage('Repetitions must be a whole number of zero or more.'); return; }
    setBusy(true); setMessage('');
    const title = form.poomsae + ' practice';
    const {error} = await supabase.from('taekwondo_training_logs').insert({
      user_id:session.user.id, discipline:'poomsae', title, session_date:form.date,
      focus:form.focus || null, poomsae_name:form.poomsae, category:form.category || null,
      repetitions:reps, rounds:null, notes:form.notes || null, is_official:false
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMode(null); setMessage('Poomsae practice saved.'); await load();
  }

  async function savePerformance() {
    if (!session || !form.event?.trim() || !form.date || !form.poomsae) {
      setMessage('Event, date and Poomsae are required.'); return;
    }
    const score = form.score ? Number(form.score) : null;
    const placing = form.placing ? Number(form.placing) : null;
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) {
      setMessage('Score must be between 0 and 10.'); return;
    }
    if (placing !== null && (!Number.isInteger(placing) || placing < 1)) {
      setMessage('Placing must be a positive whole number.'); return;
    }
    setBusy(true); setMessage('');
    const {error} = await supabase.from('taekwondo_poomsae_performances').insert({
      user_id:session.user.id, event_name:form.event.trim(), event_date:form.date,
      poomsae_name:form.poomsae, category:form.category || null, score, placing,
      result:form.result || null, notes:form.notes || null, is_official:true
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMode(null); setMessage('Official Poomsae result saved.'); await load();
  }

  const isPoomsae = discipline === 'poomsae';
  return (
    <Screen>
      <Header eyebrow="TAEKWONDO EDITION" title={isPoomsae ? 'Poomsae Studio' : 'Kyorugi Hub'}
        subtitle={isPoomsae ? 'Forms, precision, balance and performance records.' : 'Sparring bouts, opponents, rounds and match results.'}/>
      <Card accent>
        <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1}}>ACTIVE DISCIPLINE</Text>
        <Text style={{color:c.text,fontSize:24,fontWeight:'900'}}>{isPoomsae?'Poomsae':'Kyorugi'}</Text>
        <Text style={{color:c.muted,fontSize:11,lineHeight:17}}>
          {isPoomsae ? 'Your practice sessions and official Poomsae results are stored separately from Kyorugi bouts.' :
          'Your Kyorugi bout history and round-based training are kept separate from Poomsae records.'}
        </Text>
      </Card>

      {isPoomsae ? (
        <>
          <View style={{flexDirection:'row',gap:9}}>
            <Stat label="PRACTICE LOGS" value={training.length}/>
            <Stat label="PERFORMANCES" value={performances.length}/>
            <Stat label="MEDALS" value={medals}/>
          </View>
          <View style={{flexDirection:'row',gap:9}}>
            <Action title="LOG FORM PRACTICE" subtitle="Form, category, focus and repetitions" onPress={()=>open('practice')}/>
            <Action title="RECORD RESULT" subtitle="Event, score, placing and medal" onPress={()=>open('performance')}/>
          </View>
          <Card>
            <Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>Poomsae forms library</Text>
            <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>{POOMSAE_FORMS.join('  ·  ')}</Text>
            <Text style={{color:c.muted,fontSize:9,lineHeight:14,marginTop:5}}>The available list is a starting catalogue. Use Other in Category and the notes field when an event uses a different format or form name.</Text>
          </Card>
          <PerformanceLine title="Official performance scores" subtitle="Scores saved to your competition records" data={scorePoints} unit="/10"/>
          <Section title="RECENT PRACTICE">
            {training.length ? training.slice(0,8).map(x=><Card key={x.id}>
              <Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>{x.poomsae_name || x.title}</Text>
              <Text style={{color:c.muted,fontSize:10}}>{x.session_date} · {x.category || 'Category not set'} · {x.focus || 'Focus not set'}</Text>
              <Text style={{color:c.muted,fontSize:10}}>{x.repetitions === null || x.repetitions === undefined ? 'Repetitions not recorded' : String(x.repetitions) + ' repetitions'}</Text>
              {x.notes ? <Text style={{color:c.muted,fontSize:10}}>{x.notes}</Text> : null}
            </Card>) : <Empty text="No Poomsae practice logged yet. Start with Log Form Practice." />}
          </Section>
          <Section title="OFFICIAL PERFORMANCES">
            {performances.length ? performances.slice(0,10).map(x=><Card key={x.id}>
              <View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}>
                <Text style={{color:c.text,fontSize:13,fontWeight:'900',flex:1}}>{x.poomsae_name}</Text>
                <Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{x.result ? String(x.result).toUpperCase() : 'RECORDED'}</Text>
              </View>
              <Text style={{color:c.muted,fontSize:10}}>{x.event_name} · {x.event_date || 'Date not set'} · {x.category || 'Category not set'}</Text>
              <Text style={{color:c.muted,fontSize:10}}>Score: {x.score ?? '—'} / 10 · {x.placing ? 'Place ' + x.placing : 'Placing not recorded'}</Text>
              {x.notes ? <Text style={{color:c.muted,fontSize:10}}>{x.notes}</Text> : null}
            </Card>) : <Empty text="No official Poomsae results yet. Record a result after an event." />}
          </Section>
        </>
      ) : (
        <>
          <View style={{flexDirection:'row',gap:9}}>
            <Stat label="BOUTS" value={bouts.length}/>
            <Stat label="WINS" value={wins}/>
            <Stat label="LOSSES" value={losses}/>
          </View>
          <PerformanceBars title="Bout record" subtitle="Saved Kyorugi bout outcomes" data={[{label:'Wins',value:wins},{label:'Losses',value:losses}]} unit=""/>
          <Section title="RECENT BOUTS">
            {bouts.length ? bouts.slice(0,8).map(x=><Card key={x.id}>
              <View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}>
                <Text style={{color:c.text,fontSize:13,fontWeight:'900',flex:1}}>{x.opponent_name || 'Opponent not set'}</Text>
                <Text style={{color:x.result==='win'?c.success:x.result==='loss'?c.danger:c.warning,fontWeight:'900',fontSize:9}}>{String(x.result||'PENDING').toUpperCase()}</Text>
              </View>
              <Text style={{color:c.muted,fontSize:10}}>{x.event_name || 'Event'} · {x.event_date || 'Date not set'}{x.athlete_score != null ? ' · ' + x.athlete_score + '–' + x.opponent_score : ''}</Text>
              {x.round_name ? <Text style={{color:c.muted,fontSize:10}}>Round: {x.round_name}</Text> : null}
            </Card>) : <Empty text="No Kyorugi bouts recorded yet." />}
          </Section>
        </>
      )}

      <Section title={isPoomsae ? 'POOMSAE TRAINING HISTORY' : 'KYORUGI TRAINING HISTORY'}>
        {training.length ? training.slice(0,8).map(x=><Card key={x.id}>
          <Text style={{color:c.text,fontSize:13,fontWeight:'900'}}>{x.title}</Text>
          <Text style={{color:c.muted,fontSize:10}}>{x.session_date} · {x.focus || 'General'}{x.rounds ? ' · ' + x.rounds + ' rounds' : ''}{x.repetitions ? ' · ' + x.repetitions + ' reps' : ''}</Text>
        </Card>) : <Empty text="No discipline-specific sessions logged yet." />}
      </Section>
      {message ? <Text style={{color:c.accentBright,fontSize:10,lineHeight:16}}>{message}</Text> : null}

      <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={()=>setMode(null)}>
        <View style={{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.65)'}}>
          <View style={{maxHeight:'92%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:18,gap:11,borderWidth:1,borderColor:c.border}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{gap:10,paddingBottom:18}}>
              <Text style={{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.2}}>POOMSAE TOOL</Text>
              <Text style={{color:c.text,fontSize:20,fontWeight:'900'}}>{mode === 'practice' ? 'Log Form Practice' : 'Record Official Performance'}</Text>
              <EntryField label="Date (YYYY-MM-DD)" value={form.date || today()} onChangeText={v=>setForm({...form,date:v})} placeholder="YYYY-MM-DD"/>
              {mode === 'performance' ? <EntryField label="Event / tournament" value={form.event || ''} onChangeText={v=>setForm({...form,event:v})} placeholder="Event name"/> : null}
              <Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>POOMSAE FORM</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
                {POOMSAE_FORMS.map(name=><Choice key={name} title={name} active={(form.poomsae || POOMSAE_FORMS[0])===name} onPress={()=>setForm({...form,poomsae:name})}/>)}
              </View>
              <Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>CATEGORY</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
                {CATEGORIES.map(name=><Choice key={name} title={name} active={(form.category || 'Individual')===name} onPress={()=>setForm({...form,category:name})}/>)}
              </View>
              {mode === 'practice' ? (
                <>
                  <Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>TRAINING FOCUS</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
                    {FOCUS_OPTIONS.map(name=><Choice key={name} title={name} active={(form.focus || FOCUS_OPTIONS[0])===name} onPress={()=>setForm({...form,focus:name})}/>)}
                  </View>
                  <EntryField label="Repetitions (optional)" value={form.repetitions || ''} onChangeText={v=>setForm({...form,repetitions:v})} placeholder="e.g. 3" keyboardType="number-pad"/>
                </>
              ) : (
                <>
                  <EntryField label="Score (0–10, as recorded by the event)" value={form.score || ''} onChangeText={v=>setForm({...form,score:v})} placeholder="e.g. 8.5" keyboardType="decimal-pad"/>
                  <EntryField label="Placing (optional)" value={form.placing || ''} onChangeText={v=>setForm({...form,placing:v})} placeholder="e.g. 1" keyboardType="number-pad"/>
                  <Text style={{color:c.muted,fontSize:9,fontWeight:'900'}}>RESULT</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
                    {['gold','silver','bronze','placed','not_placed'].map(name=><Choice key={name} title={name.replace('_',' ')} active={(form.result || '')===name} onPress={()=>setForm({...form,result:name})}/>)}
                  </View>
                </>
              )}
              <EntryField label="Notes" value={form.notes || ''} onChangeText={v=>setForm({...form,notes:v})} placeholder="Practice notes or event feedback" multiline/>
              <View style={{flexDirection:'row',gap:8}}>
                <Pressable onPress={()=>setMode(null)} style={{flex:1,padding:13,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center'}}><Text style={{color:c.text,fontWeight:'900'}}>CANCEL</Text></Pressable>
                <Pressable disabled={busy} onPress={()=>void (mode==='practice'?savePractice():savePerformance())} style={{flex:1,padding:13,borderRadius:12,backgroundColor:c.accent,alignItems:'center',opacity:busy?0.6:1}}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'SAVING…':'SAVE RECORD'}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function EntryField({label,value,onChangeText,placeholder,keyboardType,multiline}:{label:string;value:string;onChangeText:(value:string)=>void;placeholder:string;keyboardType?:any;multiline?:boolean}) {
  return <View style={{gap:5}}>
    <Text style={{color:c.textSecondary,fontSize:10,fontWeight:'800'}}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} multiline={multiline} style={{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,padding:12,fontSize:12,minHeight:multiline?72:44,textAlignVertical:multiline?'top':'center'}}/>
  </View>;
}
function Choice({title,active,onPress}:{title:string;active:boolean;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={{backgroundColor:active?c.accentSoft:c.background,borderWidth:1,borderColor:active?c.accent:c.border,borderRadius:11,paddingHorizontal:10,paddingVertical:8}}>
    <Text style={{color:active?c.accentBright:c.textSecondary,fontSize:9,fontWeight:'900'}}>{title}</Text>
  </Pressable>;
}
function Action({title,subtitle,onPress}:{title:string;subtitle:string;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={{flex:1,minHeight:84,backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:15,padding:12,justifyContent:'space-between'}}>
    <Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>{title}</Text>
    <Text style={{color:c.muted,fontSize:9,lineHeight:14}}>{subtitle}</Text>
  </Pressable>;
}
function Stat({label,value}:{label:string;value:number}) {
  return <View style={{flex:1,backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:15,padding:12}}>
    <Text style={{color:c.text,fontSize:21,fontWeight:'900'}}>{value}</Text>
    <Text style={{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:1}}>{label}</Text>
  </View>;
}
function Empty({text}:{text:string}) {
  return <View style={{backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.border,borderRadius:14,padding:14}}>
    <Text style={{color:c.muted,fontSize:10,lineHeight:16}}>{text}</Text>
  </View>;
}

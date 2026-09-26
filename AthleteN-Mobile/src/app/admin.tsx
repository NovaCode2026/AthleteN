import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/mobile-ui';

const c = Colors.dark;

const resources = [
  ['profiles', 'Athletes'], ['training_sessions', 'Training'], ['training_plans', 'Training Plans'],
  ['tournaments', 'Tournaments'], ['matches', 'Matches'], ['medals', 'Medals'], ['weight_logs', 'Weight'],
  ['goals', 'Goals'], ['competition_checklists', 'Checklists'], ['tournament_scans', 'Scanner'],
  ['documents', 'Documents'], ['certificates', 'Certificates'], ['notifications', 'Notifications'],
  ['announcements', 'Announcements'], ['support_tickets', 'Support'], ['subscriptions', 'Subscriptions'],
  ['subscription_usage', 'Usage'], ['feature_flags', 'Feature Flags'], ['student_verifications', 'Verification'],
  ['audit_logs', 'Audit Logs'], ['feedback_items', 'Feedback'], ['roadmap_items', 'Roadmap'],
  ['calendar_events', 'Calendar'], ['injuries', 'Injuries'], ['attendance_records', 'Attendance'], ['referrals', 'Referrals'],
] as const;

type Row = Record<string, any>;
type Field = { key: string; value: string; original: any };

function labelize(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function editableFields(row: Row, owner: boolean): Field[] {
  return Object.keys(row)
    .filter(key => !['id', 'user_id', 'created_at', 'updated_at'].includes(key))
    .filter(key => owner || key !== 'role')
    .map(key => ({ key, value: row[key] == null ? '' : String(row[key]), original: row[key] }));
}

function coerce(value: string, original: any) {
  if (value === '' && (original === null || original === undefined)) return null;
  if (typeof original === 'number') return Number(value);
  if (typeof original === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

export default function AdminScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const role = String(profile?.role || 'athlete');
  const canManage = role === 'admin' || role === 'super_admin';
  const owner = role === 'super_admin';

  const [selected, setSelected] = useState('profiles');
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFields, setNewFields] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const currentLabel = resources.find(([table]) => table === selected)?.[1] || selected;

  const loadCounts = useCallback(async () => {
    if (!canManage) return;
    const result: Record<string, number> = {};
    await Promise.all(resources.map(async ([table]) => {
      const r = await supabase.from(table).select('*', { count: 'exact', head: true });
      result[table] = r.count ?? 0;
    }));
    setCounts(result);
  }, [canManage]);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setMessage('');
    setSelectedRow(null);
    const { data, error } = await supabase.from(selected).select('*').limit(100);
    if (error) setMessage(error.message);
    else setRows((data || []) as Row[]);
    setLoading(false);
  }, [canManage, selected]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  if (!canManage) {
    return <View style={s.denied}><Text style={s.brand}>ATHLETEN</Text><Text style={s.deniedTitle}>Admin access required</Text><Text style={s.meta}>This command center is restricted to administrators.</Text></View>;
  }

  function openRecord(row: Row) {
    setSelectedRow(row);
    setFields(editableFields(row, owner));
  }

  function setField(key: string, value: string) {
    setFields(current => current.map(field => field.key === key ? { ...field, value } : field));
  }

  async function saveRecord() {
    if (!selectedRow?.id) return;
    const update: Row = {};
    fields.forEach(field => { update[field.key] = coerce(field.value, field.original); });
    setBusy(true);
    const { error } = await supabase.from(selected).update(update).eq('id', selectedRow.id);
    setBusy(false);
    if (error) setMessage(error.message);
    else { setMessage('Changes saved successfully.'); setSelectedRow(null); await load(); await loadCounts(); }
  }

  async function deleteRecord() {
    if (!selectedRow?.id || !owner) return;
    Alert.alert('Delete record', 'This permanently removes this record.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        const { error } = await supabase.from(selected).delete().eq('id', selectedRow.id);
        setBusy(false);
        if (error) setMessage(error.message);
        else { setMessage('Record deleted.'); setSelectedRow(null); await load(); await loadCounts(); }
      }},
    ]);
  }

  async function createRecord() {
    const payload: Row = {};
    newFields.filter(field => field.key.trim()).forEach(field => payload[field.key.trim()] = field.value);
    if (!Object.keys(payload).length) { setMessage('Add at least one field.'); return; }
    setBusy(true);
    const { error } = await supabase.from(selected).insert(payload);
    setBusy(false);
    if (error) setMessage(error.message);
    else { setCreateOpen(false); setNewFields([{ key: '', value: '' }]); setMessage('Record created.'); await load(); await loadCounts(); }
  }

  async function publishAnnouncement() {
    if (!announcementTitle.trim() || !announcementBody.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('publish_announcement', {
      p_title: announcementTitle.trim(),
      p_body: announcementBody.trim(),
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else { setAnnouncementTitle(''); setAnnouncementBody(''); setAnnouncementOpen(false); setMessage('Announcement published to all users and notification history.'); await load(); await loadCounts(); }
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <View style={s.brandRow}>
            <Image source={require('@/assets/logo.png')} style={s.brandLogo} contentFit="cover" />
            <View><Text style={s.brand}>ATHLETEN</Text><Text style={s.brandSub}>OWNER COMMAND CENTER</Text></View>
          </View>
          <Pressable style={s.menuButton} onPress={() => setDrawerOpen(true)}><Icon name="menu" size={17} color={c.text} /><Text style={s.menuText}>MENU</Text></Pressable>
        </View>

        <View style={s.hero}>
          <Text style={s.kicker}>ADMINISTRATION</Text>
          <Text style={s.title}>Command Center</Text>
          <Text style={s.sub}>Manage every AthleteN system from one clean mobile workspace.</Text>
          <View style={s.ownerPill}><View style={s.ownerDot} /><Text style={s.ownerText}>{owner ? 'SUPER ADMIN' : 'ADMIN'} • SECURE</Text></View>
        </View>

        <View style={s.statGrid}>
          <AdminStat label="ATHLETES" value={counts.profiles ?? 0} />
          <AdminStat label="TRAINING" value={counts.training_sessions ?? 0} />
          <AdminStat label="EVENTS" value={counts.tournaments ?? 0} />
          <AdminStat label="SUPPORT" value={counts.support_tickets ?? 0} />
        </View>

        <View style={s.sectionHead}><View><Text style={s.sectionKicker}>WORKSPACE</Text><Text style={s.sectionTitle}>{currentLabel}</Text></View><Text style={s.count}>{filtered.length} RECORDS</Text></View>

        <View style={s.toolbar}>
          <TextInput value={query} onChangeText={setQuery} placeholder={`Search ${currentLabel.toLowerCase()}...`} placeholderTextColor={c.muted} style={s.search} />
          <Pressable style={s.addButton} onPress={() => setCreateOpen(!createOpen)}><View style={{flexDirection:"row",alignItems:"center",gap:5}}><Icon name="add" size={14} color={c.text}/><Text style={s.addText}>ADD</Text></View></Pressable>
        </View>

        {announcementOpen && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Publish announcement</Text>
            <TextInput value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Announcement title" placeholderTextColor={c.muted} style={s.input} />
            <TextInput value={announcementBody} onChangeText={setAnnouncementBody} placeholder="Write the announcement..." placeholderTextColor={c.muted} style={[s.input, s.textarea]} multiline />
            <View style={s.buttonRow}><Pressable style={s.primary} onPress={publishAnnouncement}><Text style={s.primaryText}>PUBLISH</Text></Pressable><Pressable style={s.secondary} onPress={() => setAnnouncementOpen(false)}><Text style={s.secondaryText}>CANCEL</Text></Pressable></View>
          </View>
        )}

        {createOpen && (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Add {currentLabel}</Text>
            <Text style={s.panelHint}>Enter fields as normal text. IDs and timestamps are generated by the database when supported.</Text>
            {newFields.map((field, index) => (
              <View style={s.newField} key={index}>
                <TextInput value={field.key} onChangeText={value => setNewFields(all => all.map((item, i) => i === index ? { ...item, key: value } : item))} placeholder="Field name" placeholderTextColor={c.muted} style={[s.input, s.keyInput]} />
                <TextInput value={field.value} onChangeText={value => setNewFields(all => all.map((item, i) => i === index ? { ...item, value } : item))} placeholder="Value" placeholderTextColor={c.muted} style={[s.input, s.valueInput]} />
              </View>
            ))}
            <Pressable onPress={() => setNewFields([...newFields, { key: '', value: '' }])}><View style={{flexDirection:"row",alignItems:"center",gap:5}}><Icon name="add" size={14} color={c.accentBright}/><Text style={s.addField}>Add another field</Text></View></Pressable>
            <View style={s.buttonRow}><Pressable style={s.primary} onPress={createRecord} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>CREATE</Text>}</Pressable><Pressable style={s.secondary} onPress={() => setCreateOpen(false)}><Text style={s.secondaryText}>CANCEL</Text></Pressable></View>
          </View>
        )}

        {selected === 'support_tickets' && <Pressable style={s.featureButton} onPress={() => router.push('/admin-support')}><Icon name="message" size={18} color={c.accentBright} /><View><Text style={s.featureTitle}>Open Support Workspace</Text><Text style={s.featureMeta}>Reply, assign, resolve and close support tickets</Text></View></Pressable>}
        {selected === 'announcements' && !announcementOpen && <Pressable style={s.featureButton} onPress={() => setAnnouncementOpen(true)}><Icon name="add" size={18} color={c.accentBright} /><View><Text style={s.featureTitle}>Publish announcement</Text><Text style={s.featureMeta}>Send an AthleteN update to users</Text></View></Pressable>}

        {message ? <Text style={s.message}>{message}</Text> : null}

        {loading ? <View style={s.loading}><ActivityIndicator color={c.accentBright} /><Text style={s.meta}>Loading {currentLabel.toLowerCase()}...</Text></View> : filtered.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyTitle}>Nothing here yet</Text><Text style={s.meta}>No records match this search.</Text></View>
        ) : filtered.map(row => (
          <Pressable key={String(row.id || JSON.stringify(row))} onPress={() => openRecord(row)} style={({ pressed }) => [s.record, pressed && s.pressed]}>
            <View style={s.recordTop}>
              <View style={s.recordIcon}><Icon name={selected==="profiles"?"people":selected.includes("training")?"training":selected.includes("tournament")||selected==="matches"||selected==="medals"?"event":selected.includes("support")||selected.includes("feedback")?"message":"info"} size={18} color={c.accentBright}/></View>
              <View style={s.recordInfo}><Text style={s.recordTitle}>{String(row.full_name || row.name || row.title || row.email || row.username || row.id || 'Record')}</Text><Text style={s.recordMeta}>{selected === 'profiles' ? [row.sport, row.discipline, row.club].filter(Boolean).join(' • ') : `ID • ${String(row.id || '').slice(0, 8)}`}</Text></View>
              <Icon name="arrow" size={16} color={c.muted}/>
            </View>
            <View style={s.recordBottom}><Text style={s.preview}>{preview(row)}</Text><View style={{flexDirection:"row",alignItems:"center",gap:4}}><Text style={s.editHint}>EDIT</Text><Icon name="edit" size={12} color={c.accentBright}/></View></View>
          </Pressable>
        ))}
      </ScrollView>

      {drawerOpen && (
        <View style={s.drawerLayer}>
          <Pressable style={s.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <View style={s.drawer}>
            <View style={s.drawerHeader}><View><Text style={s.drawerKicker}>ATHLETEN</Text><Text style={s.drawerTitle}>Admin Menu</Text></View><Pressable onPress={() => setDrawerOpen(false)} style={s.close}><Icon name="close" size={18} color={c.text}/></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                ['ATHLETES', ['profiles', 'student_verifications', 'documents']],
                ['PERFORMANCE', ['training_sessions', 'training_plans', 'weight_logs', 'goals', 'injuries', 'attendance_records']],
                ['COMPETITION', ['tournaments', 'matches', 'medals', 'competition_checklists', 'certificates']],
                ['PRODUCT', ['tournament_scans', 'roadmap_items', 'feature_flags']],
                ['COMMUNICATION', ['announcements', 'notifications', 'feedback_items', 'support_tickets']],
                ['BUSINESS', ['subscriptions', 'subscription_usage', 'referrals']],
                ['SYSTEM', ['audit_logs', 'calendar_events']],
              ].map(([group, tables]) => (
                <View key={group as string} style={s.drawerGroup}>
                  <Text style={s.drawerGroupTitle}>{group as string}</Text>
                  {(tables as string[]).map(table => {
                    const item = resources.find(([name]) => name === table);
                    return <Pressable key={table} onPress={() => { setSelected(table); setDrawerOpen(false); setQuery(''); }} style={[s.drawerItem, selected === table && s.drawerItemActive]}><Text style={s.drawerItemText}>{item?.[1] || labelize(table)}</Text><Text style={s.drawerCount}>{counts[table] ?? 0}</Text></Pressable>;
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {selectedRow && (
        <View style={s.editorLayer}>
          <View style={s.editor}>
            <View style={s.editorHeader}><View><Text style={s.kicker}>EDIT RECORD</Text><Text style={s.editorTitle}>{String(selectedRow.full_name || selectedRow.name || selectedRow.title || currentLabel)}</Text></View><Pressable onPress={() => setSelectedRow(null)}><Text style={s.closeText}>×</Text></Pressable></View>
            <ScrollView style={s.editorScroll} contentContainerStyle={s.editorContent} showsVerticalScrollIndicator={false}>
              {fields.map(field => (
                <View key={field.key} style={s.field}>
                  <Text style={s.fieldLabel}>{labelize(field.key)}</Text>
                  <TextInput value={field.value} onChangeText={value => setField(field.key, value)} placeholder={labelize(field.key)} placeholderTextColor={c.muted} style={s.input} multiline={field.value.length > 80} />
                </View>
              ))}
              {selected === 'profiles' && !owner ? <View style={s.roleProtected}><Text style={s.roleProtectedTitle}>ACCESS ROLE PROTECTED</Text><Text style={s.roleProtectedText}>Only the owner can assign Admin or Super Admin. Your administrator role can manage athlete data without changing privileged access.</Text></View> : null}
              {selected === 'profiles' && owner ? <View style={s.rolePanel}><Text style={s.rolePanelTitle}>ACCESS ROLE</Text><Text style={s.rolePanelHint}>Owner-only permission. Choose who can access the Admin Command Center.</Text><View style={s.roleButtons}>{['athlete','coach','academy_admin','support_admin','admin','super_admin'].map(role => <Pressable key={role} onPress={() => setField('role', role)} style={[s.roleButton, fields.find(field => field.key === 'role')?.value === role && s.roleButtonActive]}><Text style={[s.roleButtonText, fields.find(field => field.key === 'role')?.value === role && s.roleButtonTextActive]}>{role.replace('_',' ').toUpperCase()}</Text></Pressable>)}</View></View> : null}
              <Text style={s.advancedHint}>Advanced database fields such as IDs and timestamps are protected from normal editing.</Text>
            </ScrollView>
            <View style={s.editorActions}>
              <Pressable style={s.primary} onPress={saveRecord} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>SAVE CHANGES</Text>}</Pressable>
              {owner && <Pressable style={s.danger} onPress={deleteRecord} disabled={busy}><Text style={s.dangerText}>DELETE</Text></Pressable>}
              <Pressable style={s.secondary} onPress={() => setSelectedRow(null)}><Text style={s.secondaryText}>CANCEL</Text></Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function preview(row: Row) {
  const values = Object.entries(row).filter(([key]) => !['id', 'user_id', 'created_at', 'updated_at'].includes(key)).slice(0, 2).map(([key, value]) => `${labelize(key)}: ${value ?? '—'}`);
  return values.join('  •  ') || 'Open to manage this record';
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return <View style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></View>;
}



const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:c.background},
  content:{paddingHorizontal:18,paddingTop:10,paddingBottom:40,gap:12},
  topBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brandRow:{flexDirection:'row',alignItems:'center',gap:10},
  brandLogo:{width:42,height:42,borderRadius:13},
  brand:{color:c.text,fontSize:15,fontWeight:'900',letterSpacing:3.5},
  brandSub:{color:c.muted,fontSize:7,fontWeight:'800',letterSpacing:1.1,marginTop:2},
  menuButton:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:10,borderRadius:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},
  menuIcon:{color:c.text,fontSize:16}, menuText:{color:c.text,fontSize:9,fontWeight:'900',letterSpacing:1},
  hero:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:18,gap:8},
  kicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.5},
  title:{color:c.text,fontSize:28,fontWeight:'900'},
  sub:{color:c.muted,fontSize:12,lineHeight:18},
  ownerPill:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:999,paddingHorizontal:10,paddingVertical:6},
  ownerDot:{width:7,height:7,borderRadius:4,backgroundColor:c.success}, ownerText:{color:'#BBD6FF',fontSize:8,fontWeight:'900',letterSpacing:1},
  statGrid:{flexDirection:'row',gap:9}, stat:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:12,gap:4},
  statLabel:{color:c.muted,fontSize:7,fontWeight:'900',letterSpacing:1},statValue:{color:c.text,fontSize:20,fontWeight:'900'},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginTop:7},sectionKicker:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.3},sectionTitle:{color:c.text,fontSize:20,fontWeight:'900',marginTop:2},count:{color:c.accentBright,fontSize:8,fontWeight:'900'},
  toolbar:{flexDirection:'row',gap:8},search:{flex:1,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:13,color:c.text,paddingHorizontal:13,paddingVertical:12,fontSize:13},addButton:{backgroundColor:c.accent,borderRadius:13,paddingHorizontal:15,justifyContent:'center'},addText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.7},
  panel:{backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.borderStrong,borderRadius:18,padding:14,gap:10},panelTitle:{color:c.text,fontSize:16,fontWeight:'900'},panelHint:{color:c.muted,fontSize:11,lineHeight:16},
  input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,paddingHorizontal:13,paddingVertical:12,fontSize:13},textarea:{minHeight:100,textAlignVertical:'top'},buttonRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},primary:{backgroundColor:c.accent,borderRadius:12,paddingVertical:13,paddingHorizontal:16,alignItems:'center',justifyContent:'center',minWidth:120},primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},secondary:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:12,paddingVertical:12,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},secondaryText:{color:c.text,fontSize:10,fontWeight:'900',letterSpacing:.7},danger:{backgroundColor:'#2A1116',borderWidth:1,borderColor:'#67313C',borderRadius:12,paddingVertical:12,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},dangerText:{color:c.danger,fontSize:10,fontWeight:'900'},addField:{color:c.accentBright,fontSize:11,fontWeight:'800'},newField:{flexDirection:'row',gap:8},keyInput:{flex:1},valueInput:{flex:1.5},featureButton:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep,borderRadius:16,padding:14},featureIcon:{color:c.accentBright,fontSize:23},featureTitle:{color:c.text,fontSize:13,fontWeight:'800'},featureMeta:{color:c.muted,fontSize:10,marginTop:2},
  message:{color:c.accentBright,fontSize:11},loading:{padding:30,alignItems:'center',gap:8},empty:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:22,gap:5},emptyTitle:{color:c.text,fontSize:16,fontWeight:'800'},
  record:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:14,gap:12},pressed:{opacity:.75},recordTop:{flexDirection:'row',alignItems:'center',gap:10},recordIcon:{width:38,height:38,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},recordIconText:{color:c.accentBright,fontSize:14,fontWeight:'900'},recordInfo:{flex:1},recordTitle:{color:c.text,fontSize:14,fontWeight:'800'},recordMeta:{color:c.muted,fontSize:10,marginTop:3},chevron:{color:c.muted,fontSize:25},recordBottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},preview:{color:c.muted,fontSize:10,flex:1},editHint:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1},
  drawerLayer:{position:'absolute',top:0,left:0,right:0,bottom:0,flexDirection:'row'},drawerBackdrop:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#000',opacity:.62},drawer:{width:'82%',maxWidth:360,backgroundColor:c.surfaceRaised,borderRightWidth:1,borderRightColor:c.borderStrong,paddingTop:54,paddingHorizontal:16},drawerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},drawerKicker:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.4},drawerTitle:{color:c.text,fontSize:25,fontWeight:'900',marginTop:2},close:{width:38,height:38,borderRadius:12,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},closeText:{color:c.text,fontSize:27,fontWeight:'300'},drawerGroup:{gap:5,marginBottom:17},drawerGroupTitle:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:1.4,marginBottom:3},drawerItem:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:11,paddingHorizontal:11,borderRadius:11},drawerItemActive:{backgroundColor:c.accentSoft,borderWidth:1,borderColor:c.accentDeep},drawerItemText:{color:c.text,fontSize:12,fontWeight:'700'},drawerCount:{color:c.muted,fontSize:10},
  editorLayer:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'#000000AA',justifyContent:'flex-end'},editor:{maxHeight:'92%',backgroundColor:c.surfaceRaised,borderTopLeftRadius:25,borderTopRightRadius:25,borderWidth:1,borderColor:c.borderStrong,paddingTop:17,paddingHorizontal:18,paddingBottom:18},editorHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},editorTitle:{color:c.text,fontSize:20,fontWeight:'900',marginTop:3,flex:1},editorScroll:{marginTop:12},editorContent:{paddingBottom:10,gap:12},field:{gap:6},fieldLabel:{color:c.text,fontSize:11,fontWeight:'800'},advancedHint:{color:c.muted,fontSize:10,lineHeight:16,marginTop:5},editorActions:{flexDirection:'row',gap:8,marginTop:8,flexWrap:'wrap'},
  meta:{color:c.muted,fontSize:12,lineHeight:18},denied:{flex:1,backgroundColor:c.background,alignItems:'center',justifyContent:'center',padding:30,gap:12},deniedTitle:{color:c.text,fontSize:24,fontWeight:'900'},
});

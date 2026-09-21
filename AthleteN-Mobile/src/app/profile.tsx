import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const c=Colors.dark;

export default function ProfileScreen(){
 const {profile,signOut}=useAuth();
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.title}>{profile?.full_name || 'Athlete'}</Text>
  <Text style={styles.sub}>{profile?.sport || 'Sport not set'}{profile?.discipline?'  •  '+profile.discipline:''}</Text>
  <View style={styles.card}>
   <Row label="Date of birth" value={String(profile?.date_of_birth||'Not set')}/>
   <Row label="Gender" value={String(profile?.gender||'Not set')}/>
   <Row label="Club / Academy" value={String(profile?.club||profile?.academy||'Not set')}/>
   <Row label="Coach" value={String(profile?.coach||'Not set')}/>
   <Row label="Belt" value={String(profile?.belt||'Not set')}/>
   <Row label="Plan" value={String(profile?.plan_id||'free')}/>
  </View>
  <Pressable onPress={signOut} style={styles.danger}><Text style={styles.dangerText}>SIGN OUT</Text></Pressable>
 </ScrollView>
}
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:c.background},content:{padding:20,paddingTop:55,gap:14,paddingBottom:40},eyebrow:{color:c.accent,fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{color:c.text,fontSize:29,fontWeight:'800'},sub:{color:c.muted,fontSize:14},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:16,gap:18},row:{gap:4,borderBottomWidth:1,borderBottomColor:c.border,paddingBottom:12},label:{color:c.muted,fontSize:10,fontWeight:'800',letterSpacing:1},value:{color:c.text,fontSize:14,fontWeight:'600'},danger:{borderWidth:1,borderColor:'#6D3038',borderRadius:14,padding:15,alignItems:'center'},dangerText:{color:'#F0A8B1',fontSize:12,fontWeight:'900',letterSpacing:1}});

// @ts-nocheck
import { ActivityIndicator, DeviceEventEmitter, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { Colors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AthleteNLogo from '@/components/athleten-logo';

export const c=Colors.dark;
const icons:Record<string,string>={back:'chevron-left',arrow:'arrow-right',add:'plus',close:'close',check:'check',settings:'cog',empty:'square-outline',search:'magnify',refresh:'refresh',edit:'pencil',delete:'trash-can',calendar:'calendar',bell:'bell',menu:'menu',home:'view-dashboard',dashboard:'view-dashboard',more:'dots-horizontal',searchCircle:'magnify-plus',closeCircle:'close-circle',person:'account',people:'account-group',coach:'run',athlete:'run-fast',training:'run',event:'trophy',finance:'currency-inr',ai:'creation',shield:'shield-check',lock:'lock',warning:'alert',info:'information',chart:'chart-line',medal:'medal',message:'message-text','bell.fill':'bell'};
export function Icon({name,size=18,color=c.accentBright}:{name:string;size?:number;color?:string}){return <MaterialCommunityIcons name={(icons[name]||name) as any} size={size} color={color}/>}
export function SupportContact(){
 const router=useRouter();
 const openAdmin=()=>router.push('/messages?support=novacode.admin');
 const openSupport=()=>router.push('/support');
 return <View style={{marginTop:18,paddingTop:16,paddingBottom:8,borderTopWidth:1,borderTopColor:c.border,alignItems:'center',gap:6}}>
  <Text style={{color:c.muted,fontSize:9,textAlign:'center'}}>Need help with AthleteN?</Text>
  <Pressable onPress={openAdmin} hitSlop={8}>
   <Text style={{color:c.accentBright,fontSize:10,fontWeight:'900'}}>MESSAGE NOVACODE ADMIN · novacode.admin</Text>
  </Pressable>
  <Pressable onPress={openSupport} hitSlop={8}><Text style={{color:c.accentBright,fontSize:9,fontWeight:'900'}}>CREATE SUPPORT TICKET</Text></Pressable>
  <Text style={{color:c.muted,fontSize:8}}>Support: novacode.create@gmail.com</Text>
 </View>;
}
export function useNavigationScrollToTop() {
 const ref = useRef<any>(null);
 useEffect(() => {
  const subscription = DeviceEventEmitter.addListener('athleten-scroll-to-top', () => {
   ref.current?.scrollTo?.({ y: 0, animated: false });
  });
  return () => subscription.remove();
 }, []);
 return ref;
}
export function Screen({children,scroll=true,bottomBar}:{children:React.ReactNode;scroll?:boolean;bottomBar?:React.ReactNode}){
 const scrollRef=useNavigationScrollToTop();
 const body=<View style={s.wrap}>{children}</View>;
 const footer=<SupportContact />;
 return <SafeAreaView style={s.screen} edges={['top','bottom']}>{scroll?<View style={{flex:1}}><ScrollView ref={scrollRef} contentContainerStyle={bottomBar ? [s.content,{paddingBottom:190}] : [s.content]} showsVerticalScrollIndicator={false}>{body}{footer}</ScrollView>{bottomBar}</View>:<View style={{flex:1}}>{body}{footer}{bottomBar}</View>}</SafeAreaView>;
}
export function RefreshButton({onPress,busy=false}:{onPress:()=>void;busy?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" onPress={onPress} disabled={busy} hitSlop={8} style={({pressed})=>({width:42,height:42,borderRadius:13,borderWidth:1,borderColor:c.borderStrong,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',opacity:pressed?.7:busy?.55:1})}>{busy?<ActivityIndicator size="small" color={c.accentBright}/>:<Icon name="refresh" size={19} color={c.accentBright}/>}</Pressable>}
export function Header({eyebrow,title,subtitle,right,back=false,onRefresh,refreshing=false}:{eyebrow:string;title:string;subtitle?:string;right?:React.ReactNode;back?:boolean;onRefresh?:()=>void;refreshing?:boolean}){const router=useRouter();return <View style={s.header}>{back?<Pressable onPress={()=>router.back()} style={s.back}><View style={s.backText}><Icon name="back" size={14} color={c.accentBright}/><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:.7,marginLeft:5}}>BACK</Text></View></Pressable>:null}<View style={s.headerRow}><View style={s.headerIdentity}><AthleteNLogo width={104} height={58} style={s.headerLogo}/><View style={{flex:1,gap:4}}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View></View><View style={{flexDirection:'row',alignItems:'center',gap:8}}>{onRefresh?<RefreshButton onPress={onRefresh} busy={refreshing}/>:null}{right}</View></View></View>}
export function Section({title,action,children}:{title:string;action?:React.ReactNode;children:React.ReactNode}){return <View style={s.sectionWrap}><View style={s.sectionHead}><Text style={s.section}>{title}</Text>{action}</View>{children}</View>}
export function Card({children,accent=false,style}:{children:React.ReactNode;accent?:boolean;style?:any}){return <View style={[s.card,accent&&s.accentCard,style]}>{children}</View>}
export function Button({title,onPress,busy=false,secondary=false,icon}:{title:string;onPress:()=>void;busy?:boolean;secondary?:boolean;icon?:string}){return <Pressable onPress={onPress} disabled={busy} style={({pressed})=>[s.button,secondary&&s.secondary,pressed&&s.pressed]}>{busy?<ActivityIndicator color={secondary?c.accentBright:'#fff'}/>:<View style={{flexDirection:'row',alignItems:'center',gap:8}}>{icon?<Icon name={icon} size={15} color={secondary?c.accentBright:'#fff'}/>:null}<Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></View>}</Pressable>}
export function Field({label,value,onChangeText,placeholder,keyboardType,autoCapitalize,autoCorrect,maxLength}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any;autoCapitalize?:any;autoCorrect?:boolean;maxLength?:number}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} maxLength={maxLength} style={s.input}/></View>}
export function FeatureRow({title,text,onPress,badge,icon='arrow'}:{title:string;text?:string;onPress:()=>void;badge?:string;icon?:string}){return <Pressable onPress={onPress} style={({pressed})=>[s.row,pressed&&{opacity:.72}]}><View style={s.rowIcon}><Icon name={icon} size={18}/></View><View style={s.rowCopy}><Text style={s.rowTitle}>{title}</Text>{text?<Text style={s.rowText}>{text}</Text>:null}</View>{badge?<Text style={s.badge}>{badge}</Text>:<Icon name="arrow" size={16} color={c.muted}/>}</Pressable>}
export function Empty({text,icon='empty'}:{text:string;icon?:string}){return <Card><View style={{width:42,height:42,borderRadius:13,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={20}/></View><Text style={s.emptyTitle}>{text}</Text><Text style={s.muted}>Start adding data and AthleteN will build this view automatically.</Text></Card>}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},
 content:{paddingHorizontal:18,paddingTop:18,paddingBottom:78,width:'100%',maxWidth:900,alignSelf:'center'},
 wrap:{gap:14},
 header:{gap:10,paddingTop:8,paddingBottom:4},
 headerRow:{flexDirection:'row',alignItems:'center',gap:14},
 headerIdentity:{flex:1,flexDirection:'row',alignItems:'center',gap:13,minWidth:0},
 headerLogo:{width:104,height:58},
 back:{alignSelf:'flex-start',paddingVertical:3,paddingHorizontal:2},
 backText:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:.7,flexDirection:'row',alignItems:'center'},
 eyebrow:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:1.45},
 title:{color:c.text,fontSize:32,fontWeight:'900',letterSpacing:-.8,marginTop:2},
 subtitle:{color:c.muted,fontSize:12,lineHeight:18},
 sectionWrap:{gap:10},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 section:{color:c.muted,fontSize:10,fontWeight:'900',letterSpacing:1.35},
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:21,padding:16,gap:11,shadowColor:'#000',shadowOpacity:.16,shadowRadius:16,shadowOffset:{width:0,height:8},elevation:3},
 accentCard:{backgroundColor:c.accentSoft,borderColor:c.accentDeep,shadowColor:c.glow,shadowOpacity:.24,shadowRadius:18,elevation:4},
 button:{backgroundColor:c.accent,borderRadius:14,minHeight:48,alignItems:'center',justifyContent:'center',paddingHorizontal:17,shadowColor:c.accent,shadowOpacity:.22,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:3},
 secondary:{backgroundColor:c.surfaceRaised,borderWidth:1,borderColor:c.borderStrong,shadowOpacity:0,elevation:0},
 buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:.75},
 secondaryText:{color:c.accentBright},
 field:{gap:5},
 label:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:.8},
 input:{backgroundColor:c.background,borderWidth:1,borderColor:c.borderStrong,borderRadius:13,color:c.text,paddingHorizontal:13,paddingVertical:13,fontSize:14},
 row:{minHeight:72,flexDirection:'row',alignItems:'center',gap:12,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:13},
 rowIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},
 rowIconText:{color:c.accentBright,fontSize:12,fontWeight:'900'},
 rowCopy:{flex:1},
 rowTitle:{color:c.text,fontSize:13,fontWeight:'900',letterSpacing:-.15},
 rowText:{color:c.muted,fontSize:11,lineHeight:16,marginTop:3},
 badge:{color:c.accentBright,fontSize:9,fontWeight:'900',letterSpacing:.45},
 arrow:{color:c.muted,fontSize:25},
 emptyTitle:{color:c.text,fontSize:14,fontWeight:'800'},
 muted:{color:c.muted,fontSize:11,lineHeight:17},
 pressed:{opacity:.78,transform:[{scale:.985}]}
});

export const ui=s;

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const c=Colors.dark;
const icons:Record<string,string>={back:'chevron-left',arrow:'arrow-right',add:'plus',close:'close',check:'check',settings:'cog',empty:'square-outline',search:'magnify',refresh:'refresh',edit:'pencil',delete:'trash-can',calendar:'calendar',bell:'bell',menu:'menu',home:'view-dashboard',dashboard:'view-dashboard',more:'dots-horizontal',searchCircle:'magnify-plus',closeCircle:'close-circle',person:'account',people:'account-group',coach:'run',athlete:'run-fast',training:'run',event:'trophy',finance:'currency-inr',ai:'creation',shield:'shield-check',lock:'lock',warning:'alert',info:'information',chart:'chart-line',medal:'medal',message:'message-text','bell.fill':'bell'};
export function Icon({name,size=18,color=c.accentBright}:{name:string;size?:number;color?:string}){return <MaterialCommunityIcons name={(icons[name]||name) as any} size={size} color={color}/>}
export function Screen({children,scroll=true,bottomBar}:{children:React.ReactNode;scroll?:boolean;bottomBar?:React.ReactNode}){
 const body=<View style={s.wrap}>{children}</View>;
 return <SafeAreaView style={s.screen} edges={['top','bottom']}>{scroll?<View style={{flex:1}}><ScrollView contentContainerStyle={[s.content,bottomBar&&{paddingBottom:190}]} showsVerticalScrollIndicator={false}>{body}</ScrollView>{bottomBar}</View>:<View style={{flex:1}}>{body}{bottomBar}</View>}</SafeAreaView>;
}
export function Header({eyebrow,title,subtitle,right,back=false}:{eyebrow:string;title:string;subtitle?:string;right?:React.ReactNode;back?:boolean}){const router=useRouter();return <View style={s.header}>{back?<Pressable onPress={()=>router.back()} style={s.back}><View style={s.backText}><Icon name="back" size={14} color={c.accentBright}/><Text style={{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:.7,marginLeft:5}}>BACK</Text></View></Pressable>:null}<View style={s.headerRow}><View style={{flex:1,gap:4}}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View>{right}</View></View>}
export function Section({title,action,children}:{title:string;action?:React.ReactNode;children:React.ReactNode}){return <View style={s.sectionWrap}><View style={s.sectionHead}><Text style={s.section}>{title}</Text>{action}</View>{children}</View>}
export function Card({children,accent=false,style}:{children:React.ReactNode;accent?:boolean;style?:any}){return <View style={[s.card,accent&&s.accentCard,style]}>{children}</View>}
export function Button({title,onPress,busy=false,secondary=false,icon}:{title:string;onPress:()=>void;busy?:boolean;secondary?:boolean;icon?:string}){return <Pressable onPress={onPress} disabled={busy} style={[s.button,secondary&&s.secondary]}>{busy?<ActivityIndicator color={secondary?c.accentBright:'#fff'}/>:<View style={{flexDirection:'row',alignItems:'center',gap:8}}>{icon?<Icon name={icon} size={15} color={secondary?c.accentBright:'#fff'}/>:null}<Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></View>}</Pressable>}
export function Field({label,value,onChangeText,placeholder,keyboardType,autoCapitalize,autoCorrect,maxLength}:{label:string;value:string;onChangeText:(v:string)=>void;placeholder:string;keyboardType?:any;autoCapitalize?:any;autoCorrect?:boolean;maxLength?:number}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} maxLength={maxLength} style={s.input}/></View>}
export function FeatureRow({title,text,onPress,badge,icon='arrow'}:{title:string;text?:string;onPress:()=>void;badge?:string;icon?:string}){return <Pressable onPress={onPress} style={({pressed})=>[s.row,pressed&&{opacity:.72}]}><View style={s.rowIcon}><Icon name={icon} size={18}/></View><View style={s.rowCopy}><Text style={s.rowTitle}>{title}</Text>{text?<Text style={s.rowText}>{text}</Text>:null}</View>{badge?<Text style={s.badge}>{badge}</Text>:<Icon name="arrow" size={16} color={c.muted}/>}</Pressable>}
export function Empty({text,icon='empty'}:{text:string;icon?:string}){return <Card><View style={{width:42,height:42,borderRadius:13,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={20}/></View><Text style={s.emptyTitle}>{text}</Text><Text style={s.muted}>Start adding data and AthleteN will build this view automatically.</Text></Card>}
export const ui=s;
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:c.background},
 content:{padding:18,paddingBottom:70},
 wrap:{gap:14},
 header:{gap:8,paddingTop:5},
 headerRow:{flexDirection:'row',alignItems:'center',gap:12},
 back:{alignSelf:'flex-start',paddingVertical:3,paddingHorizontal:2},
 backText:{color:c.accentBright,fontSize:10,fontWeight:'900',letterSpacing:.7,flexDirection:'row',alignItems:'center'},
 eyebrow:{color:c.accentBright,fontSize:8,fontWeight:'900',letterSpacing:1.6},
 title:{color:c.text,fontSize:30,fontWeight:'900',marginTop:2},
 subtitle:{color:c.muted,fontSize:12,lineHeight:18},
 sectionWrap:{gap:7},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 section:{color:c.muted,fontSize:9,fontWeight:'900',letterSpacing:1.5},
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:15,gap:10},
 accentCard:{backgroundColor:c.accentSoft,borderColor:c.accentDeep},
 button:{backgroundColor:c.accent,borderRadius:13,minHeight:45,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:c.borderStrong},
 buttonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:1},
 secondaryText:{color:c.accentBright},
 field:{gap:5},
 label:{color:c.textSecondary,fontSize:8,fontWeight:'900',letterSpacing:.8},
 input:{backgroundColor:c.background,borderWidth:1,borderColor:c.border,borderRadius:12,color:c.text,paddingHorizontal:12,paddingVertical:11,fontSize:13},
 row:{minHeight:68,flexDirection:'row',alignItems:'center',gap:11,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:17,padding:12},
 rowIcon:{width:40,height:40,borderRadius:13,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},
 rowIconText:{color:c.accentBright,fontSize:12,fontWeight:'900'},
 rowCopy:{flex:1},
 rowTitle:{color:c.text,fontSize:13,fontWeight:'900'},
 rowText:{color:c.muted,fontSize:10,lineHeight:15,marginTop:2},
 badge:{color:c.accentBright,fontSize:8,fontWeight:'900'},
 arrow:{color:c.muted,fontSize:25},
 emptyTitle:{color:c.text,fontSize:14,fontWeight:'800'},
 muted:{color:c.muted,fontSize:10,lineHeight:16}
});

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

const c = Colors.dark;
export type ChartPoint = { label: string; value: number };

function clean(data: ChartPoint[]){return data.filter(x=>Number.isFinite(Number(x.value))).map(x=>({label:String(x.label),value:Number(x.value)}));}
function formatValue(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}

export function PerformanceLine({ title, subtitle, data, unit = '', accent = c.accent }: { title:string;subtitle?:string;data:ChartPoint[];unit?:string;accent?:string }){
 const points=clean(data); const [width,setWidth]=useState(0); const height=142; const padX=10; const padY=16;
 if(!points.length)return <View style={s.card}><View style={s.head}><View style={s.headCopy}><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View></View><Text style={s.empty}>Not enough data yet. Keep logging activity and the graph will build automatically.</Text></View>;
 const values=points.map(p=>p.value); const rawMin=Math.min(...values); const rawMax=Math.max(...values); const rawRange=rawMax-rawMin;
 const padding=rawRange===0?Math.max(Math.abs(rawMax)*0.02,1):rawRange*0.12; const min=rawMin-padding; const max=rawMax+padding; const range=max-min||1;
 const plotW=Math.max(width-padX*2,1),plotH=height-padY*2;
 const pos=(i:number,v:number)=>({x:padX+(points.length===1?plotW/2:(i/(points.length-1))*plotW),y:padY+(1-(v-min)/range)*plotH});
 return <View style={s.card}>
  <View style={s.head}><View style={s.headCopy}><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View><Text style={s.total}>{formatValue(values[values.length-1])}{unit}</Text></View>
  <View style={s.chart} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
   <View style={s.gridTop}/><View style={s.gridMid}/><View style={s.gridBottom}/>
   {width>0&&points.map((p,i)=>{const a=pos(i,p.value);const n=points[i+1];const b=n?pos(i+1,n.value):a;const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy),angle=Math.atan2(dy,dx)*180/Math.PI;return <View key={p.label+i}>{n?<View style={[s.segment,{left:a.x,top:a.y,width:len,backgroundColor:accent,transform:[{rotate:angle+'deg'}]}]}/>:null}<View style={[s.dot,{left:a.x,top:a.y,backgroundColor:accent,borderColor:c.background}]}/>{(i===0||i===points.length-1)?<Text style={[s.pointValue,{left:Math.max(0,Math.min(width-42,a.x-21))}]}>{formatValue(p.value)}</Text>:null}<Text style={[s.xLabel,{left:Math.max(0,Math.min(width-34,a.x-17))}]}>{p.label}</Text></View>})}
  </View>
  <View style={s.axis}><Text style={s.axisText}>{formatValue(rawMin)}{unit}</Text><Text style={s.axisText}>{formatValue(rawMax)}{unit}</Text></View>
 </View>;
}

export function PerformanceBars({title,subtitle,data,unit='',accent=c.accent}:{title:string;subtitle?:string;data:ChartPoint[];unit?:string;accent?:string}){
 const points=clean(data);const max=Math.max(...points.map(x=>x.value),1);
 return <View style={s.card}><View style={s.head}><View style={s.headCopy}><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View>{points.length?<Text style={s.total}>{formatValue(points.reduce((a,b)=>a+b.value,0))}{unit}</Text>:null}</View>
 {!points.length?<Text style={s.empty}>Not enough data yet. Keep logging activity and the chart will build automatically.</Text>:<View style={s.barChart}>{points.map((p,i)=><View style={s.column} key={p.label+i}><Text style={s.value}>{formatValue(p.value)}{unit}</Text><View style={s.track}><View style={[s.bar,{height:Math.max(5,(p.value/max)*94),backgroundColor:accent}]}/></View><Text style={s.label}>{p.label}</Text></View>)}</View>}
 </View>;
}
export function ProgressRing({value,label,detail}:{value:number;label:string;detail:string}){const safe=Math.max(0,Math.min(100,value));return <View style={s.progressCard}><View style={s.ringOuter}><View style={s.ring}><Text style={s.percent}>{Math.round(safe)}%</Text></View></View><View style={s.progressCopy}><Text style={s.progressLabel}>{label}</Text><Text style={s.progressDetail}>{detail}</Text></View></View>;}

const s=StyleSheet.create({
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:16,gap:10},
 head:{flexDirection:'row',alignItems:'center',gap:10},headCopy:{flex:1},title:{color:c.text,fontSize:15,fontWeight:'900'},subtitle:{color:c.muted,fontSize:10,lineHeight:15,marginTop:2},total:{color:c.accentBright,fontSize:12,fontWeight:'900'},
 chart:{height:142,position:'relative',marginTop:3},gridTop:{position:'absolute',left:0,right:0,top:'12%',height:1,backgroundColor:c.border},gridMid:{position:'absolute',left:0,right:0,top:'50%',height:1,backgroundColor:c.border},gridBottom:{position:'absolute',left:0,right:0,top:'88%',height:1,backgroundColor:c.border},segment:{position:'absolute',height:3,borderRadius:3,transformOrigin:'left center'},dot:{position:'absolute',width:9,height:9,borderRadius:5,borderWidth:2,marginLeft:-4.5,marginTop:-4.5},pointValue:{position:'absolute',top:0,width:42,textAlign:'center',color:c.text,fontSize:7,fontWeight:'900'},xLabel:{position:'absolute',top:126,width:34,textAlign:'center',color:c.muted,fontSize:7,fontWeight:'800'},axis:{flexDirection:'row',justifyContent:'space-between'},axisText:{color:c.muted,fontSize:7,fontWeight:'800'},
 barChart:{height:145,flexDirection:'row',alignItems:'flex-end',gap:7,paddingTop:16},column:{flex:1,height:'100%',alignItems:'center',justifyContent:'flex-end',gap:4},value:{color:c.muted,fontSize:7,fontWeight:'800',height:10},track:{height:94,width:'72%',maxWidth:24,justifyContent:'flex-end',backgroundColor:c.backgroundElement,borderRadius:8,overflow:'hidden'},bar:{width:'100%',borderRadius:8,minHeight:4},label:{color:c.muted,fontSize:8,fontWeight:'800'},empty:{color:c.muted,fontSize:11,lineHeight:17,paddingVertical:14},
 progressCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:16,flexDirection:'row',alignItems:'center',gap:14},ringOuter:{width:76,height:76,borderRadius:38,borderWidth:7,borderColor:c.border,alignItems:'center',justifyContent:'center',backgroundColor:c.accentSoft},ring:{width:58,height:58,borderRadius:29,borderWidth:5,borderColor:c.accent,alignItems:'center',justifyContent:'center'},percent:{color:c.text,fontSize:16,fontWeight:'900'},progressCopy:{flex:1},progressLabel:{color:c.text,fontSize:14,fontWeight:'900'},progressDetail:{color:c.muted,fontSize:11,lineHeight:16,marginTop:3}
});
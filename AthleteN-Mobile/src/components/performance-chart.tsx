import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export type ChartPoint = { label: string; value: number };

export function PerformanceLine({ title, subtitle, data, unit = '', accent = c.accent }: { title: string; subtitle?: string; data: ChartPoint[]; unit?: string; accent?: string }) {
  const values = data.map(x => Number(x.value) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.headCopy}><Text style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
        {data.length ? <Text style={s.total}>{formatValue(values[values.length - 1])}{unit}</Text> : null}
      </View>
      {!data.length ? <Text style={s.empty}>Not enough data yet. Keep logging activity and the graph will build automatically.</Text> : (
        <View style={s.lineChart}>
          <View style={s.gridLineTop}/><View style={s.gridLineMid}/><View style={s.gridLineBottom}/>
          {data.map((point, index) => {
            const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
            const y = 88 - ((Number(point.value) - min) / range) * 72;
            const next = data[index + 1];
            const nx = next ? (data.length === 1 ? 50 : ((index + 1) / (data.length - 1)) * 100) : x;
            const ny = next ? 88 - ((Number(next.value) - min) / range) * 72 : y;
            const dx = nx - x;
            const dy = ny - y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return (
              <View key={point.label + index}>
                {next ? <View style={[s.segment,{left: x + '%', top: y + '%', width: length + '%', backgroundColor: accent, transform:[{rotate: angle + 'deg'}]}]} /> : null}
                <View style={[s.dot,{left:x + '%',top:y + '%',backgroundColor:accent,borderColor:c.background}]} />
                <Text style={[s.xLabel,{left:x + '%'}]}>{point.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function PerformanceBars({ title, subtitle, data, unit = '', accent = c.accent }: { title: string; subtitle?: string; data: ChartPoint[]; unit?: string; accent?: string }) {
  const max = Math.max(...data.map(x => x.value), 1);
  return (
    <View style={s.card}>
      <View style={s.head}><View style={s.headCopy}><Text style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>{data.length ? <Text style={s.total}>{Math.round(data.reduce((a,b)=>a+b.value,0))}{unit}</Text> : null}</View>
      {!data.length ? <Text style={s.empty}>Not enough data yet. Keep logging activity and the chart will build automatically.</Text> : (
        <View style={s.chart}>
          {data.map((point,index)=><View style={s.column} key={point.label+index}><Text style={s.value}>{point.value>0?formatValue(point.value)+unit:''}</Text><View style={s.track}><View style={[s.bar,{height:Math.max(7,Math.round((point.value/max)*94)),backgroundColor:accent}]}/></View><Text style={s.label}>{point.label}</Text></View>)}
        </View>
      )}
    </View>
  );
}

export function ProgressRing({ value, label, detail }: { value: number; label: string; detail: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <View style={s.progressCard}><View style={s.ringOuter}><View style={s.ring}><Text style={s.percent}>{Math.round(safe)}%</Text></View></View><View style={s.progressCopy}><Text style={s.progressLabel}>{label}</Text><Text style={s.progressDetail}>{detail}</Text></View></View>;
}

function formatValue(value:number){return Number.isInteger(value)?String(value):value.toFixed(1)}

const s=StyleSheet.create({
 card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:16,gap:10},
 head:{flexDirection:'row',alignItems:'center',gap:10},headCopy:{flex:1},title:{color:c.text,fontSize:15,fontWeight:'900'},subtitle:{color:c.muted,fontSize:10,lineHeight:15,marginTop:2},total:{color:c.accentBright,fontSize:12,fontWeight:'900'},
 lineChart:{height:150,marginTop:3,position:'relative',overflow:'hidden'},gridLineTop:{position:'absolute',left:0,right:0,top:'15%',height:1,backgroundColor:c.border},gridLineMid:{position:'absolute',left:0,right:0,top:'50%',height:1,backgroundColor:c.border},gridLineBottom:{position:'absolute',left:0,right:0,top:'88%',height:1,backgroundColor:c.border},
 segment:{position:'absolute',height:3,borderRadius:3,transformOrigin:'left center'},dot:{position:'absolute',width:9,height:9,borderRadius:5,borderWidth:2,marginLeft:-4,marginTop:-4},xLabel:{position:'absolute',top:'93%',transform:[{translateX:-12}],color:c.muted,fontSize:7,fontWeight:'800',width:28,textAlign:'center'},
 chart:{height:145,flexDirection:'row',alignItems:'flex-end',gap:7,paddingTop:16},column:{flex:1,height:'100%',alignItems:'center',justifyContent:'flex-end',gap:4},value:{color:c.muted,fontSize:7,fontWeight:'800',height:10},track:{height:94,width:'72%',maxWidth:24,justifyContent:'flex-end',backgroundColor:c.backgroundElement,borderRadius:8,overflow:'hidden'},bar:{width:'100%',borderRadius:8,minHeight:4},label:{color:c.muted,fontSize:8,fontWeight:'800'},
 empty:{color:c.muted,fontSize:11,lineHeight:17,paddingVertical:14},progressCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:22,padding:16,flexDirection:'row',alignItems:'center',gap:14},ringOuter:{width:76,height:76,borderRadius:38,borderWidth:7,borderColor:c.border,alignItems:'center',justifyContent:'center',backgroundColor:c.accentSoft},ring:{width:58,height:58,borderRadius:29,borderWidth:5,borderColor:c.accent,alignItems:'center',justifyContent:'center'},percent:{color:c.text,fontSize:16,fontWeight:'900'},progressCopy:{flex:1},progressLabel:{color:c.text,fontSize:14,fontWeight:'900'},progressDetail:{color:c.muted,fontSize:11,lineHeight:16,marginTop:3}
});
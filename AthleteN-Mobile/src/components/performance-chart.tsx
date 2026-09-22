import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export type ChartPoint = { label: string; value: number };

export function PerformanceBars({ title, subtitle, data, unit = '', accent = c.accent }: { title: string; subtitle?: string; data: ChartPoint[]; unit?: string; accent?: string }) {
  const max = Math.max(...data.map(x => x.value), 1);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {data.length ? <Text style={s.total}>{Math.round(data.reduce((a, b) => a + b.value, 0))}{unit}</Text> : null}
      </View>
      {!data.length ? <Text style={s.empty}>Not enough data yet. Keep logging activity and the chart will build automatically.</Text> : (
        <View style={s.chart}>
          {data.map((point, index) => {
            const height = Math.max(8, Math.round((point.value / max) * 94));
            return (
              <View style={s.column} key={point.label + index}>
                <Text style={s.value}>{point.value > 0 ? Math.round(point.value) + unit : ''}</Text>
                <View style={s.track}><View style={[s.bar, { height, backgroundColor: accent }]} /></View>
                <Text style={s.label}>{point.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function ProgressRing({ value, label, detail }: { value: number; label: string; detail: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <View style={s.progressCard}>
      <View style={s.ring}><View style={s.ringInner}><Text style={s.percent}>{Math.round(safe)}%</Text></View></View>
      <View style={{ flex: 1 }}>
        <Text style={s.progressLabel}>{label}</Text>
        <Text style={s.progressDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:15,gap:10},
  head:{flexDirection:'row',alignItems:'center',gap:10},
  title:{color:c.text,fontSize:15,fontWeight:'900'},
  subtitle:{color:c.muted,fontSize:10,lineHeight:15,marginTop:2},
  total:{color:c.accentBright,fontSize:12,fontWeight:'900'},
  chart:{height:145,flexDirection:'row',alignItems:'flex-end',gap:7,paddingTop:16},
  column:{flex:1,height:'100%',alignItems:'center',justifyContent:'flex-end',gap:4},
  value:{color:c.muted,fontSize:7,fontWeight:'800',height:10},
  track:{height:94,width:'72%',maxWidth:24,justifyContent:'flex-end',backgroundColor:c.backgroundElement,borderRadius:8,overflow:'hidden'},
  bar:{width:'100%',borderRadius:8,minHeight:4},
  label:{color:c.muted,fontSize:8,fontWeight:'800'},
  empty:{color:c.muted,fontSize:11,lineHeight:17,paddingVertical:14},
  progressCard:{backgroundColor:c.surface,borderWidth:1,borderColor:c.borderStrong,borderRadius:20,padding:15,flexDirection:'row',alignItems:'center',gap:14},
  ring:{width:68,height:68,borderRadius:34,borderWidth:7,borderColor:c.accent,alignItems:'center',justifyContent:'center',backgroundColor:c.accentSoft},
  ringInner:{alignItems:'center',justifyContent:'center'},
  percent:{color:c.text,fontSize:16,fontWeight:'900'},
  progressLabel:{color:c.text,fontSize:14,fontWeight:'900'},
  progressDetail:{color:c.muted,fontSize:11,lineHeight:16,marginTop:3},
});

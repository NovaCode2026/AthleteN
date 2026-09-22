import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

const c = Colors.dark;

export type ChartPoint = {
  label: string;
  value: number;
};

const clean = (data: ChartPoint[]) =>
  data
    .map((x) => ({
      label: String(x.label),
      value: Number(x.value),
    }))
    .filter((x) => Number.isFinite(x.value) && x.value >= 0);

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function PerformanceLine({
  title,
  subtitle,
  data,
  unit = '',
  accent = c.accent,
}: {
  title: string;
  subtitle?: string;
  data: ChartPoint[];
  unit?: string;
  accent?: string;
}) {
  const points = clean(data);
  const [width, setWidth] = useState(0);

  const H = 158;
  const L = 14;
  const R = 14;
  const T = 25;
  const B = 30;

  if (!points.length) {
    return (
      <View style={s.card}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <Text style={s.empty}>No valid data yet.</Text>
      </View>
    );
  }

  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const raw = hi - lo;
  const pad = raw ? raw * 0.12 : Math.max(hi * 0.15, 1);
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const span = max - min || 1;

  const plotW = Math.max(1, width - L - R);
  const plotH = H - T - B;

  const pos = (i: number, v: number) => ({
    x:
      L +
      (points.length === 1
        ? plotW / 2
        : (i / (points.length - 1)) * plotW),
    y: T + (1 - (v - min) / span) * plotH,
  });

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        <Text style={s.total}>
          {fmt(vals[vals.length - 1])}
          {unit}
        </Text>
      </View>

      <View
        style={s.chart}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={[s.grid, { top: T }]} />
        <View style={[s.grid, { top: T + plotH / 2 }]} />
        <View style={[s.grid, { top: T + plotH }]} />

        {width > 0 &&
          points.map((p, i) => {
            const a = pos(i, p.value);
            const next = points[i + 1];
            const b = next ? pos(i + 1, next.value) : null;

            let line: React.ReactNode = null;

            if (b) {
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const length = Math.hypot(dx, dy);
              const angle = `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`;

              line = (
                <View
                  style={[
                    s.segment,
                    {
                      left: a.x,
                      top: a.y,
                      width: length,
                      backgroundColor: accent,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            }

            const pointLeft = Math.max(
              0,
              Math.min(width - 44, a.x - 22)
            );

            return (
              <View key={`${p.label}-${i}`}>
                {line}

                <View
                  style={[
                    s.dot,
                    {
                      left: a.x,
                      top: a.y,
                      backgroundColor: accent,
                      borderColor: c.background,
                    },
                  ]}
                />

                {(i === 0 || i === points.length - 1) && (
                  <Text style={[s.point, { left: pointLeft }]}>
                    {fmt(p.value)}
                    {unit}
                  </Text>
                )}

                <Text
                  style={[s.x, { left: pointLeft }]}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
              </View>
            );
          })}
      </View>

      <View style={s.axis}>
        <Text style={s.axisText}>
          {fmt(lo)}
          {unit}
        </Text>
        <Text style={s.axisText}>
          {fmt(hi)}
          {unit}
        </Text>
      </View>
    </View>
  );
}

export function PerformanceBars({
  title,
  subtitle,
  data,
  unit = '',
  accent = c.accent,
}: {
  title: string;
  subtitle?: string;
  data: ChartPoint[];
  unit?: string;
  accent?: string;
}) {
  const points = clean(data);
  const max = Math.max(...points.map((x) => x.value), 1);
  const total = points.reduce((a, b) => a + b.value, 0);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        {points.length ? (
          <Text style={s.total}>
            {fmt(total)}
            {unit}
          </Text>
        ) : null}
      </View>

      {points.length ? (
        <View style={s.bars}>
          {points.map((p, i) => (
            <View style={s.col} key={`${p.label}-${i}`}>
              <Text style={s.value}>
                {fmt(p.value)}
                {unit}
              </Text>

              <View style={s.track}>
                <View
                  style={[
                    s.bar,
                    {
                      height: p.value
                        ? Math.max(4, (p.value / max) * 92)
                        : 1,
                      backgroundColor: accent,
                    },
                  ]}
                />
              </View>

              <Text style={s.label} numberOfLines={1}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.empty}>No valid data yet.</Text>
      )}
    </View>
  );
}

export function ProgressRing({
  value,
  label,
  detail,
}: {
  value: number;
  label: string;
  detail: string;
}) {
  const safe = Math.max(0, Math.min(100, value));

  return (
    <View style={s.progress}>
      <View style={s.ringOuter}>
        <View style={s.ring}>
          <Text style={s.percent}>{Math.round(safe)}%</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.progressLabel}>{label}</Text>
        <Text style={s.progressDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 22,
    padding: 16,
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: c.text,
    fontSize: 15,
    fontWeight: '900',
  },
  subtitle: {
    color: c.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  total: {
    color: c.accentBright,
    fontSize: 12,
    fontWeight: '900',
  },
  chart: {
    height: 158,
    position: 'relative',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: c.border,
  },
  segment: {
    position: 'absolute',
    height: 3,
    borderRadius: 3,
  },
  dot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    marginLeft: -4.5,
    marginTop: -4.5,
  },
  point: {
    position: 'absolute',
    top: 5,
    width: 44,
    textAlign: 'center',
    color: c.text,
    fontSize: 7,
    fontWeight: '900',
  },
  x: {
    position: 'absolute',
    top: 136,
    width: 44,
    textAlign: 'center',
    color: c.muted,
    fontSize: 7,
    fontWeight: '800',
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {
    color: c.muted,
    fontSize: 7,
    fontWeight: '800',
  },
  empty: {
    color: c.muted,
    fontSize: 11,
    lineHeight: 17,
    paddingVertical: 15,
  },
  bars: {
    height: 148,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 10,
  },
  col: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  value: {
    color: c.muted,
    fontSize: 7,
    fontWeight: '800',
    height: 11,
  },
  track: {
    height: 92,
    width: '70%',
    maxWidth: 24,
    justifyContent: 'flex-end',
    backgroundColor: c.backgroundElement,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 8,
  },
  label: {
    color: c.muted,
    fontSize: 8,
    fontWeight: '800',
  },
  progress: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 7,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentSoft,
  },
  ring: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    color: c.text,
    fontSize: 16,
    fontWeight: '900',
  },
  progressLabel: {
    color: c.text,
    fontSize: 14,
    fontWeight: '900',
  },
  progressDetail: {
    color: c.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
});
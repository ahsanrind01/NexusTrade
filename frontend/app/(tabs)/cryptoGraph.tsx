import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, TextInput, KeyboardAvoidingView, Platform,
  PanResponder, GestureResponderEvent, PanResponderGestureState,
  InteractionManager,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withTiming, withSequence, withRepeat, interpolate, Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
// useIsFocused comes from @react-navigation/native, which expo-router is
// built on top of. It's what lets us pause the pulsing "LIVE" dot animation
// when this screen isn't the one on screen (see PulseDot below).
import { useIsFocused } from '@react-navigation/native';
import { FontFamily, FontSize } from '../../constants/typography';
import { useMarketStore } from '../../stores/marketStore';
import { useMarketSocket } from '../../hooks/useMarketSocket';
import { useAuthStore } from '../../stores/authStore';

let BlurView: any = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

// Dimensions.get is called once at module load, not inside the component,
// so it never re-runs on re-render (it also doesn't respond to runtime
// orientation changes, but that was already true of the original code —
// preserved as-is, not a behavior change).
const { width } = Dimensions.get('window');

const CHART_H = 220;
const CHART_PAD = 18;
// Hoisted to module scope: width/CHART_PAD never change at runtime, so this
// only needs to be computed once for the whole app lifetime instead of on
// every render of every chart component that needs it (both the line chart
// and the candlestick chart use the same width).
const CHART_W = width - 36 - CHART_PAD * 2;

// ---------------------------------------------------------------------------
// NOTE ON WIRING THIS SCREEN UP
// ---------------------------------------------------------------------------
// 1. This assumes expo-router (file at app/(tabs)/cryptoGraph.tsx per your
//    setup). Swap useLocalSearchParams()/useRouter() for React Navigation's
//    useRoute()/useNavigation() if you switch later.
// 2. API_BASE points at the API Gateway (port 3000). Update it if you have
//    a shared axios/fetch client elsewhere.
// 3. Token field: assumes useAuthStore exposes `token`. Rename if different.
// 4. useIsFocused requires @react-navigation/native, which expo-router
//    depends on internally — if it's not resolvable in your project, add it
//    as a direct dependency (`npx expo install @react-navigation/native`).
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:3000/api';

// ---- theme tokens, copied 1:1 from Home so this screen matches exactly ----
const T = {
  bg0: '#06070A',
  bg1: '#0A0C11',
  glass: 'rgba(255,255,255,0.035)',
  glassUp: 'rgba(255,255,255,0.055)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderHi: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(255,255,255,0.06)',
  accent: '#7C8AFF',
  accentDeep: '#5B63E8',
  violet: '#B583FF',
  cyan: '#5EE7E7',
  gain: '#3DDC97',
  gainDim: 'rgba(61,220,151,0.10)',
  loss: '#FF6B7A',
  lossDim: 'rgba(255,107,122,0.10)',
  gold: '#E8B656',
  textPri: '#F4F5F7',
  textSec: '#9499A8',
  textTer: '#5B6072',
};

const SYMBOL_META: Record<string, { name: string; short: string; color: string }> = {
  BTCUSDT: { name: 'Bitcoin', short: 'BTC', color: '#F7931A' },
  ETHUSDT: { name: 'Ethereum', short: 'ETH', color: '#8FA3FF' },
  BNBUSDT: { name: 'BNB', short: 'BNB', color: '#F3BA2F' },
  SOLUSDT: { name: 'Solana', short: 'SOL', color: '#B583FF' },
  XRPUSDT: { name: 'XRP', short: 'XRP', color: '#5EC8F2' },
  ADAUSDT: { name: 'Cardano', short: 'ADA', color: '#5C7CFA' },
  DOGEUSDT: { name: 'Dogecoin', short: 'DOGE', color: '#E0C354' },
  AVAXUSDT: { name: 'Avalanche', short: 'AVAX', color: '#F06A6E' },
  DOTUSDT: { name: 'Polkadot', short: 'DOT', color: '#F25CA8' },
  LINKUSDT: { name: 'Chainlink', short: 'LINK', color: '#6D8DF2' },
  MATICUSDT: { name: 'Polygon', short: 'MATIC', color: '#A87DF0' },
  UNIUSDT: { name: 'Uniswap', short: 'UNI', color: '#FF66A8' },
  LTCUSDT: { name: 'Litecoin', short: 'LTC', color: '#C9C9CE' },
  BCHUSDT: { name: 'Bitcoin Cash', short: 'BCH', color: '#9FDB81' },
  SHIBUSDT: { name: 'Shiba Inu', short: 'SHIB', color: '#F2A94D' },
  NEARUSDT: { name: 'NEAR', short: 'NEAR', color: '#5CDDB0' },
  APTUSDT: { name: 'Aptos', short: 'APT', color: '#5CECBF' },
  FILUSDT: { name: 'Filecoin', short: 'FIL', color: '#5EB3FF' },
  RNDRUSDT: { name: 'Render', short: 'RNDR', color: '#F2895E' },
  ATOMUSDT: { name: 'Cosmos', short: 'ATOM', color: '#8E96C2' },
};

type Period = '1H' | '1D' | '1W' | '1M' | '1Y';
const PERIODS: { key: Period; interval: string; limit: number }[] = [
  { key: '1H', interval: '1m', limit: 60 },
  { key: '1D', interval: '15m', limit: 96 },
  { key: '1W', interval: '1h', limit: 168 },
  { key: '1M', interval: '4h', limit: 180 },
  { key: '1Y', interval: '1w', limit: 52 },
];

type Side = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT';

// Pure, prop/state-free helper — hoisted OUT of the component so it's
// created exactly once for the whole app lifetime instead of being
// redefined as a brand-new function on every render of CoinDetail
// (a fresh function identity per render is cheap by itself, but it's
// unnecessary allocation for a function that closes over nothing).
function formatVolume(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Shared small components (same visual language as Home)
// ---------------------------------------------------------------------------

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28, tint = 'dark' }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,15,20,0.45)' }]} />
        {children}
      </View>
    );
  }
  return (
    <View style={[style, { backgroundColor: T.glassUp, overflow: 'hidden' }]}>
      {children}
    </View>
  );
});

// PulseDot now stops its infinite withRepeat loop whenever this screen isn't
// focused (e.g. the user navigated to another tab/screen but this one is
// still mounted in the stack) and whenever it unmounts. Reanimated's
// withRepeat(..., -1, ...) runs forever on the UI thread until explicitly
// cancelled — left unchecked, every backgrounded instance of this dot is
// still scheduling frame callbacks for no visible benefit, which costs
// battery/CPU for zero user-facing value. cancelAnimation() stops that
// scheduling immediately; restarting it on refocus costs nothing since the
// animation is cheap to (re)start.
const PulseDot = memo(function PulseDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      return;
    }
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1100 }), withTiming(1, { duration: 0 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1100 }), withTiming(0.9, { duration: 0 })), -1, false);

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [isFocused]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, position: 'absolute' }, ringStyle]} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// AmbientField — the same drifting background orbs used on Home, so this
// screen doesn't feel visually disconnected from the rest of the app.
// ---------------------------------------------------------------------------

function AmbientField() {
  const drift = useSharedValue(0);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      // Same reasoning as PulseDot: don't keep an infinite withRepeat loop
      // scheduling UI-thread work while this screen is backgrounded.
      cancelAnimation(drift);
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [isFocused]);

  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-12, 14]) },
      { translateY: interpolate(drift.value, [0, 1], [-8, 10]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [10, -16]) },
      { translateY: interpolate(drift.value, [0, 1], [6, -12]) },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -80, left: -60, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 140, right: -100, backgroundColor: T.violet, opacity: 0.10 }, orb2]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Price chart — same "rotated line segment" trick as Home's Sparkline, just
// bigger, with a scrub gesture so touching/dragging shows price + time.
// ---------------------------------------------------------------------------

function PriceChartBase({
  points,
  labels,
  positive,
}: {
  points: number[];
  labels: string[];
  positive: boolean;
}) {
  const chartW = CHART_W;
  const [scrub, setScrub] = useState<{ x: number; index: number } | null>(null);

  const { segments, max, min } = useMemo(() => {
    if (points.length < 2) return { segments: null as any, max: 0, min: 0 };
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const step = chartW / (points.length - 1);
    const segs = points.slice(0, -1).map((p, i) => {
      const x1 = i * step;
      const y1 = CHART_H - ((p - min) / range) * CHART_H;
      const x2 = (i + 1) * step;
      const y2 = CHART_H - ((points[i + 1] - min) / range) * CHART_H;
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      return { x1, y1, length, angle };
    });
    return { segments: segs, max, min };
  }, [points, chartW]);
  // ^ Already memoized in the original code — kept as-is. This is the
  // expensive part (trig per point), and it now only reruns when `points`
  // itself changes identity, which only happens when a new period's kline
  // data arrives (see the fetch effect below), not on every re-render.

  // --- Fresh-data refs for the PanResponder -------------------------------
  // PanResponder.create(...) builds a small internal gesture state machine
  // and its handler closures capture whatever values are in scope AT THE
  // MOMENT they're created. The original code called PanResponder.create()
  // fresh on every render (only the *first* render's result was ever kept,
  // via useRef(...).current), which had two costs:
  //   1. Perf: a brand-new PanResponder object + closures were allocated
  //      every single render and immediately discarded.
  //   2. Correctness: onPanResponderMove's closure kept referencing the
  //      `points`/`chartW` from the FIRST render forever — so scrubbing
  //      after switching chart periods would silently use stale/wrong data.
  // Fix: create the PanResponder exactly once (useMemo with no deps) and
  // have its handlers read the *latest* points/chartW through refs that we
  // keep in sync via an effect. This removes the repeated allocation and
  // fixes the staleness in one move.
  const pointsRef = useRef(points);
  const chartWRef = useRef(chartW);
  const hasSegmentsRef = useRef(!!segments);
  useEffect(() => {
    pointsRef.current = points;
    chartWRef.current = chartW;
    hasSegmentsRef.current = !!segments;
  }, [points, chartW, segments]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          if (!hasSegmentsRef.current) return;
          const w = chartWRef.current;
          const pts = pointsRef.current;
          const localX = Math.max(0, Math.min(w, g.moveX - CHART_PAD - 18));
          const step = w / (pts.length - 1);
          const index = Math.round(localX / step);
          setScrub({ x: index * step, index: Math.max(0, Math.min(pts.length - 1, index)) });
        },
        onPanResponderRelease: () => setScrub(null),
        onPanResponderTerminate: () => setScrub(null),
      }),
    []
  );

  // The line itself (up to ~180 absolutely-positioned Views) is rendered
  // into a memoized element array that only recomputes when `segments` or
  // `positive` change. Without this, every scrub touch-move (many per
  // second while dragging) would call `.map()` again and build brand-new
  // style objects for EVERY segment just to update the small scrub
  // dot/line — forcing React to redo prop-diffing across the whole line on
  // each finger movement. Because these are plain (non-memoized) host
  // Views, React skips re-sending a prop to native entirely when the style
  // object reference is unchanged, so keeping this array stable during a
  // scrub gesture avoids that native-bridge churn — this is the single
  // biggest win for keeping the scrub gesture smooth.
  const segmentElements = useMemo(() => {
    if (!segments) return null;
    const color = positive ? T.gain : T.loss;
    return segments.map((s: any, i: number) => (
      <View
        key={i}
        style={{
          position: 'absolute', left: s.x1, top: s.y1,
          width: s.length, height: 2,
          backgroundColor: color, borderRadius: 1,
          transform: [{ rotate: `${s.angle}deg` }],
          transformOrigin: '0 0',
        }}
      />
    ));
  }, [segments, positive]);

  // Static gridline styles never change once the chart height constant is
  // fixed, so build them once per mounted chart instead of recreating three
  // small style arrays on every render.
  const gridLineStyles = useMemo(
    () => [
      [styles.gridLine, { top: 0 }],
      [styles.gridLine, { top: CHART_H / 2 }],
      [styles.gridLine, { top: CHART_H - 1 }],
    ],
    []
  );
  const chartEmptyStyle = useMemo(() => [styles.chartEmpty, { height: CHART_H }], []);

  if (!segments) {
    return (
      <View style={chartEmptyStyle}>
        <Text style={styles.chartEmptyText}>Loading chart…</Text>
      </View>
    );
  }

  const color = positive ? T.gain : T.loss;
  const scrubPrice = scrub ? points[scrub.index] : null;
  const scrubLabel = scrub ? labels[scrub.index] : null;

  return (
    <View {...panResponder.panHandlers}>
      <View style={styles.chartLabelsRow}>
        <Text style={styles.chartMaxLabel}>{max.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      </View>

      <View style={{ width: chartW, height: CHART_H, marginLeft: CHART_PAD }}>
        {/* gridlines */}
        <View style={gridLineStyles[0] as any} />
        <View style={gridLineStyles[1] as any} />
        <View style={gridLineStyles[2] as any} />

        {segmentElements}

        {scrub && scrubPrice !== null && (
          <>
            <View style={[styles.scrubLine, { left: scrub.x }]} />
            <View
              style={[
                styles.scrubDot,
                { left: scrub.x - 5, top: CHART_H - ((scrubPrice - min) / (max - min || 1)) * CHART_H - 5, borderColor: color },
              ]}
            />
          </>
        )}
      </View>

      <View style={styles.chartLabelsRow}>
        <Text style={styles.chartMinLabel}>{min.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      </View>

      {scrub && scrubPrice !== null && (
        <Animated.View entering={FadeIn.duration(120)} style={styles.scrubTooltip}>
          <Text style={styles.scrubTooltipPrice}>${scrubPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
          <Text style={styles.scrubTooltipTime}>{scrubLabel}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// Wrapped in memo with the DEFAULT shallow prop comparator. Since `points`
// and `labels` are arrays, the default comparator already compares them by
// reference (Object.is), which is exactly what we want: as long as the
// parent's `candles` state object hasn't changed (i.e. no new period/kline
// fetch resolved), `candles.closes`/`candles.labels` keep the same array
// reference across re-renders, so this whole component — and all the work
// inside it — is skipped entirely when the parent re-renders for unrelated
// reasons (e.g. a live price tick updating the header text).
const PriceChart = memo(PriceChartBase);

const ChartPeriodTabs = memo(function ChartPeriodTabs({
  active, onChange,
}: { active: Period; onChange: (p: Period) => void }) {
  return (
    <View style={styles.periodTabsRow}>
      {PERIODS.map((p) => (
        <TouchableOpacity key={p.key} onPress={() => onChange(p.key)} style={[styles.periodTab, active === p.key && styles.periodTabActive]}>
          <Text style={[styles.periodTabText, active === p.key && styles.periodTabTextActive]}>{p.key}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});
// ^ Already memoized, and `onChange` is `setPeriod` passed straight from
// useState — React guarantees state setter identity is stable across
// renders, so this never re-renders unless `active` itself changes. No
// further change needed here.

// ---------------------------------------------------------------------------
// Candlestick chart — OHLC bars (wick = high/low, body = open/close),
// built with the same plain-View technique as the line chart (no svg/Skia
// dependency added), same scrub-to-inspect gesture, same perf approach:
// geometry + rendered elements are memoized so a scrub touch-move only
// updates the crosshair/tooltip, never rebuilds all the candle Views.
// ---------------------------------------------------------------------------

function CandlestickChartBase({
  open, high, low, close, labels, positive,
}: { open: number[]; high: number[]; low: number[]; close: number[]; labels: string[]; positive: boolean }) {
  const [scrub, setScrub] = useState<number | null>(null); // candle index

  const { candles, max, min } = useMemo(() => {
    const n = close.length;
    if (n < 1) return { candles: null as any, max: 0, min: 0 };
    const max = Math.max(...high);
    const min = Math.min(...low);
    const range = max - min || 1;
    const slot = CHART_W / n;
    const bodyW = Math.max(2, slot * 0.6);
    const list = close.map((c, i) => {
      const o = open[i];
      const h = high[i];
      const l = low[i];
      const cx = i * slot + slot / 2;
      const yHigh = CHART_H - ((h - min) / range) * CHART_H;
      const yLow = CHART_H - ((l - min) / range) * CHART_H;
      const yOpen = CHART_H - ((o - min) / range) * CHART_H;
      const yClose = CHART_H - ((c - min) / range) * CHART_H;
      const bullish = c >= o;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
      return { cx, yHigh, yLow, bodyTop, bodyHeight, bodyW, bullish, slot };
    });
    return { candles: list, max, min };
  }, [open, high, low, close]);

  // Same ref-based fix/optimization as the line chart's PanResponder: build
  // it once and read fresh geometry through refs instead of recreating it
  // (and re-closing over stale data) on every render.
  const candlesRef = useRef(candles);
  const slotRef = useRef(candles?.[0]?.slot ?? 1);
  useEffect(() => {
    candlesRef.current = candles;
    slotRef.current = candles?.[0]?.slot ?? 1;
  }, [candles]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const list = candlesRef.current;
          if (!list) return;
          const localX = Math.max(0, Math.min(CHART_W, g.moveX - CHART_PAD - 18));
          const index = Math.max(0, Math.min(list.length - 1, Math.floor(localX / slotRef.current)));
          setScrub(index);
        },
        onPanResponderRelease: () => setScrub(null),
        onPanResponderTerminate: () => setScrub(null),
      }),
    []
  );

  // Wicks + bodies for every candle, memoized so a scrub drag (which only
  // changes the small crosshair/tooltip below) doesn't rebuild ~100+ View
  // style objects on every touch-move frame — same reasoning as the line
  // chart's `segmentElements`.
  const candleElements = useMemo(() => {
    if (!candles) return null;
    return candles.map((c: any, i: number) => {
      const color = c.bullish ? T.gain : T.loss;
      return (
        <View key={i} style={{ position: 'absolute', left: c.cx - c.bodyW / 2, top: 0, width: c.bodyW, height: CHART_H }}>
          <View style={{ position: 'absolute', left: c.bodyW / 2 - 0.75, top: c.yHigh, width: 1.5, height: Math.max(1, c.yLow - c.yHigh), backgroundColor: color, opacity: 0.7 }} />
          <View style={{ position: 'absolute', left: 0, top: c.bodyTop, width: c.bodyW, height: c.bodyHeight, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );
    });
  }, [candles]);

  const chartEmptyStyle = useMemo(() => [styles.chartEmpty, { height: CHART_H }], []);

  if (!candles) {
    return (
      <View style={chartEmptyStyle}>
        <Text style={styles.chartEmptyText}>Loading chart…</Text>
      </View>
    );
  }

  const scrubCandle = scrub !== null ? candles[scrub] : null;
  const scrubOhlc = scrub !== null ? { o: open[scrub], h: high[scrub], l: low[scrub], c: close[scrub] } : null;

  return (
    <View {...panResponder.panHandlers}>
      <View style={styles.chartLabelsRow}>
        <Text style={styles.chartMaxLabel}>{max.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      </View>

      <View style={{ width: CHART_W, height: CHART_H, marginLeft: CHART_PAD }}>
        <View style={[styles.gridLine, { top: 0 }]} />
        <View style={[styles.gridLine, { top: CHART_H / 2 }]} />
        <View style={[styles.gridLine, { top: CHART_H - 1 }]} />

        {candleElements}

        {scrubCandle && (
          <View style={[styles.scrubLine, { left: scrubCandle.cx }]} />
        )}
      </View>

      <View style={styles.chartLabelsRow}>
        <Text style={styles.chartMinLabel}>{min.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      </View>

      {scrubOhlc && (
        <Animated.View entering={FadeIn.duration(120)} style={styles.scrubTooltip}>
          <View style={styles.ohlcRow}>
            <Text style={styles.ohlcLabel}>O <Text style={styles.ohlcValue}>{scrubOhlc.o.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
            <Text style={styles.ohlcLabel}>H <Text style={styles.ohlcValue}>{scrubOhlc.h.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
            <Text style={styles.ohlcLabel}>L <Text style={styles.ohlcValue}>{scrubOhlc.l.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
            <Text style={styles.ohlcLabel}>C <Text style={styles.ohlcValue}>{scrubOhlc.c.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
          </View>
          <Text style={styles.scrubTooltipTime}>{labels[scrub!]}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// Default shallow-compare memo: `open`/`high`/`low`/`close`/`labels` are
// arrays sourced from the same `candles` state object as the line chart, so
// they keep stable references across unrelated re-renders (e.g. a live
// price tick) and this component is skipped entirely just like PriceChart.
const CandlestickChart = memo(CandlestickChartBase);

const ChartTypeToggle = memo(function ChartTypeToggle({
  active, onChange,
}: { active: 'candles' | 'line'; onChange: (t: 'candles' | 'line') => void }) {
  return (
    <View style={styles.chartTypeRow}>
      <TouchableOpacity onPress={() => onChange('candles')} style={[styles.chartTypeBtn, active === 'candles' && styles.chartTypeBtnActive]}>
        <Text style={[styles.chartTypeText, active === 'candles' && styles.chartTypeTextActive]}>Candles</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onChange('line')} style={[styles.chartTypeBtn, active === 'line' && styles.chartTypeBtnActive]}>
        <Text style={[styles.chartTypeText, active === 'line' && styles.chartTypeTextActive]}>Line</Text>
      </TouchableOpacity>
    </View>
  );
});

const StatCell = memo(function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCell2}>
      <Text style={styles.statCell2Label}>{label}</Text>
      <Text style={[styles.statCell2Value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Trade panel — buy/sell, market/limit, quick %, place order
// ---------------------------------------------------------------------------

function TradePanelBase({
  symbol, meta, livePrice, token,
}: { symbol: string; meta: { short: string }; livePrice: number; token?: string }) {
  const [side, setSide] = useState<Side>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    // AbortController cancels the in-flight request if `token` changes or
    // the panel unmounts before the response arrives — otherwise a slow
    // response could resolve after unmount and call setState on a dead
    // component (React warning + wasted JSON parsing for a result nobody
    // will ever see).
    const controller = new AbortController();
    fetch(`${API_BASE}/wallet/balance`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setBalances(d.balance ?? {}); })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  // All the per-render arithmetic (effective price, balances lookup, max
  // amount, estimated total) is grouped into one memo so it's recomputed
  // only when an input that actually affects it changes — not on every
  // render of this component (e.g. not when `submitting` toggles, which
  // used to recompute all of this for no reason since it was inline).
  const derived = useMemo(() => {
    const effectivePrice = orderType === 'MARKET' ? livePrice : (parseFloat(limitPrice) || 0);
    const baseAsset = meta.short;
    const quoteBalance = parseFloat(balances['USDT'] ?? '0');
    const baseBalance = parseFloat(balances[baseAsset] ?? '0');
    const maxAmount = side === 'BUY'
      ? (effectivePrice > 0 ? quoteBalance / effectivePrice : 0)
      : baseBalance;
    const total = (parseFloat(amount) || 0) * effectivePrice;
    return { effectivePrice, baseAsset, quoteBalance, baseBalance, maxAmount, total };
  }, [orderType, livePrice, limitPrice, meta.short, balances, side, amount]);

  const applyPct = useCallback((pct: number) => {
    if (!derived.maxAmount) return;
    setAmount((derived.maxAmount * pct).toFixed(6));
  }, [derived.maxAmount]);

  const canSubmit = useMemo(
    () => !submitting && parseFloat(amount) > 0 && derived.effectivePrice > 0 && !!token,
    [submitting, amount, derived.effectivePrice, token]
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch(`${API_BASE}/orders/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          asset: symbol,
          amount: parseFloat(amount),
          price: derived.effectivePrice,
          side,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBanner({ type: 'success', text: `${side === 'BUY' ? 'Buy' : 'Sell'} order placed · #${String(data.orderId).slice(0, 8)}` });
        setAmount('');
      } else {
        setBanner({ type: 'error', text: data.error ?? 'Order failed. Please try again.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Network error placing order.' });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, amount, derived.effectivePrice, side, symbol, token]);

  // Stable handlers for the Buy/Sell and Market/Limit toggles — useState
  // setters (`setSide`, `setOrderType`) are already stable identities, so
  // wrapping them doesn't change behavior, but it keeps the pattern
  // consistent and makes it trivial to later extract these buttons into
  // their own memoized subcomponents without having to touch call sites.
  const selectBuy = useCallback(() => setSide('BUY'), []);
  const selectSell = useCallback(() => setSide('SELL'), []);
  const selectMarket = useCallback(() => setOrderType('MARKET'), []);
  const selectLimit = useCallback(() => setOrderType('LIMIT'), []);

  return (
    <Animated.View entering={FadeInDown.delay(120).springify().damping(16)} style={styles.tradeWrap}>
      <GlassPanel style={styles.tradePanel} intensity={26}>
        {/* Buy / Sell */}
        <View style={styles.sideRow}>
          <TouchableOpacity
            onPress={selectBuy}
            style={[styles.sideBtn, side === 'BUY' && { backgroundColor: T.gainDim, borderColor: 'rgba(61,220,151,0.35)' }]}
          >
            <Text style={[styles.sideBtnText, { color: side === 'BUY' ? T.gain : T.textTer }]}>Buy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={selectSell}
            style={[styles.sideBtn, side === 'SELL' && { backgroundColor: T.lossDim, borderColor: 'rgba(255,107,122,0.35)' }]}
          >
            <Text style={[styles.sideBtnText, { color: side === 'SELL' ? T.loss : T.textTer }]}>Sell</Text>
          </TouchableOpacity>
        </View>

        {/* Market / Limit */}
        <View style={styles.typeRow}>
          <TouchableOpacity onPress={selectMarket} style={[styles.typeTab, orderType === 'MARKET' && styles.typeTabActive]}>
            <Text style={[styles.typeTabText, orderType === 'MARKET' && styles.typeTabTextActive]}>Market</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={selectLimit} style={[styles.typeTab, orderType === 'LIMIT' && styles.typeTabActive]}>
            <Text style={[styles.typeTabText, orderType === 'LIMIT' && styles.typeTabTextActive]}>Limit</Text>
          </TouchableOpacity>
        </View>

        {orderType === 'LIMIT' && (
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Limit price</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder={livePrice ? livePrice.toFixed(2) : '0.00'}
                placeholderTextColor={T.textTer}
                value={limitPrice}
                onChangeText={setLimitPrice}
              />
              <Text style={styles.inputSuffix}>USDT</Text>
            </View>
          </View>
        )}

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={T.textTer}
              value={amount}
              onChangeText={setAmount}
            />
            <Text style={styles.inputSuffix}>{derived.baseAsset}</Text>
          </View>
        </View>

        <View style={styles.pctRow}>
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <TouchableOpacity key={pct} onPress={() => applyPct(pct)} style={styles.pctBtn}>
              <Text style={styles.pctBtnText}>{pct === 1 ? 'MAX' : `${pct * 100}%`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tradeDivider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Available</Text>
          <Text style={styles.totalValue}>
            {side === 'BUY' ? `${derived.quoteBalance.toFixed(2)} USDT` : `${derived.baseBalance.toFixed(6)} ${derived.baseAsset}`}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Est. total</Text>
          <Text style={styles.totalValue}>{derived.total ? `$${derived.total.toFixed(2)}` : '—'}</Text>
        </View>

        {banner && (
          <Animated.View entering={FadeIn.duration(150)} style={[styles.banner, { backgroundColor: banner.type === 'success' ? T.gainDim : T.lossDim }]}>
            <Text style={[styles.bannerText, { color: banner.type === 'success' ? T.gain : T.loss }]}>{banner.text}</Text>
          </Animated.View>
        )}

        <TouchableOpacity
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.4 }]}
        >
          <LinearGradient
            colors={side === 'BUY' ? [T.gain, '#2FBE82'] : [T.loss, '#E85463']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.submitBtnText}>
            {submitting ? 'Placing order…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${derived.baseAsset}`}
          </Text>
        </TouchableOpacity>

        {!token && (
          <Text style={styles.authHint}>Sign in to place trades.</Text>
        )}
      </GlassPanel>
    </Animated.View>
  );
}

// Wrapped in memo so that when CoinDetail re-renders for reasons unrelated
// to this panel (e.g. the chart's period tab changing, which updates
// `candles`/`ticker` state), TradePanel is skipped entirely as long as its
// own props (symbol, meta, livePrice, token) haven't changed. Combined with
// `meta` being memoized in CoinDetail below (stable reference) and the
// zustand price subscription being scoped to just this symbol, this panel
// now only re-renders when something it actually displays has changed.
const TradePanel = memo(TradePanelBase);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CoinDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? 'BTCUSDT').toUpperCase();

  // Memoized so the fallback object literal (`{ name: symbol, ... }`) isn't
  // reallocated every render for unknown symbols, and so `meta` keeps a
  // stable reference across renders (needed for TradePanel's memo to work —
  // an unstable `meta` object would defeat that memoization every time).
  const meta = useMemo(
    () => SYMBOL_META[symbol] ?? { name: symbol, short: symbol.replace('USDT', ''), color: T.accent },
    [symbol]
  );

  const token = useAuthStore((s) => (s as any).token as string | undefined);
  // ^ Already a selector — only re-renders this component when `token`
  // itself changes, not on unrelated auth-store updates. No change needed.

  // Scoped zustand selectors instead of destructuring the whole store.
  // The original `const { prices } = useMarketStore();` subscribes to the
  // ENTIRE prices object — since that object gets a new reference on every
  // socket tick for ANY of the ~40 tracked symbols, this screen would
  // re-render on every price update for every coin, not just the one being
  // viewed. Selecting `s.prices[symbol]?.price` means React (via zustand's
  // shallow-equality check on the selected value) only re-renders this
  // screen when THIS symbol's price actually changes — a ~40x reduction in
  // re-render frequency on an active market.
  const socketPrice = useMarketStore((s) => s.prices[symbol]?.price);
  const isLive = useMarketStore((s) => Boolean(s.prices[symbol]));
  useMarketSocket();

  const [period, setPeriod] = useState<Period>('1D');
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles');
  const [candles, setCandles] = useState<{ open: number[]; high: number[]; low: number[]; close: number[]; labels: string[] } | null>(null);
  const [ticker, setTicker] = useState<{ high: number; low: number; volume: number; changePct: number } | null>(null);

  // live price: prefer the socket-fed store, fall back to last candle close
  const livePrice = useMemo(
    () => socketPrice ?? candles?.close[candles.close.length - 1] ?? 0,
    [socketPrice, candles]
  );

  const handleChartTypeChange = useCallback((t: 'candles' | 'line') => setChartType(t), []);

  useEffect(() => {
    let cancelled = false;
    // AbortController: if the user flips periods quickly (1H -> 1D -> 1W),
    // earlier in-flight requests are cancelled instead of being left to
    // resolve later and overwrite the chart with stale data for a period
    // the user has already navigated away from — a correctness fix that's
    // also a perf win (no wasted JSON parsing / state updates for responses
    // nobody needs anymore).
    const controller = new AbortController();
    const cfg = PERIODS.find((p) => p.key === period)!;

    const load = async () => {
      try {
        const [klineRes, tickerRes] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${cfg.interval}&limit=${cfg.limit}`, { signal: controller.signal }),
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { signal: controller.signal }),
        ]);
        const klineData = await klineRes.json();
        const tickerData = await tickerRes.json();
        if (cancelled) return;

        // Binance kline tuple: [openTime, open, high, low, close, volume, ...]
        // Pulling all four OHLC values (not just close) is what lets the
        // candlestick chart draw real wicks/bodies instead of a flat line.
        const opens = klineData.map((k: any[]) => parseFloat(k[1]));
        const highs = klineData.map((k: any[]) => parseFloat(k[2]));
        const lows = klineData.map((k: any[]) => parseFloat(k[3]));
        const closes = klineData.map((k: any[]) => parseFloat(k[4]));
        const labels = klineData.map((k: any[]) => {
          const d = new Date(k[0]);
          return period === '1H' || period === '1D'
            ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        setCandles({ open: opens, high: highs, low: lows, close: closes, labels });
        setTicker({
          high: parseFloat(tickerData.highPrice),
          low: parseFloat(tickerData.lowPrice),
          volume: parseFloat(tickerData.quoteVolume),
          changePct: parseFloat(tickerData.priceChangePercent),
        });
      } catch {
        // AbortError from a cancelled request is expected and silently
        // ignored here, matching the original code's blanket catch.
      }
    };

    // Defer the fetch + JSON parsing until after this screen's push
    // transition (and any other queued touch/animation interactions) have
    // finished, so ~100KB+ of kline/ticker JSON parsing doesn't compete
    // with the JS thread for frames while the screen is still animating
    // in — the same pattern already used for sparklines in Home.tsx.
    const task = InteractionManager.runAfterInteractions(load);

    return () => {
      cancelled = true;
      task.cancel();
      controller.abort();
    };
  }, [symbol, period]);

  // All ticker/price-derived display strings grouped into a single memo so
  // they're recomputed only when `livePrice` or `ticker` actually change —
  // not on every render of this screen (e.g. not when TradePanel's local
  // input state changes, since that lives in a separate component and
  // never touches this one anyway; grouping here mainly avoids redoing all
  // four `toLocaleString`/`toFixed` calls independently on every relevant
  // update).
  const { priceStr, changePctLabel, positive, highLabel, lowLabel, volumeLabel } = useMemo(() => {
    const positive = (ticker?.changePct ?? 0) >= 0;
    const priceStr = livePrice
      ? livePrice >= 1000
        ? livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : livePrice >= 1 ? livePrice.toFixed(4) : livePrice.toFixed(6)
      : '—';
    return {
      priceStr,
      positive,
      changePctLabel: `${positive ? '+' : ''}${(ticker?.changePct ?? 0).toFixed(2)}%`,
      highLabel: ticker ? `$${ticker.high.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—',
      lowLabel: ticker ? `$${ticker.low.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—',
      volumeLabel: ticker ? formatVolume(ticker.volume) : '—',
    };
  }, [livePrice, ticker]);

  // Stable handlers — router methods are stable across renders already,
  // but wrapping in useCallback keeps the pattern consistent and avoids
  // creating a fresh closure on every render for the header's back button.
  const handleBack = useCallback(() => router.back(), [router]);
  const handlePeriodChange = useCallback((p: Period) => setPeriod(p), []);

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
            <View style={styles.topBarCenter}>
              <View style={[styles.coinIconBg, { backgroundColor: meta.color + '14', borderColor: meta.color + '2A' }]}>
                <Text style={[styles.coinIconText, { color: meta.color }]}>{meta.short.slice(0, 2)}</Text>
              </View>
              <View>
                <Text style={styles.coinSymbol}>{meta.short}/USDT</Text>
                <Text style={styles.coinName}>{meta.name}</Text>
              </View>
            </View>
            <View style={styles.statusPill}>
              <PulseDot color={isLive ? T.gain : T.textTer} />
              <Text style={styles.statusPillText}>{isLive ? 'LIVE' : '—'}</Text>
            </View>
          </Animated.View>

          {/* Price */}
          <Animated.View entering={FadeInDown.delay(40).springify().damping(16)} style={styles.priceBlock}>
            <Text style={styles.priceValue}>${priceStr}</Text>
            <View style={[styles.changeBadgeBig, { backgroundColor: positive ? T.gainDim : T.lossDim }]}>
              <Text style={[styles.changeBadgeBigText, { color: positive ? T.gain : T.loss }]}>
                {changePctLabel} · {period}
              </Text>
            </View>
          </Animated.View>

          {/* Chart */}
          <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.chartWrap}>
            <GlassPanel style={styles.chartPanel} intensity={24}>
              <ChartTypeToggle active={chartType} onChange={handleChartTypeChange} />
              {chartType === 'candles' ? (
                <CandlestickChart
                  open={candles?.open ?? []}
                  high={candles?.high ?? []}
                  low={candles?.low ?? []}
                  close={candles?.close ?? []}
                  labels={candles?.labels ?? []}
                  positive={positive}
                />
              ) : (
                <PriceChart
                  points={candles?.close ?? []}
                  labels={candles?.labels ?? []}
                  positive={positive}
                />
              )}
              <ChartPeriodTabs active={period} onChange={handlePeriodChange} />
            </GlassPanel>
          </Animated.View>

          {/* Stats */}
          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)} style={styles.statsWrap}>
            <GlassPanel style={styles.statsPanel} intensity={22}>
              <StatCell label="24H HIGH" value={highLabel} color={T.gain} />
              <StatCell label="24H LOW" value={lowLabel} color={T.loss} />
              <StatCell label="24H VOLUME" value={volumeLabel} />
            </GlassPanel>
          </Animated.View>

          {/* Trade */}
          <TradePanel symbol={symbol} meta={meta} livePrice={livePrice} token={token} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },

  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.14 },

  // Header
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  backIcon: { fontSize: 22, color: T.textPri, marginTop: -2 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  coinIconBg: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  coinIconText: { fontSize: 11, fontFamily: FontFamily.heading },
  coinSymbol: { fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri },
  coinName: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: T.hairline, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statusPillText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.textSec, letterSpacing: 1 },

  // Price
  priceBlock: { marginBottom: 18 },
  priceValue: { fontSize: 34, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1 },
  changeBadgeBig: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  changeBadgeBigText: { fontSize: 12, fontFamily: FontFamily.heading },

  // Chart
  chartWrap: { marginBottom: 14, borderRadius: 22 },
  chartPanel: { borderRadius: 22, paddingVertical: 16, paddingHorizontal: 0, borderWidth: 1, borderColor: T.glassBorderHi },
  chartEmpty: { justifyContent: 'center', alignItems: 'center' },
  chartEmptyText: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  chartLabelsRow: { paddingHorizontal: 18, marginBottom: 2 },
  chartMaxLabel: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, alignSelf: 'flex-end' },
  chartMinLabel: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, alignSelf: 'flex-end', marginTop: 4 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.hairline },
  scrubLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  scrubDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: T.bg0, borderWidth: 2 },
  scrubTooltip: {
    alignSelf: 'center', marginTop: 10, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: T.glassBorder, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center',
  },
  scrubTooltipPrice: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },
  scrubTooltipTime: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },

  ohlcRow: { flexDirection: 'row', gap: 10 },
  ohlcLabel: { fontSize: 9.5, fontFamily: FontFamily.body, color: T.textTer, textTransform: 'uppercase' },
  ohlcValue: { fontSize: 11, fontFamily: FontFamily.heading, color: T.textPri },

  chartTypeRow: {
    flexDirection: 'row', gap: 4, alignSelf: 'flex-end',
    marginRight: 18, marginBottom: 10, backgroundColor: T.glass,
    borderRadius: 10, padding: 3, borderWidth: 1, borderColor: T.hairline,
  },
  chartTypeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  chartTypeBtnActive: { backgroundColor: 'rgba(124,138,255,0.16)' },
  chartTypeText: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  chartTypeTextActive: { color: T.accent },

  periodTabsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 16, marginHorizontal: 18, backgroundColor: T.glass,
    borderRadius: 12, padding: 3, borderWidth: 1, borderColor: T.hairline,
  },
  periodTab: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  periodTabActive: { backgroundColor: 'rgba(124,138,255,0.16)' },
  periodTabText: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  periodTabTextActive: { color: T.accent },

  // Stats
  statsWrap: { marginBottom: 14, borderRadius: 18 },
  statsPanel: {
    borderRadius: 18, padding: 16, flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: T.glassBorder,
  },
  statCell2: { alignItems: 'flex-start' },
  statCell2Label: { fontSize: 8.5, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.6, marginBottom: 4 },
  statCell2Value: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },

  // Trade panel
  tradeWrap: { marginBottom: 20, borderRadius: 22 },
  tradePanel: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: T.glassBorderHi },
  sideRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sideBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: T.hairline, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sideBtnText: { fontSize: 13, fontFamily: FontFamily.heading },

  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  typeTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: T.hairline },
  typeTabActive: { borderColor: 'rgba(124,138,255,0.4)', backgroundColor: 'rgba(124,138,255,0.1)' },
  typeTabText: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  typeTabTextActive: { color: T.accent },

  inputRow: { marginBottom: 10 },
  inputLabel: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginBottom: 6, letterSpacing: 0.3 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass,
    borderRadius: 13, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri, paddingVertical: 13 },
  inputSuffix: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },

  pctRow: { flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 14 },
  pctBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: T.hairline, alignItems: 'center' },
  pctBtnText: { fontSize: 10.5, fontFamily: FontFamily.bodyMedium, color: T.textSec },

  tradeDivider: { height: 1, backgroundColor: T.hairline, marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalLabel: { fontSize: 11.5, fontFamily: FontFamily.body, color: T.textTer },
  totalValue: { fontSize: 12.5, fontFamily: FontFamily.bodyMedium, color: T.textPri },

  banner: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginTop: 4, marginBottom: 10 },
  bannerText: { fontSize: 11.5, fontFamily: FontFamily.bodyMedium, textAlign: 'center' },

  submitBtn: {
    marginTop: 6, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    overflow: 'hidden',
  },
  submitBtnText: { fontSize: 14, fontFamily: FontFamily.heading, color: '#fff' },
  authHint: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center', marginTop: 10 },
});
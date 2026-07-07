import { Fragment, useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, TextInput, KeyboardAvoidingView, Platform,
  PanResponder, GestureResponderEvent, PanResponderGestureState,
  InteractionManager,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withSequence, withRepeat, interpolate, Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import Svg, { Path, Line, Rect } from 'react-native-svg';
import { FontFamily } from '../../constants/typography';
import { useMarketStore } from '../../stores/marketStore';
import { useAuthStore } from '../../stores/authStore';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../stores/walletStore';
import { usePlaceOrder } from '../../hooks/useOrders';

let BlurView: any = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

const { width } = Dimensions.get('window');
const CHART_H = 220;
const CHART_PAD = 18;
const CHART_W = width - 36 - CHART_PAD * 2;
const MIN_VISIBLE_CANDLES = 12;
const MAX_LOADED_CANDLES = 500;

const T = {
  bg0: '#06070A',
  bg1: '#0A0C11',
  glass: 'rgba(255,255,255,0.04)',
  glassUp: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.09)',
  glassBorderHi: 'rgba(255,255,255,0.16)',
  hairline: 'rgba(255,255,255,0.07)',
  accent: '#7C8AFF',
  accentDeep: '#5B63E8',
  violet: '#B583FF',
  cyan: '#5EE7E7',
  gain: '#3DDC97',
  gainDim: 'rgba(61,220,151,0.12)',
  loss: '#FF6B7A',
  lossDim: 'rgba(255,107,122,0.12)',
  gold: '#E8B656',
  textPri: '#F7F8FA',
  textSec: '#9CA1B0',
  textTer: '#60657A',
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

interface CandleSet {
  times: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  labels: string[];
}

function formatVolume(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function formatLabel(time: number, period: Period) {
  const d = new Date(time);
  return period === '1H' || period === '1D'
    ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Evenly-spaced index picker for x-axis time labels — scales with however
// many labels we ask for, instead of a fixed 4-point [0, n/3, 2n/3, n-1] split
// that produced uneven/inaccurate spacing depending on window size.
function pickAxisLabels(labels: string[], count = 5) {
  const n = labels.length;
  if (n === 0) return [];
  if (n <= count) return labels;
  const idxSet = new Set<number>();
  for (let i = 0; i < count; i++) {
    idxSet.add(Math.round((i * (n - 1)) / (count - 1)));
  }
  return Array.from(idxSet).map((i) => labels[i]);
}

function formatPrice(v: number) {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(6);
}

// Builds a consistent set of price gridlines/labels anchored to real pixel
// positions inside the chart box, instead of 3 sparse labels living outside
// the chart in their own rows (which could clip or misalign against the
// actual plotted line/candles).
function buildPriceLabels(max: number, min: number, height: number, steps = 4) {
  const range = max - min || 1;
  const out: { y: number; label: string }[] = [];
  for (let i = 0; i <= steps; i++) {
    const value = max - (range * i) / steps;
    out.push({ y: (height * i) / steps, label: formatPrice(value) });
  }
  return out;
}

function buildLinePath(points: number[], width: number, height: number) {
  if (points.length < 2) return '';
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  return points.reduce((d, point, index) => {
    const x = index * step;
    const y = height - ((point - min) / range) * height;
    return `${d}${index === 0 ? 'M' : 'L'}${x} ${y}`;
  }, '');
}

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28, tint = 'dark' }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView pointerEvents="none" intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,13,18,0.5)' }]} />
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
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
    </View>
  );
});

function AmbientField() {
  const drift = useSharedValue(0);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(drift);
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [isFocused]);

  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-12, 16]) },
      { translateY: interpolate(drift.value, [0, 1], [-10, 12]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [12, -18]) },
      { translateY: interpolate(drift.value, [0, 1], [8, -14]) },
    ],
  }));
  const orb3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-8, 10]) },
      { translateY: interpolate(drift.value, [0, 1], [10, -8]) },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -90, left: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 150, right: -110, backgroundColor: T.violet, opacity: 0.09 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { bottom: 120, left: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: T.cyan, opacity: 0.06 }, orb3]} />
    </View>
  );
}

function useChartGesture({
  totalLength,
  chartW,
  onEdgeReached,
  onGestureActiveChange,
}: {
  totalLength: number;
  chartW: number;
  onEdgeReached: () => void;
  onGestureActiveChange?: (active: boolean) => void;
}) {
  const [windowStart, setWindowStart] = useState(0);
  const [windowSize, setWindowSize] = useState(totalLength);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const totalLengthRef = useRef(totalLength);
  const windowStartRef = useRef(windowStart);
  const windowSizeRef = useRef(windowSize);
  const chartWRef = useRef(chartW);
  const onEdgeReachedRef = useRef(onEdgeReached);
  const onGestureActiveChangeRef = useRef(onGestureActiveChange);

  useEffect(() => { totalLengthRef.current = totalLength; }, [totalLength]);
  useEffect(() => { windowStartRef.current = windowStart; }, [windowStart]);
  useEffect(() => { windowSizeRef.current = windowSize; }, [windowSize]);
  useEffect(() => { chartWRef.current = chartW; }, [chartW]);
  useEffect(() => { onEdgeReachedRef.current = onEdgeReached; }, [onEdgeReached]);
  useEffect(() => { onGestureActiveChangeRef.current = onGestureActiveChange; }, [onGestureActiveChange]);

  const gestureRef = useRef({
    mode: 'none' as 'none' | 'pinch' | 'pan' | 'scrub',
    pinchStartDist: 0,
    pinchStartSize: 0,
    pinchStartCenter: 0,
    panStartX: 0,
    panStartWindowStart: 0,
    lastTapTime: 0,
  });

  const resetView = useCallback((newTotal: number) => {
    setWindowStart(0);
    setWindowSize(newTotal);
  }, []);

  const shiftAfterPrepend = useCallback((addedCount: number) => {
    setWindowStart((prev) => prev + addedCount);
  }, []);

  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        // Claim two-finger touches in the CAPTURE phase so the parent
        // ScrollView's native pan recognizer never gets first look at a
        // pinch gesture and cancels it mid-stream.
        onStartShouldSetPanResponderCapture: (evt: GestureResponderEvent) =>
          evt.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponderCapture: (evt: GestureResponderEvent) =>
          evt.nativeEvent.touches.length >= 2,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Once we have the gesture, never release it back to an ancestor
        // (this is what let the ScrollView steal pan/scrub mid-touch before).
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (evt: GestureResponderEvent) => {
          onGestureActiveChangeRef.current?.(true);
          const touches = evt.nativeEvent.touches;
          const now = Date.now();
          if (touches.length >= 2) {
            const [a, b] = touches;
            gestureRef.current.mode = 'pinch';
            gestureRef.current.pinchStartDist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            gestureRef.current.pinchStartSize = windowSizeRef.current;
            gestureRef.current.pinchStartCenter = windowStartRef.current + windowSizeRef.current / 2;
          } else {
            const sincePrevTap = now - gestureRef.current.lastTapTime;
            gestureRef.current.lastTapTime = now;
            if (sincePrevTap < 280 && windowSizeRef.current < totalLengthRef.current) {
              resetView(totalLengthRef.current);
              gestureRef.current.mode = 'none';
              return;
            }
            gestureRef.current.mode = windowSizeRef.current < totalLengthRef.current ? 'pan' : 'scrub';
            gestureRef.current.panStartX = touches[0]?.pageX ?? 0;
            gestureRef.current.panStartWindowStart = windowStartRef.current;
          }
        },

        onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            if (gestureRef.current.mode !== 'pinch') {
              const [a, b] = touches;
              gestureRef.current.mode = 'pinch';
              gestureRef.current.pinchStartDist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
              gestureRef.current.pinchStartSize = windowSizeRef.current;
              gestureRef.current.pinchStartCenter = windowStartRef.current + windowSizeRef.current / 2;
            }
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
            const ratio = dist / (gestureRef.current.pinchStartDist || 1);
            const total = totalLengthRef.current;
            const rawSize = gestureRef.current.pinchStartSize / ratio;
            const newSize = Math.max(MIN_VISIBLE_CANDLES, Math.min(total, Math.round(rawSize)));
            const center = gestureRef.current.pinchStartCenter;
            let newStart = Math.round(center - newSize / 2);
            newStart = Math.max(0, Math.min(total - newSize, newStart));
            setWindowSize(newSize);
            setWindowStart(newStart);
            setScrubIndex(null);
            return;
          }

          if (gestureRef.current.mode === 'scrub') {
            const size = windowSizeRef.current;
            if (size < 2) return;
            const w = chartWRef.current;
            const localX = Math.max(0, Math.min(w, gestureState.moveX - CHART_PAD - 18));
            const step = w / (size - 1);
            const index = Math.round(localX / step);
            setScrubIndex(Math.max(0, Math.min(size - 1, index)));
            return;
          }

          if (gestureRef.current.mode === 'pan') {
            const size = windowSizeRef.current;
            const total = totalLengthRef.current;
            const w = chartWRef.current;
            const pxPerCandle = w / Math.max(1, size);
            const deltaCandles = -(gestureState.moveX - gestureRef.current.panStartX) / pxPerCandle;
            let newStart = gestureRef.current.panStartWindowStart + deltaCandles;
            if (newStart < 0) {
              newStart = 0;
              onEdgeReachedRef.current();
            }
            newStart = Math.min(total - size, newStart);
            setWindowStart(Math.round(newStart));
          }
        },

        onPanResponderRelease: () => {
          gestureRef.current.mode = 'none';
          setScrubIndex(null);
          onGestureActiveChangeRef.current?.(false);
        },
        onPanResponderTerminate: () => {
          gestureRef.current.mode = 'none';
          setScrubIndex(null);
          onGestureActiveChangeRef.current?.(false);
        },
      }),
    [resetView]
  );

  return { windowStart, windowSize, scrubIndex, panHandlers, resetView, shiftAfterPrepend };
}

function ChartFrame({
  priceLabels, xLabels, panHandlers, children, scrubLineX, tooltip, loadingMore,
}: {
  priceLabels: { y: number; label: string }[]; xLabels: string[];
  panHandlers: any; children: React.ReactNode; scrubLineX: number | null;
  tooltip: React.ReactNode; loadingMore: boolean;
}) {
  return (
    <View {...panHandlers}>
      {loadingMore && (
        <View style={styles.loadingMoreBar}>
          <Text style={styles.loadingMoreText}>Loading earlier data…</Text>
        </View>
      )}
      <View style={{ width: CHART_W, height: CHART_H, marginLeft: CHART_PAD }}>
        {priceLabels.map((p, i) => (
          <Fragment key={i}>
            <View style={[styles.gridLine, { top: p.y }]} />
            <Text
              style={[
                styles.gridPriceLabel,
                { top: Math.min(Math.max(p.y - 7, 0), CHART_H - 14) },
              ]}
            >
              {p.label}
            </Text>
          </Fragment>
        ))}
        {children}
        {scrubLineX !== null && <View style={[styles.scrubLine, { left: scrubLineX }]} />}
      </View>
      <View style={styles.xAxisRow}>
        {xLabels.map((l, i) => (
          <Text key={i} style={styles.xAxisLabel}>{l}</Text>
        ))}
      </View>
      {tooltip}
    </View>
  );
}

function PriceChartBase({
  points, labels, positive, scrubIndex, panHandlers, loadingMore,
}: {
  points: number[]; labels: string[]; positive: boolean;
  scrubIndex: number | null; panHandlers: any; loadingMore: boolean;
}) {
  const { max, min, pathD } = useMemo(() => {
    if (points.length < 2) return { max: 0, min: 0, pathD: '' };
    const max = Math.max(...points);
    const min = Math.min(...points);
    return { max, min, pathD: buildLinePath(points, CHART_W, CHART_H) };
  }, [points]);

  const chartEmptyStyle = useMemo(() => [styles.chartEmpty, { height: CHART_H }], []);

  if (!pathD) {
    return (
      <View style={chartEmptyStyle}>
        <Text style={styles.chartEmptyText}>Loading chart…</Text>
      </View>
    );
  }

  const color = positive ? T.gain : T.loss;
  const step = CHART_W / (points.length - 1);
  const scrubX = scrubIndex !== null ? scrubIndex * step : null;
  const scrubPrice = scrubIndex !== null ? points[scrubIndex] : null;
  const scrubLabel = scrubIndex !== null ? labels[scrubIndex] : null;

  const scrubDot = scrubIndex !== null && scrubPrice !== null ? (
    <View
      style={[
        styles.scrubDot,
        { left: (scrubX ?? 0) - 5, top: CHART_H - ((scrubPrice - min) / (max - min || 1)) * CHART_H - 5, borderColor: color },
      ]}
    />
  ) : null;

  const tooltip = scrubPrice !== null ? (
    <Animated.View entering={FadeIn.duration(120)} style={styles.scrubTooltip}>
      <Text style={styles.scrubTooltipPrice}>${scrubPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      <Text style={styles.scrubTooltipTime}>{scrubLabel}</Text>
    </Animated.View>
  ) : null;

  return (
    <ChartFrame
      priceLabels={buildPriceLabels(max, min, CHART_H)}
      xLabels={pickAxisLabels(labels)}
      panHandlers={panHandlers}
      scrubLineX={scrubX}
      tooltip={tooltip}
      loadingMore={loadingMore}
    >
      <Svg width={CHART_W} height={CHART_H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={pathD}
          fill="none"
          stroke={positive ? T.gain : T.loss}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {scrubDot}
    </ChartFrame>
  );
}
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

function CandlestickChartBase({
  open, high, low, close, labels, positive, scrubIndex, panHandlers, loadingMore,
}: {
  open: number[]; high: number[]; low: number[]; close: number[]; labels: string[]; positive: boolean;
  scrubIndex: number | null; panHandlers: any; loadingMore: boolean;
}) {
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

  const chartEmptyStyle = useMemo(() => [styles.chartEmpty, { height: CHART_H }], []);

  if (!candles) {
    return (
      <View style={chartEmptyStyle}>
        <Text style={styles.chartEmptyText}>Loading chart…</Text>
      </View>
    );
  }

  const scrubCandle = scrubIndex !== null ? candles[scrubIndex] : null;
  const scrubOhlc = scrubIndex !== null ? { o: open[scrubIndex], h: high[scrubIndex], l: low[scrubIndex], c: close[scrubIndex] } : null;

  const tooltip = scrubOhlc ? (
    <Animated.View entering={FadeIn.duration(120)} style={styles.scrubTooltip}>
      <View style={styles.ohlcRow}>
        <Text style={styles.ohlcLabel}>O <Text style={styles.ohlcValue}>{scrubOhlc.o.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
        <Text style={styles.ohlcLabel}>H <Text style={styles.ohlcValue}>{scrubOhlc.h.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
        <Text style={styles.ohlcLabel}>L <Text style={styles.ohlcValue}>{scrubOhlc.l.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
        <Text style={styles.ohlcLabel}>C <Text style={styles.ohlcValue}>{scrubOhlc.c.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text></Text>
      </View>
      <Text style={styles.scrubTooltipTime}>{labels[scrubIndex!]}</Text>
    </Animated.View>
  ) : null;

  return (
    <ChartFrame
      priceLabels={buildPriceLabels(max, min, CHART_H)}
      xLabels={pickAxisLabels(labels)}
      panHandlers={panHandlers}
      scrubLineX={scrubCandle ? scrubCandle.cx : null}
      tooltip={tooltip}
      loadingMore={loadingMore}
    >
      <Svg width={CHART_W} height={CHART_H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {candles.map((c: any, i: number) => {
          const color = c.bullish ? T.gain : T.loss;
          return (
            <Fragment key={i}>
              <Line
                x1={c.cx}
                y1={c.yHigh}
                x2={c.cx}
                y2={c.yLow}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.7}
              />
              <Rect
                x={c.cx - c.bodyW / 2}
                y={c.bodyTop}
                width={c.bodyW}
                height={c.bodyHeight}
                fill={color}
                rx={1}
                ry={1}
              />
            </Fragment>
          );
        })}
      </Svg>
    </ChartFrame>
  );
}
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

function TradePanelBase({
  symbol, meta, livePrice, token,
}: { symbol: string; meta: { short: string }; livePrice: number; token?: string | null }) {
  const [side, setSide] = useState<Side>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [amountText, setAmountText] = useState('');
  const [totalText, setTotalText] = useState('');
  const [activeField, setActiveField] = useState<'amount' | 'total'>('amount');
  const [limitPrice, setLimitPrice] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  useWallet();
  const balances = useWalletStore((s) => s.balances);

  const placeOrder = usePlaceOrder();
  const submitting = placeOrder.isPending;

  const derived = useMemo(() => {
    const effectivePrice = orderType === 'MARKET' ? livePrice : (parseFloat(limitPrice) || 0);
    const baseAsset = meta.short;
    const quoteBalance = balances['USDT'] ?? 0;
    const baseBalance = balances[baseAsset] ?? 0;
    const parsedAmount = parseFloat(amountText) || 0;
    const parsedTotal = parseFloat(totalText) || 0;
    const amount = activeField === 'amount' ? parsedAmount : (effectivePrice > 0 ? parsedTotal / effectivePrice : 0);
    const total = activeField === 'total' ? parsedTotal : parsedAmount * effectivePrice;
    const fillPct = side === 'BUY'
      ? (quoteBalance > 0 ? Math.min(1, total / quoteBalance) : 0)
      : (baseBalance > 0 ? Math.min(1, amount / baseBalance) : 0);
    const availableLabel = side === 'BUY' ? `${quoteBalance.toFixed(2)} USDT` : `${baseBalance.toFixed(6)} ${baseAsset}`;
    return { effectivePrice, baseAsset, quoteBalance, baseBalance, amount, total, fillPct, availableLabel };
  }, [orderType, livePrice, limitPrice, meta.short, balances, side, amountText, totalText, activeField]);

  const displayAmount = activeField === 'amount' ? amountText : (derived.amount ? derived.amount.toFixed(6) : '');
  const displayTotal = activeField === 'total' ? totalText : (derived.total ? derived.total.toFixed(2) : '');
  const amountEditable = orderType === 'MARKET' || derived.effectivePrice > 0;

  useEffect(() => {
    if (orderType === 'LIMIT' && !(parseFloat(limitPrice) > 0)) {
      setAmountText('');
      setTotalText('');
    }
  }, [orderType, limitPrice]);

  const applyPct = useCallback((pct: number) => {
    if (side === 'BUY') {
      const quoteAmount = derived.quoteBalance * pct;
      setTotalText(quoteAmount ? quoteAmount.toFixed(2) : '');
      setActiveField('total');
    } else {
      const baseAmount = derived.baseBalance * pct;
      setAmountText(baseAmount ? baseAmount.toFixed(6) : '');
      setActiveField('amount');
    }
  }, [side, derived.quoteBalance, derived.baseBalance]);

  const canSubmit = useMemo(
    () => !submitting && derived.amount > 0 && derived.effectivePrice > 0 && !!token,
    [submitting, derived.amount, derived.effectivePrice, token]
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBanner(null);
    try {
      const res = await placeOrder.mutateAsync({
        asset: symbol,
        amount: derived.amount,
        price: derived.effectivePrice,
        side,
        type: orderType,
      });
      if (res?.success) {
        setBanner({ type: 'success', text: `${side === 'BUY' ? 'Buy' : 'Sell'} order placed · #${String(res.orderId).slice(0, 8)}` });
        setAmountText('');
        setTotalText('');
      } else {
        setBanner({ type: 'error', text: 'Order failed. Please try again.' });
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err.response?.data?.error ?? 'Network error placing order.' });
    }
  }, [canSubmit, derived.amount, derived.effectivePrice, side, symbol, orderType, placeOrder]);

  const selectBuy = useCallback(() => { setSide('BUY'); setAmountText(''); setTotalText(''); }, []);
  const selectSell = useCallback(() => { setSide('SELL'); setAmountText(''); setTotalText(''); }, []);
  const selectMarket = useCallback(() => setOrderType('MARKET'), []);
  const selectLimit = useCallback(() => setOrderType('LIMIT'), []);
  const handleAmountChange = useCallback((t: string) => { setAmountText(t); setActiveField('amount'); }, []);
  const handleTotalChange = useCallback((t: string) => { setTotalText(t); setActiveField('total'); }, []);

  return (
    <Animated.View entering={FadeInDown.delay(120).springify().damping(16)} style={styles.tradeWrap}>
      <GlassPanel style={styles.tradePanel} intensity={28}>
        <View style={styles.sideRow}>
          <TouchableOpacity
            onPress={selectBuy}
            style={[styles.sideBtn, side === 'BUY' && { backgroundColor: T.gainDim, borderColor: 'rgba(61,220,151,0.4)' }]}
          >
            <Text style={[styles.sideBtnText, { color: side === 'BUY' ? T.gain : T.textTer }]}>Buy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={selectSell}
            style={[styles.sideBtn, side === 'SELL' && { backgroundColor: T.lossDim, borderColor: 'rgba(255,107,122,0.4)' }]}
          >
            <Text style={[styles.sideBtnText, { color: side === 'SELL' ? T.loss : T.textTer }]}>Sell</Text>
          </TouchableOpacity>
        </View>

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
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <Text style={styles.inputSuffix}>USDT</Text>
            </View>
            <Text style={styles.fieldHint}>
              {derived.effectivePrice > 0
                ? `Amount and Total below are calculated at this price.`
                : `Set the price you want to ${side === 'BUY' ? 'buy' : 'sell'} at — Amount and Total will use it.`}
            </Text>
          </View>
        )}

        <View style={styles.availableRow}>
          <Text style={styles.availableLabel}>Available to {side === 'BUY' ? 'spend' : 'sell'}</Text>
          <Text style={styles.availableValue}>{derived.availableLabel}</Text>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Amount</Text>
          <View style={[styles.inputWrap, !amountEditable && styles.inputWrapDisabled]}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder={amountEditable ? '0.00' : 'Set limit price first'}
              placeholderTextColor={T.textTer}
              value={displayAmount}
              onChangeText={handleAmountChange}
              editable={amountEditable}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Text style={styles.inputSuffix}>{derived.baseAsset}</Text>
          </View>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Total</Text>
          <View style={[styles.inputWrap, !amountEditable && styles.inputWrapDisabled]}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder={amountEditable ? '0.00' : 'Set limit price first'}
              placeholderTextColor={T.textTer}
              value={displayTotal}
              onChangeText={handleTotalChange}
              editable={amountEditable}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Text style={styles.inputSuffix}>USDT</Text>
          </View>
        </View>

        <View style={styles.pctRow}>
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <TouchableOpacity
              key={pct}
              onPress={() => applyPct(pct)}
              disabled={!amountEditable}
              style={[styles.pctBtn, !amountEditable && { opacity: 0.4 }]}
            >
              <Text style={styles.pctBtnText}>{pct === 1 ? 'MAX' : `${pct * 100}%`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.fillTrack}>
          <LinearGradient
            colors={side === 'BUY' ? [T.gain, '#2FBE82'] : [T.loss, '#E85463']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.fillBar, { width: `${Math.round(derived.fillPct * 100)}%` }]}
          />
        </View>

        <View style={styles.tradeDivider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order value</Text>
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
const TradePanel = memo(TradePanelBase);

export default function CoinDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const navigation = useNavigation<any>();
  const scrollRef = useRef<ScrollView>(null);
  const symbol = (rawSymbol ?? 'BTCUSDT').toUpperCase();

  const meta = useMemo(
    () => SYMBOL_META[symbol] ?? { name: symbol, short: symbol.replace('USDT', ''), color: T.accent },
    [symbol]
  );

  const token = useAuthStore((s) => s.token);
  const socketPrice = useMarketStore((s) => s.prices[symbol]?.price);
  const isLive = useMarketStore((s) => Boolean(s.prices[symbol]));

  const [period, setPeriod] = useState<Period>('1D');
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles');
  const [candles, setCandles] = useState<CandleSet | null>(null);
  const [ticker, setTicker] = useState<{ high: number; low: number; volume: number; changePct: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Tracks whether a touch is currently active on the chart itself, so the
  // outer ScrollView can be disabled for the duration — this is what lets
  // pinch-zoom and left-edge panning (which triggers history loading) work
  // instead of the ScrollView stealing the touch.
  const [chartTouchActive, setChartTouchActive] = useState(false);
  const loadingMoreRef = useRef(false);
  const candlesRef = useRef<CandleSet | null>(null);
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  const livePrice = useMemo(
    () => socketPrice ?? candles?.close[candles.close.length - 1] ?? 0,
    [socketPrice, candles]
  );

  const handleChartTypeChange = useCallback((t: 'candles' | 'line') => setChartType(t), []);
  const handleGestureActiveChange = useCallback((active: boolean) => setChartTouchActive(active), []);

  const loadOlder = useCallback(async () => {
    const current = candlesRef.current;
    if (loadingMoreRef.current || !current || current.times.length === 0) return;
    if (current.times.length >= MAX_LOADED_CANDLES) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const cfg = PERIODS.find((p) => p.key === period)!;
      const endTime = current.times[0] - 1;
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${cfg.interval}&limit=${cfg.limit}&endTime=${endTime}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
      const addedCount = data.length;
      const newTimes = data.map((k: any[]) => k[0]);
      const newOpens = data.map((k: any[]) => parseFloat(k[1]));
      const newHighs = data.map((k: any[]) => parseFloat(k[2]));
      const newLows = data.map((k: any[]) => parseFloat(k[3]));
      const newCloses = data.map((k: any[]) => parseFloat(k[4]));
      const newLabels = data.map((k: any[]) => formatLabel(k[0], period));
      setCandles((prev) => {
        if (!prev) return prev;
        return {
          times: [...newTimes, ...prev.times],
          open: [...newOpens, ...prev.open],
          high: [...newHighs, ...prev.high],
          low: [...newLows, ...prev.low],
          close: [...newCloses, ...prev.close],
          labels: [...newLabels, ...prev.labels],
        };
      });
      chartGesture.shiftAfterPrepend(addedCount);
    } catch {
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [period, symbol]);

  const totalLength = candles?.close.length ?? 0;
  const chartGesture = useChartGesture({
    totalLength,
    chartW: CHART_W,
    onEdgeReached: loadOlder,
    onGestureActiveChange: handleGestureActiveChange,
  });

  useEffect(() => {
    let cancelled = false;
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

        const times = klineData.map((k: any[]) => k[0]);
        const opens = klineData.map((k: any[]) => parseFloat(k[1]));
        const highs = klineData.map((k: any[]) => parseFloat(k[2]));
        const lows = klineData.map((k: any[]) => parseFloat(k[3]));
        const closes = klineData.map((k: any[]) => parseFloat(k[4]));
        const labels = klineData.map((k: any[]) => formatLabel(k[0], period));
        setCandles({ times, open: opens, high: highs, low: lows, close: closes, labels });
        setTicker({
          high: parseFloat(tickerData.highPrice),
          low: parseFloat(tickerData.lowPrice),
          volume: parseFloat(tickerData.quoteVolume),
          changePct: parseFloat(tickerData.priceChangePercent),
        });
        chartGesture.resetView(closes.length);
      } catch {
      }
    };

    const task = InteractionManager.runAfterInteractions(load);

    return () => {
      cancelled = true;
      task.cancel();
      controller.abort();
    };
  }, [symbol, period]);

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

  const handleBack = useCallback(() => router.back(), [router]);
  const handlePeriodChange = useCallback((p: Period) => setPeriod(p), []);
  const handleResetZoom = useCallback(() => chartGesture.resetView(totalLength), [chartGesture, totalLength]);

  const windowed = useMemo(() => {
    if (!candles) return null;
    const s = chartGesture.windowStart;
    const e = chartGesture.windowStart + chartGesture.windowSize;
    return {
      open: candles.open.slice(s, e),
      high: candles.high.slice(s, e),
      low: candles.low.slice(s, e),
      close: candles.close.slice(s, e),
      labels: candles.labels.slice(s, e),
    };
  }, [candles, chartGesture.windowStart, chartGesture.windowSize]);

  const isZoomed = totalLength > 0 && chartGesture.windowSize < totalLength;

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          // Disabled while a touch is active on the chart so pinch/pan
          // gestures aren't cancelled by the ScrollView's own recognizer.
          scrollEnabled={!chartTouchActive}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 140 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Animated.View entering={FadeIn.duration(400)} style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
            <View style={styles.topBarCenter}>
              <View style={[styles.coinIconBg, { backgroundColor: meta.color + '16', borderColor: meta.color + '30' }]}>
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

          <Animated.View entering={FadeInDown.delay(40).springify().damping(16)} style={styles.priceBlock}>
            <Text style={styles.priceValue}>${priceStr}</Text>
            <View style={[styles.changeBadgeBig, { backgroundColor: positive ? T.gainDim : T.lossDim }]}>
              <Text style={[styles.changeBadgeBigText, { color: positive ? T.gain : T.loss }]}>
                {changePctLabel} · {period}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.chartWrap}>
            <GlassPanel style={styles.chartPanel} intensity={26}>
              <View style={styles.chartTopRow}>
                <ChartTypeToggle active={chartType} onChange={handleChartTypeChange} />
                {isZoomed && (
                  <TouchableOpacity onPress={handleResetZoom} style={styles.resetZoomBtn}>
                    <Text style={styles.resetZoomText}>⟲ Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
              {chartType === 'candles' ? (
                <CandlestickChart
                  open={windowed?.open ?? []}
                  high={windowed?.high ?? []}
                  low={windowed?.low ?? []}
                  close={windowed?.close ?? []}
                  labels={windowed?.labels ?? []}
                  positive={positive}
                  scrubIndex={chartGesture.scrubIndex}
                  panHandlers={chartGesture.panHandlers}
                  loadingMore={loadingMore}
                />
              ) : (
                <PriceChart
                  points={windowed?.close ?? []}
                  labels={windowed?.labels ?? []}
                  positive={positive}
                  scrubIndex={chartGesture.scrubIndex}
                  panHandlers={chartGesture.panHandlers}
                  loadingMore={loadingMore}
                />
              )}
              <ChartPeriodTabs active={period} onChange={handlePeriodChange} />
            </GlassPanel>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)} style={styles.statsWrap}>
            <GlassPanel style={styles.statsPanel} intensity={22}>
              <StatCell label="24H HIGH" value={highLabel} color={T.gain} />
              <StatCell label="24H LOW" value={lowLabel} color={T.loss} />
              <StatCell label="24H VOLUME" value={volumeLabel} />
            </GlassPanel>
          </Animated.View>

          <TradePanel key={symbol} symbol={symbol} meta={meta} livePrice={livePrice} token={token} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },

  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.15 },

  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder,
    justifyContent: 'center', alignItems: 'center', marginRight: 13,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  backIcon: { fontSize: 22, color: T.textPri, marginTop: -2 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  coinIconBg: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  coinIconText: { fontSize: 11, fontFamily: FontFamily.heading },
  coinSymbol: { fontSize: 15.5, fontFamily: FontFamily.heading, color: T.textPri },
  coinName: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2.5 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: T.hairline, backgroundColor: 'rgba(255,255,255,0.035)',
  },
  statusPillText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.textSec, letterSpacing: 1.1 },

  priceBlock: { marginBottom: 20 },
  priceValue: { fontSize: 36, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1.1 },
  changeBadgeBig: { alignSelf: 'flex-start', marginTop: 9, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
  changeBadgeBigText: { fontSize: 12, fontFamily: FontFamily.heading },

  chartWrap: { marginBottom: 16, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  chartPanel: { borderRadius: 24, paddingVertical: 17, paddingHorizontal: 0, borderWidth: 1, borderColor: T.glassBorderHi },
  chartEmpty: { justifyContent: 'center', alignItems: 'center' },
  chartEmptyText: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: T.hairline },
  gridPriceLabel: {
    position: 'absolute',
    right: 2,
    fontSize: 9,
    fontFamily: FontFamily.body,
    color: T.textTer,
    backgroundColor: T.bg0,
    paddingHorizontal: 3,
  },
  scrubLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  scrubDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: T.bg0, borderWidth: 2 },
  scrubTooltip: {
    alignSelf: 'center', marginTop: 10, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: T.glassBorder, borderRadius: 11,
    paddingHorizontal: 13, paddingVertical: 8, alignItems: 'center',
  },
  scrubTooltipPrice: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },
  scrubTooltipTime: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },

  ohlcRow: { flexDirection: 'row', gap: 10 },
  ohlcLabel: { fontSize: 9.5, fontFamily: FontFamily.body, color: T.textTer, textTransform: 'uppercase' },
  ohlcValue: { fontSize: 11, fontFamily: FontFamily.heading, color: T.textPri },

  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 8 },
  xAxisLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer },

  loadingMoreBar: { alignSelf: 'center', marginBottom: 8, backgroundColor: 'rgba(124,138,255,0.14)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  loadingMoreText: { fontSize: 9.5, fontFamily: FontFamily.bodyMedium, color: T.accent },

  chartTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginRight: 18, marginBottom: 11 },
  chartTypeRow: {
    flexDirection: 'row', gap: 4, backgroundColor: T.glass,
    borderRadius: 11, padding: 3, borderWidth: 1, borderColor: T.hairline,
  },
  chartTypeBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 },
  chartTypeBtnActive: { backgroundColor: 'rgba(124,138,255,0.18)' },
  chartTypeText: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  chartTypeTextActive: { color: T.accent },

  resetZoomBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(124,138,255,0.14)', borderWidth: 1, borderColor: 'rgba(124,138,255,0.3)' },
  resetZoomText: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.accent },

  periodTabsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 16, marginHorizontal: 18, backgroundColor: T.glass,
    borderRadius: 13, padding: 3, borderWidth: 1, borderColor: T.hairline,
  },
  periodTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  periodTabActive: { backgroundColor: 'rgba(124,138,255,0.18)' },
  periodTabText: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  periodTabTextActive: { color: T.accent },

  statsWrap: { marginBottom: 16, borderRadius: 19, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  statsPanel: {
    borderRadius: 19, padding: 17, flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: T.glassBorder,
  },
  statCell2: { alignItems: 'flex-start' },
  statCell2Label: { fontSize: 8.5, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.7, marginBottom: 5 },
  statCell2Value: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },

  tradeWrap: { marginBottom: 22, borderRadius: 24, shadowColor: T.accent, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  tradePanel: { borderRadius: 24, padding: 19, borderWidth: 1, borderColor: T.glassBorderHi },
  sideRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  sideBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 13, alignItems: 'center',
    borderWidth: 1, borderColor: T.hairline, backgroundColor: 'rgba(255,255,255,0.025)',
  },
  sideBtnText: { fontSize: 13, fontFamily: FontFamily.heading },

  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 15 },
  typeTab: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: T.hairline },
  typeTabActive: { borderColor: 'rgba(124,138,255,0.45)', backgroundColor: 'rgba(124,138,255,0.12)' },
  typeTabText: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  typeTabTextActive: { color: T.accent },

  availableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: T.hairline },
  availableLabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer },
  availableValue: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textPri },

  inputRow: { marginBottom: 11 },
  inputLabel: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginBottom: 7, letterSpacing: 0.3 },
  fieldHint: { fontSize: 9.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass,
    borderRadius: 14, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 15,
  },
  inputWrapDisabled: { opacity: 0.45 },
  input: { flex: 1, fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri, paddingVertical: 14 },
  inputSuffix: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },

  pctRow: { flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 8 },
  pctBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: T.hairline, alignItems: 'center' },
  pctBtnText: { fontSize: 10.5, fontFamily: FontFamily.bodyMedium, color: T.textSec },

  fillTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 15 },
  fillBar: { height: 4, borderRadius: 2 },

  tradeDivider: { height: 1, backgroundColor: T.hairline, marginBottom: 13 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalLabel: { fontSize: 11.5, fontFamily: FontFamily.body, color: T.textTer },
  totalValue: { fontSize: 12.5, fontFamily: FontFamily.bodyMedium, color: T.textPri },

  banner: { borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13, marginTop: 4, marginBottom: 11 },
  bannerText: { fontSize: 11.5, fontFamily: FontFamily.bodyMedium, textAlign: 'center' },

  submitBtn: {
    marginTop: 6, borderRadius: 15, paddingVertical: 16, alignItems: 'center',
    overflow: 'hidden',
  },
  submitBtnText: { fontSize: 14, fontFamily: FontFamily.heading, color: '#fff' },
  authHint: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center', marginTop: 11 },
});
import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
  ListRenderItemInfo,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withSequence, withRepeat,
  interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Router } from 'expo-router';
import { FontFamily } from '../../constants/typography';
import { useMarketStore } from '../../stores/marketStore';
import { useTicker24h } from '../../hooks/useTicker24h';
// Note: no `useMarketSocket()` call here. The websocket connection is
// established exactly once at the tab-layout level (app/(tabs)/_layout.tsx)
// and shared via the store — every screen just reads from it. Calling the
// hook again here would open a second, redundant connection the first time
// this tab is visited (the hook's internal ref-guard only protects against
// double-invocation within a single component instance, not across
// multiple components that each independently call the hook).

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const T = {
  bg0: '#06070A',
  glass: 'rgba(255,255,255,0.035)',
  glassUp: 'rgba(255,255,255,0.055)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassBorderHi: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(255,255,255,0.06)',
  accent: '#7C8AFF',
  accentDeep: '#5B63E8',
  violet: '#B583FF',
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
  BTCUSDT:   { name: 'Bitcoin',          short: 'BTC',  color: '#F7931A' },
  ETHUSDT:   { name: 'Ethereum',         short: 'ETH',  color: '#8FA3FF' },
  BNBUSDT:   { name: 'BNB',              short: 'BNB',  color: '#F3BA2F' },
  SOLUSDT:   { name: 'Solana',           short: 'SOL',  color: '#B583FF' },
  XRPUSDT:   { name: 'XRP',              short: 'XRP',  color: '#5EC8F2' },
  ADAUSDT:   { name: 'Cardano',          short: 'ADA',  color: '#5C7CFA' },
  DOGEUSDT:  { name: 'Dogecoin',         short: 'DOGE', color: '#E0C354' },
  AVAXUSDT:  { name: 'Avalanche',        short: 'AVAX', color: '#F06A6E' },
  DOTUSDT:   { name: 'Polkadot',         short: 'DOT',  color: '#F25CA8' },
  LINKUSDT:  { name: 'Chainlink',        short: 'LINK', color: '#6D8DF2' },
  MATICUSDT: { name: 'Polygon',          short: 'MATIC',color: '#A87DF0' },
  UNIUSDT:   { name: 'Uniswap',          short: 'UNI',  color: '#FF66A8' },
  LTCUSDT:   { name: 'Litecoin',         short: 'LTC',  color: '#C9C9CE' },
  BCHUSDT:   { name: 'Bitcoin Cash',     short: 'BCH',  color: '#9FDB81' },
  SHIBUSDT:  { name: 'Shiba Inu',        short: 'SHIB', color: '#F2A94D' },
  NEARUSDT:  { name: 'NEAR',             short: 'NEAR', color: '#5CDDB0' },
  APTUSDT:   { name: 'Aptos',            short: 'APT',  color: '#5CECBF' },
  FILUSDT:   { name: 'Filecoin',         short: 'FIL',  color: '#5EB3FF' },
  RNDRUSDT:  { name: 'Render',           short: 'RNDR', color: '#F2895E' },
  ATOMUSDT:  { name: 'Cosmos',           short: 'ATOM', color: '#8E96C2' },
  VETUSDT:   { name: 'VeChain',          short: 'VET',  color: '#5ED2FF' },
  XLMUSDT:   { name: 'Stellar',          short: 'XLM',  color: '#9CA6F7' },
  TRXUSDT:   { name: 'TRON',             short: 'TRX',  color: '#F2616B' },
  ETCUSDT:   { name: 'Ethereum Classic', short: 'ETC',  color: '#7FD17F' },
  ICPUSDT:   { name: 'ICP',              short: 'ICP',  color: '#5CC2EE' },
  HBARUSDT:  { name: 'Hedera',           short: 'HBAR', color: '#4DD8DB' },
  ALGOUSDT:  { name: 'Algorand',         short: 'ALGO', color: '#E8E8EC' },
  EGLDUSDT:  { name: 'MultiversX',       short: 'EGLD', color: '#5CF2DD' },
  XTZUSDT:   { name: 'Tezos',            short: 'XTZ',  color: '#6FA3F7' },
  AAVEUSDT:  { name: 'Aave',             short: 'AAVE', color: '#D08AC0' },
  SANDUSDT:  { name: 'The Sandbox',      short: 'SAND', color: '#5EC6F5' },
  MANAUSDT:  { name: 'Decentraland',     short: 'MANA', color: '#F2607D' },
  AXSUSDT:   { name: 'Axie Infinity',    short: 'AXS',  color: '#6B9EF2' },
  GRTUSDT:   { name: 'The Graph',        short: 'GRT',  color: '#A689E0' },
  FTMUSDT:   { name: 'Fantom',           short: 'FTM',  color: '#5C8DFF' },
  RUNEUSDT:  { name: 'THORChain',        short: 'RUNE', color: '#6EF0AC' },
  INJUSDT:   { name: 'Injective',        short: 'INJ',  color: '#5ECEFF' },
  OPUSDT:    { name: 'Optimism',         short: 'OP',   color: '#F2616B' },
  ARBUSDT:   { name: 'Arbitrum',         short: 'ARB',  color: '#6FB6F2' },
};

// Module-level constant — computed once at import time, not per render.
const ALL_SYMBOLS = Object.keys(SYMBOL_META);

type TabType = 'hot' | 'gainers' | 'losers';

const TABS: { key: TabType; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

const ROW_HEIGHT = 73;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.13 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  screenTitle: { fontSize: 23, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.3 },
  screenSubtitle: { fontSize: 11.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  statusText: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 1.2 },
  searchRow: { marginBottom: 14 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: T.glassBorder },
  searchWrapFocused: { borderColor: 'rgba(124,138,255,0.5)' },
  searchIcon: { fontSize: 17, color: T.textTer },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FontFamily.body, color: T.textPri },
  searchClear: { fontSize: 11, color: T.textTer, padding: 4 },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  tabsGroup: { flexDirection: 'row', gap: 4, backgroundColor: T.glass, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: T.hairline },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  tabActive: {},
  tabText: { fontSize: 12, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  tabTextActive: { color: '#fff' },
  countPill: { marginLeft: 'auto', backgroundColor: 'rgba(124,138,255,0.10)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(124,138,255,0.2)' },
  countText: { fontSize: 11, fontFamily: FontFamily.heading, color: T.accent },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2 },
  sectionCountPill: { backgroundColor: 'rgba(124,138,255,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sectionCountText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent },
  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 9 },
  listHeaderText: { fontSize: 9, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.7 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: T.glass, borderRadius: 17, paddingVertical: 13, paddingHorizontal: 13, borderWidth: 1, borderColor: T.glassBorder, overflow: 'hidden' },
  dotAccent: { width: 2.5, height: 30, borderRadius: 2 },
  assetIconBg: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  assetIconText: { fontSize: 12, fontFamily: FontFamily.heading },
  assetInfo: { flex: 1 },
  assetSymbol: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri },
  assetName: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  sparklinePlaceholder: { width: 58, height: 34 },
  assetPriceCol: { alignItems: 'flex-end', gap: 5 },
  assetPrice: { fontSize: 13.5, fontFamily: FontFamily.heading, color: T.textPri },
  changeBadge: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  changeText: { fontSize: 10, fontFamily: FontFamily.heading, letterSpacing: 0.2 },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyIcon: { fontSize: 32, color: T.textTer },
  emptyText: { fontSize: 13, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center' },
});


// memo: AmbientField takes no props at all, so it should never re-render
// due to Market's state changes (search typing, tab switches, price ticks)
// — only its own internal shared-value drift animation should ever run.
const AmbientField = memo(function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 13000, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-10, 14]) },
      { translateY: interpolate(drift.value, [0, 1], [-8, 10]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [12, -14]) },
      { translateY: interpolate(drift.value, [0, 1], [6, -10]) },
    ],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -80, right: -60, backgroundColor: T.violet }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { bottom: 160, left: -90, backgroundColor: T.accentDeep, opacity: 0.10 }, orb2]} />
    </View>
  );
});

// memo: purely presentational; without memo it would re-render (and
// re-touch its native BlurView) every time its parent re-renders.
const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28 }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,15,20,0.45)' }]} />
        {children}
      </View>
    );
  }
  return <View style={[style, { backgroundColor: T.glassUp, overflow: 'hidden' }]}>{children}</View>;
});

// memo: depends only on `color`; animation is fully self-contained via
// shared values.
const PulseDot = memo(function PulseDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1100 }), withTiming(1, { duration: 0 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1100 }), withTiming(0.9, { duration: 0 })), -1, false);
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, position: 'absolute' }, ringStyle]} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
});

// memo + custom comparator: only re-renders when this row's own price or
// side actually changes (used inside AssetRow, which itself now owns its
// own price subscription — see below).
const PriceFlash = memo(function PriceFlash({ price, positive }: { price: string; positive: boolean }) {
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(${positive ? '61,220,151' : '255,107,122'}, ${flash.value * 0.18})`,
  }));
  useEffect(() => {
    flash.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 700 }));
  }, [price]);
  return (
    <Animated.View style={[{ borderRadius: 5, paddingHorizontal: 3, paddingVertical: 1 }, flashStyle]}>
      <Text style={styles.assetPrice}>${price}</Text>
    </Animated.View>
  );
}, (p, n) => p.price === n.price && p.positive === n.positive);

// memo + useMemo: segment geometry (trig per point) is the expensive part;
// useMemo means it's only recalculated when `points` itself changes (i.e.
// once per sparkline update from ticker24h), not on every parent re-render.
const Sparkline = memo(function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const segments = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const h = 34, w = 58;
    const step = w / (points.length - 1);
    return points.slice(0, -1).map((p, i) => {
      const x1 = i * step;
      const y1 = h - ((p - min) / range) * h;
      const x2 = (i + 1) * step;
      const y2 = h - ((points[i + 1] - min) / range) * h;
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      return { x1, y1, length, angle, opacity: 0.35 + (i / points.length) * 0.65 };
    });
  }, [points]);
  if (!segments) return <View style={styles.sparklinePlaceholder} />;
  const color = positive ? T.gain : T.loss;
  return (
    <View style={{ width: 58, height: 34 }}>
      {segments.map((s, i) => (
        <View key={i} style={{
          position: 'absolute', left: s.x1, top: s.y1,
          width: s.length, height: 1.75,
          backgroundColor: color, borderRadius: 1,
          opacity: s.opacity,
          transform: [{ rotate: `${s.angle}deg` }],
          transformOrigin: '0 0',
        }} />
      ))}
    </View>
  );
}, (p, n) => p.points === n.points && p.positive === n.positive);

// ── AssetRow ──────────────────────────────────────────────────────────────
// Biggest structural change in this file: AssetRow now subscribes to its
// OWN price directly from the store (`s.prices[symbol]`), instead of
// receiving a pre-merged `asset` object built by Market on every tick.
//
// Why this matters: previously Market selected the whole `prices` map,
// which forced Market itself to re-render on every websocket tick for
// every symbol (not just the ones whose rows were visible or changed).
// With each row subscribing narrowly to its own slice, Market no longer
// needs `prices` at all — a price tick for BTC now only re-renders BTC's
// row, and Market's own render function isn't invoked by price ticks at
// all, only by tab/search changes and periodic ticker24h updates.
function AssetRowBase({ symbol, change24h, sparkline, index, router }: {
  symbol: string; change24h: number; sparkline: number[]; index: number; router: Router;
}) {
  const price = useMarketStore((s) => s.prices[symbol]?.price ?? 0);

  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(lift.value, [0, 1], [1, 0.985]) }],
  }));
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: lift.value > 0 ? 'rgba(124,138,255,0.35)' : T.glassBorder,
  }));

  // This component re-renders on every price tick (it subscribes to its own
  // price directly). `meta` only depends on `symbol` (which never changes
  // for a mounted row), so memoizing it means the lookup + fallback object
  // construction happens once per row instead of on every tick.
  const meta = useMemo(
    () => SYMBOL_META[symbol] ?? { name: symbol, short: symbol.replace('USDT', ''), color: T.accent },
    [symbol]
  );
  const positive = change24h >= 0;

  // All of these style objects/arrays previously were inline literals,
  // meaning React allocated a fresh object for EACH of them on EVERY price
  // tick — even though none of them actually depend on price, only on
  // `positive` (derived from change24h) or `meta` (derived from symbol).
  // Memoizing them means a price-only re-render does zero extra allocation
  // for styling, across all ~40 rows, on every tick.
const gradientColors = useMemo<[string, string]>(
  () => [positive ? T.gain + '07' : T.loss + '07', 'transparent'],
  [positive]
);

  const dotStyle = useMemo(
    () => [styles.dotAccent, { backgroundColor: positive ? T.gain : T.loss }],
    [positive]
  );
  const iconBgStyle = useMemo(
    () => [styles.assetIconBg, { backgroundColor: meta.color + '14', borderColor: meta.color + '2A' }],
    [meta]
  );
  const iconTextStyle = useMemo(
    () => [styles.assetIconText, { color: meta.color }],
    [meta]
  );
  const changeBadgeStyle = useMemo(
    () => [styles.changeBadge, { backgroundColor: positive ? T.gainDim : T.lossDim }],
    [positive]
  );
  const changeTextStyle = useMemo(
    () => [styles.changeText, { color: positive ? T.gain : T.loss }],
    [positive]
  );

  const priceStr = price >= 1000
    ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price >= 1 ? price.toFixed(4)
    : price.toFixed(6);

  // Stable per-row navigation handler: recreated only if `router` or
  // `symbol` change (i.e. essentially never, for a given row's lifetime),
  // instead of a brand-new closure being allocated every time FlatList
  // calls renderItem for this row (e.g. during scroll recycling).
  const handlePress = useCallback(() => {
    router.push({ pathname: '/(tabs)/cryptoGraph', params: { symbol } });
  }, [router, symbol]);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 22).springify().damping(20)} style={{ marginBottom: 8 }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={handlePress}
        onPressIn={() => { lift.value = withTiming(1, { duration: 100 }); }}
        onPressOut={() => { lift.value = withTiming(0, { duration: 200 }); }}
      >
        <Animated.View style={[styles.assetRow, liftStyle, borderStyle]}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={dotStyle} />
          <View style={iconBgStyle}>
            <Text style={iconTextStyle}>{meta.short.slice(0, 2)}</Text>
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetSymbol}>{meta.short}</Text>
            <Text style={styles.assetName}>{meta.name}</Text>
          </View>
          <Sparkline points={sparkline} positive={positive} />
          <View style={styles.assetPriceCol}>
            <PriceFlash price={priceStr} positive={positive} />
            <View style={changeBadgeStyle}>
              <Text style={changeTextStyle}>
                {positive ? '+' : ''}{change24h.toFixed(2)}%
              </Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// memo with a custom comparator: since AssetRow now sources its own price
// via a store selector, the parent-passed props that matter are just
// symbol/change24h/sparkline/index. `router` is intentionally excluded from
// the comparison — expo-router's router object is stable across renders,
// and the row's own internal `handlePress` useCallback already guards
// against it causing pointless re-binding.
function assetPropsEqual(p: any, n: any) {
  return (
    p.symbol === n.symbol &&
    p.change24h === n.change24h &&
    p.sparkline === n.sparkline &&
    p.index === n.index
  );
}
const AssetRow = memo(AssetRowBase, assetPropsEqual);

const TabButton = memo(function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      {active && (
        <LinearGradient
          colors={[T.accentDeep, T.violet]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
});

// ── Extracted, memoized header sections ────────────────────────────────
// Splitting the header into small memoized pieces (instead of one large
// useMemo-built JSX blob) means each piece only re-renders when ITS OWN
// props actually change — e.g. `connected` toggling no longer forces the
// search input or tabs to re-render, and typing in search no longer forces
// the status pill to re-render.

const TopBar = memo(function TopBar({ connected }: { connected: boolean }) {
  return (
    <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
      <View>
        <Text style={styles.screenTitle}>Markets</Text>
        <Text style={styles.screenSubtitle}>{ALL_SYMBOLS.length} assets · real-time</Text>
      </View>
      <View style={[styles.statusPill, { borderColor: connected ? 'rgba(61,220,151,0.3)' : 'rgba(255,107,122,0.3)' }]}>
        <PulseDot color={connected ? T.gain : T.loss} />
        <Text style={[styles.statusText, { color: connected ? T.gain : T.loss }]}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </Text>
      </View>
    </Animated.View>
  );
});

const SearchBar = memo(function SearchBar({
  value, focused, onChangeText, onFocus, onBlur, onClear,
}: {
  value: string; focused: boolean;
  onChangeText: (t: string) => void; onFocus: () => void; onBlur: () => void; onClear: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.searchRow}>
      <GlassPanel style={[styles.searchWrap, focused && styles.searchWrapFocused]} intensity={20}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search 40+ assets..."
          placeholderTextColor={T.textTer}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={onClear}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </GlassPanel>
    </Animated.View>
  );
});

const TabsRow = memo(function TabsRow({
  activeTab, count, onTabPress,
}: { activeTab: TabType; count: number; onTabPress: (key: TabType) => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(110).springify().damping(16)} style={styles.tabsRow}>
      <View style={styles.tabsGroup}>
        {TABS.map((t) => (
          <TabButton
            key={t.key}
            label={t.label}
            active={activeTab === t.key}
            onPress={() => onTabPress(t.key)}
          />
        ))}
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </Animated.View>
  );
});

const SectionLabelRow = memo(function SectionLabelRow({ activeTab, count }: { activeTab: TabType; count: number }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.sectionLabelText}>
        {TABS.find((t) => t.key === activeTab)!.label}
      </Text>
      <View style={styles.sectionCountPill}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
    </View>
  );
});

// Fully static — there is nothing dynamic about the column labels, so this
// is built exactly once at module load instead of being rebuilt inside any
// component or useMemo call.
const LIST_COLUMN_HEADER = (
  <View style={styles.listHeader}>
    <Text style={styles.listHeaderText}>Asset</Text>
    <Text style={[styles.listHeaderText, { marginLeft: 'auto', marginRight: 58 }]}>24H</Text>
    <Text style={styles.listHeaderText}>Price</Text>
  </View>
);

export default function Market() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Only `ticker24h` (24h change + sparkline) and `connected` are selected
  // here — deliberately NOT `prices`. `prices` changes on every websocket
  // tick for every symbol; selecting it here would force this whole screen
  // to re-render on every tick regardless of which row actually changed.
  // Each AssetRow instead subscribes to its own price slice directly (see
  // AssetRowBase above), so Market's own re-renders are now driven only by
  // ticker24h updates (periodic, not per-tick), connection status changes,
  // and user interaction (search/tab).
  const ticker24h = useMarketStore((s) => s.ticker24h);
  const connected = useMarketStore((s) => s.connected);

  // Derived boolean selector instead of reading the raw `prices` object.
  // Zustand bails out of re-rendering when a selector's *output* is
  // reference/value-equal to the previous one (`Object.is` comparison) —
  // so even though the underlying `prices` map changes every tick, this
  // boolean only flips once (false → true, the first time any price
  // arrives) and never causes a re-render again after that.
  const hasPrices = useMarketStore((s) => Object.keys(s.prices).length > 0);

  const [activeTab, setActiveTab] = useState<TabType>('hot');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useTicker24h();

  // Ordering/filtering now depends ONLY on ticker24h/activeTab/search —
  // never on price. Previously this list was rebuilt (and, for Gainers/
  // Losers, fully re-sorted with O(n log n)) on every single price tick,
  // even though the sort key (`change24h`) comes from ticker24h and never
  // actually changes on a raw price tick. Now the expensive sort only runs
  // when the data it depends on actually changes.
  const filtered = useMemo(() => {
    let symbols = ALL_SYMBOLS;
    if (search.trim()) {
      const q = search.toLowerCase();
      symbols = symbols.filter((symbol) => {
        const meta = SYMBOL_META[symbol];
        return meta.short.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q);
      });
    }
    const withTicker = symbols.map((symbol) => ({
      symbol,
      change24h: ticker24h[symbol]?.change ?? 0,
      sparkline: ticker24h[symbol]?.sparkline ?? [],
    }));
    if (activeTab === 'gainers') return [...withTicker].sort((a, b) => b.change24h - a.change24h);
    if (activeTab === 'losers') return [...withTicker].sort((a, b) => a.change24h - b.change24h);
    return withTicker;
  }, [ticker24h, activeTab, search]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<{ symbol: string; change24h: number; sparkline: number[] }>) => (
    <AssetRow
      symbol={item.symbol}
      change24h={item.change24h}
      sparkline={item.sparkline}
      index={index}
      router={router}
    />
  ), [router]);

  const keyExtractor = useCallback((item: { symbol: string }) => item.symbol, []);

  const handleTabPress = useCallback((key: TabType) => setActiveTab(key), []);
  const handleSearchFocus = useCallback(() => setSearchFocused(true), []);
  const handleSearchBlur = useCallback(() => setSearchFocused(false), []);
  const handleSearchClear = useCallback(() => setSearch(''), []);

  const ListHeader = useMemo(() => (
    <>
      <TopBar connected={connected} />
      <SearchBar
        value={search}
        focused={searchFocused}
        onChangeText={setSearch}
        onFocus={handleSearchFocus}
        onBlur={handleSearchBlur}
        onClear={handleSearchClear}
      />
      <TabsRow activeTab={activeTab} count={filtered.length} onTabPress={handleTabPress} />
      <SectionLabelRow activeTab={activeTab} count={filtered.length} />
      {LIST_COLUMN_HEADER}
    </>
  ), [connected, search, searchFocused, activeTab, filtered.length, handleSearchFocus, handleSearchBlur, handleSearchClear, handleTabPress]);

  const ListEmpty = useMemo(() => (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyText}>
        {hasPrices ? 'No assets found' : 'Connecting to live market feed...'}
      </Text>
    </Animated.View>
  ), [hasPrices]);

  // Previously a fresh array + object literal on every Market render. Market
  // now re-renders far less often than before (only for ticker/tab/search/
  // connection changes, not per price tick), so this is low-frequency, but
  // it's on the FlatList itself — the component where prop churn matters
  // most for scroll/navigation smoothness — so it's worth keeping stable.
  const contentContainerStyle = useMemo(
    () => [styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }],
    [insets.top]
  );

  // Same reasoning: a stable function reference instead of a new arrow
  // function on every render, for the prop FlatList consults on every
  // scroll/layout pass.
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
    []
  );

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={60}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={getItemLayout}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
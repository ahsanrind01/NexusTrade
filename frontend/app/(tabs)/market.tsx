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

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const T = {
  bg0: '#06070A',
  glass: 'rgba(255,255,255,0.04)',
  glassUp: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.09)',
  glassBorderHi: 'rgba(255,255,255,0.16)',
  hairline: 'rgba(255,255,255,0.07)',
  accent: '#7C8AFF',
  accentDeep: '#5B63E8',
  violet: '#B583FF',
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

const ALL_SYMBOLS = Object.keys(SYMBOL_META);

type TabType = 'hot' | 'gainers' | 'losers';

const TABS: { key: TabType; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

const ROW_HEIGHT = 74;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.15 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  screenTitle: { fontSize: 24, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.4 },
  screenSubtitle: { fontSize: 11.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.035)' },
  statusText: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 1.3 },
  searchRow: { marginBottom: 16, borderRadius: 17, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 14, borderWidth: 1, borderColor: T.glassBorder },
  searchWrapFocused: { borderColor: 'rgba(124,138,255,0.55)' },
  searchIcon: { fontSize: 17, color: T.textTer },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FontFamily.body, color: T.textPri },
  searchClear: { fontSize: 11, color: T.textTer, padding: 4 },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  tabsGroup: { flexDirection: 'row', gap: 4, backgroundColor: T.glass, borderRadius: 15, padding: 4, borderWidth: 1, borderColor: T.hairline },
  tab: { paddingHorizontal: 17, paddingVertical: 9, borderRadius: 11, overflow: 'hidden' },
  tabActive: { shadowColor: T.accentDeep, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  tabText: { fontSize: 12, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  tabTextActive: { color: '#fff' },
  countPill: { marginLeft: 'auto', backgroundColor: 'rgba(124,138,255,0.12)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(124,138,255,0.22)' },
  countText: { fontSize: 11, fontFamily: FontFamily.heading, color: T.accent },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  sectionAccentBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13.5, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2 },
  sectionCountPill: { backgroundColor: 'rgba(124,138,255,0.14)', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2.5 },
  sectionCountText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent },
  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 10 },
  listHeaderText: { fontSize: 9, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.8 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.glass, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: T.glassBorder, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  dotAccent: { width: 3, height: 32, borderRadius: 2 },
  assetIconBg: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  assetIconText: { fontSize: 12, fontFamily: FontFamily.heading },
  assetInfo: { flex: 1 },
  assetSymbol: { fontSize: 14.5, fontFamily: FontFamily.heading, color: T.textPri },
  assetName: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2.5 },
  sparklinePlaceholder: { width: 58, height: 34 },
  assetPriceCol: { alignItems: 'flex-end', gap: 6 },
  assetPrice: { fontSize: 13.5, fontFamily: FontFamily.heading, color: T.textPri },
  changeBadge: { paddingHorizontal: 7.5, paddingVertical: 3, borderRadius: 7 },
  changeText: { fontSize: 10, fontFamily: FontFamily.heading, letterSpacing: 0.2 },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyIcon: { fontSize: 32, color: T.textTer },
  emptyText: { fontSize: 13, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center' },
});

const AmbientField = memo(function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-12, 16]) },
      { translateY: interpolate(drift.value, [0, 1], [-10, 12]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [14, -16]) },
      { translateY: interpolate(drift.value, [0, 1], [8, -12]) },
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
      <Animated.View style={[styles.ambientOrb, { top: -90, right: -70, backgroundColor: T.violet }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { bottom: 180, left: -100, backgroundColor: T.accentDeep, opacity: 0.09 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { top: 460, right: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: T.gold, opacity: 0.05 }, orb3]} />
    </View>
  );
});

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28 }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,13,18,0.5)' }]} />
        {children}
      </View>
    );
  }
  return <View style={[style, { backgroundColor: T.glassUp, overflow: 'hidden' }]}>{children}</View>;
});

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
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
    </View>
  );
});

const PriceFlash = memo(function PriceFlash({ price, positive }: { price: string; positive: boolean }) {
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(${positive ? '61,220,151' : '255,107,122'}, ${flash.value * 0.2})`,
  }));
  useEffect(() => {
    flash.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 700 }));
  }, [price]);
  return (
    <Animated.View style={[{ borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1.5 }, flashStyle]}>
      <Text style={styles.assetPrice}>${price}</Text>
    </Animated.View>
  );
}, (p, n) => p.price === n.price && p.positive === n.positive);

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
      return { x1, y1, length, angle, opacity: 0.4 + (i / points.length) * 0.6 };
    });
  }, [points]);
  if (!segments) return <View style={styles.sparklinePlaceholder} />;
  const color = positive ? T.gain : T.loss;
  return (
    <View style={{ width: 58, height: 34 }}>
      {segments.map((s, i) => (
        <View key={i} style={{
          position: 'absolute', left: s.x1, top: s.y1,
          width: s.length, height: 2,
          backgroundColor: color, borderRadius: 2,
          opacity: s.opacity,
          transform: [{ rotate: `${s.angle}deg` }],
          transformOrigin: '0 0',
        }} />
      ))}
    </View>
  );
}, (p, n) => p.points === n.points && p.positive === n.positive);

function AssetRowBase({ symbol, change24h, sparkline, index, router }: {
  symbol: string; change24h: number; sparkline: number[]; index: number; router: Router;
}) {
  const price = useMarketStore((s) => s.prices[symbol]?.price ?? 0);

  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(lift.value, [0, 1], [1, 0.985]) }],
  }));
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: lift.value > 0 ? 'rgba(124,138,255,0.4)' : T.glassBorder,
  }));

  const meta = useMemo(
    () => SYMBOL_META[symbol] ?? { name: symbol, short: symbol.replace('USDT', ''), color: T.accent },
    [symbol]
  );
  const positive = change24h >= 0;

  const gradientColors = useMemo<[string, string]>(
    () => [positive ? T.gain + '09' : T.loss + '09', 'transparent'],
    [positive]
  );

  const dotStyle = useMemo(
    () => [styles.dotAccent, { backgroundColor: positive ? T.gain : T.loss }],
    [positive]
  );
  const iconBgStyle = useMemo(
    () => [styles.assetIconBg, { backgroundColor: meta.color + '16', borderColor: meta.color + '30' }],
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

  const handlePress = useCallback(() => {
    router.push({ pathname: '/(tabs)/cryptoGraph', params: { symbol } });
  }, [router, symbol]);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 22).springify().damping(20)} style={{ marginBottom: 9 }}>
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

const TopBar = memo(function TopBar({ connected }: { connected: boolean }) {
  return (
    <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
      <View>
        <Text style={styles.screenTitle}>Markets</Text>
        <Text style={styles.screenSubtitle}>{ALL_SYMBOLS.length} assets · real-time</Text>
      </View>
      <View style={[styles.statusPill, { borderColor: connected ? 'rgba(61,220,151,0.32)' : 'rgba(255,107,122,0.32)' }]}>
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
      <GlassPanel style={[styles.searchWrap, focused && styles.searchWrapFocused]} intensity={22}>
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

  const ticker24h = useMarketStore((s) => s.ticker24h);
  const connected = useMarketStore((s) => s.connected);

  const hasPrices = useMarketStore((s) => Object.keys(s.prices).length > 0);

  const [activeTab, setActiveTab] = useState<TabType>('hot');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useTicker24h();

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

  const contentContainerStyle = useMemo(
    () => [styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }],
    [insets.top]
  );

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
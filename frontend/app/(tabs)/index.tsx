import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, TextInput, KeyboardAvoidingView, Platform,
  ListRenderItemInfo,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withRepeat,
  interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../constants/typography';
import { useMarketStore } from '../../stores/marketStore';
import { useAuthStore } from '../../stores/authStore';
import { useMarketSocket } from '../../hooks/useMarketSocket';
import { useTicker24h } from '../../hooks/useTicker24h';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../stores/walletStore';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const { width } = Dimensions.get('window');

const TOP_5 = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

const SYMBOL_META: Record<string, { name: string; short: string; color: string }> = {
  BTCUSDT: { name: 'Bitcoin',   short: 'BTC', color: '#F7931A' },
  ETHUSDT: { name: 'Ethereum',  short: 'ETH', color: '#8FA3FF' },
  BNBUSDT: { name: 'BNB',       short: 'BNB', color: '#F3BA2F' },
  SOLUSDT: { name: 'Solana',    short: 'SOL', color: '#B583FF' },
  XRPUSDT: { name: 'XRP',       short: 'XRP', color: '#5EC8F2' },
};

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

const PERIODS = ['1D', '1W', '1M', '3M', 'ALL'];
const AI_SIGNALS = [
  { l: 'BTC Momentum', v: 'Strong ↑', c: T.gain },
  { l: 'Fear / Greed', v: '38',       c: T.gold },
  { l: 'Whale Alerts', v: '4',         c: T.accent },
];

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

function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-14, 16]) }, { translateY: interpolate(drift.value, [0, 1], [-10, 12]) }],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [12, -18]) }, { translateY: interpolate(drift.value, [0, 1], [8, -14]) }],
  }));
  const orb3 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-8, 10]) }, { translateY: interpolate(drift.value, [0, 1], [10, -8]) }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -90, left: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 150, right: -110, backgroundColor: T.violet, opacity: 0.09 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { top: 520, left: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: T.gold, opacity: 0.05 }, orb3]} />
    </View>
  );
}

const PortfolioCard = memo(function PortfolioCard() {
  const [activePeriod, setActivePeriod] = useState(0);
  const totalUsd = useWalletStore((s) => s.totalUsd);
  const balances = useWalletStore((s) => s.balances);
  const { isLoading } = useWallet();

  const BARS = [28, 40, 36, 56, 42, 68, 52, 64, 48, 80, 66, 100];

  const formattedTotal = totalUsd.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const assetCount = Object.keys(balances).length;

  return (
    <Animated.View entering={FadeInDown.delay(70).springify().damping(16)} style={styles.heroWrap}>
      <GlassPanel style={styles.heroPanel} intensity={34}>
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.45 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(124,138,255,0.14)', 'rgba(181,131,255,0.04)', 'transparent']}
          start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroInnerBorder} pointerEvents="none" />

        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.liveTag}>
              <PulseDot color={T.gain} />
              <Text style={styles.liveTagText}>PORTFOLIO</Text>
            </View>
            {isLoading && totalUsd === 0 ? (
              <View style={styles.skeletonValue} />
            ) : (
              <Text style={styles.heroValue}>${formattedTotal}</Text>
            )}
            <View style={styles.heroDeltaRow}>
              <View style={styles.deltaChip}>
                <Text style={styles.heroDelta}>
                  {assetCount > 0 ? `${assetCount} assets` : 'No assets'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.heroStatsCol}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>USDT</Text>
              <Text style={[styles.heroStatValue, { color: T.gain }]}>
                {balances['USDT'] ? `$${balances['USDT'].toFixed(2)}` : '—'}
              </Text>
            </View>
            <View style={[styles.heroStatItem, { marginTop: 14 }]}>
              <Text style={styles.heroStatLabel}>BTC</Text>
              <Text style={[styles.heroStatValue, { color: T.accent }]}>
                {balances['BTC'] ? balances['BTC'].toFixed(6) : '—'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.barsRow}>
          {BARS.map((h, i) => {
            const last = i === BARS.length - 1;
            return (
              <Animated.View key={i} entering={FadeInUp.delay(140 + i * 18).springify()} style={styles.barCol}>
                <LinearGradient
                  colors={last ? [T.violet, T.accent] : [T.accent + '00', T.accent + Math.round((0.08 + (i / BARS.length) * 0.34) * 255).toString(16).padStart(2, '0')]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={[styles.bar, { height: (h / 100) * 50 }]}
                />
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.periodRow}>
          {PERIODS.map((p, i) => (
            <TouchableOpacity
              key={p}
              onPress={() => setActivePeriod(i)}
              style={[styles.periodBtn, activePeriod === i && styles.periodBtnActive]}
            >
              {activePeriod === i && (
                <LinearGradient
                  colors={[T.accentDeep, T.violet]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Text style={[styles.periodText, activePeriod === i && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.heroDivider} />

        <View style={styles.statsStrip}>
          {[
            { l: 'TOTAL VALUE',  v: `$${formattedTotal}`,       c: undefined },
            { l: 'ASSETS',       v: `${assetCount}`,             c: T.accent  },
            { l: 'USDT BAL',     v: balances['USDT'] ? `$${balances['USDT'].toFixed(0)}` : '—', c: T.gain },
            { l: 'BTC BAL',      v: balances['BTC']  ? balances['BTC'].toFixed(5)  : '—', c: T.gold },
          ].map((s, i) => (
            <View key={s.l} style={[styles.statCell, i > 0 && styles.statCellDivider]}>
              <Text style={styles.statCellLabel}>{s.l}</Text>
              <Text style={[styles.statCellValue, s.c ? { color: s.c } : {}]}>{s.v}</Text>
            </View>
          ))}
        </View>
      </GlassPanel>
    </Animated.View>
  );
});

const ActionButton = memo(function ActionButton({ label, icon, color }: { label: string; icon: string; color: string }) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.9]) }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(press.value, [0, 1], [0, 1]) }));
  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center' }, animStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => { press.value = withSpring(1, { damping: 14 }); }}
        onPressOut={() => { press.value = withSpring(0, { damping: 10 }); }}
        style={{ alignItems: 'center' }}
      >
        <View style={styles.actionIconShell}>
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 17, backgroundColor: color, opacity: 0.28 }, glowStyle]} />
          <Text style={[styles.actionIcon, { color }]}>{icon}</Text>
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const QuickActions = memo(function QuickActions() {
  return (
    <Animated.View entering={FadeInDown.delay(150).springify().damping(16)} style={styles.actionsPanelWrap}>
      <GlassPanel style={styles.actionsPanel} intensity={24}>
        <View style={styles.actionsRow}>
          <ActionButton label="Add Funds" icon="＋" color={T.gain} />
          <ActionButton label="Withdraw"  icon="↑"  color={T.loss} />
          <ActionButton label="Trade"     icon="⇄"  color={T.accent} />
          <ActionButton label="Transfer"  icon="→"  color={T.violet} />
        </View>
      </GlassPanel>
    </Animated.View>
  );
});

const AIInsightCard = memo(function AIInsightCard() {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: interpolate(shimmer.value, [0, 1], [0.55, 1]) }));
  return (
    <Animated.View entering={FadeInDown.delay(200).springify().damping(16)} style={styles.aiWrap}>
      <GlassPanel style={styles.aiPanel} intensity={26}>
        <LinearGradient colors={['rgba(124,138,255,0.16)', 'rgba(181,131,255,0.06)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.aiHeader}>
          <Animated.View style={[styles.aiIconShell, shimmerStyle]}>
            <Text style={styles.aiIcon}>◈</Text>
          </Animated.View>
          <Text style={styles.aiTitle}>AI Market Intelligence</Text>
          <View style={styles.aiLivePill}>
            <PulseDot color={T.accent} />
            <Text style={styles.aiLiveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.aiSummary}>
          BTC showing strong buying pressure near key support. ETH remains range-bound — watch for a breakout above resistance.
        </Text>
        <View style={styles.aiSignalsRow}>
          {AI_SIGNALS.map((s) => (
            <View key={s.l} style={styles.aiSignal}>
              <Text style={styles.aiSignalLabel}>{s.l}</Text>
              <Text style={[styles.aiSignalValue, { color: s.c }]}>{s.v}</Text>
            </View>
          ))}
        </View>
      </GlassPanel>
    </Animated.View>
  );
});

function assetPropsEqual(p: any, n: any) {
  return (
    p.asset.symbol === n.asset.symbol &&
    p.asset.price === n.asset.price &&
    p.change24h === n.change24h &&
    p.sparkline === n.sparkline
  );
}

const AssetRow = memo(function AssetRow({
  asset, index, change24h, sparkline, onPress,
}: {
  asset: any; index: number; change24h: number; sparkline: number[]; onPress: () => void;
}) {
  const lift = useSharedValue(0);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(lift.value, [0, 1], [1, 0.985]) },
      { translateY: interpolate(lift.value, [0, 1], [0, 1]) },
    ],
  }));
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: lift.value > 0
      ? `rgba(124,138,255,${interpolate(lift.value, [0, 1], [0.1, 0.4])})`
      : T.glassBorder,
  }));

  const meta = SYMBOL_META[asset.symbol];
  const positive = change24h >= 0;
  const price = asset.price >= 1000
    ? asset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : asset.price >= 1 ? asset.price.toFixed(4)
    : asset.price.toFixed(6);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 40).springify().damping(18)} style={{ marginBottom: 9 }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { lift.value = withTiming(1, { duration: 120 }); }}
        onPressOut={() => { lift.value = withTiming(0, { duration: 220 }); }}
      >
        <Animated.View style={[styles.assetRow, liftStyle, borderStyle]}>
          <View style={[styles.dotAccent, { backgroundColor: positive ? T.gain : T.loss }]} />
          <View style={[styles.assetIconBg, { backgroundColor: meta.color + '16', borderColor: meta.color + '30' }]}>
            <Text style={[styles.assetIconText, { color: meta.color }]}>{meta.short.slice(0, 2)}</Text>
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetSymbol}>{meta.short}</Text>
            <Text style={styles.assetName}>{meta.name}</Text>
          </View>
          <Sparkline points={sparkline} positive={positive} />
          <View style={styles.assetPriceCol}>
            <PriceFlash price={price} positive={positive} />
            <View style={[styles.changeBadge, { backgroundColor: positive ? T.gainDim : T.lossDim }]}>
              <Text style={[styles.changeText, { color: positive ? T.gain : T.loss }]}>
                {positive ? '+' : ''}{change24h.toFixed(2)}%
              </Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}, assetPropsEqual);

const ROW_HEIGHT = 74;

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const connected = useMarketStore((s) => s.connected);
  const prices = useMarketStore((s) => s.prices);
  const ticker24h = useMarketStore((s) => s.ticker24h);

  useMarketSocket();
  useTicker24h(TOP_5);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const top5Assets = useMemo(() =>
    TOP_5
      .map((sym) => prices[sym])
      .filter(Boolean),
    [prices]
  );

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<any>) => (
    <AssetRow
      asset={item}
      index={index}
      change24h={ticker24h[item.symbol]?.change ?? 0}
      sparkline={ticker24h[item.symbol]?.sparkline ?? []}
      onPress={() => router.push({ pathname: '/(tabs)/cryptoGraph', params: { symbol: item.symbol } })}
    />
  ), [ticker24h, router]);

  const keyExtractor = useCallback((item: any) => item.symbol, []);

  const ListHeader = useMemo(() => (
    <>
      <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.userName}>{user?.name ?? 'Trader'}</Text>
        </View>
        <View style={styles.topRight}>
          <View style={[styles.statusPill, { borderColor: connected ? 'rgba(61,220,151,0.32)' : 'rgba(255,107,122,0.32)' }]}>
            <PulseDot color={connected ? T.gain : T.loss} />
            <Text style={[styles.statusText, { color: connected ? T.gain : T.loss }]}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </Text>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <View style={styles.notifDot} />
            <Text style={styles.notifIcon}>◉</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <PortfolioCard />
      <QuickActions />
      <AIInsightCard />

      <View style={styles.sectionLabelRow}>
        <View style={styles.sectionAccentBar} />
        <Text style={styles.sectionLabelText}>Top Markets</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/market')} style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>See all →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>Asset</Text>
        <Text style={[styles.listHeaderText, { marginLeft: 'auto', marginRight: 58 }]}>24H</Text>
        <Text style={styles.listHeaderText}>Price</Text>
      </View>
    </>
  ), [greeting, user?.name, connected]);

  const ListEmpty = useMemo(() => (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyText}>Connecting to live market feed...</Text>
    </Animated.View>
  ), []);

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={top5Assets}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.15 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.6 },
  userName: { fontSize: 24, fontFamily: FontFamily.heading, color: T.textPri, marginTop: 4, letterSpacing: -0.4 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.035)' },
  statusText: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 1.3 },
  notifBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  notifDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.loss, position: 'absolute', top: 8, right: 8, borderWidth: 1.5, borderColor: T.bg0, zIndex: 1 },
  notifIcon: { fontSize: 16, color: T.textSec },

  heroWrap: { marginBottom: 18, borderRadius: 28, shadowColor: T.accentDeep, shadowOpacity: 0.32, shadowRadius: 34, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  heroPanel: { borderRadius: 28, padding: 22, borderWidth: 1, borderColor: T.glassBorderHi },
  heroInnerBorder: { position: 'absolute', top: 1, left: 1, right: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderTopLeftRadius: 27, borderTopRightRadius: 27 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.gainDim, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 11, borderWidth: 1, borderColor: 'rgba(61,220,151,0.2)' },
  liveTagText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.gain, letterSpacing: 1.5 },
  heroValue: { fontSize: 40, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1.4 },
  heroDeltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 9 },
  heroDelta: { fontSize: 14, fontFamily: FontFamily.heading, color: T.gain },
  heroDeltaPct: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  heroStatsCol: { alignItems: 'flex-end' },
  heroStatItem: { alignItems: 'flex-end' },
  heroStatLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.9, marginBottom: 4 },
  heroStatValue: { fontSize: 16, fontFamily: FontFamily.heading },

  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3.5, height: 56, marginBottom: 20 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },

  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' },
  periodBtnActive: { borderColor: 'transparent', shadowColor: T.accentDeep, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  periodText: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  periodTextActive: { color: '#fff' },

  heroDivider: { height: 1, backgroundColor: T.hairline, marginBottom: 18 },
  statsStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  statCell: { alignItems: 'flex-start', flex: 1 },
  statCellDivider: { borderLeftWidth: 1, borderLeftColor: T.hairline, paddingLeft: 12 },
  statCellLabel: { fontSize: 8, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.7, marginBottom: 5 },
  statCellValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },

  actionsPanelWrap: { marginBottom: 16, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  actionsPanel: { borderRadius: 24, paddingVertical: 19, paddingHorizontal: 10, borderWidth: 1, borderColor: T.glassBorder },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionIconShell: { width: 54, height: 54, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: T.hairline, justifyContent: 'center', alignItems: 'center', marginBottom: 9, overflow: 'hidden' },
  actionIcon: { fontSize: 20, fontFamily: FontFamily.heading },
  actionLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textSec, letterSpacing: 0.3 },

  aiWrap: { marginBottom: 16, borderRadius: 24, shadowColor: T.accent, shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  aiPanel: { borderRadius: 24, padding: 18, borderWidth: 1, borderColor: T.glassBorderHi },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  aiIconShell: { width: 31, height: 31, borderRadius: 10, backgroundColor: 'rgba(124,138,255,0.18)', borderWidth: 1, borderColor: 'rgba(124,138,255,0.34)', justifyContent: 'center', alignItems: 'center' },
  aiIcon: { fontSize: 14, color: T.accent },
  aiTitle: { fontSize: 13.5, fontFamily: FontFamily.heading, color: T.textPri, flex: 1, letterSpacing: -0.15 },
  aiLivePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(124,138,255,0.14)' },
  aiLiveText: { fontSize: 8, fontFamily: FontFamily.heading, color: T.accent, letterSpacing: 1.1 },
  aiSummary: { fontSize: 12.5, fontFamily: FontFamily.body, color: T.textSec, lineHeight: 19.5, marginBottom: 15 },
  aiSignalsRow: { flexDirection: 'row', gap: 9 },
  aiSignal: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: T.hairline },
  aiSignalLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, marginBottom: 5 },
  aiSignalValue: { fontSize: 12.5, fontFamily: FontFamily.heading },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  sectionAccentBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13.5, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2, flex: 1 },
  seeAllBtn: {},
  seeAllText: { fontSize: 12, fontFamily: FontFamily.bodyMedium, color: T.accent },

  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, marginBottom: 10 },
  listHeaderText: { fontSize: 9, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.8 },

  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.glass, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: T.glassBorder, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
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

  skeletonValue: {
    width: 190, height: 44, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 8,
  },
  deltaChip: {
    backgroundColor: T.gainDim, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(61,220,151,0.2)',
    alignSelf: 'flex-start', marginTop: 6,
  },
});
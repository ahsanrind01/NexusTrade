import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat,
  withSequence, interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily } from '../../constants/typography';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../stores/walletStore';
import {
  useFundingHistory,
  useCreateDepositIntent,
  useSimulateCryptoDeposit,
  useCreateWithdrawalIntent,
} from '../../hooks/useFunding';
import { useFundingStore } from '../../stores/fundingStore';

// [P6] Evaluated once — avoids conditional require() inside render
let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}
const HAS_BLUR = BlurView !== null;

const { width } = Dimensions.get('window');

// ─── Design tokens (unchanged) ────────────────────────────────────────────────
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

// ─── Asset metadata (unchanged) ───────────────────────────────────────────────
const ASSET_META: Record<string, { name: string; color: string; symbol: string }> = {
  USDT:  { name: 'Tether',    color: '#26A17B', symbol: '$' },
  BTC:   { name: 'Bitcoin',   color: '#F7931A', symbol: '₿' },
  ETH:   { name: 'Ethereum',  color: '#8FA3FF', symbol: 'Ξ' },
  BNB:   { name: 'BNB',       color: '#F3BA2F', symbol: 'B' },
  SOL:   { name: 'Solana',    color: '#B583FF', symbol: 'S' },
  XRP:   { name: 'XRP',       color: '#5EC8F2', symbol: 'X' },
  ADA:   { name: 'Cardano',   color: '#5C7CFA', symbol: 'A' },
  DOGE:  { name: 'Dogecoin',  color: '#E0C354', symbol: 'D' },
  AVAX:  { name: 'Avalanche', color: '#F06A6E', symbol: 'A' },
};

// [P7] Module-level static constants — never reallocated
const FIAT_ASSETS = new Set(['USDT', 'USDC']);
const MODAL_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type HistoryItem = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  asset: string;
  amount: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  time: string;
};

// ─── [P1] GlassPanel — memo, HAS_BLUR checked at module level ─────────────────
const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28 }: any) {
  if (HAS_BLUR) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
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

// ─── [P1] PulseDot — memo: color prop never changes after mount ───────────────
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

// ─── [P1] AmbientField — memo: pure decoration, never needs to re-render ──────
const AmbientField = memo(function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    // [C5] Easing.sine is the correct API (not Easing.sin)
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-10, 12]) },
      { translateY: interpolate(drift.value, [0, 1], [-6, 10]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [8, -14]) },
      { translateY: interpolate(drift.value, [0, 1], [4, -10]) },
    ],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -60, right: -80, backgroundColor: T.violet }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { bottom: 200, left: -100, backgroundColor: T.accentDeep, opacity: 0.10 }, orb2]} />
    </View>
  );
});

// ─── [B3] FundingModal — wired to real backend endpoints ──────────────────────
function FundingModal({ visible, mode, onClose, onSuccess }: {
  visible: boolean;
  mode: 'deposit' | 'withdraw';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [asset, setAsset] = useState<typeof MODAL_ASSETS[number]>('USDT');
  const [amount, setAmount] = useState('');

  // [B3,B5] Real API calls to the funding service through the gateway,
  // via React Query mutations (see hooks/useFunding.ts).
  const createDepositIntent = useCreateDepositIntent();
  const simulateCryptoDeposit = useSimulateCryptoDeposit();
  const createWithdrawalIntent = useCreateWithdrawalIntent();
  const loading =
    createDepositIntent.isPending ||
    simulateCryptoDeposit.isPending ||
    createWithdrawalIntent.isPending;

  const translateY = useSharedValue(600);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 280 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 160 });
    } else {
      backdropOp.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(600, { duration: 260 });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  // [B3,B5] Real API calls to the funding service through the gateway.
  // Deposits go through a two-step flow on the backend: an intent is
  // created first (POST /funding/deposit/intent); for on-chain assets we
  // then immediately simulate the confirmation (POST
  // /funding/deposit/simulate-crypto) since there's no real chain watcher
  // in this environment. FIAT_STRIPE intents settle via the Stripe
  // webhook instead, so no follow-up call is needed there.
  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    // [B5] type field: stablecoins are fiat on-ramp, everything else is on-chain
    const type = FIAT_ASSETS.has(asset) ? 'FIAT_STRIPE' : 'CRYPTO_ETH';

    try {
      if (mode === 'deposit') {
        const { transaction } = await createDepositIntent.mutateAsync({ asset, amount, type });
        if (type === 'CRYPTO_ETH') {
          await simulateCryptoDeposit.mutateAsync(transaction.id);
        }
        Alert.alert('Success', 'Deposit request submitted.');
      } else {
        await createWithdrawalIntent.mutateAsync({
          asset,
          amount,
          type,
          // Mock destination for the on-chain path; a real UI would collect this.
          destinationAddress: type === 'CRYPTO_ETH' ? '0xUserProvidedDestinationAddress' : undefined,
        });
        Alert.alert('Success', 'Withdrawal request submitted.');
      }
      setAmount('');
      onSuccess();  // trigger a balance refetch
      onClose();
    } catch (err: any) {
      Alert.alert('Failed', err.response?.data?.error || 'Something went wrong');
    }
  };

  const meta = ASSET_META[asset];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]}>
          <GlassPanel style={styles.sheetPanel} intensity={40}>
            <LinearGradient
              colors={[mode === 'deposit' ? T.gain + '12' : T.loss + '12', 'transparent']}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIconWrap, {
                backgroundColor: mode === 'deposit' ? T.gainDim : T.lossDim,
                borderColor: mode === 'deposit' ? T.gain + '40' : T.loss + '40',
              }]}>
                <Text style={[styles.sheetIcon, { color: mode === 'deposit' ? T.gain : T.loss }]}>
                  {mode === 'deposit' ? '↓' : '↑'}
                </Text>
              </View>
              <View>
                <Text style={styles.sheetTitle}>{mode === 'deposit' ? 'Add Funds' : 'Withdraw'}</Text>
                <Text style={styles.sheetSubtitle}>
                  {mode === 'deposit' ? 'Deposit assets to your wallet' : 'Withdraw assets from your wallet'}
                </Text>
              </View>
            </View>

            <Text style={styles.sheetLabel}>Select Asset</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetPickerScroll}>
              <View style={styles.assetPickerRow}>
                {MODAL_ASSETS.map((a) => {
                  const m = ASSET_META[a];
                  const selected = asset === a;
                  return (
                    <TouchableOpacity
                      key={a}
                      onPress={() => setAsset(a)}
                      style={[
                        styles.assetPill,
                        selected && { borderColor: m.color, backgroundColor: m.color + '18' },
                      ]}
                    >
                      <View style={[styles.assetPillDot, { backgroundColor: m.color }]} />
                      <Text style={[styles.assetPillText, selected && { color: m.color }]}>{a}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.sheetLabel}>Amount</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.amountSymbol}>{meta?.symbol ?? '$'}</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={T.textTer}
                keyboardType="decimal-pad"
                autoFocus={false}
              />
              <TouchableOpacity onPress={() => setAmount('100')} style={styles.maxBtn}>
                <Text style={styles.maxText}>MAX</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sheetInfoRow}>
              <Text style={styles.sheetInfoLabel}>Network fee</Text>
              <Text style={styles.sheetInfoValue}>~$0.50</Text>
            </View>
            <View style={styles.sheetInfoRow}>
              <Text style={styles.sheetInfoLabel}>Processing time</Text>
              <Text style={styles.sheetInfoValue}>{mode === 'deposit' ? 'Instant' : '1-2 mins'}</Text>
            </View>

            <TouchableOpacity
              style={styles.sheetSubmitBtn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={mode === 'deposit' ? ['#3DDC97', '#2AB87D'] : ['#FF6B7A', '#D94F5C']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.sheetSubmitGradient}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.sheetSubmitText}>
                      {mode === 'deposit' ? 'CONFIRM DEPOSIT' : 'CONFIRM WITHDRAWAL'} →
                    </Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </GlassPanel>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── [P2] AssetCard — memo with custom comparator ─────────────────────────────
// Only re-renders when this specific asset's balance or USD value changes.
// Without memo, every 30s balance refetch re-renders all asset cards.
const AssetCard = memo(function AssetCard({
  asset, balance, usdValue, index,
}: {
  asset: string;
  balance: number;
  usdValue: number;
  index: number;
}) {
  const meta = ASSET_META[asset] ?? { name: asset, color: T.accent, symbol: asset[0] };
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => { scale.value = withSpring(0.97); }, []);
  const onPressOut = useCallback(() => { scale.value = withSpring(1); }, []);

  // [P5] Format only when balance/usd changes
  const balanceStr = useMemo(() => {
    if (balance < 0.001) return balance.toFixed(6);
    if (balance < 1) return balance.toFixed(4);
    return balance.toFixed(2);
  }, [balance]);

  const usdStr = useMemo(() =>
    usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [usdValue]
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 60).springify().damping(18)}
      style={[animStyle, styles.assetCardWrap]}
    >
      <TouchableOpacity activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}>
        <GlassPanel style={styles.assetCard} intensity={24}>
          <LinearGradient
            colors={[meta.color + '0A', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.assetCardLeft}>
            <View style={[styles.assetCardIcon, { backgroundColor: meta.color + '18', borderColor: meta.color + '30' }]}>
              <Text style={[styles.assetCardIconText, { color: meta.color }]}>{asset.slice(0, 2)}</Text>
            </View>
            <View>
              <Text style={styles.assetCardSymbol}>{asset}</Text>
              <Text style={styles.assetCardName}>{meta.name}</Text>
            </View>
          </View>

          <View style={styles.assetCardRight}>
            <Text style={styles.assetCardBalance}>{balanceStr}</Text>
            <Text style={styles.assetCardUsd}>≈ ${usdStr}</Text>
          </View>

          <View style={[styles.assetCardAccent, { backgroundColor: meta.color }]} />
        </GlassPanel>
      </TouchableOpacity>
    </Animated.View>
  );
// [P2] Custom comparator: re-render only if balance or usd value changed
}, (prev, next) =>
  prev.asset === next.asset &&
  prev.balance === next.balance &&
  prev.usdValue === next.usdValue
);

// ─── [P3] HistoryRow — memo: history items are immutable after fetch ───────────
const HistoryRow = memo(function HistoryRow({ item, index }: { item: HistoryItem; index: number }) {
  const isDeposit = item.type === 'DEPOSIT';
  const isPending = item.status === 'PENDING' || item.status === 'PROCESSING';
  const isFailed = item.status === 'FAILED';
  const statusColor = isFailed ? T.loss : isPending ? T.gold : T.gain;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify().damping(18)} style={styles.historyRow}>
      <View style={[
        styles.historyIconWrap,
        {
          backgroundColor: isDeposit ? T.gainDim : T.lossDim,
          borderColor: isDeposit ? T.gain + '30' : T.loss + '30',
        },
      ]}>
        <Text style={[styles.historyIcon, { color: isDeposit ? T.gain : T.loss }]}>
          {isDeposit ? '↓' : '↑'}
        </Text>
      </View>

      <View style={styles.historyInfo}>
        <Text style={styles.historyType}>{isDeposit ? 'Deposit' : 'Withdrawal'}</Text>
        <Text style={styles.historyTime}>{item.time}</Text>
      </View>

      <View style={styles.historyRight}>
        <Text style={[styles.historyAmount, { color: isDeposit ? T.gain : T.loss }]}>
          {isDeposit ? '+' : '-'}{item.amount} {item.asset}
        </Text>
        <View style={[styles.historyStatusPill, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.historyStatus, { color: statusColor }]}>
            {item.status}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── [B2] Transaction history is now sourced from the funding-service via
// the useFundingHistory hook + fundingStore (see hooks/useFunding.ts).
// This local mapper just adapts the store's FundingTransaction shape into
// the HistoryItem shape this screen already renders.
function toHistoryItems(transactions: ReturnType<typeof useFundingStore.getState>['transactions']): HistoryItem[] {
  return transactions.map((tx) => ({
    id: tx.id,
    type: tx.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAW',
    asset: tx.asset.toUpperCase(),
    amount: tx.amount,
    status: tx.status,
    time: new Date(tx.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }));
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function Wallet() {
  const insets = useSafeAreaInsets();

  // [B1] Real balances via React Query + walletStore
  const { isLoading, isFetching, refetch } = useWallet();

  // [B4] Read computed values from the store (setBalances computes totalUsd)
  const balances = useWalletStore((s) => s.balances);
  const totalUsd = useWalletStore((s) => s.totalUsd);

  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<'assets' | 'history'>('assets');

  // [B2] Real funding history via React Query + fundingStore
  const { isLoading: historyLoading, refetch: refetchHistory } = useFundingHistory();
  const transactions = useFundingStore((s) => s.transactions);
  const history = useMemo(() => toHistoryItems(transactions), [transactions]);

  // [P5] Derive assetList from store — only recomputes when balances changes
  const assetList = useMemo(() =>
    Object.entries(balances).filter(([, v]) => v > 0),
    [balances]
  );

  // [P4] Stable handler references
  const openDeposit = useCallback(() => {
    setModalMode('deposit');
    setModalVisible(true);
  }, []);

  const openWithdraw = useCallback(() => {
    setModalMode('withdraw');
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => setModalVisible(false), []);

  // After a successful deposit/withdraw, refetch balance and history
  const onFundingSuccess = useCallback(() => {
    refetch();
    refetchHistory();
  }, [refetch, refetchHistory]);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const handleSectionAssets = useCallback(() => setActiveSection('assets'), []);
  const handleSectionHistory = useCallback(() => setActiveSection('history'), []);

  const totalUsdStr = useMemo(() =>
    totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [totalUsd]
  );

  return (
    <View style={styles.root}>
      <AmbientField />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={T.accent}
          />
        }
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
          <View>
            <Text style={styles.pageLabel}>Wallet</Text>
            <Text style={styles.pageSubLabel}>Your assets & balances</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={onRefresh}>
            <Text style={styles.notifIcon}>↻</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Hero balance card ────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.heroWrap}>
          <GlassPanel style={styles.heroPanel} intensity={32}>
            <LinearGradient
              colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(124,138,255,0.12)', 'transparent']}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.9 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroTop}>
              <View style={styles.heroBadge}>
                <PulseDot color={T.gain} />
                <Text style={styles.heroBadgeText}>TOTAL BALANCE</Text>
              </View>

              {isLoading ? (
                <ActivityIndicator color={T.accent} size="large" style={styles.heroLoader} />
              ) : (
                <Text style={styles.heroValue}>${totalUsdStr}</Text>
              )}

              <View style={styles.heroDeltaRow}>
                <View style={styles.heroDeltaBadge}>
                  <Text style={styles.heroDeltaText}>↑ +3.51% today</Text>
                </View>
                <Text style={styles.heroAssetCount}>{assetList.length} assets</Text>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroActionsRow}>
              <TouchableOpacity style={styles.heroActionBtn} onPress={openDeposit} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#3DDC97', '#2AB87D']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.heroActionGradient}
                >
                  <Text style={styles.heroActionIcon}>↓</Text>
                  <Text style={styles.heroActionText}>ADD FUNDS</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.heroActionBtn} onPress={openWithdraw} activeOpacity={0.8}>
                <LinearGradient
                  colors={['#FF6B7A', '#D94F5C']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.heroActionGradient}
                >
                  <Text style={styles.heroActionIcon}>↑</Text>
                  <Text style={styles.heroActionText}>WITHDRAW</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.heroActionBtn, styles.heroActionBtnGhost]} activeOpacity={0.8}>
                <Text style={[styles.heroActionIcon, styles.heroActionIconAccent]}>→</Text>
                <Text style={[styles.heroActionText, styles.heroActionTextAccent]}>TRANSFER</Text>
              </TouchableOpacity>
            </View>
          </GlassPanel>
        </Animated.View>

        {/* ── Section toggle ───────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(16)} style={styles.sectionToggle}>
          <TouchableOpacity
            onPress={handleSectionAssets}
            style={[styles.sectionBtn, activeSection === 'assets' && styles.sectionBtnActive]}
          >
            {activeSection === 'assets' && (
              <LinearGradient
                colors={[T.accentDeep, T.violet]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[styles.sectionBtnText, activeSection === 'assets' && styles.sectionBtnTextActive]}>
              Assets
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSectionHistory}
            style={[styles.sectionBtn, activeSection === 'history' && styles.sectionBtnActive]}
          >
            {activeSection === 'history' && (
              <LinearGradient
                colors={[T.accentDeep, T.violet]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[styles.sectionBtnText, activeSection === 'history' && styles.sectionBtnTextActive]}>
              History
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Assets section ───────────────────────────────────────── */}
        {activeSection === 'assets' ? (
          <View>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionLabelText}>Your Holdings</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>{assetList.length}</Text>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={T.accent} />
                <Text style={styles.loadingText}>Loading balances...</Text>
              </View>
            ) : assetList.length === 0 ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
                <Text style={styles.emptyIcon}>◎</Text>
                <Text style={styles.emptyTitle}>No Assets Yet</Text>
                <Text style={styles.emptyText}>Add funds to get started trading</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={openDeposit}>
                  <LinearGradient
                    colors={[T.accentDeep, T.violet]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.emptyBtnGradient}
                  >
                    <Text style={styles.emptyBtnText}>Add Funds →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              assetList.map(([asset, balance], i) => {
                // Compute usdValue here so AssetCard's memo comparator can use it
                const meta = ASSET_META[asset];
                const usdValue = balance * (meta ? 1 : 0); // walletStore already has price-adjusted total; pass raw for display
                return (
                  <AssetCard
                    key={asset}
                    asset={asset}
                    balance={balance}
                    usdValue={usdValue}
                    index={i}
                  />
                );
              })
            )}
          </View>
        ) : (
          /* ── History section ────────────────────────────────────── */
          <View>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionLabelText}>Transaction History</Text>
            </View>

            {historyLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={T.accent} />
                <Text style={styles.loadingText}>Loading history...</Text>
              </View>
            ) : history.length === 0 ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
                <Text style={styles.emptyIcon}>◎</Text>
                <Text style={styles.emptyTitle}>No Transactions</Text>
                <Text style={styles.emptyText}>Your deposits and withdrawals will appear here</Text>
              </Animated.View>
            ) : (
              history.map((item, i) => (
                <HistoryRow key={item.id} item={item} index={i} />
              ))
            )}
          </View>
        )}
      </ScrollView>

      <FundingModal
        visible={modalVisible}
        mode={modalMode}
        onClose={closeModal}
        onSuccess={onFundingSuccess}
      />
    </View>
  );
}

// ─── Styles (not a single value changed from original) ───────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.13 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  pageLabel: { fontSize: 26, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.5 },
  pageSubLabel: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  notifBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  notifIcon: { fontSize: 18, color: T.textSec },

  heroWrap: {
    marginBottom: 16, borderRadius: 26,
    shadowColor: T.accentDeep, shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  heroPanel: { borderRadius: 26, padding: 20, borderWidth: 1, borderColor: T.glassBorderHi },
  heroTop: { marginBottom: 18 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: T.gainDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(61,220,151,0.18)',
  },
  heroBadgeText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.gain, letterSpacing: 1.4 },
  heroLoader: { marginVertical: 16 },
  heroValue: { fontSize: 42, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1.5, marginBottom: 10 },
  heroDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDeltaBadge: { backgroundColor: T.gainDim, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(61,220,151,0.2)' },
  heroDeltaText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.gain },
  heroAssetCount: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  heroDivider: { height: 1, backgroundColor: T.hairline, marginBottom: 16 },

  heroActionsRow: { flexDirection: 'row', gap: 8 },
  heroActionBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  heroActionGradient: { paddingVertical: 12, alignItems: 'center', gap: 3 },
  heroActionBtnGhost: {
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorderHi,
    paddingVertical: 12, alignItems: 'center', gap: 3, justifyContent: 'center', flexDirection: 'column',
  },
  heroActionIcon: { fontSize: 14, color: '#fff', fontFamily: FontFamily.heading },
  heroActionIconAccent: { color: T.accent },
  heroActionText: { fontSize: 9, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 1 },
  heroActionTextAccent: { color: T.accent },

  sectionToggle: {
    flexDirection: 'row', gap: 4, backgroundColor: T.glass,
    borderRadius: 14, padding: 4, borderWidth: 1, borderColor: T.hairline,
    alignSelf: 'flex-start', marginBottom: 20,
  },
  sectionBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, overflow: 'hidden' },
  sectionBtnActive: {},
  sectionBtnText: { fontSize: 13, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  sectionBtnTextActive: { color: '#fff' },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2 },
  sectionCountPill: { backgroundColor: 'rgba(124,138,255,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sectionCountText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent },

  assetCardWrap: { marginBottom: 10 },
  assetCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: T.glassBorder, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  assetCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  assetCardIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  assetCardIconText: { fontSize: 13, fontFamily: FontFamily.heading },
  assetCardSymbol: { fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri },
  assetCardName: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  assetCardRight: { alignItems: 'flex-end', marginRight: 10 },
  assetCardBalance: { fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri },
  assetCardUsd: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  assetCardAccent: { width: 2.5, height: 34, borderRadius: 2, opacity: 0.7 },

  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.glass, borderRadius: 17,
    paddingVertical: 13, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 1, borderColor: T.glassBorder,
  },
  historyIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  historyIcon: { fontSize: 16, fontFamily: FontFamily.heading },
  historyInfo: { flex: 1 },
  historyType: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri },
  historyTime: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: { fontSize: 13, fontFamily: FontFamily.heading },
  historyStatusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  historyStatus: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 0.5 },

  loadingState: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontFamily: FontFamily.body, color: T.textTer },
  emptyState: { paddingVertical: 50, alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 36, color: T.textTer, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontFamily: FontFamily.heading, color: T.textPri },
  emptyText: { fontSize: 13, fontFamily: FontFamily.body, color: T.textTer },
  emptyBtn: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  emptyBtnGradient: { paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center' },
  emptyBtnText: { fontSize: 13, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 0.5 },

  backdrop: { backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetPanel: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderColor: T.glassBorderHi, paddingBottom: 44 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.glassBorder, alignSelf: 'center', marginBottom: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  sheetIconWrap: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetIcon: { fontSize: 20, fontFamily: FontFamily.heading },
  sheetTitle: { fontSize: 20, fontFamily: FontFamily.heading, color: T.textPri },
  sheetSubtitle: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  sheetLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.8, marginBottom: 10 },
  assetPickerScroll: { marginBottom: 20 },
  assetPickerRow: { flexDirection: 'row', gap: 8 },
  assetPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder },
  assetPillDot: { width: 6, height: 6, borderRadius: 3 },
  assetPillText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textSec },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: T.glassBorderHi, marginBottom: 16, gap: 10 },
  amountSymbol: { fontSize: 18, fontFamily: FontFamily.heading, color: T.textTer },
  amountInput: { flex: 1, fontSize: 22, fontFamily: FontFamily.heading, color: T.textPri },
  maxBtn: { backgroundColor: T.accentDeep + '30', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: T.accent + '40' },
  maxText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent, letterSpacing: 1 },
  sheetInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetInfoLabel: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  sheetInfoValue: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textSec },
  sheetSubmitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 16 },
  sheetSubmitGradient: { paddingVertical: 17, alignItems: 'center' },
  sheetSubmitText: { fontSize: 13, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 1.5 },
});
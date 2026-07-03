import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, Dimensions, TextInput,
  KeyboardAvoidingView, Platform, Keyboard,
  TouchableWithoutFeedback, Alert, ActivityIndicator,
  ListRenderItemInfo,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeInRight,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withRepeat,
  interpolate, Easing, runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily } from '../../constants/typography';
import { useMarketStore } from '../../stores/marketStore';
import { useMarketSocket } from '../../hooks/useMarketSocket';
import { useWallet } from '../../hooks/useWallet';
import { useWalletStore } from '../../stores/walletStore';
import { useMyOrders, useMyTrades, usePlaceOrder, useCancelOrder } from '../../hooks/useOrders';
import { useOrderStore, Trade as TradeFill, TradeRole } from '../../stores/orderStore';

// ─── Blur fallback ────────────────────────────────────────────────────────────
let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch { BlurView = null; }

const { width } = Dimensions.get('window');

// ─── Design tokens (identical to Home) ───────────────────────────────────────
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

// ─── Tradeable pairs (matches backend + SYMBOL_META) ─────────────────────────
// Deduped once at module scope, instead of filtering on every render.
// (Previous list had a duplicate SOLUSDT entry — removed here.)
const PAIRS: Array<{ symbol: string; base: string; quote: string; color: string }> = [
  { symbol: 'BTCUSDT',  base: 'BTC',  quote: 'USDT', color: '#F7931A' },
  { symbol: 'ETHUSDT',  base: 'ETH',  quote: 'USDT', color: '#8FA3FF' },
  { symbol: 'BNBUSDT',  base: 'BNB',  quote: 'USDT', color: '#F3BA2F' },
  { symbol: 'SOLUSDT',  base: 'SOL',  quote: 'USDT', color: '#B583FF' },
  { symbol: 'XRPUSDT',  base: 'XRP',  quote: 'USDT', color: '#5EC8F2' },
  { symbol: 'ADAUSDT',  base: 'ADA',  quote: 'USDT', color: '#5C7CFA' },
  { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', color: '#E0C354' },
  { symbol: 'AVAXUSDT', base: 'AVAX', quote: 'USDT', color: '#F06A6E' },
  { symbol: 'DOTUSDT',  base: 'DOT',  quote: 'USDT', color: '#F25CA8' },
  { symbol: 'LINKUSDT', base: 'LINK', quote: 'USDT', color: '#6D8DF2' },
  { symbol: 'NEARUSDT', base: 'NEAR', quote: 'USDT', color: '#5CDDB0' },
  { symbol: 'APTUSDT',  base: 'APT',  quote: 'USDT', color: '#5CECBF' },
  { symbol: 'INJUSDT',  base: 'INJ',  quote: 'USDT', color: '#5ECEFF' },
  { symbol: 'ARBUSDT',  base: 'ARB',  quote: 'USDT', color: '#6FB6F2' },
];

type OrderSide = 'BUY' | 'SELL';
type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'PARTIAL';

interface Order {
  id: string;
  asset: string;
  side: OrderSide;
  price: string;
  amount: string;
  status: OrderStatus;
  createdAt: string;
}

// Wallet balances are now sourced from stores/walletStore (WalletBalance is defined there).

// ─── Helpers ──────────────────────────────────────────────────────────────────
// memo: GlassPanel is purely presentational; without memo it re-renders (and
// re-touches its native BlurView) every time its parent re-renders, which
// happened very often before the Zustand-selector fixes below.
const GlassPanel = memo(function GlassPanel({ style, children, intensity = 24 }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,15,20,0.50)' }]} />
        {children}
      </View>
    );
  }
  return <View style={[style, { backgroundColor: T.glassUp, overflow: 'hidden' }]}>{children}</View>;
});

// memo: only depends on `color`; its animation is fully self-contained via
// shared values, so parent re-renders shouldn't touch it at all.
const PulseDot = memo(function PulseDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1100 }), withTiming(1, { duration: 0 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1100 }), withTiming(0.9, { duration: 0 })), -1, false);
  }, []);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, position: 'absolute' }, ring]} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
});

// ─── Price ticker (flashing on update) ───────────────────────────────────────
// Zustand fix: select only this symbol's price instead of the whole store,
// so a tick for another pair never re-renders this component.
function LivePriceTicker({ symbol, color }: { symbol: string; color: string }) {
  const price = useMarketStore((s) => s.prices[symbol]?.price ?? 0);
  const flash = useSharedValue(0);
  const prevPrice = useRef(price);

  useEffect(() => {
    if (price !== prevPrice.current) {
      const up = price > prevPrice.current;
      prevPrice.current = price;
      flash.value = withSequence(
        withTiming(up ? 1 : -1, { duration: 80 }),
        withTiming(0, { duration: 500 })
      );
    }
  }, [price]);

  const flashStyle = useAnimatedStyle(() => ({
    color: flash.value > 0 ? T.gain : flash.value < 0 ? T.loss : T.textPri,
  }));

  const formatted = price >= 1000
    ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price >= 1 ? price.toFixed(4) : price.toFixed(6);

  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Animated.Text style={[styles.tickerPrice, flashStyle]}>${formatted}</Animated.Text>
    </View>
  );
}

// ─── Pair selector pill ───────────────────────────────────────────────────────
// Zustand fix: only subscribes to this pair's own price, and only actually
// needs it when selected (unselected pills don't render a price at all).
// memo fix: custom comparator ignores onSelect's identity (a new closure is
// created each render in the parent) so the memo isn't defeated by that.
function PairPillBase({ pair, selected, onSelect }: { pair: typeof PAIRS[0]; selected: boolean; onSelect: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const price = useMarketStore((s) => (selected ? s.prices[pair.symbol]?.price ?? 0 : 0));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => { scale.value = withSpring(0.94, { damping: 14 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10 }); }}
        onPress={onSelect}
        style={[styles.pairPill, selected && styles.pairPillActive]}
      >
        {selected && (
          <LinearGradient
            colors={[pair.color + '22', pair.color + '08']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[styles.pairDot, { backgroundColor: pair.color + (selected ? 'FF' : '88') }]} />
        <Text style={[styles.pairPillText, selected && { color: T.textPri }]}>{pair.base}</Text>
        {selected && (
          <Text style={[styles.pairPillPrice, { color: pair.color }]}>
            ${price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : price.toFixed(2)}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
const PairPill = memo(PairPillBase, (prev, next) =>
  prev.pair.symbol === next.pair.symbol && prev.selected === next.selected
);

// ─── Order book mock visualization ───────────────────────────────────────────
// useMemo fix: the random levels were previously recomputed (with Math.random
// calls) on every single render. Now they only regenerate when the symbol
// changes or price moves by roughly one spread-width, not on every tick.
function MiniOrderBook({ symbol, currentPrice }: { symbol: string; currentPrice: number }) {
  const levels = 6;
  const priceBucket = Math.round(currentPrice / (currentPrice * 0.002 || 1));

  const { asks, bids, spread } = useMemo(() => {
    const spread = currentPrice * 0.0004;
    const asks = Array.from({ length: levels }, (_, i) => ({
      price: currentPrice + spread * (i + 1),
      amount: (Math.random() * 2 + 0.1).toFixed(4),
      pct: Math.random(),
    })).reverse();
    const bids = Array.from({ length: levels }, (_, i) => ({
      price: currentPrice - spread * (i + 1),
      amount: (Math.random() * 2 + 0.1).toFixed(4),
      pct: Math.random(),
    }));
    return { asks, bids, spread };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, priceBucket]);

  return (
    <View style={styles.orderBook}>
      <View style={styles.obHeader}>
        <Text style={styles.obLabel}>Price</Text>
        <Text style={[styles.obLabel, { textAlign: 'right' }]}>Amount</Text>
      </View>
      {asks.map((a, i) => (
        <View key={`ask-${i}`} style={styles.obRow}>
          <View style={[styles.obFill, { width: `${a.pct * 100}%`, backgroundColor: T.loss + '1A' }]} />
          <Text style={[styles.obPrice, { color: T.loss }]}>
            {a.price >= 1000 ? a.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : a.price.toFixed(4)}
          </Text>
          <Text style={styles.obAmount}>{a.amount}</Text>
        </View>
      ))}
      <View style={styles.obSpread}>
        <Text style={styles.obSpreadLabel}>Spread</Text>
        <Text style={[styles.obSpreadValue, { color: T.gold }]}>
          ${(spread * 2).toFixed(currentPrice >= 100 ? 2 : 4)}
        </Text>
      </View>
      {bids.map((b, i) => (
        <View key={`bid-${i}`} style={styles.obRow}>
          <View style={[styles.obFill, { width: `${b.pct * 100}%`, backgroundColor: T.gain + '1A' }]} />
          <Text style={[styles.obPrice, { color: T.gain }]}>
            {b.price >= 1000 ? b.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : b.price.toFixed(4)}
          </Text>
          <Text style={styles.obAmount}>{b.amount}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Order row ────────────────────────────────────────────────────────────────
// memo: `order` objects are stable between renders unless orders are
// re-fetched, so this only needs to re-render when its own order changes.
// `onCancel` / `cancelling` let the parent own the DELETE /orders/:orderId
// mutation (via useCancelOrder) while this component stays presentational.
const OrderRow = memo(function OrderRow({
  order, index, onCancel, cancelling,
}: {
  order: Order;
  index: number;
  onCancel: (orderId: string) => void;
  cancelling: boolean;
}) {
  const statusColor: Record<OrderStatus, string> = {
    PENDING: T.gold,
    FILLED: T.gain,
    CANCELLED: T.loss,
    PARTIAL: T.accent,
  };
  const sideColor = order.side === 'BUY' ? T.gain : T.loss;
  const price = parseFloat(order.price);
  const amount = parseFloat(order.amount);
  const isCancellable = order.status === 'PENDING' || order.status === 'PARTIAL';

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 14) * 25).springify().damping(18)} style={styles.orderRow}>
      <View style={[styles.orderSideBadge, { backgroundColor: sideColor + '18', borderColor: sideColor + '35' }]}>
        <Text style={[styles.orderSideText, { color: sideColor }]}>{order.side}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.orderAsset}>{order.asset.replace('USDT', '')} / USDT</Text>
        <Text style={styles.orderMeta}>
          {amount.toFixed(4)} @ ${price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toFixed(4)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor[order.status] + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor[order.status] }]}>{order.status}</Text>
        </View>
        <Text style={styles.orderTime}>
          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {isCancellable && (
        <TouchableOpacity
          onPress={() => onCancel(order.id)}
          disabled={cancelling}
          style={styles.cancelBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color={T.loss} />
          ) : (
            <Text style={styles.cancelBtnText}>✕</Text>
          )}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

// ─── Trade (fill) row ─────────────────────────────────────────────────────────
// memo: same rationale as OrderRow — trade objects are stable between
// GET /orders/my-trades refetches.
const TradeRow = memo(function TradeRow({ trade, index }: { trade: TradeFill; index: number }) {
  const roleColor: Record<TradeRole, string> = { MAKER: T.accent, TAKER: T.gold };
  const sideColor = trade.side === 'BUY' ? T.gain : T.loss;
  const price = parseFloat(trade.price);
  const amount = parseFloat(trade.amount);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 14) * 25).springify().damping(18)} style={styles.orderRow}>
      <View style={[styles.orderSideBadge, { backgroundColor: sideColor + '18', borderColor: sideColor + '35' }]}>
        <Text style={[styles.orderSideText, { color: sideColor }]}>{trade.side}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.orderAsset}>{trade.asset.replace('USDT', '')} / USDT</Text>
        <Text style={styles.orderMeta}>
          {amount.toFixed(4)} @ ${price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toFixed(4)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <View style={[styles.statusBadge, { backgroundColor: roleColor[trade.role] + '18' }]}>
          <Text style={[styles.statusText, { color: roleColor[trade.role] }]}>{trade.role}</Text>
        </View>
        <Text style={styles.orderTime}>
          {new Date(trade.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Animated.View>
  );
});

// ─── Ambient background ───────────────────────────────────────────────────────
// memo: takes no props at all, so it should never re-render due to Trade's
// state changes — only its own internal shared-value animation should run.
const AmbientField = memo(function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [-10, 16]) },
      { translateY: interpolate(drift.value, [0, 1], [-6, 8]) },
    ],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [8, -18]) },
      { translateY: interpolate(drift.value, [0, 1], [10, -8]) },
    ],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -60, right: -80, backgroundColor: T.gain, opacity: 0.07 }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { bottom: 200, left: -100, backgroundColor: T.accentDeep, opacity: 0.10 }, orb2]} />
    </View>
  );
});

// ─── Main Trade Screen ────────────────────────────────────────────────────────
export default function Trade() {
  const insets = useSafeAreaInsets();

  useMarketSocket();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [priceInput, setPriceInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [activeTab, setActiveTab] = useState<'trade' | 'orders' | 'trades'>('trade');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── Wallet & orders, via the shared hooks/stores (same ones the Wallet
  // screen uses) instead of ad-hoc fetch() calls with a manually attached
  // token — the `api` client already injects auth from authStore.
  const { refetch: refetchWallet } = useWallet();
  const walletBalances = useWalletStore((s) => s.balances);

  const { isLoading: loadingOrders, refetch: refetchOrders } = useMyOrders();
  const orders = useOrderStore((s) => s.orders);

  const { isLoading: loadingTrades, refetch: refetchTrades } = useMyTrades();
  const trades = useOrderStore((s) => s.trades);

  const placeOrder = usePlaceOrder();
  const submitting = placeOrder.isPending;

  // DELETE /orders/:orderId — tracked per-order so only the row being
  // cancelled shows a spinner, not the whole list.
  const cancelOrder = useCancelOrder();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const handleCancelOrder = useCallback((orderId: string) => {
    setCancellingId(orderId);
    cancelOrder.mutate(orderId, {
      onError: (err: any) => {
        Alert.alert('Cancel Failed', err.response?.data?.error ?? 'Could not cancel this order.');
      },
      onSettled: () => setCancellingId(null),
    });
  }, [cancelOrder]);

  // Selected pair's live price and connection flag, each scoped narrowly.
  const selectedLivePrice = useMarketStore((s) => s.prices[selectedPair.symbol]?.price ?? 0);
  const connected = useMarketStore((s) => s.connected);

  // Auto-fill price input with the live price exactly once per pair
  // selection, instead of re-checking (and mostly no-op'ing) on every tick.
  const hasAutoFilledRef = useRef(false);

  useEffect(() => {
    hasAutoFilledRef.current = false;
    setPriceInput('');
  }, [selectedPair.symbol]);

  useEffect(() => {
    if (selectedLivePrice > 0 && !hasAutoFilledRef.current) {
      setPriceInput(
        selectedLivePrice >= 1000
          ? selectedLivePrice.toFixed(2)
          : selectedLivePrice >= 1 ? selectedLivePrice.toFixed(4) : selectedLivePrice.toFixed(6)
      );
      hasAutoFilledRef.current = true;
    }
  }, [selectedLivePrice]);

  const fetchWallet = useCallback(() => { refetchWallet(); }, [refetchWallet]);
  const fetchOrders = useCallback(() => { refetchOrders(); }, [refetchOrders]);
  const fetchTrades = useCallback(() => { refetchTrades(); }, [refetchTrades]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const totalValue = useMemo(() => {
    const p = parseFloat(priceInput) || 0;
    const a = parseFloat(amountInput) || 0;
    return (p * a).toFixed(2);
  }, [priceInput, amountInput]);

  const usdtBalance = walletBalances['USDT'] ?? 0;
  const baseBalance = walletBalances[selectedPair.base] ?? 0;

  const quickAmountPcts = useMemo(() => [0.25, 0.5, 0.75, 1.0], []);

  const handleQuickPct = useCallback((pct: number) => {
    const price = parseFloat(priceInput) || selectedLivePrice;
    if (side === 'BUY' && usdtBalance > 0 && price > 0) {
      const maxAmount = (usdtBalance * pct) / price;
      setAmountInput(maxAmount.toFixed(6));
    } else if (side === 'SELL' && baseBalance > 0) {
      setAmountInput((baseBalance * pct).toFixed(6));
    }
  }, [priceInput, selectedLivePrice, side, usdtBalance, baseBalance]);

  // ── Submit order → POST /api/orders/place ──────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    const price = parseFloat(priceInput);
    const amount = parseFloat(amountInput);

    if (!price || !amount || price <= 0 || amount <= 0) {
      Alert.alert('Invalid Order', 'Please enter a valid price and amount.');
      return;
    }

    try {
      await placeOrder.mutateAsync({ asset: selectedPair.symbol, side, price, amount });
      setSubmitSuccess(true);
      setAmountInput('');
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (err: any) {
      Alert.alert('Order Failed', err.response?.data?.error ?? 'Could not reach the order service.');
    }
  }, [priceInput, amountInput, selectedPair.symbol, side, placeOrder]);

  const handlePairSelect = useCallback((pair: typeof PAIRS[0]) => {
    setSelectedPair(pair);
  }, []);

  // ── Button animations ──────────────────────────────────────────────────────
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const successOpacity = useSharedValue(0);
  useEffect(() => {
    if (submitSuccess) {
      successOpacity.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 1200 }));
    }
  }, [submitSuccess]);
  const successStyle = useAnimatedStyle(() => ({ opacity: successOpacity.value }));

  // ── Side toggle ────────────────────────────────────────────────────────────
  const sideOffset = useSharedValue(0);
  useEffect(() => {
    sideOffset.value = withSpring(side === 'BUY' ? 0 : 1, { damping: 18 });
  }, [side]);
  const sideIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sideOffset.value, [0, 1], [0, (width - 36) / 2 - 4]) }],
  }));

  // ── Orders list rendering (FlatList) ──────────────────────────────────────
  const renderOrderItem = useCallback(({ item, index }: ListRenderItemInfo<Order>) => (
    <OrderRow
      order={item}
      index={index}
      onCancel={handleCancelOrder}
      cancelling={cancellingId === item.id}
    />
  ), [handleCancelOrder, cancellingId]);
  const orderKeyExtractor = useCallback((item: Order) => item.id, []);

  const OrdersHeader = useMemo(() => (
    <View style={styles.ordersHeader}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.ordersTitle}>Recent Orders</Text>
      <TouchableOpacity onPress={fetchOrders} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>↻ Refresh</Text>
      </TouchableOpacity>
    </View>
  ), [fetchOrders]);

  const OrdersEmpty = useMemo(() => (
    loadingOrders ? (
      <View style={styles.loadingState}>
        <ActivityIndicator color={T.accent} />
        <Text style={styles.loadingText}>Fetching orders...</Text>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>◎</Text>
        <Text style={styles.emptyText}>No orders yet</Text>
        <Text style={styles.emptySubText}>Your placed orders will appear here</Text>
      </View>
    )
  ), [loadingOrders]);

  // ── Trades (fills) list rendering — GET /orders/my-trades ──────────────────
  const renderTradeItem = useCallback(({ item, index }: ListRenderItemInfo<TradeFill>) => (
    <TradeRow trade={item} index={index} />
  ), []);
  const tradeKeyExtractor = useCallback((item: TradeFill) => item.id, []);

  const TradesHeader = useMemo(() => (
    <View style={styles.ordersHeader}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.ordersTitle}>Trade History</Text>
      <TouchableOpacity onPress={fetchTrades} style={styles.refreshBtn}>
        <Text style={styles.refreshBtnText}>↻ Refresh</Text>
      </TouchableOpacity>
    </View>
  ), [fetchTrades]);

  const TradesEmpty = useMemo(() => (
    loadingTrades ? (
      <View style={styles.loadingState}>
        <ActivityIndicator color={T.accent} />
        <Text style={styles.loadingText}>Fetching trades...</Text>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>◈</Text>
        <Text style={styles.emptyText}>No fills yet</Text>
        <Text style={styles.emptySubText}>Executed trades will appear here</Text>
      </View>
    )
  ), [loadingTrades]);

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Header ──────────────────────────────────────── */}
            <Animated.View entering={FadeIn.delay(40).duration(400)} style={styles.topBar}>
              <View>
                <Text style={styles.screenLabel}>Trading Terminal</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <Text style={styles.screenTitle}>{selectedPair.base} / {selectedPair.quote}</Text>
                  <LivePriceTicker symbol={selectedPair.symbol} color={selectedPair.color} />
                </View>
              </View>
              <View style={styles.topRight}>
                <View style={[styles.statusPill, { borderColor: connected ? 'rgba(61,220,151,0.3)' : 'rgba(255,107,122,0.3)' }]}>
                  <PulseDot color={connected ? T.gain : T.loss} />
                  <Text style={[styles.statusText, { color: connected ? T.gain : T.loss }]}>
                    {connected ? 'LIVE' : 'OFFLINE'}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* ── Pair Selector ────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(60).springify().damping(18)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pairScroll}
              >
                {PAIRS.map((pair) => (
                  <PairPill
                    key={pair.symbol}
                    pair={pair}
                    selected={selectedPair.symbol === pair.symbol}
                    onSelect={() => handlePairSelect(pair)}
                  />
                ))}
              </ScrollView>
            </Animated.View>

            {/* ── Wallet balances ──────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(90).springify().damping(18)} style={styles.walletStrip}>
              <GlassPanel style={styles.walletPanel}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.04)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.walletRow}>
                  <View style={styles.walletItem}>
                    <Text style={styles.walletLabel}>USDT Balance</Text>
                    <Text style={[styles.walletValue, { color: T.gain }]}>
                      ${usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={styles.walletDivider} />
                  <View style={styles.walletItem}>
                    <Text style={styles.walletLabel}>{selectedPair.base} Balance</Text>
                    <Text style={[styles.walletValue, { color: selectedPair.color }]}>
                      {baseBalance.toFixed(6)} {selectedPair.base}
                    </Text>
                  </View>
                  <View style={styles.walletDivider} />
                  <TouchableOpacity onPress={fetchWallet} style={styles.walletRefresh}>
                    <Text style={styles.walletRefreshIcon}>↻</Text>
                  </TouchableOpacity>
                </View>
              </GlassPanel>
            </Animated.View>

            {/* ── Tab bar: Trade / Orders / Trades ─────────────── */}
            <Animated.View entering={FadeInDown.delay(110).springify().damping(18)} style={styles.tabBarWrap}>
              <GlassPanel style={styles.tabBar}>
                <View style={styles.tabsGroup}>
                  {(['trade', 'orders', 'trades'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setActiveTab(t)}
                      style={[styles.tabBtn, activeTab === t && styles.tabBtnActive]}
                    >
                      {activeTab === t && (
                        <LinearGradient
                          colors={[T.accentDeep, T.violet]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Text style={[styles.tabBtnText, activeTab === t && { color: '#fff' }]}>
                        {t === 'trade'
                          ? 'Place Order'
                          : t === 'orders'
                          ? `Orders ${orders.length > 0 ? `(${orders.length})` : ''}`
                          : `Trades ${trades.length > 0 ? `(${trades.length})` : ''}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </GlassPanel>
            </Animated.View>

            {/*
              Tab content fix: both branches stay mounted at all times and are
              toggled with `display: none` instead of being conditionally
              rendered. Conditional rendering previously destroyed and rebuilt
              the entire "trade" subtree (including native BlurView instances,
              which are expensive to initialize) on every tab switch — that
              mount/unmount churn was the actual cause of tab-switch lag.
              With display:none, switching tabs is just a cheap visibility flip.
            */}
            <View style={activeTab === 'trade' ? undefined : styles.hidden}>
              {/* ── Order form ────────────────────────────────── */}
              <Animated.View entering={FadeInDown.delay(130).springify().damping(18)} style={styles.formCard}>
                <GlassPanel style={styles.formPanel}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.055)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.3 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* BUY / SELL toggle */}
                  <View style={styles.sideToggleWrap}>
                    <Animated.View style={[styles.sideIndicator, {
                      width: (width - 36) / 2 - 4,
                      backgroundColor: side === 'BUY' ? T.gain + '22' : T.loss + '22',
                      borderColor: side === 'BUY' ? T.gain + '50' : T.loss + '50',
                    }, sideIndicatorStyle]} />
                    <TouchableOpacity style={styles.sideBtn} onPress={() => setSide('BUY')}>
                      <Text style={[styles.sideBtnText, side === 'BUY' && { color: T.gain }]}>▲ BUY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sideBtn} onPress={() => setSide('SELL')}>
                      <Text style={[styles.sideBtnText, side === 'SELL' && { color: T.loss }]}>▼ SELL</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Price input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Limit Price (USDT)</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        value={priceInput}
                        onChangeText={setPriceInput}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={T.textTer}
                      />
                      <TouchableOpacity
                        style={styles.inputSuffix}
                        onPress={() => {
                          if (selectedLivePrice > 0) {
                            setPriceInput(selectedLivePrice >= 1000 ? selectedLivePrice.toFixed(2) : selectedLivePrice.toFixed(4));
                          }
                        }}
                      >
                        <Text style={styles.inputSuffixText}>MARKET</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Amount input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Amount ({selectedPair.base})</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        value={amountInput}
                        onChangeText={setAmountInput}
                        keyboardType="decimal-pad"
                        placeholder="0.000000"
                        placeholderTextColor={T.textTer}
                      />
                      <Text style={styles.inputUnit}>{selectedPair.base}</Text>
                    </View>
                  </View>

                  {/* Quick % buttons */}
                  <View style={styles.pctRow}>
                    {quickAmountPcts.map((pct) => (
                      <TouchableOpacity key={pct} style={styles.pctBtn} onPress={() => handleQuickPct(pct)}>
                        <Text style={styles.pctBtnText}>{Math.round(pct * 100)}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Total */}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={[styles.totalValue, { color: side === 'BUY' ? T.gain : T.loss }]}>
                      ≈ ${totalValue} USDT
                    </Text>
                  </View>

                  <View style={styles.formDivider} />

                  {/* Submit button */}
                  <Animated.View style={btnStyle}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPressIn={() => { btnScale.value = withSpring(0.97, { damping: 14 }); }}
                      onPressOut={() => { btnScale.value = withSpring(1, { damping: 10 }); }}
                      onPress={handlePlaceOrder}
                      disabled={submitting}
                      style={styles.submitBtnWrap}
                    >
                      <LinearGradient
                        colors={side === 'BUY'
                          ? [T.gain + 'EE', '#1aad6e']
                          : [T.loss + 'EE', '#cc2233']
                        }
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.submitBtn}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : submitSuccess ? (
                          <Text style={styles.submitBtnText}>✓ Order Placed</Text>
                        ) : (
                          <Text style={styles.submitBtnText}>
                            {side === 'BUY' ? '▲ Place Buy Order' : '▼ Place Sell Order'}
                          </Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Success flash */}
                  <Animated.View style={[styles.successOverlay, successStyle]} pointerEvents="none">
                    <LinearGradient
                      colors={[T.gain + '22', 'transparent']}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                </GlassPanel>
              </Animated.View>

              {/* ── Order book ────────────────────────────────── */}
              <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={styles.obCard}>
                <GlassPanel style={styles.obPanel}>
                  <View style={styles.obTitleRow}>
                    <View style={styles.sectionAccentBar} />
                    <Text style={styles.obTitle}>Order Book</Text>
                    <Text style={styles.obSubtitle}>{selectedPair.base}/USDT</Text>
                  </View>
                  <MiniOrderBook symbol={selectedPair.symbol} currentPrice={selectedLivePrice} />
                </GlassPanel>
              </Animated.View>
            </View>

            <View style={activeTab === 'orders' ? { marginTop: 6 } : styles.hidden}>
              <FlatList
                data={orders}
                renderItem={renderOrderItem}
                keyExtractor={orderKeyExtractor}
                ListHeaderComponent={OrdersHeader}
                ListEmptyComponent={OrdersEmpty}
                scrollEnabled={false}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
              />
            </View>

            <View style={activeTab === 'trades' ? { marginTop: 6 } : styles.hidden}>
              <FlatList
                data={trades}
                renderItem={renderTradeItem}
                keyExtractor={tradeKeyExtractor}
                ListHeaderComponent={TradesHeader}
                ListEmptyComponent={TradesEmpty}
                scrollEnabled={false}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },
  hidden: { display: 'none' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  screenLabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.8, marginBottom: 2 },
  screenTitle: { fontSize: 22, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.4 },
  tickerPrice: { fontSize: 18, fontFamily: FontFamily.heading, letterSpacing: -0.4 },
  topRight: { paddingTop: 4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  statusText: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 1.2 },

  // Pair selector
  pairScroll: { paddingBottom: 14, gap: 7 },
  pairPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: T.glassBorder,
    backgroundColor: T.glass, overflow: 'hidden',
  },
  pairPillActive: { borderColor: T.glassBorderHi },
  pairDot: { width: 6, height: 6, borderRadius: 3 },
  pairPillText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textTer },
  pairPillPrice: { fontSize: 11, fontFamily: FontFamily.body, marginLeft: 2 },

  // Wallet strip
  walletStrip: { marginBottom: 12 },
  walletPanel: { borderRadius: 18, borderWidth: 1, borderColor: T.glassBorder, overflow: 'hidden' },
  walletRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  walletItem: { flex: 1 },
  walletLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.5, marginBottom: 4 },
  walletValue: { fontSize: 14, fontFamily: FontFamily.heading },
  walletDivider: { width: 1, height: 30, backgroundColor: T.hairline, marginHorizontal: 12 },
  walletRefresh: { paddingHorizontal: 8, paddingVertical: 4 },
  walletRefreshIcon: { fontSize: 18, color: T.textTer },

  // Tab bar
  tabBarWrap: { marginBottom: 14 },
  tabBar: { borderRadius: 18, borderWidth: 1, borderColor: T.glassBorder, padding: 4 },
  tabsGroup: { flexDirection: 'row', gap: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', overflow: 'hidden' },
  tabBtnActive: {},
  tabBtnText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textTer, letterSpacing: 0.2 },

  // Form card
  formCard: { marginBottom: 14 },
  formPanel: { borderRadius: 24, borderWidth: 1, borderColor: T.glassBorderHi, padding: 18 },

  // BUY/SELL toggle
  sideToggleWrap: {
    flexDirection: 'row', position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, padding: 4, marginBottom: 20,
    borderWidth: 1, borderColor: T.hairline,
  },
  sideIndicator: {
    position: 'absolute', top: 4, left: 4, bottom: 4,
    borderRadius: 10, borderWidth: 1,
  },
  sideBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', zIndex: 1 },
  sideBtnText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textTer, letterSpacing: 0.3 },

  // Inputs
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.7, marginBottom: 7 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 13, borderWidth: 1, borderColor: T.glassBorder,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  input: {
    flex: 1, fontSize: 16, fontFamily: FontFamily.heading,
    color: T.textPri,
  },
  inputUnit: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginLeft: 8 },
  inputSuffix: {
    backgroundColor: T.accent + '20', borderRadius: 7,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: T.accent + '40',
  },
  inputSuffixText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent, letterSpacing: 0.5 },

  // Quick pct
  pctRow: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  pctBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: T.hairline,
    alignItems: 'center',
  },
  pctBtnText: { fontSize: 11, fontFamily: FontFamily.heading, color: T.textSec },

  // Total
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer },
  totalValue: { fontSize: 15, fontFamily: FontFamily.heading },

  formDivider: { height: 1, backgroundColor: T.hairline, marginBottom: 16 },

  // Submit
  submitBtnWrap: { borderRadius: 16, overflow: 'hidden' },
  submitBtn: { paddingVertical: 15, alignItems: 'center', borderRadius: 16 },
  submitBtnText: { fontSize: 15, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 0.3 },
  successOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },

  // Order book
  obCard: { marginBottom: 14 },
  obPanel: { borderRadius: 20, borderWidth: 1, borderColor: T.glassBorder, padding: 16 },
  obTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  obTitle: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },
  obSubtitle: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginLeft: 2 },
  orderBook: { gap: 2 },
  obHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  obLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.5 },
  obRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: 2, overflow: 'hidden', borderRadius: 4,
    position: 'relative',
  },
  obFill: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4 },
  obPrice: { fontSize: 11, fontFamily: FontFamily.heading, zIndex: 1 },
  obAmount: { fontSize: 11, fontFamily: FontFamily.body, color: T.textSec, zIndex: 1 },
  obSpread: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 7, marginVertical: 2,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.hairline,
  },
  obSpreadLabel: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer },
  obSpreadValue: { fontSize: 12, fontFamily: FontFamily.heading },

  // My Orders
  ordersHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  ordersTitle: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, flex: 1 },
  refreshBtn: {
    backgroundColor: T.glass, borderRadius: 9, borderWidth: 1, borderColor: T.glassBorder,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  refreshBtnText: { fontSize: 11, fontFamily: FontFamily.body, color: T.textSec },
  orderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.glass, borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 1, borderColor: T.glassBorder,
  },
  orderSideBadge: {
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, borderWidth: 1, minWidth: 46, alignItems: 'center',
  },
  orderSideText: { fontSize: 10, fontFamily: FontFamily.heading, letterSpacing: 0.3 },
  orderAsset: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },
  orderMeta: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginBottom: 3 },
  statusTextt: { fontSize: 9, fontFamily: FontFamily.heading, letterSpacing: 0.3 },
  orderTime: { fontSize: 9, fontFamily: FontFamily.body, color: T.textTer },
  cancelBtn: {
    marginLeft: 10, width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.lossDim, borderWidth: 1, borderColor: 'rgba(255,107,122,0.3)',
  },
  cancelBtnText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.loss },

  // States
  loadingState: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 32, color: T.textTer },
  emptyText: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textSec },
  emptySubText: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer },
});
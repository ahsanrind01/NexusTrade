import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, RefreshControl,
  Modal, TextInput, Platform,
  Alert, ActivityIndicator, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat,
  withSequence, interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { FontFamily } from '../../constants/typography';
import { useWallet } from '../../hooks/useWallet';
import { useTransferFunds, useWalletTransfers, type WalletTransferRecord } from '../../hooks/useWallet';
import { useWalletStore, PRICE_MAP } from '../../stores/walletStore';
import { useMarketStore } from '../../stores/marketStore';
import { useTicker24h } from '../../hooks/useTicker24h';
import {
  useFundingHistory,
  useCreateDepositIntent,
  useSimulateCryptoDeposit,
  useCreateWithdrawalIntent,
} from '../../hooks/useFunding';
import { useFundingStore } from '../../stores/fundingStore';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}
const HAS_BLUR = BlurView !== null;

const { width } = Dimensions.get('window');

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
  DOT:   { name: 'Polkadot',  color: '#F25CA8', symbol: 'D' },
  LINK:  { name: 'Chainlink', color: '#6D8DF2', symbol: 'L' },
  NEAR:  { name: 'NEAR Protocol', color: '#5CDDB0', symbol: 'N' },
  APT:   { name: 'Aptos',     color: '#5CECBF', symbol: 'A' },
  INJ:   { name: 'Injective', color: '#5ECEFF', symbol: 'I' },
  ARB:   { name: 'Arbitrum',  color: '#6FB6F2', symbol: 'A' },
};

const FIAT_ASSETS = new Set(['USDT', 'USDC']);
const CRYPTO_ASSETS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'NEAR', 'APT', 'INJ', 'ARB'] as const;
const MODAL_ASSETS = ['USDT', ...CRYPTO_ASSETS] as const;

function formatAssetAmount(balance: number): string {
  if (!balance || balance <= 0) return '0';
  if (balance < 0.001) return balance.toFixed(6);
  if (balance < 1) return balance.toFixed(4);
  return balance.toFixed(2);
}

type HistoryItem = {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER';
  flow?: 'IN' | 'OUT';
  title: string;
  asset: string;
  amount: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  time: string;
};

type DepositIntentTransaction = {
  id: string;
  status: string;
  type: string;
  amount: string;
  asset: string;
  stripeClientSecret: string | null;
  cryptoDepositAddress: string | null;
};

function useKeyboardOffset() {
  const keyboardHeight = useSharedValue(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      keyboardHeight.value = withTiming(e.endCoordinates?.height ?? 0, { duration: 220 });
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      keyboardHeight.value = withTiming(0, { duration: 220 });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28 }: any) {
  if (HAS_BLUR) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,13,18,0.5)' }]} />
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

const SheetSurface = memo(function SheetSurface({ style, children, tint }: { style?: any; children: any; tint?: [string, string] }) {
  return (
    <View style={[style, styles.sheetSolid, { overflow: 'hidden' }]}>
      <LinearGradient
        colors={tint ?? ['rgba(124,138,255,0.12)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
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

const AmbientField = memo(function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
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

type DepositKind = 'FIAT' | 'CRYPTO';

function FundingModal({ visible, mode, onClose, onSuccess }: {
  visible: boolean;
  mode: 'deposit' | 'withdraw';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [kind, setKind] = useState<DepositKind | null>(null);
  const [asset, setAsset] = useState<typeof MODAL_ASSETS[number]>('BTC');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [pendingDeposit, setPendingDeposit] = useState<DepositIntentTransaction | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'PENDING' | 'COMPLETED' | 'FAILED' | null>(null);

  const createDepositIntent = useCreateDepositIntent();
  const simulateCryptoDeposit = useSimulateCryptoDeposit();
  const createWithdrawalIntent = useCreateWithdrawalIntent();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { refetch: refetchFundingHistory } = useFundingHistory();
  const transactions = useFundingStore((s) => s.transactions);
  const walletBalances = useWalletStore((s) => s.balances);
  const availableBalance = walletBalances[asset] ?? 0;

  const loading =
    createDepositIntent.isPending ||
    simulateCryptoDeposit.isPending ||
    createWithdrawalIntent.isPending;

  const translateY = useSharedValue(600);
  const backdropOp = useSharedValue(0);
  const keyboardHeight = useKeyboardOffset();

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      backdropOp.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(600, { duration: 220, easing: Easing.in(Easing.cubic) });
      setKind(null);
      setPendingDeposit(null);
      setAmount('');
      setDestination('');
      setProcessingId(null);
      setProcessingStatus(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!processingId) return;
    const interval = setInterval(() => {
      refetchFundingHistory();
    }, 2000);
    return () => clearInterval(interval);
  }, [processingId, refetchFundingHistory]);

  useEffect(() => {
    if (!processingId) return;
    const tx = transactions.find((t) => t.id === processingId);
    if (!tx) return;

    if (tx.status === 'COMPLETED') {
      setProcessingStatus('COMPLETED');
      const timeout = setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
      return () => clearTimeout(timeout);
    }

    if (tx.status === 'FAILED') {
      setProcessingStatus('FAILED');
    }
  }, [transactions, processingId, onSuccess, onClose]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - keyboardHeight.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  const dismissModal = useCallback(() => {
    Keyboard.dismiss();
    setKind(null);
    setPendingDeposit(null);
    setAmount('');
    setDestination('');
    setProcessingId(null);
    setProcessingStatus(null);
    onClose();
  }, [onClose]);

  const selectKind = useCallback((next: DepositKind) => {
    setKind(next);
    setAsset(next === 'FIAT' ? 'USDT' : 'BTC');
  }, []);

  const goBackToMethod = useCallback(() => {
    setKind(null);
    setAmount('');
    setDestination('');
  }, []);

  const startCardPayment = useCallback(async (clientSecret: string, transactionId: string) => {
    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: 'NexusTrade',
      paymentIntentClientSecret: clientSecret,
    });

    if (initError) {
      Alert.alert('Payment setup failed', initError.message);
      return;
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code !== 'Canceled') {
        Alert.alert('Payment failed', presentError.message);
      }
      return;
    }

    setProcessingId(transactionId);
    setProcessingStatus('PENDING');
  }, [initPaymentSheet, presentPaymentSheet]);

  const confirmCryptoDeposit = useCallback(async () => {
    if (!pendingDeposit) return;

    try {
      await simulateCryptoDeposit.mutateAsync(pendingDeposit.id);
      setProcessingId(pendingDeposit.id);
      setProcessingStatus('PENDING');
    } catch (err: any) {
      Alert.alert('Confirmation failed', err.response?.data?.error || 'Something went wrong');
    }
  }, [pendingDeposit, simulateCryptoDeposit]);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    if (mode === 'withdraw' && !destination.trim()) {
      Alert.alert(
        'Missing destination',
        kind === 'FIAT' ? 'Enter the bank account to withdraw to.' : 'Enter the destination wallet address.'
      );
      return;
    }

    const type = FIAT_ASSETS.has(asset) ? 'FIAT_STRIPE' : 'CRYPTO_ETH';

    try {
      if (mode === 'deposit') {
        const { transaction } = await createDepositIntent.mutateAsync({ asset, amount, type });

        if (transaction.type === 'FIAT_STRIPE' && transaction.stripeClientSecret) {
          await startCardPayment(transaction.stripeClientSecret, transaction.id);
          return;
        }

        setPendingDeposit(transaction);
        Alert.alert(
          'Deposit intent created',
          'Send the funds to the displayed address, then confirm from this screen.'
        );
      } else {
        await createWithdrawalIntent.mutateAsync({
          asset,
          amount,
          type,
          destinationAddress: destination.trim(),
        });
        Alert.alert('Success', 'Withdrawal request submitted.');
      }
      if (mode === 'withdraw') {
        setAmount('');
        setDestination('');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      Alert.alert('Failed', err.response?.data?.error || 'Something went wrong');
    }
  };

  const meta = ASSET_META[asset];
  const showProcessing = processingId !== null;
  const showDepositDetails = mode === 'deposit' && pendingDeposit !== null && !showProcessing;
  const showMethodStep = kind === null && !showProcessing;
  const tint: [string, string] = mode === 'deposit'
    ? [T.gain + '14', 'transparent']
    : [T.loss + '14', 'transparent'];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismissModal} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]}>
          <SheetSurface style={styles.sheetPanel} tint={tint}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View>
                <View style={styles.sheetHandle} />

                {!showProcessing && (
                  <View style={styles.sheetHeader}>
                    {!showMethodStep && !showDepositDetails && (
                      <TouchableOpacity onPress={goBackToMethod} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={styles.backBtnText}>‹</Text>
                      </TouchableOpacity>
                    )}
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
                )}

                {showProcessing ? (
                  <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                    {processingStatus === 'COMPLETED' ? (
                      <>
                        <Text style={{ fontSize: 40, marginBottom: 14 }}>✅</Text>
                        <Text style={styles.sheetTitle}>Deposit complete</Text>
                        <Text style={[styles.sheetSubtitle, { marginTop: 6, textAlign: 'center' }]}>
                          Your balance has been updated.
                        </Text>
                      </>
                    ) : processingStatus === 'FAILED' ? (
                      <>
                        <Text style={{ fontSize: 40, marginBottom: 14 }}>⚠️</Text>
                        <Text style={styles.sheetTitle}>Deposit failed</Text>
                        <TouchableOpacity style={styles.sheetGhostBtn} onPress={dismissModal}>
                          <Text style={styles.sheetGhostText}>Close</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <ActivityIndicator color={T.accent} size="large" style={{ marginBottom: 16 }} />
                        <Text style={styles.sheetTitle}>Processing deposit...</Text>
                        <Text style={[styles.sheetSubtitle, { marginTop: 6, textAlign: 'center' }]}>
                          This usually takes a few seconds.
                        </Text>
                      </>
                    )}
                  </View>
                ) : showMethodStep ? (
                  <View style={styles.methodGrid}>
                    <TouchableOpacity style={styles.methodCard} onPress={() => selectKind('FIAT')} activeOpacity={0.85}>
                      <View style={[styles.methodIconWrap, { backgroundColor: T.gainDim, borderColor: T.gain + '40' }]}>
                        <Text style={[styles.methodIcon, { color: T.gain }]}>$</Text>
                      </View>
                      <Text style={styles.methodTitle}>USDT</Text>
                      <Text style={styles.methodSubtitle}>{mode === 'withdraw' ? 'To your bank account' : 'Pay by card'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.methodCard} onPress={() => selectKind('CRYPTO')} activeOpacity={0.85}>
                      <View style={[styles.methodIconWrap, { backgroundColor: T.accentDeep + '20', borderColor: T.accent + '40' }]}>
                        <Text style={[styles.methodIcon, { color: T.accent }]}>₿</Text>
                      </View>
                      <Text style={styles.methodTitle}>Crypto</Text>
                      <Text style={styles.methodSubtitle}>{mode === 'withdraw' ? 'To external wallet' : 'On-chain transfer'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : showDepositDetails ? (
                  <>
                    <View style={styles.intentCard}>
                      <Text style={styles.intentCardTitle}>Deposit intent ready</Text>
                      <Text style={styles.intentCardText}>
                        {pendingDeposit.type === 'FIAT_STRIPE'
                          ? 'Your payment session is ready. The deposit remains pending until the processor confirms it.'
                          : 'Send funds to the address below. The deposit remains pending until you confirm completion.'}
                      </Text>
                      <View style={styles.intentDetailRow}>
                        <Text style={styles.intentDetailLabel}>Asset</Text>
                        <Text style={styles.intentDetailValue}>{pendingDeposit.asset}</Text>
                      </View>
                      <View style={styles.intentDetailRow}>
                        <Text style={styles.intentDetailLabel}>Amount</Text>
                        <Text style={styles.intentDetailValue}>{pendingDeposit.amount}</Text>
                      </View>
                      {pendingDeposit.cryptoDepositAddress ? (
                        <View style={styles.intentAddressBox}>
                          <Text style={styles.intentAddressLabel}>Deposit address</Text>
                          <Text style={styles.intentAddressText}>{pendingDeposit.cryptoDepositAddress}</Text>
                        </View>
                      ) : null}
                    </View>

                    {pendingDeposit.type === 'FIAT_STRIPE' ? (
                      <TouchableOpacity
                        style={styles.sheetSubmitBtn}
                        onPress={() => pendingDeposit.stripeClientSecret && startCardPayment(pendingDeposit.stripeClientSecret, pendingDeposit.id)}
                        disabled={!pendingDeposit.stripeClientSecret}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={['#3DDC97', '#2AB87D']}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={styles.sheetSubmitGradient}
                        >
                          <Text style={styles.sheetSubmitText}>RETRY PAYMENT →</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.sheetSubmitBtn}
                        onPress={confirmCryptoDeposit}
                        disabled={simulateCryptoDeposit.isPending}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={['#3DDC97', '#2AB87D']}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={styles.sheetSubmitGradient}
                        >
                          {simulateCryptoDeposit.isPending
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.sheetSubmitText}>I&apos;VE SENT THE FUNDS →</Text>
                          }
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.sheetGhostBtn} onPress={dismissModal}>
                      <Text style={styles.sheetGhostText}>Close</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {kind === 'FIAT' ? (
                      <View style={styles.fixedAssetRow}>
                        <View style={[styles.assetPillDot, { backgroundColor: ASSET_META.USDT.color }]} />
                        <Text style={styles.fixedAssetText}>USDT</Text>
                        <View style={styles.fixedAssetBadge}>
                          <Text style={styles.fixedAssetBadgeText}>CARD</Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.sheetLabel}>Select Asset</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetPickerScroll} keyboardShouldPersistTaps="handled">
                          <View style={styles.assetPickerRow}>
                            {CRYPTO_ASSETS.map((a) => {
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
                      </>
                    )}

                    {mode === 'withdraw' && (
                      <>
                        <Text style={styles.sheetLabel}>
                          {kind === 'FIAT' ? 'Bank Account Number / IBAN' : 'Destination Wallet Address'}
                        </Text>
                        <View style={styles.recipientWrap}>
                          <TextInput
                            style={styles.recipientInput}
                            value={destination}
                            onChangeText={setDestination}
                            placeholder={kind === 'FIAT' ? 'e.g. GB29 NWBK 6016 1331 9268 19' : '0x...'}
                            placeholderTextColor={T.textTer}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="next"
                          />
                        </View>
                      </>
                    )}

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
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      {mode === 'withdraw' && (
                        <TouchableOpacity onPress={() => setAmount(formatAssetAmount(availableBalance))} style={styles.maxBtn}>
                          <Text style={styles.maxText}>MAX</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {mode === 'withdraw' && (
                      <Text style={styles.availableBalanceText}>
                        Available: {formatAssetAmount(availableBalance)} {asset}
                      </Text>
                    )}

                    <View style={styles.sheetInfoRow}>
                      <Text style={styles.sheetInfoLabel}>Network fee</Text>
                      <Text style={styles.sheetInfoValue}>{kind === 'FIAT' ? '~$0.50' : 'Network dependent'}</Text>
                    </View>
                    <View style={styles.sheetInfoRow}>
                      <Text style={styles.sheetInfoLabel}>Processing time</Text>
                      <Text style={styles.sheetInfoValue}>
                        {mode === 'withdraw' ? '1-2 mins' : kind === 'FIAT' ? 'Instant after payment' : 'Pending confirmation'}
                      </Text>
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
                              {mode === 'deposit'
                                ? (kind === 'FIAT' ? 'PAY WITH CARD' : 'CREATE DEPOSIT INTENT')
                                : 'CONFIRM WITHDRAWAL'} →
                            </Text>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </SheetSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TransferModal({ visible, onClose, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [asset, setAsset] = useState<typeof MODAL_ASSETS[number]>('USDT');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  const transferFunds = useTransferFunds();
  const walletBalances = useWalletStore((s) => s.balances);
  const availableBalance = walletBalances[asset] ?? 0;

  const translateY = useSharedValue(600);
  const backdropOp = useSharedValue(0);
  const keyboardHeight = useKeyboardOffset();

  useEffect(() => {
    if (visible) {
      backdropOp.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      backdropOp.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(600, { duration: 220, easing: Easing.in(Easing.cubic) });
      setRecipient('');
      setAmount('');
      setAsset('USDT');
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - keyboardHeight.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  const dismissModal = useCallback(() => {
    Keyboard.dismiss();
    setRecipient('');
    setAmount('');
    setAsset('USDT');
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const parsed = parseFloat(amount);
    if (!recipient.trim()) {
      Alert.alert('Missing recipient', 'Enter a recipient email or user id.');
      return;
    }
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    try {
      await transferFunds.mutateAsync({
        recipient: recipient.trim(),
        asset,
        amount: parsed,
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      Alert.alert('Transfer complete', 'Balances and history have been updated.');
      setRecipient('');
      setAmount('');
      setAsset('USDT');
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Transfer failed', err.response?.data?.error || 'Something went wrong');
    }
  };

  const loading = transferFunds.isPending;
  const meta = ASSET_META[asset];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissModal}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismissModal} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]}>
          <SheetSurface style={styles.sheetPanel} tint={['rgba(124,138,255,0.14)', 'transparent']}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View>
                <View style={styles.sheetHandle} />

                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetIconWrap, {
                    backgroundColor: T.accentDeep + '20',
                    borderColor: T.accent + '40',
                  }]}>
                    <Text style={[styles.sheetIcon, { color: T.accent }]}>⇄</Text>
                  </View>
                  <View>
                    <Text style={styles.sheetTitle}>Transfer</Text>
                    <Text style={styles.sheetSubtitle}>Move funds to another wallet user</Text>
                  </View>
                </View>

                <Text style={styles.sheetLabel}>Select Asset</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetPickerScroll} keyboardShouldPersistTaps="handled">
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

                <Text style={styles.sheetLabel}>Recipient Email or User ID</Text>
                <View style={styles.recipientWrap}>
                  <TextInput
                    style={styles.recipientInput}
                    value={recipient}
                    onChangeText={setRecipient}
                    placeholder="user@example.com or user id"
                    placeholderTextColor={T.textTer}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                  />
                </View>

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
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <TouchableOpacity onPress={() => setAmount(formatAssetAmount(availableBalance))} style={styles.maxBtn}>
                    <Text style={styles.maxText}>MAX</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.availableBalanceText}>
                  Available: {formatAssetAmount(availableBalance)} {asset}
                </Text>

                <View style={styles.sheetInfoRow}>
                  <Text style={styles.sheetInfoLabel}>Processing time</Text>
                  <Text style={styles.sheetInfoValue}>Instant</Text>
                </View>

                <TouchableOpacity
                  style={styles.sheetSubmitBtn}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#7C8AFF', '#5B63E8']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.sheetSubmitGradient}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.sheetSubmitText}>SEND TRANSFER →</Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetGhostBtn} onPress={dismissModal}>
                  <Text style={styles.sheetGhostText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </SheetSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

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
      entering={FadeInDown.delay(Math.min(index, 6) * 25).duration(200)}
      style={[animStyle, styles.assetCardWrap]}
    >
      <TouchableOpacity activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={styles.assetCard}>
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
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}, (prev, next) =>
  prev.asset === next.asset &&
  prev.balance === next.balance &&
  prev.usdValue === next.usdValue
);

const HistoryRow = memo(function HistoryRow({ item, index }: { item: HistoryItem; index: number }) {
  const isDeposit = item.kind === 'DEPOSIT';
  const isTransfer = item.kind === 'TRANSFER';
  const isPending = item.status === 'PENDING' || item.status === 'PROCESSING';
  const isFailed = item.status === 'FAILED';
  const statusColor = isFailed ? T.loss : isPending ? T.gold : T.gain;
  const direction = isTransfer ? item.flow : (isDeposit ? 'IN' : 'OUT');
  const amountPrefix = direction === 'OUT' ? '-' : '+';
  const label = isTransfer
    ? `Transfer ${direction === 'OUT' ? 'out' : 'in'}`
    : isDeposit
      ? 'Deposit'
      : 'Withdrawal';
  const iconColor = isTransfer ? T.accent : isDeposit ? T.gain : T.loss;
  const iconBg = isTransfer ? T.accentDeep + '18' : isDeposit ? T.gainDim : T.lossDim;
  const borderColor = isTransfer ? T.accent + '30' : isDeposit ? T.gain + '30' : T.loss + '30';

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 25).duration(200)} style={styles.historyRow}>
      <View style={[
        styles.historyIconWrap,
        {
          backgroundColor: iconBg,
          borderColor,
        },
      ]}>
        <Text style={[styles.historyIcon, { color: iconColor }]}>
          {isTransfer ? '⇄' : isDeposit ? '↓' : '↑'}
        </Text>
      </View>

      <View style={styles.historyInfo}>
        <Text style={styles.historyType}>{label}</Text>
        <Text style={styles.historyTime}>{item.time}</Text>
      </View>

      <View style={styles.historyRight}>
        <Text style={[styles.historyAmount, { color: iconColor }]}>
          {amountPrefix}{item.amount} {item.asset}
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

function toFundingHistoryItems(transactions: ReturnType<typeof useFundingStore.getState>['transactions']): HistoryItem[] {
  return transactions.map((tx) => ({
    id: tx.id,
    kind: tx.direction === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAW',
    title: tx.direction === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
    asset: tx.asset.toUpperCase(),
    amount: tx.amount,
    status: tx.status,
    createdAt: tx.createdAt,
    time: new Date(tx.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }));
}

function toTransferHistoryItems(transfers: WalletTransferRecord[]): HistoryItem[] {
  return transfers.map((tx) => ({
    id: tx.id,
    kind: 'TRANSFER',
    flow: tx.direction,
    title: tx.direction === 'OUT'
      ? `To ${tx.counterpartyEmail || tx.counterpartyId}`
      : `From ${tx.counterpartyEmail || tx.counterpartyId}`,
    asset: tx.asset.toUpperCase(),
    amount: tx.amount,
    status: tx.status,
    createdAt: tx.createdAt,
    time: new Date(tx.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }));
}

function sortHistoryItems(items: HistoryItem[]) {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export default function Wallet() {
  const insets = useSafeAreaInsets();

  const { isLoading, refetch } = useWallet();
  const { isLoading: transferHistoryLoading, refetch: refetchTransfers, data: transferRecords = [] } = useWalletTransfers();

  const balances = useWalletStore((s) => s.balances);
  const totalUsd = useWalletStore((s) => s.totalUsd);
  const marketPrices = useMarketStore((s) => s.prices);
  const ticker24h = useMarketStore((s) => s.ticker24h);

  useTicker24h();

  const livePrices = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [symbol, data] of Object.entries(marketPrices)) {
      out[symbol.replace('USDT', '')] = data.price;
    }
    return out;
  }, [marketPrices]);

  const [modalMode, setModalMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [modalVisible, setModalVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<'assets' | 'history'>('assets');
  const { isLoading: historyLoading, refetch: refetchHistory } = useFundingHistory();

  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setActiveSection('assets');
      refetch();
      refetchHistory();
      refetchTransfers();
    }, [refetch, refetchHistory, refetchTransfers])
  );

  const transactions = useFundingStore((s) => s.transactions);
  const history = useMemo(() => sortHistoryItems([
    ...toFundingHistoryItems(transactions),
    ...toTransferHistoryItems(transferRecords),
  ]), [transactions, transferRecords]);

  const assetList = useMemo(() =>
    Object.entries(balances).filter(([, v]) => v > 0),
    [balances]
  );

  const portfolioPnl = useMemo(() => {
    let pnlUsd = 0;
    let prevTotal = 0;

    for (const [asset, balance] of assetList) {
      const price = livePrices[asset] ?? PRICE_MAP[asset] ?? 0;
      const usdValue = balance * price;
      const changePercent = FIAT_ASSETS.has(asset) ? 0 : (ticker24h[`${asset}USDT`]?.change ?? 0);
      const prevValue = changePercent ? usdValue / (1 + changePercent / 100) : usdValue;
      pnlUsd += usdValue - prevValue;
      prevTotal += prevValue;
    }

    const pnlPercent = prevTotal > 0 ? (pnlUsd / prevTotal) * 100 : 0;
    return { pnlUsd, pnlPercent };
  }, [assetList, livePrices, ticker24h]);

  const openDeposit = useCallback(() => {
    setModalMode('deposit');
    setModalVisible(true);
  }, []);

  const openWithdraw = useCallback(() => {
    setModalMode('withdraw');
    setModalVisible(true);
  }, []);

  const openTransfer = useCallback(() => {
    setTransferVisible(true);
  }, []);

  const closeModal = useCallback(() => setModalVisible(false), []);
  const closeTransfer = useCallback(() => setTransferVisible(false), []);

  const onFundingSuccess = useCallback(() => {
    refetch();
    refetchHistory();
    refetchTransfers();
  }, [refetch, refetchHistory, refetchTransfers]);

  const onTransferSuccess = useCallback(() => {
    refetch();
    refetchHistory();
    refetchTransfers();
  }, [refetch, refetchHistory, refetchTransfers]);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([refetch(), refetchHistory(), refetchTransfers()]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, refetchHistory, refetchTransfers]);

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
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={onRefresh}
            tintColor={T.accent}
          />
        }
      >
        <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
          <View>
            <Text style={styles.pageLabel}>Wallet</Text>
            <Text style={styles.pageSubLabel}>Your assets & balances</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={onRefresh}>
            <Text style={styles.notifIcon}>↻</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.heroWrap}>
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
              <View style={styles.heroBadge}>
                <PulseDot color={T.gain} />
                <Text style={styles.heroBadgeText}>TOTAL BALANCE</Text>
              </View>

              {isLoading ? (
                <ActivityIndicator color={T.accent} size="large" style={styles.heroLoader} />
              ) : (
                <Text
                  style={styles.heroValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  ${totalUsdStr}
                </Text>
              )}

              <View style={styles.heroDeltaRow}>
                {isLoading ? null : assetList.length === 0 ? (
                  <View style={styles.heroDeltaBadge}>
                    <Text style={styles.heroDeltaText}>No holdings yet</Text>
                  </View>
                ) : (
                  <View style={[
                    styles.heroDeltaBadge,
                    portfolioPnl.pnlUsd < 0 && {
                      backgroundColor: T.lossDim,
                      borderColor: 'rgba(255,107,122,0.2)',
                    },
                  ]}>
                    <Text style={[
                      styles.heroDeltaText,
                      { color: portfolioPnl.pnlUsd >= 0 ? T.gain : T.loss },
                    ]}>
                      {portfolioPnl.pnlUsd >= 0 ? '↑ +' : '↓ -'}
                      ${Math.abs(portfolioPnl.pnlUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {' '}({portfolioPnl.pnlPercent >= 0 ? '+' : '-'}{Math.abs(portfolioPnl.pnlPercent).toFixed(2)}%)
                    </Text>
                  </View>
                )}
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

              <TouchableOpacity style={[styles.heroActionBtn, styles.heroActionBtnGhost]} onPress={openTransfer} activeOpacity={0.8}>
                <Text style={[styles.heroActionIcon, styles.heroActionIconAccent]}>→</Text>
                <Text style={[styles.heroActionText, styles.heroActionTextAccent]}>TRANSFER</Text>
              </TouchableOpacity>
            </View>
          </GlassPanel>
        </Animated.View>

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
              <Animated.View entering={FadeIn.duration(200)} style={styles.emptyState}>
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
                const price = livePrices[asset] ?? PRICE_MAP[asset] ?? 0;
                const usdValue = balance * price;
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
          <View>
            <View style={styles.sectionLabelRow}>
              <View style={styles.sectionAccentBar} />
              <Text style={styles.sectionLabelText}>Transaction History</Text>
            </View>

            {historyLoading || transferHistoryLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={T.accent} />
                <Text style={styles.loadingText}>Loading history...</Text>
              </View>
            ) : history.length === 0 ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.emptyState}>
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

      <TransferModal
        visible={transferVisible}
        onClose={closeTransfer}
        onSuccess={onTransferSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.13 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  pageLabel: { fontSize: 26, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.5 },
  pageSubLabel: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  notifBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  notifIcon: { fontSize: 18, color: T.textSec },

  heroWrap: {
    marginBottom: 16, borderRadius: 26,
    shadowColor: T.accentDeep, shadowOpacity: 0.32, shadowRadius: 34, shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  heroPanel: { borderRadius: 26, padding: 20, borderWidth: 1, borderColor: T.glassBorderHi },
  heroInnerBorder: { position: 'absolute', top: 1, left: 1, right: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  heroTop: { marginBottom: 18 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: T.gainDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(61,220,151,0.18)',
  },
  heroBadgeText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.gain, letterSpacing: 1.4 },
  heroLoader: { marginVertical: 16 },
  heroValue: { fontSize: 42, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1.5, marginBottom: 10, maxWidth: width * 0.62 },
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

  assetCardWrap: {
    marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  assetCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: T.glassBorder, backgroundColor: T.glassUp, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
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
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
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
  sheetSolid: { backgroundColor: '#0C0E13' },
  sheetPanel: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, borderColor: T.glassBorderHi, paddingBottom: 44 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: T.glassBorder, alignSelf: 'center', marginBottom: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  backBtn: {
    position: 'absolute', left: -4, top: -6, width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder,
  },
  backBtnText: { fontSize: 20, fontFamily: FontFamily.heading, color: T.textSec, marginTop: -2 },
  sheetIconWrap: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sheetIcon: { fontSize: 20, fontFamily: FontFamily.heading },
  sheetTitle: { fontSize: 20, fontFamily: FontFamily.heading, color: T.textPri },
  sheetSubtitle: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  sheetLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.8, marginBottom: 10 },

  methodGrid: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  methodCard: {
    flex: 1, borderRadius: 18, padding: 18, alignItems: 'center',
    backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorderHi,
  },
  methodIconWrap: {
    width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, marginBottom: 12,
  },
  methodIcon: { fontSize: 20, fontFamily: FontFamily.heading },
  methodTitle: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri, marginBottom: 4 },
  methodSubtitle: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center' },

  fixedAssetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.glass, borderRadius: 12, borderWidth: 1, borderColor: T.glassBorder,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  fixedAssetText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, flex: 1 },
  fixedAssetBadge: { backgroundColor: T.gainDim, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  fixedAssetBadgeText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.gain, letterSpacing: 0.6 },

  assetPickerScroll: { marginBottom: 20 },
  assetPickerRow: { flexDirection: 'row', gap: 8 },
  assetPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder },
  assetPillDot: { width: 6, height: 6, borderRadius: 3 },
  assetPillText: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textSec },
  recipientWrap: { backgroundColor: T.glass, borderRadius: 14, borderWidth: 1, borderColor: T.glassBorderHi, marginBottom: 16 },
  recipientInput: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, fontFamily: FontFamily.body, color: T.textPri },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: T.glassBorderHi, marginBottom: 16, gap: 10 },
  amountSymbol: { fontSize: 18, fontFamily: FontFamily.heading, color: T.textTer },
  amountInput: { flex: 1, fontSize: 22, fontFamily: FontFamily.heading, color: T.textPri },
  maxBtn: { backgroundColor: T.accentDeep + '30', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: T.accent + '40' },
  maxText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.accent, letterSpacing: 1 },
  availableBalanceText: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: -10, marginBottom: 16 },
  sheetInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetInfoLabel: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer },
  sheetInfoValue: { fontSize: 12, fontFamily: FontFamily.heading, color: T.textSec },
  sheetSubmitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 16 },
  sheetSubmitGradient: { paddingVertical: 17, alignItems: 'center' },
  sheetSubmitText: { fontSize: 13, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 1.5 },
  sheetGhostBtn: { alignSelf: 'center', marginTop: 14, paddingVertical: 6, paddingHorizontal: 14 },
  sheetGhostText: { fontSize: 12, fontFamily: FontFamily.bodyMedium, color: T.textTer },
  intentCard: {
    backgroundColor: T.glass,
    borderWidth: 1,
    borderColor: T.glassBorderHi,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  intentCardTitle: { fontSize: 15, fontFamily: FontFamily.heading, color: T.textPri, marginBottom: 8 },
  intentCardText: { fontSize: 12, fontFamily: FontFamily.body, color: T.textTer, lineHeight: 18, marginBottom: 14 },
  intentDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  intentDetailLabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer },
  intentDetailValue: { fontSize: 11, fontFamily: FontFamily.heading, color: T.textSec },
  intentAddressBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(124,138,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124,138,255,0.20)',
  },
  intentAddressLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer, marginBottom: 8, letterSpacing: 0.7 },
  intentAddressText: { fontSize: 12, fontFamily: FontFamily.body, color: T.textPri, lineHeight: 17 },
});
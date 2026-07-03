import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Dimensions,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft, FadeInUp,
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  withSequence, withRepeat, withDelay, interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { FontFamily, FontSize } from '../../constants/typography';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const { height } = Dimensions.get('window');

// --- Local design tokens, mirrored from the dashboard / register screen ---
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
  gold: '#E8B656',
  textPri: '#F4F5F7',
  textSec: '#9499A8',
  textTer: '#5B6072',
};

// --- Shared primitives, copied locally (same pattern as dashboard / register) ---

function GlassPanel({ style, children, intensity = 28 }: any) {
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
}

function PulseDot({ color }: { color: string }) {
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
}

function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-14, 16]) }, { translateY: interpolate(drift.value, [0, 1], [-10, 12]) }],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [12, -18]) }, { translateY: interpolate(drift.value, [0, 1], [8, -14]) }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -90, right: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: height * 0.4, left: -100, backgroundColor: T.violet, opacity: 0.10 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { bottom: -100, right: -40, backgroundColor: T.gain, opacity: 0.05, width: 220, height: 220, borderRadius: 110 }, orb1]} />
    </View>
  );
}

function FloatingInput({ label, value, onChangeText, secureTextEntry, keyboardType, index }: any) {
  const focused = useSharedValue(0);
  const hasValue = value.length > 0;

  const labelUp = useAnimatedStyle(() => ({
    transform: [
      { translateY: withTiming((focused.value || hasValue) ? -21 : 0, { duration: 250 }) },
      { scale: withTiming((focused.value || hasValue) ? 0.78 : 1, { duration: 250 }) },
    ],
    color: withTiming(
      focused.value ? T.accent : hasValue ? T.textSec : T.textTer,
      { duration: 250 }
    ),
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focused.value
      ? `rgba(124,138,255,${interpolate(focused.value, [0, 1], [0.08, 0.4])})`
      : T.glassBorder,
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(300 + index * 70).duration(600).springify().damping(16)}
      style={[styles.floatWrapper, borderStyle]}
    >
      <Animated.Text style={[styles.floatLabel, labelUp]}>{label}</Animated.Text>
      <TextInput
        style={styles.floatInput}
        value={value}
        onChangeText={onChangeText}
        placeholder=""
        placeholderTextColor="transparent"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
        onFocus={() => { focused.value = 1; }}
        onBlur={() => { focused.value = 0; }}
      />
    </Animated.View>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const accentLineWidth = useSharedValue(0);
  const buttonPress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      accentLineWidth.value = 0;
      accentLineWidth.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }, [])
  );

  const accentLineStyle = useAnimatedStyle(() => ({
    width: `${interpolate(accentLineWidth.value, [0, 1], [0, 40])}%`,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(buttonPress.value, [0, 1], [1, 0.97]) }],
  }));

  const buttonGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(buttonPress.value, [0, 1], [0, 1]),
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(buttonPress.value ? 6 : 0, { duration: 200 }) }],
  }));

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Missing Fields', 'Please fill in all fields.');
    buttonPress.value = withSpring(1, { damping: 14 });
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
      buttonPress.value = withSpring(0, { damping: 10 });
    }
  };

  return (
    <View style={styles.root}>
      <AmbientField />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top bar */}
          <Animated.View entering={FadeIn.delay(80).duration(450)} style={styles.topBar}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <LinearGradient colors={[T.accentDeep, T.violet]} style={styles.logoGradient}>
                  <Text style={styles.logoLetter}>N</Text>
                </LinearGradient>
              </View>
              <Text style={styles.logoWordmark}>
                NEXUS<Text style={{ color: T.accent }}>TRADE</Text>
              </Text>
            </View>
            <View style={styles.securePill}>
              <PulseDot color={T.gain} />
              <Text style={styles.securePillText}>LIVE</Text>
            </View>
          </Animated.View>

          {/* Hero */}
          <View style={styles.heroSection}>
            <Animated.Text entering={FadeInLeft.delay(160).duration(700).springify()} style={styles.heroLine1}>
              TRADE
            </Animated.Text>
            <Animated.View entering={FadeInLeft.delay(240).duration(700).springify()} style={styles.heroLine2Row}>
              <Text style={styles.heroLine2}>THE </Text>
              <Text style={[styles.heroLine2, { color: T.accent }]}>FUTURE</Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(420).duration(600)} style={styles.accentLineContainer}>
              <Animated.View style={[styles.accentLineAnimated, accentLineStyle]} />
              <View style={styles.accentLineDot} />
            </Animated.View>
          </View>

          {/* Form card */}
          <Animated.View entering={FadeInDown.delay(140).springify().damping(16)} style={styles.formWrap}>
            <GlassPanel style={styles.formPanel} intensity={30}>
              <LinearGradient
                colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.4 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['rgba(124,138,255,0.09)', 'transparent']}
                start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.9 }}
                style={StyleSheet.absoluteFill}
              />

              <FloatingInput label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" index={0} />
              <FloatingInput label="Password" value={password} onChangeText={setPassword} secureTextEntry index={1} />

              <Animated.View entering={FadeIn.delay(460).duration(400)} style={styles.forgotRow}>
                <TouchableOpacity activeOpacity={0.6}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View style={[styles.submitWrap, buttonStyle]}>
                <TouchableOpacity
                  onPress={handleLogin}
                  activeOpacity={1}
                  disabled={loading}
                  onPressIn={() => { buttonPress.value = withSpring(1, { damping: 14 }); }}
                  onPressOut={() => { buttonPress.value = withSpring(0, { damping: 10 }); }}
                  style={styles.submitBtn}
                >
                  <LinearGradient
                    colors={[T.accentDeep, T.violet]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: 0.08 }, buttonGlowStyle]} />
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View style={styles.submitInner}>
                        <Text style={styles.submitText}>SIGN IN</Text>
                        <Animated.Text style={[styles.submitArrow, arrowStyle]}>→</Animated.Text>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </GlassPanel>
          </Animated.View>

          {/* Stats */}
          <Animated.View entering={FadeInDown.delay(220).springify().damping(16)} style={styles.statsWrap}>
            <GlassPanel style={styles.statsPanel} intensity={22}>
              {[
                { label: 'Active Traders', value: '50K+', c: T.accent },
                { label: 'Daily Volume', value: '$2.4B', c: T.gain },
                { label: 'Supported Assets', value: '120+', c: T.gold },
              ].map((s, i) => (
                <Animated.View key={s.label} entering={FadeInUp.delay(300 + i * 50).springify()} style={styles.statItem}>
                  <Text style={[styles.statValue, { color: s.c }]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </Animated.View>
              ))}
            </GlassPanel>
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeIn.delay(380).duration(400)} style={styles.footer}>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7} style={styles.registerRow}>
              <Text style={styles.registerText}>New to NexusTrade? </Text>
              <Text style={styles.registerLink}>Create account</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 48, minHeight: height },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.14 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 44 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' },
  logoGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoLetter: { fontSize: 16, fontFamily: FontFamily.heading, color: '#fff' },
  logoWordmark: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 3 },
  securePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.gainDim, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(61,220,151,0.18)' },
  securePillText: { fontSize: 9, fontFamily: FontFamily.heading, color: T.gain, letterSpacing: 1.2 },

  heroSection: { marginBottom: 30 },
  heroLine1: { fontSize: 52, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1, lineHeight: 58 },
  heroLine2Row: { flexDirection: 'row' },
  heroLine2: { fontSize: 52, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -1, lineHeight: 58 },
  accentLineContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 4, gap: 6 },
  accentLineAnimated: { height: 1.5, backgroundColor: T.violet },
  accentLineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.violet },

  formWrap: { marginBottom: 16, borderRadius: 26, shadowColor: T.accentDeep, shadowOpacity: 0.26, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  formPanel: { borderRadius: 26, padding: 20, borderWidth: 1, borderColor: T.glassBorderHi },

  floatWrapper: { marginBottom: 22, position: 'relative', borderRadius: 14, borderWidth: 1, borderColor: T.glassBorder, backgroundColor: 'rgba(255,255,255,0.02)', paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },
  floatLabel: { position: 'absolute', top: 14, left: 14, fontSize: FontSize.md, fontFamily: FontFamily.body, transformOrigin: 'left center' },
  floatInput: { fontSize: FontSize.lg, fontFamily: FontFamily.bodyMedium, color: T.textPri, backgroundColor: 'transparent', padding: 0 },

  forgotRow: { alignItems: 'flex-end', marginBottom: 18, marginTop: -8 },
  forgotText: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: T.accent },

  submitWrap: { marginTop: 4 },
  submitBtn: { borderRadius: 14, overflow: 'hidden' },
  submitGradient: { paddingVertical: 17, paddingHorizontal: 24, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 2 },
  submitArrow: { fontSize: FontSize.lg, color: '#fff' },

  statsWrap: { marginBottom: 24, borderRadius: 20 },
  statsPanel: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: T.glassBorder },
  statItem: { alignItems: 'center', gap: 3 },
  statValue: { fontSize: FontSize.md, fontFamily: FontFamily.heading },
  statLabel: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center' },

  footer: { gap: 16, alignItems: 'center' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  registerText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: T.textTer },
  registerLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: T.accent },
});
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Dimensions,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft, FadeInUp,
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  withSequence, withRepeat, withDelay, interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { FontFamily, FontSize } from '../../constants/typography';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get('window');

// --- Local design tokens, mirrored from the dashboard so this screen stays self-contained ---
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
      <Animated.View style={[styles.ambientOrb, { top: -90, left: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: height * 0.35, right: -110, backgroundColor: T.violet, opacity: 0.10 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { bottom: -100, left: -40, backgroundColor: T.gain, opacity: 0.05, width: 220, height: 220, borderRadius: 110 }, orb1]} />
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
      entering={FadeInDown.delay(260 + index * 60).duration(550).springify().damping(16)}
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

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const accentLineWidth = useSharedValue(0);
  const buttonPress = useSharedValue(0);

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    accentLineWidth.value = withDelay(500, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, []);

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

  const handleRegister = async () => {
    if (!fullName || !username || !email || !password)
      return Alert.alert('Missing Fields', 'Please fill in all fields.');
    if (password.length < 6)
      return Alert.alert('Weak Password', 'Password must be at least 6 characters.');

    buttonPress.value = withSpring(1, { damping: 14 });
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', { name: fullName, email, password });
      const { token, user } = res.data;
      setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
      buttonPress.value = withSpring(0, { damping: 10 });
    }
  };

  const handleGoogleIdToken = useCallback(async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const res = await api.post('/auth/google', { idToken });
      const { token, user } = res.data;
      setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Google Sign-In Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setGoogleLoading(false);
    }
  }, [setAuth]);

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken;
      if (idToken) {
        handleGoogleIdToken(idToken);
      } else {
        Alert.alert('Google Sign-In Failed', 'No ID token returned by Google.');
      }
    } else if (response?.type === 'error') {
      Alert.alert('Google Sign-In Failed', 'Something went wrong while signing in with Google.');
    }
  }, [response, handleGoogleIdToken]);

const handleGooglePress = useCallback(async () => {
  if (googleLoading || !request) return;

  try {
    setGoogleLoading(true);
    await promptAsync();
  } finally {
    setGoogleLoading(false);
  }
}, [promptAsync, googleLoading, request]);

  const strengthLevel =
    password.length === 0 ? 0 :
    password.length < 4 ? 1 :
    password.length < 8 ? 2 : 3;

  const strengthLabel = ['', 'Weak', 'Fair', 'Strong'][strengthLevel];
  const strengthColor = [T.hairline, T.loss, T.gold, T.gain][strengthLevel];

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
              <Text style={styles.securePillText}>ENCRYPTED</Text>
            </View>
          </Animated.View>

          {/* Hero */}
          <View style={styles.heroSection}>
            <Animated.Text entering={FadeInLeft.delay(160).duration(700).springify()} style={styles.heroLine1}>
              JOIN THE
            </Animated.Text>
            <Animated.Text entering={FadeInLeft.delay(240).duration(700).springify()} style={styles.heroLine2}>
              MARKET
            </Animated.Text>

            <Animated.View entering={FadeIn.delay(420).duration(600)} style={styles.accentLineContainer}>
              <Animated.View style={[styles.accentLineAnimated, accentLineStyle]} />
              <View style={styles.accentLineDot} />
            </Animated.View>

            <Animated.Text entering={FadeIn.delay(500).duration(600)} style={styles.heroSub}>
              Create your account and start trading{'\n'}with an edge.
            </Animated.Text>
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

              <FloatingInput label="Full name" value={fullName} onChangeText={setFullName} index={0} />
              <FloatingInput label="Username" value={username} onChangeText={setUsername} index={1} />
              <FloatingInput label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" index={2} />
              <FloatingInput label="Password" value={password} onChangeText={setPassword} secureTextEntry index={3} />

              {password.length > 0 && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.strengthRow}>
                  {[1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthBar,
                        { backgroundColor: strengthLevel >= i ? strengthColor : T.hairline },
                      ]}
                    />
                  ))}
                  <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
                </Animated.View>
              )}

              <Animated.View style={[styles.submitWrap, buttonStyle]}>
                <TouchableOpacity
                  onPress={handleRegister}
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
                        <Text style={styles.submitText}>CREATE ACCOUNT</Text>
                        <Animated.Text style={[styles.submitArrow, arrowStyle]}>→</Animated.Text>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View entering={FadeIn.delay(480).duration(400)} style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(520).springify().damping(16)}>
                <TouchableOpacity
                  onPress={handleGooglePress}
                  disabled={!request || googleLoading}
                  activeOpacity={0.8}
                  style={[styles.googleBtn, (!request || googleLoading) && { opacity: 0.5 }]}
                >
                  {googleLoading ? (
                    <ActivityIndicator color={T.textPri} />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={17} color={T.textPri} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </GlassPanel>
          </Animated.View>

          {/* Perks */}
          <Animated.View entering={FadeInDown.delay(220).springify().damping(16)} style={styles.perksWrap}>
            <GlassPanel style={styles.perksPanel} intensity={22}>
              {['No deposit fees', 'Instant execution', 'Bank-grade security'].map((perk, i) => (
                <Animated.View
                  key={perk}
                  entering={FadeInUp.delay(300 + i * 50).springify()}
                  style={styles.perkItem}
                >
                  <View style={styles.perkDot} />
                  <Text style={styles.perkText}>{perk}</Text>
                </Animated.View>
              ))}
            </GlassPanel>
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeIn.delay(380).duration(400)} style={styles.footer}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
            <Text style={styles.termsNote}>
              By continuing you agree to our{' '}
              <Text style={{ color: T.accent }} onPress={() => router.push('/legal/terms')}>Terms</Text>
              {' '}and{' '}
              <Text style={{ color: T.accent }} onPress={() => router.push('/legal/privacy')}>Privacy Policy</Text>
            </Text>
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
  heroLine2: { fontSize: 52, fontFamily: FontFamily.heading, color: T.accent, letterSpacing: -1, lineHeight: 58 },
  accentLineContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 18, gap: 6 },
  accentLineAnimated: { height: 1.5, backgroundColor: T.violet },
  accentLineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.violet },
  heroSub: { fontSize: FontSize.md, fontFamily: FontFamily.body, color: T.textSec, lineHeight: 22 },

  formWrap: { marginBottom: 16, borderRadius: 26, shadowColor: T.accentDeep, shadowOpacity: 0.26, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  formPanel: { borderRadius: 26, padding: 20, borderWidth: 1, borderColor: T.glassBorderHi },

  floatWrapper: { marginBottom: 22, position: 'relative', borderRadius: 14, borderWidth: 1, borderColor: T.glassBorder, backgroundColor: 'rgba(255,255,255,0.02)', paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },
  floatLabel: { position: 'absolute', top: 14, left: 14, fontSize: FontSize.md, fontFamily: FontFamily.body, transformOrigin: 'left center' },
  floatInput: { fontSize: FontSize.lg, fontFamily: FontFamily.bodyMedium, color: T.textPri, backgroundColor: 'transparent', padding: 0 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 20 },
  strengthBar: { flex: 1, height: 2, borderRadius: 1 },
  strengthLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, minWidth: 36 },

  submitWrap: { marginTop: 4 },
  submitBtn: { borderRadius: 14, overflow: 'hidden' },
  submitGradient: { paddingVertical: 17, paddingHorizontal: 24, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 2 },
  submitArrow: { fontSize: FontSize.lg, color: '#fff' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.hairline },
  dividerText: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 1 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, borderColor: T.glassBorderHi,
    backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 15,
  },
  googleBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2 },

  perksWrap: { marginBottom: 24, borderRadius: 20 },
  perksPanel: { borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18, borderWidth: 1, borderColor: T.glassBorder, gap: 12 },
  perkItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: T.gain },
  perkText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: T.textSec },

  footer: { gap: 16, alignItems: 'center' },
  loginRow: { flexDirection: 'row', alignItems: 'center' },
  loginText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: T.textTer },
  loginLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: T.accent },
  termsNote: { fontSize: 10, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center', lineHeight: 16 },
});
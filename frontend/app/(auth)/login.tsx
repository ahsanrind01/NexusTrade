import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { router } from 'expo-router';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft, FadeInRight,
  useSharedValue, useAnimatedStyle, withTiming,
  withSpring, withDelay, withRepeat, withSequence,
  interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Colors } from '../../constants/colors';
import { FontFamily, FontSize } from '../../constants/typography';

const { width, height } = Dimensions.get('window');
const DOTS = 12;

function FloatingInput({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, index }: any) {
  const focused = useSharedValue(0);
  const hasValue = value.length > 0;

  const lineWidth = useAnimatedStyle(() => ({
    width: withTiming(focused.value ? '100%' : '0%', { duration: 400, easing: Easing.out(Easing.cubic) }),
  }));

  const labelUp = useAnimatedStyle(() => ({
    transform: [
      { translateY: withTiming((focused.value || hasValue) ? -22 : 0, { duration: 250 }) },
      { scale: withTiming((focused.value || hasValue) ? 0.78 : 1, { duration: 250 }) },
    ],
    color: withTiming(
      focused.value ? Colors.accent : hasValue ? Colors.textSecondary : Colors.textMuted,
      { duration: 250 }
    ),
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(300 + index * 80).duration(600).springify()}
      style={styles.floatWrapper}
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
      <View style={styles.floatBaseLine} />
      <Animated.View style={[styles.floatAccentLine, lineWidth]} />
    </Animated.View>
  );
}

function DotGrid() {
  return (
    <View style={styles.dotGrid} pointerEvents="none">
      {Array.from({ length: DOTS * DOTS }).map((_, i) => {
        const opacity = Math.random() * 0.12 + 0.03;
        return (
          <View
            key={i}
            style={[styles.dot, { opacity }]}
          />
        );
      })}
    </View>
  );
}

function TickerItem({ symbol, price, change, positive }: any) {
  return (
    <View style={styles.tickerItem}>
      <Text style={styles.tickerSymbol}>{symbol}</Text>
      <Text style={styles.tickerPrice}>{price}</Text>
      <Text style={[styles.tickerChange, { color: positive ? Colors.gain : Colors.loss }]}>
        {positive ? '+' : ''}{change}%
      </Text>
    </View>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const accentLineWidth = useSharedValue(0);
  const buttonPressed = useSharedValue(0);
  const arrowX = useSharedValue(0);

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
    opacity: withTiming(buttonPressed.value ? 0.85 : 1),
    transform: [{ scale: withTiming(buttonPressed.value ? 0.985 : 1, { duration: 120 }) }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(buttonPressed.value ? 6 : 0, { duration: 200 }) }],
  }));

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Missing Fields', 'Please fill in all fields.');
    buttonPressed.value = 1;
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      buttonPressed.value = 0;
      Alert.alert('Login Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
      buttonPressed.value = 0;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DotGrid />

      <LinearGradient
        colors={['rgba(108,99,255,0.08)', 'transparent', 'rgba(0,212,170,0.04)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeIn.delay(100).duration(500)} style={styles.topBar}>
          <View style={styles.logoMark}>
            <LinearGradient colors={[Colors.accent, '#9B5CFF']} style={styles.logoGradient}>
              <Text style={styles.logoLetter}>N</Text>
            </LinearGradient>
          </View>
          <Text style={styles.logoWordmark}>
            NEXUS<Text style={{ color: Colors.accent }}>TRADE</Text>
          </Text>
          <View style={styles.versionTag}>
            <Text style={styles.versionText}>PRO</Text>
          </View>
        </Animated.View>

        <View style={styles.heroSection}>
          <Animated.Text entering={FadeInLeft.delay(200).duration(700).springify()} style={styles.heroLine1}>
            TRADE
          </Animated.Text>
          <Animated.View entering={FadeInLeft.delay(300).duration(700).springify()} style={styles.heroLine2Row}>
            <Text style={styles.heroLine2}>THE </Text>
            <Text style={[styles.heroLine2, { color: Colors.accent }]}>FUTURE</Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(500).duration(600)} style={styles.accentLineContainer}>
            <Animated.View style={[styles.accentLineAnimated, accentLineStyle]} />
            <View style={styles.accentLineDot} />
          </Animated.View>


        </View>

        <View style={styles.formSection}>
          <FloatingInput
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            index={0}
          />
          <FloatingInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            index={1}
          />

          <Animated.View entering={FadeIn.delay(500).duration(400)} style={styles.forgotRow}>
            <TouchableOpacity activeOpacity={0.6}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </Animated.View>
          <Animated.View
            entering={FadeInDown.delay(580).duration(500).springify()}
            style={buttonStyle}
          >
            <TouchableOpacity
              onPress={handleLogin}
              activeOpacity={1}
              disabled={loading}
              onPressIn={() => { buttonPressed.value = 1; }}
              onPressOut={() => { buttonPressed.value = 0; }}
              style={styles.submitBtn}
            >
              <LinearGradient
                colors={['#6C63FF', '#9B5CFF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
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

          <Animated.View entering={FadeIn.delay(650).duration(400)} style={styles.statsRow}>
            {[
              { label: 'Active Traders', value: '50K+' },
              { label: 'Daily Volume', value: '$2.4B' },
              { label: 'Supported Assets', value: '120+' },
            ].map((s, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.delay(700).duration(400)} style={styles.footer}>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7} style={styles.registerRow}>
            <Text style={styles.registerText}>New to NexusTrade? </Text>
            <Text style={styles.registerLink}>Create account</Text>
          </TouchableOpacity>

        
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const DOT_SIZE = 1.5;
const DOT_SPACING = width / DOTS;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 28, paddingTop: 60, paddingBottom: 48, minHeight: height },

  dotGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingVertical: 16,
    gap: DOT_SPACING - DOT_SIZE,
  },
  dot: {
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.textSecondary,
    margin: (DOT_SPACING - DOT_SIZE) / 2,
  },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 56,
  },
  logoMark: { width: 32, height: 32, borderRadius: 8, overflow: 'hidden' },
  logoGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoLetter: { fontSize: 16, fontFamily: FontFamily.heading, color: '#fff' },
  logoWordmark: { fontSize: 13, fontFamily: FontFamily.heading, color: Colors.textPrimary, letterSpacing: 3, flex: 1 },
  versionTag: {
    backgroundColor: Colors.accentDim, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.accent + '44',
  },
  versionText: { fontSize: 9, fontFamily: FontFamily.heading, color: Colors.accent, letterSpacing: 1.5 },

  heroSection: { marginBottom: 48 },
  heroLine1: {
    fontSize: 68, fontFamily: FontFamily.heading, color: Colors.textPrimary,
    letterSpacing: -1, lineHeight: 72,
  },
  heroLine2Row: { flexDirection: 'row' },
  heroLine2: {
    fontSize: 68, fontFamily: FontFamily.heading, color: Colors.textPrimary,
    letterSpacing: -1, lineHeight: 72,
  },
  accentLineContainer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 20, gap: 6,
  },
  accentLineAnimated: {
    height: 1.5, backgroundColor: Colors.accent,
  },
  accentLineDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent,
  },
  heroSub: {
    fontSize: FontSize.md, fontFamily: FontFamily.body,
    color: Colors.textSecondary, lineHeight: 24,
  },

  formSection: { marginBottom: 36 },

  floatWrapper: { marginBottom: 32, position: 'relative' },
  floatLabel: {
    position: 'absolute', top: 14,
    fontSize: FontSize.md, fontFamily: FontFamily.body,
    transformOrigin: 'left center',
  },
  floatInput: {
    paddingTop: 20, paddingBottom: 12,
    fontSize: FontSize.lg, fontFamily: FontFamily.bodyMedium,
    color: Colors.textPrimary,
    backgroundColor: 'transparent',
  },
  floatBaseLine: { height: 1, backgroundColor: Colors.border },
  floatAccentLine: { height: 1.5, backgroundColor: Colors.accent, marginTop: -1.5 },

  forgotRow: { alignItems: 'flex-end', marginBottom: 28, marginTop: -12 },
  forgotText: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: Colors.accent },

  submitBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 32 },
  submitGradient: { paddingVertical: 18, paddingHorizontal: 24, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 2 },
  submitArrow: { fontSize: FontSize.lg, color: '#fff' },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 4,
    borderTopWidth: 1, borderColor: Colors.border,marginTop:30,
  },
  statItem: { alignItems: 'center', gap: 3 },
  statValue: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  statLabel: { fontSize: 10, fontFamily: FontFamily.body, color: Colors.textMuted, textAlign: 'center' },

  footer: { gap: 20 },
  tickerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'space-between',
  },
  tickerItem: { alignItems: 'center', gap: 2 },
  tickerSymbol: { fontSize: 10, fontFamily: FontFamily.heading, color: Colors.textMuted, letterSpacing: 1 },
  tickerPrice: { fontSize: FontSize.sm, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  tickerChange: { fontSize: 10, fontFamily: FontFamily.bodyMedium },
  tickerDivider: { width: 1, height: 28, backgroundColor: Colors.border },

  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  registerText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: Colors.textMuted },
  registerLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: Colors.accent },

  securityNote: {
    fontSize: 10, fontFamily: FontFamily.body,
    color: Colors.textMuted, textAlign: 'center', letterSpacing: 0.5,
  },
});
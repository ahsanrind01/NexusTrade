import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import Animated, {
  FadeIn, FadeInDown, FadeInLeft,
  useSharedValue, useAnimatedStyle, withTiming,
  withDelay, interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Colors } from '../../constants/colors';
import { FontFamily, FontSize } from '../../constants/typography';

const { width, height } = Dimensions.get('window');
const DOTS = 12;

function FloatingInput({ label, value, onChangeText, secureTextEntry, keyboardType, index }: any) {
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
      entering={FadeInDown.delay(280 + index * 70).duration(600).springify()}
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
        return <View key={i} style={[styles.dot, { opacity }]} />;
      })}
    </View>
  );
}

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const accentLineWidth = useSharedValue(0);
  const buttonPressed = useSharedValue(0);

  useEffect(() => {
    accentLineWidth.value = withDelay(500, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, []);

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

  const handleRegister = async () => {
    if (!fullName || !username || !email || !password)
      return Alert.alert('Missing Fields', 'Please fill in all fields.');
    if (password.length < 6)
      return Alert.alert('Weak Password', 'Password must be at least 6 characters.');

    buttonPressed.value = 1;
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { name :fullName, email, password });
      const { token, user } = res.data;
      setAuth(token, user);
      router.replace('/(tabs)');
    } catch (err: any) {
      buttonPressed.value = 0;
      Alert.alert('Registration Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
      buttonPressed.value = 0;
    }
  };

  const strengthLevel =
    password.length === 0 ? 0 :
    password.length < 4 ? 1 :
    password.length < 8 ? 2 : 3;

  const strengthLabel = ['', 'Weak', 'Fair', 'Strong'][strengthLevel];
  const strengthColor = [Colors.border, Colors.loss, Colors.accent, Colors.gain][strengthLevel];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DotGrid />

      <LinearGradient
        colors={['rgba(155,92,255,0.07)', 'transparent', 'rgba(0,212,170,0.04)']}
        start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
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
          <Animated.Text entering={FadeInLeft.delay(180).duration(700).springify()} style={styles.heroLine1}>
            JOIN THE
          </Animated.Text>
          <Animated.View entering={FadeInLeft.delay(260).duration(700).springify()} style={styles.heroLine2Row}>
            <Text style={styles.heroLine2}>MARKET</Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(450).duration(600)} style={styles.accentLineContainer}>
            <Animated.View style={[styles.accentLineAnimated, accentLineStyle]} />
            <View style={styles.accentLineDot} />
          </Animated.View>

          <Animated.Text entering={FadeIn.delay(540).duration(600)} style={styles.heroSub}>
            Create your account and start trading{'\n'}with an edge.
          </Animated.Text>
        </View>

        <View style={styles.formSection}>
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
                    { backgroundColor: strengthLevel >= i ? strengthColor : Colors.border },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(600).duration(500).springify()}
            style={buttonStyle}
          >
            <TouchableOpacity
              onPress={handleRegister}
              activeOpacity={1}
              disabled={loading}
              onPressIn={() => { buttonPressed.value = 1; }}
              onPressOut={() => { buttonPressed.value = 0; }}
              style={styles.submitBtn}
            >
              <LinearGradient
                colors={['#9B5CFF', '#6C63FF']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
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

          <Animated.View entering={FadeIn.delay(680).duration(400)} style={styles.perksRow}>
            {['No deposit fees', 'Instant execution', 'Bank-grade security'].map((perk, i) => (
              <View key={i} style={styles.perkItem}>
                <View style={styles.perkDot} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.delay(720).duration(400)} style={styles.footer}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <Text style={styles.loginLink}>Sign in</Text>
          </TouchableOpacity>
          <Text style={styles.termsNote}>
            By continuing you agree to our{' '}
            <Text style={{ color: Colors.accent }}>Terms</Text>
            {' '}and{' '}
            <Text style={{ color: Colors.accent }}>Privacy Policy</Text>
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const DOT_SPACING = width / DOTS;
const DOT_SIZE = 1.5;

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

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 56 },
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

  heroSection: { marginBottom: 44 },
  heroLine1: {
    fontSize: 62, fontFamily: FontFamily.heading, color: Colors.textPrimary,
    letterSpacing: -1, lineHeight: 68,
  },
  heroLine2Row: { flexDirection: 'row' },
  heroLine2: {
    fontSize: 62, fontFamily: FontFamily.heading, color: Colors.accent,
    letterSpacing: -1, lineHeight: 68,
  },
  accentLineContainer: {
    flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 20, gap: 6,
  },
  accentLineAnimated: { height: 1.5, backgroundColor: '#9B5CFF' },
  accentLineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9B5CFF' },
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
  floatAccentLine: { height: 1.5, backgroundColor: '#9B5CFF', marginTop: -1.5 },

  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: -20, marginBottom: 24,
  },
  strengthBar: { flex: 1, height: 2, borderRadius: 1 },
  strengthLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, minWidth: 36 },

  submitBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 28 },
  submitGradient: { paddingVertical: 18, paddingHorizontal: 24, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { fontSize: FontSize.md, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 2 },
  submitArrow: { fontSize: FontSize.lg, color: '#fff' },

  perksRow: { gap: 10 },
  perkItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gain },
  perkText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: Colors.textSecondary },

  footer: { gap: 16, alignItems: 'center' },
  loginRow: { flexDirection: 'row', alignItems: 'center' },
  loginText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: Colors.textMuted },
  loginLink: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: Colors.accent },
  termsNote: {
    fontSize: 10, fontFamily: FontFamily.body,
    color: Colors.textMuted, textAlign: 'center', lineHeight: 16,
  },
});
import { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withTiming, withSequence, withRepeat,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAuthStore } from '../../stores/authStore';

let BlurView: any = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

// ---------------------------------------------------------------------------
// NOTE ON WIRING THIS SCREEN UP
// ---------------------------------------------------------------------------
// 1. API_BASE points at the API Gateway. Update the host for device testing.
// 2. Assumes useAuthStore exposes `user` ({ id, name, email, createdAt }),
//    `token`, and a `logout()` action. Rename anything that doesn't match
//    your actual store — I don't have that file's contents.
// 3. Password change has NO backend endpoint yet (auth-service only has
//    signup/login/profile). The row here is wired to a friendly "not
//    available yet" state instead of a fake call — say the word and I'll
//    build the backend route + controller for it too.
// 4. Deposit/Withdraw/Order History buttons route to placeholder paths
//    (/deposit, /withdraw, /orders) — adjust to wherever those screens
//    actually live once they exist.
// ---------------------------------------------------------------------------

const API_BASE = 'http://localhost:3000/api';

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

// ---------------------------------------------------------------------------
// Shared small components — same visual language as Home/Market
// ---------------------------------------------------------------------------

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 26, tint = 'dark' }: any) {
  if (BlurView) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
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

const SectionLabel = memo(function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.sectionLabelText}>{title}</Text>
    </View>
  );
});

const ToggleSwitch = memo(function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useSharedValue(value ? 1 : 0);
  useEffect(() => { anim.value = withTiming(value ? 1 : 0, { duration: 180 }); }, [value]);
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: value ? 'rgba(124,138,255,0.35)' : 'rgba(255,255,255,0.08)',
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: anim.value * 18 }],
    backgroundColor: value ? T.accent : T.textTer,
  }));
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onChange(!value)}>
      <Animated.View style={[styles.toggleTrack, trackStyle]}>
        <Animated.View style={[styles.toggleKnob, knobStyle]} />
      </Animated.View>
    </TouchableOpacity>
  );
});

const RowButton = memo(function RowButton({
  icon, label, sub, onPress, danger, right,
}: { icon: string; label: string; sub?: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row} disabled={!onPress}>
      <View style={[styles.rowIconShell, danger && { backgroundColor: T.lossDim, borderColor: 'rgba(255,107,122,0.25)' }]}>
        <Text style={[styles.rowIconText, danger && { color: T.loss }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: T.loss }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.rowChevron}>›</Text> : null)}
    </TouchableOpacity>
  );
});

const QuickAction = memo(function QuickAction({ label, icon, color, onPress }: { label: string; icon: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
      <View style={styles.quickIconShell}>
        <Text style={[styles.quickIcon, { color }]}>{icon}</Text>
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user = useAuthStore((s) => (s as any).user as { id: string; name: string; email: string; createdAt?: string } | undefined);
  const token = useAuthStore((s) => (s as any).token as string | undefined);
  const logout = useAuthStore((s) => (s as any).logout as (() => void) | undefined);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwBanner, setPwBanner] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user?.name, user?.email]);

  const dirty = name !== (user?.name ?? '') || email !== (user?.email ?? '');

  const initials = (user?.name ?? 'T')
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join('') || 'T';

  const joinedLabel = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const handleSave = useCallback(async () => {
    if (!user?.id || !token || !dirty) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`${API_BASE}/auth/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBanner({ type: 'success', text: 'Profile updated.' });
      } else {
        setBanner({ type: 'error', text: data.error ?? 'Could not update profile.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Network error updating profile.' });
    } finally {
      setSaving(false);
    }
  }, [user?.id, token, dirty, name, email]);

  const handleLogoutPress = useCallback(() => {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      logoutTimer.current = setTimeout(() => setConfirmingLogout(false), 3000);
      return;
    }
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    logout?.();
    router.replace('/login'); // adjust to your actual auth route
  }, [confirmingLogout, logout, router]);

  const handlePasswordRow = useCallback(() => {
    setPwBanner('Password changes aren’t available yet — this needs a backend endpoint first.');
    setTimeout(() => setPwBanner(null), 3200);
  }, []);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 60 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.topBar}>
            <Text style={styles.screenTitle}>Profile</Text>
          </Animated.View>

          {/* Identity card */}
          <Animated.View entering={FadeInDown.delay(40).springify().damping(16)} style={styles.identityWrap}>
            <GlassPanel style={styles.identityPanel} intensity={30}>
              <LinearGradient
                colors={['rgba(124,138,255,0.10)', 'transparent']}
                start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.8 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.avatarShell}>
                <LinearGradient colors={[T.accentDeep, T.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.identityName}>{user?.name ?? 'Trader'}</Text>
              <Text style={styles.identityEmail}>{user?.email ?? '—'}</Text>
              {joinedLabel && (
                <View style={styles.joinedPill}>
                  <PulseDot color={T.accent} />
                  <Text style={styles.joinedText}>Member since {joinedLabel}</Text>
                </View>
              )}
            </GlassPanel>
          </Animated.View>

          {/* Quick actions */}
          <Animated.View entering={FadeInDown.delay(70).springify().damping(16)} style={styles.quickWrap}>
            <GlassPanel style={styles.quickPanel} intensity={22}>
              <QuickAction label="Deposit" icon="＋" color={T.gain} onPress={() => router.push('/deposit')} />
              <QuickAction label="Withdraw" icon="↑" color={T.loss} onPress={() => router.push('/withdraw')} />
              <QuickAction label="Orders" icon="≡" color={T.accent} onPress={() => router.push('/orders')} />
            </GlassPanel>
          </Animated.View>

          {/* Edit profile */}
          <SectionLabel title="Account" />
          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)} style={styles.cardWrap}>
            <GlassPanel style={styles.card} intensity={22}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Name</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={T.textTer}
                  />
                </View>
              </View>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={T.textTer}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
              </View>

              {banner && (
                <Animated.View entering={FadeIn.duration(150)} style={[styles.banner, { backgroundColor: banner.type === 'success' ? T.gainDim : T.lossDim }]}>
                  <Text style={[styles.bannerText, { color: banner.type === 'success' ? T.gain : T.loss }]}>{banner.text}</Text>
                </Animated.View>
              )}

              <TouchableOpacity
                disabled={!dirty || saving}
                onPress={handleSave}
                style={[styles.saveBtn, { opacity: dirty && !saving ? 1 : 0.4 }]}
              >
                <LinearGradient colors={[T.accentDeep, T.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
              </TouchableOpacity>
            </GlassPanel>
          </Animated.View>

          {/* Security */}
          <SectionLabel title="Security" />
          <Animated.View entering={FadeInDown.delay(130).springify().damping(16)} style={styles.cardWrap}>
            <GlassPanel style={styles.card} intensity={22}>
              <RowButton icon="⚿" label="Change password" sub="Update your account password" onPress={handlePasswordRow} />
              <View style={styles.rowDivider} />
              <RowButton
                icon="◈"
                label="Biometric login"
                sub="Use Face ID / fingerprint to sign in"
                right={<ToggleSwitch value={biometricEnabled} onChange={setBiometricEnabled} />}
              />
              {pwBanner && (
                <Animated.View entering={FadeIn.duration(150)} style={[styles.banner, { backgroundColor: T.lossDim, marginTop: 12 }]}>
                  <Text style={[styles.bannerText, { color: T.loss }]}>{pwBanner}</Text>
                </Animated.View>
              )}
            </GlassPanel>
          </Animated.View>

          {/* Preferences */}
          <SectionLabel title="Preferences" />
          <Animated.View entering={FadeInDown.delay(160).springify().damping(16)} style={styles.cardWrap}>
            <GlassPanel style={styles.card} intensity={22}>
              <RowButton
                icon="◔"
                label="Push notifications"
                sub="Price alerts, order fills, security"
                right={<ToggleSwitch value={pushEnabled} onChange={setPushEnabled} />}
              />
              <View style={styles.rowDivider} />
              <RowButton icon="◎" label="Help & support" onPress={() => router.push('/support')} />
              <View style={styles.rowDivider} />
              <RowButton icon="▤" label="Terms & privacy" onPress={() => router.push('/legal')} />
            </GlassPanel>
          </Animated.View>

          {/* Logout */}
          <Animated.View entering={FadeInDown.delay(190).springify().damping(16)} style={styles.cardWrap}>
            <GlassPanel style={styles.card} intensity={22}>
              <RowButton
                icon="⏻"
                label={confirmingLogout ? 'Tap again to confirm' : 'Log out'}
                danger
                onPress={handleLogoutPress}
                right={<View />}
              />
            </GlassPanel>
          </Animated.View>

          <Text style={styles.versionText}>NexusTrade · v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },

  topBar: { marginBottom: 18 },
  screenTitle: { fontSize: 23, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.3 },

  identityWrap: { marginBottom: 14, borderRadius: 24 },
  identityPanel: { borderRadius: 24, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: T.glassBorderHi },
  avatarShell: {
    width: 68, height: 68, borderRadius: 22, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 24, fontFamily: FontFamily.heading, color: '#fff' },
  identityName: { fontSize: 18, fontFamily: FontFamily.heading, color: T.textPri },
  identityEmail: { fontSize: 12.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 4 },
  joinedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    backgroundColor: 'rgba(124,138,255,0.1)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  joinedText: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.accent },

  quickWrap: { marginBottom: 22, borderRadius: 20 },
  quickPanel: {
    borderRadius: 20, paddingVertical: 16, paddingHorizontal: 10,
    flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: T.glassBorder,
  },
  quickIconShell: {
    width: 46, height: 46, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: T.hairline,
    justifyContent: 'center', alignItems: 'center', marginBottom: 7,
  },
  quickIcon: { fontSize: 17, fontFamily: FontFamily.heading },
  quickLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textSec },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 2 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 12.5, fontFamily: FontFamily.heading, color: T.textSec, letterSpacing: 0.4, textTransform: 'uppercase' },

  cardWrap: { marginBottom: 20, borderRadius: 20 },
  card: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: T.glassBorder },

  inputRow: { marginBottom: 12 },
  inputLabel: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginBottom: 6, letterSpacing: 0.3 },
  inputWrap: {
    backgroundColor: T.glass, borderRadius: 13,
    borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 14,
  },
  input: { fontSize: 14, fontFamily: FontFamily.bodyMedium, color: T.textPri, paddingVertical: 13 },

  banner: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginTop: 2, marginBottom: 10 },
  bannerText: { fontSize: 11.5, fontFamily: FontFamily.bodyMedium, textAlign: 'center' },

  saveBtn: { borderRadius: 13, paddingVertical: 14, alignItems: 'center', overflow: 'hidden', marginTop: 2 },
  saveBtnText: { fontSize: 13, fontFamily: FontFamily.heading, color: '#fff' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowIconShell: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: T.hairline,
    justifyContent: 'center', alignItems: 'center',
  },
  rowIconText: { fontSize: 15, color: T.textSec },
  rowLabel: { fontSize: 13.5, fontFamily: FontFamily.bodyMedium, color: T.textPri },
  rowSub: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
  rowChevron: { fontSize: 18, color: T.textTer },
  rowDivider: { height: 1, backgroundColor: T.hairline, marginVertical: 6 },

  toggleTrack: { width: 42, height: 24, borderRadius: 12, padding: 3, justifyContent: 'center' },
  toggleKnob: { width: 18, height: 18, borderRadius: 9 },

  versionText: { fontSize: 10.5, fontFamily: FontFamily.body, color: T.textTer, textAlign: 'center', marginTop: 4 },
});
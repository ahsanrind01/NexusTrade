import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, TextInput, KeyboardAvoidingView, Platform,
  Modal, Pressable, Alert,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withRepeat,
  interpolate, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../constants/typography';
import {
  useProfile, useUpdateProfile, useChangePassword,
  useSendPhoneOtp, useVerifyPhoneOtp, useLogout,
} from '../../hooks/useProfile';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────
// THEME — mirrored 1:1 from the dashboard so this screen feels
// like the same app, not a bolted-on page.
// ─────────────────────────────────────────────────────────────
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

type Provider = 'LOCAL' | 'GOOGLE';

// ─────────────────────────────────────────────────────────────
// SHARED PRIMITIVES (same contract as dashboard's)
// ─────────────────────────────────────────────────────────────
const GlassPanel = memo(function GlassPanel({ style, children, intensity = 28 }: any) {
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

function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-12, 14]) }, { translateY: interpolate(drift.value, [0, 1], [-8, 10]) }],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [10, -16]) }, { translateY: interpolate(drift.value, [0, 1], [6, -12]) }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -80, left: -60, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 220, right: -100, backgroundColor: T.violet, opacity: 0.10 }, orb2]} />
    </View>
  );
}

// Press-scale wrapper, same feel as ActionButton on the dashboard.
const Pressy = memo(function Pressy({ onPress, children, style }: any) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.97]) }] }));
  return (
    <Animated.View style={[animStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { press.value = withSpring(1, { damping: 14 }); }}
        onPressOut={() => { press.value = withSpring(0, { damping: 10 }); }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────
// AVATAR — gradient ring, initials fallback, edit badge
// ─────────────────────────────────────────────────────────────
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Avatar = memo(function Avatar({ name, onEdit }: { name: string; onEdit: () => void }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ opacity: interpolate(shimmer.value, [0, 1], [0.6, 1]) }));

  return (
    <View style={styles.avatarWrap}>
      <Animated.View style={[styles.avatarRing, ringStyle]}>
        <LinearGradient
          colors={[T.violet, T.accent, T.accentDeep]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.avatarRingGradient}
        />
      </Animated.View>
      <View style={styles.avatarInner}>
        <Text style={styles.avatarInitials}>{getInitials(name || 'Trader')}</Text>
      </View>
      <Pressy onPress={onEdit} style={styles.avatarEditBtn}>
        <LinearGradient colors={[T.accentDeep, T.violet]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <Text style={styles.avatarEditIcon}>✎</Text>
      </Pressy>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────
// BADGES
// ─────────────────────────────────────────────────────────────
function ProviderBadge({ provider }: { provider: Provider }) {
  const isGoogle = provider === 'GOOGLE';
  return (
    <View style={[styles.badge, { backgroundColor: isGoogle ? 'rgba(124,138,255,0.10)' : 'rgba(232,182,86,0.10)', borderColor: isGoogle ? 'rgba(124,138,255,0.22)' : 'rgba(232,182,86,0.22)' }]}>
      <Text style={[styles.badgeText, { color: isGoogle ? T.accent : T.gold }]}>
        {isGoogle ? 'Google Account' : 'Email & Password'}
      </Text>
    </View>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: verified ? T.gainDim : 'rgba(255,255,255,0.04)', borderColor: verified ? 'rgba(61,220,151,0.22)' : T.hairline }]}>
      <PulseDot color={verified ? T.gain : T.textTer} />
      <Text style={[styles.badgeText, { color: verified ? T.gain : T.textTer, marginLeft: 5 }]}>
        {verified ? 'Phone Verified' : 'Phone Unverified'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// QUICK ACTIONS ROW
// ─────────────────────────────────────────────────────────────
const ActionButton = memo(function ActionButton({ label, icon, color, onPress }: { label: string; icon: string; color: string; onPress: () => void }) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.9]) }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(press.value, [0, 1], [0, 1]) }));
  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center' }, animStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={() => { press.value = withSpring(1, { damping: 14 }); }}
        onPressOut={() => { press.value = withSpring(0, { damping: 10 }); }}
        style={{ alignItems: 'center' }}
      >
        <View style={styles.actionIconShell}>
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 16, backgroundColor: color, opacity: 0.25 }, glowStyle]} />
          <Text style={[styles.actionIcon, { color }]}>{icon}</Text>
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────
// INFO ROW — used inside Personal Info / Security panels
// ─────────────────────────────────────────────────────────────
function InfoRow({ label, value, onPress, valueColor, isLast }: { label: string; value: string; onPress?: () => void; valueColor?: string; isLast?: boolean }) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper activeOpacity={0.7} onPress={onPress} style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoRightGroup}>
        <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]} numberOfLines={1}>{value}</Text>
        {onPress && <Text style={styles.infoChevron}>›</Text>}
      </View>
    </Wrapper>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// BOTTOM SHEET MODAL SHELL — glass, slide-up, blurred backdrop
// ─────────────────────────────────────────────────────────────
function SheetModal({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          {BlurView ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,7,10,0.75)' }]} />
          )}
        </Pressable>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none"
        >
          <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOut} style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.sheetCloseBtn}>
                <Text style={styles.sheetCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SheetInput({ label, value, onChangeText, secureTextEntry, keyboardType, placeholder }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.sheetInputLabel}>{label}</Text>
      <View style={styles.sheetInputBox}>
        <TextInput
          style={styles.sheetInputText}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={T.textTer}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

function SheetPrimaryButton({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressy onPress={loading ? undefined : onPress} style={{ marginTop: 6 }}>
      <View style={[styles.sheetPrimaryBtn, loading && { opacity: 0.7 }]}>
        <LinearGradient colors={[T.accentDeep, T.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.sheetPrimaryBtnText}>{loading ? 'Please wait…' : label}</Text>
      </View>
    </Pressy>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { profile: user, isLoading: profileLoading } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();
  const sendOtpMutation = useSendPhoneOtp();
  const verifyOtpMutation = useVerifyPhoneOtp();
  const logoutMutation = useLogout();

  // Normalized view of the profile with safe fallbacks while the
  // GET /auth/profile request is in flight (falls back to what
  // login/signup already put in authStore).
  const profile = useMemo(() => ({
    id: user?.id ?? '',
    name: user?.name ?? 'Trader',
    email: user?.email ?? '',
    provider: (user?.provider ?? 'LOCAL') as Provider,
    profileImage: user?.profileImage ?? null,
    phoneNumber: user?.phoneNumber ?? null,
    phoneVerified: user?.phoneVerified ?? false,
    createdAt: user?.createdAt ?? new Date().toISOString(),
  }), [user]);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);

  const [pwdVisible, setPwdVisible] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const [phoneVisible, setPhoneVisible] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'enter' | 'otp'>('enter');
  const [phoneInput, setPhoneInput] = useState(profile.phoneNumber ?? '');
  const [otpInput, setOtpInput] = useState('');

  const memberSince = useMemo(() => {
    const d = new Date(profile.createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [profile.createdAt]);

  const openEdit = useCallback(() => {
    setEditName(profile.name);
    setEditEmail(profile.email);
    setEditVisible(true);
  }, [profile.name, profile.email]);

  const handleSaveProfile = useCallback(() => {
    if (!editName.trim() || !editEmail.trim()) {
      return Alert.alert('Missing Fields', 'Name and email cannot be empty.');
    }
    updateProfileMutation.mutate(
      { name: editName.trim(), email: editEmail.trim() },
      {
        onSuccess: () => setEditVisible(false),
        onError: (err: any) => Alert.alert('Update Failed', err.response?.data?.error || 'Something went wrong'),
      }
    );
  }, [editName, editEmail, updateProfileMutation]);

  const handleChangePassword = useCallback(() => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      return Alert.alert('Missing Fields', 'Please fill in all password fields.');
    }
    if (newPwd !== confirmPwd) {
      return Alert.alert('Passwords Don\u2019t Match', 'New password and confirmation must match.');
    }
    changePasswordMutation.mutate(
      { currentPassword: currentPwd, newPassword: newPwd },
      {
        onSuccess: () => {
          setPwdVisible(false);
          setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
        },
        onError: (err: any) => Alert.alert('Change Failed', err.response?.data?.error || 'Something went wrong'),
      }
    );
  }, [currentPwd, newPwd, confirmPwd, changePasswordMutation]);

  const handleSendOtp = useCallback(() => {
    if (!phoneInput.trim()) return Alert.alert('Missing Field', 'Enter a phone number first.');
    sendOtpMutation.mutate(phoneInput.trim(), {
      onSuccess: () => setPhoneStep('otp'),
      onError: (err: any) => Alert.alert('Failed to Send OTP', err.response?.data?.error || 'Something went wrong'),
    });
  }, [phoneInput, sendOtpMutation]);

  const handleVerifyOtp = useCallback(() => {
    if (!otpInput.trim()) return Alert.alert('Missing Field', 'Enter the code we sent you.');
    verifyOtpMutation.mutate(
      { phone: phoneInput.trim(), otp: otpInput.trim() },
      {
        onSuccess: () => {
          setPhoneVisible(false);
          setPhoneStep('enter');
          setOtpInput('');
        },
        onError: (err: any) => Alert.alert('Verification Failed', err.response?.data?.error || 'Something went wrong'),
      }
    );
  }, [phoneInput, otpInput, verifyOtpMutation]);

  const closePhoneSheet = useCallback(() => {
    setPhoneVisible(false);
    setPhoneStep('enter');
    setOtpInput('');
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logoutMutation.mutate() },
    ]);
  }, [logoutMutation]);

  const saving = updateProfileMutation.isPending;
  const changingPwd = changePasswordMutation.isPending;
  const sendingOtp = sendOtpMutation.isPending;
  const verifyingOtp = verifyOtpMutation.isPending;

  return (
    <View style={styles.root}>
      <AmbientField />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={{ width: 38 }} />
        </Animated.View>

        {/* Hero identity card */}
        <Animated.View entering={FadeInDown.delay(70).springify().damping(16)} style={styles.heroWrap}>
          <GlassPanel style={styles.heroPanel} intensity={32}>
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(124,138,255,0.10)', 'transparent']}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.8 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroCenter}>
              <Avatar name={profile.name} onEdit={openEdit} />
              <Text style={styles.heroName}>{profile.name}</Text>
              <Text style={styles.heroEmail}>{profile.email}</Text>

              <View style={styles.badgeRow}>
                <ProviderBadge provider={profile.provider} />
                <VerifiedBadge verified={profile.phoneVerified} />
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.statsStrip}>
              <View style={styles.statCell}>
                <Text style={styles.statCellLabel}>MEMBER SINCE</Text>
                <Text style={styles.statCellValue}>{memberSince}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellLabel}>ACCOUNT ID</Text>
                <Text style={styles.statCellValue}>#{profile.id ? profile.id.slice(0, 6).toUpperCase() : '------'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statCellLabel}>STATUS</Text>
                <Text style={[styles.statCellValue, { color: T.gain }]}>{profileLoading ? 'Syncing…' : 'Active'}</Text>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.delay(140).springify().damping(16)} style={styles.actionsPanelWrap}>
          <GlassPanel style={styles.actionsPanel} intensity={24}>
            <View style={styles.actionsRow}>
              <ActionButton label="Edit Profile" icon="✎" color={T.accent} onPress={openEdit} />
              <ActionButton label="Password" icon="⚿" color={T.gold} onPress={() => setPwdVisible(true)} />
              <ActionButton label="Phone" icon="☎" color={T.violet} onPress={() => setPhoneVisible(true)} />
              <ActionButton label="Logout" icon="⏻" color={T.loss} onPress={handleLogout} />
            </View>
          </GlassPanel>
        </Animated.View>

        {/* Personal information */}
        <Animated.View entering={FadeInDown.delay(190).springify().damping(16)}>
          <SectionLabel text="Personal Information" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <InfoRow label="Full Name" value={profile.name} onPress={openEdit} />
            <InfoRow label="Email Address" value={profile.email} onPress={openEdit} isLast />
          </GlassPanel>
        </Animated.View>

        {/* Security */}
        <Animated.View entering={FadeInDown.delay(230).springify().damping(16)}>
          <SectionLabel text="Security" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <InfoRow
              label="Password"
              value={profile.provider === 'LOCAL' ? 'Change password' : 'Managed by Google'}
              onPress={profile.provider === 'LOCAL' ? () => setPwdVisible(true) : undefined}
            />
            <InfoRow
              label="Phone Number"
              value={profile.phoneNumber ?? 'Not added'}
              valueColor={profile.phoneVerified ? T.gain : undefined}
              onPress={() => setPhoneVisible(true)}
            />
            <InfoRow
              label="Google Account"
              value={profile.provider === 'GOOGLE' ? 'Linked' : 'Not linked'}
              valueColor={profile.provider === 'GOOGLE' ? T.gain : undefined}
              isLast
            />
          </GlassPanel>
        </Animated.View>

        {/* Danger zone */}
        <Animated.View entering={FadeInDown.delay(270).springify().damping(16)} style={{ marginTop: 4 }}>
          <SectionLabel text="Danger Zone" />
          <Pressy onPress={handleLogout}>
            <GlassPanel style={styles.dangerPanel} intensity={20}>
              <Text style={styles.dangerText}>Log Out</Text>
              <Text style={styles.dangerChevron}>›</Text>
            </GlassPanel>
          </Pressy>
        </Animated.View>
      </ScrollView>

      {/* ── Edit Profile Sheet ───────────────────────────── */}
      <SheetModal visible={editVisible} onClose={() => setEditVisible(false)} title="Edit Profile">
        <SheetInput label="Full Name" value={editName} onChangeText={setEditName} placeholder="Your name" />
        <SheetInput label="Email Address" value={editEmail} onChangeText={setEditEmail} placeholder="you@example.com" keyboardType="email-address" />
        <SheetPrimaryButton label="Save Changes" onPress={handleSaveProfile} loading={saving} />
      </SheetModal>

      {/* ── Change Password Sheet ───────────────────────────── */}
      <SheetModal visible={pwdVisible} onClose={() => setPwdVisible(false)} title="Change Password">
        <SheetInput label="Current Password" value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="New Password" value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="Confirm New Password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder="••••••••" />
        <Text style={styles.sheetHint}>Min 8 characters, with uppercase, lowercase, a number & a symbol.</Text>
        <SheetPrimaryButton label="Update Password" onPress={handleChangePassword} loading={changingPwd} />
      </SheetModal>

      {/* ── Phone Verify Sheet ───────────────────────────── */}
      <SheetModal visible={phoneVisible} onClose={closePhoneSheet} title={phoneStep === 'enter' ? 'Add Phone Number' : 'Verify OTP'}>
        {phoneStep === 'enter' ? (
          <>
            <SheetInput label="Phone Number" value={phoneInput} onChangeText={setPhoneInput} placeholder="+92 300 1234567" keyboardType="phone-pad" />
            <SheetPrimaryButton label="Send OTP" onPress={handleSendOtp} loading={sendingOtp} />
          </>
        ) : (
          <>
            <Text style={styles.sheetHint}>We sent a 6-digit code to {phoneInput}.</Text>
            <SheetInput label="Verification Code" value={otpInput} onChangeText={setOtpInput} placeholder="••••••" keyboardType="number-pad" />
            <SheetPrimaryButton label="Verify Phone" onPress={handleVerifyOtp} loading={verifyingOtp} />
          </>
        )}
      </SheetModal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.14 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  backBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 22, color: T.textPri, marginTop: -2 },
  topBarTitle: { fontSize: 16, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2 },

  heroWrap: { marginBottom: 16, borderRadius: 26, shadowColor: T.accentDeep, shadowOpacity: 0.28, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  heroPanel: { borderRadius: 26, padding: 22, borderWidth: 1, borderColor: T.glassBorderHi },
  heroCenter: { alignItems: 'center' },

  avatarWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarRing: { position: 'absolute', width: 96, height: 96, borderRadius: 48, padding: 2.5 },
  avatarRingGradient: { flex: 1, borderRadius: 48 },
  avatarInner: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#14151C', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 28, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.5 },
  avatarEditBtn: { position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 2, borderColor: T.bg0 },
  avatarEditIcon: { fontSize: 13, color: '#fff' },

  heroName: { fontSize: 21, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.3, marginBottom: 3 },
  heroEmail: { fontSize: 13, fontFamily: FontFamily.body, color: T.textSec, marginBottom: 14 },

  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 10.5, fontFamily: FontFamily.heading, letterSpacing: 0.2 },

  heroDivider: { height: 1, backgroundColor: T.hairline, marginVertical: 18 },
  statsStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  statCell: { alignItems: 'flex-start' },
  statCellLabel: { fontSize: 8, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.6, marginBottom: 4 },
  statCellValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },

  actionsPanelWrap: { marginBottom: 20, borderRadius: 22 },
  actionsPanel: { borderRadius: 22, paddingVertical: 18, paddingHorizontal: 10, borderWidth: 1, borderColor: T.glassBorder },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionIconShell: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: T.hairline, justifyContent: 'center', alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  actionIcon: { fontSize: 19, fontFamily: FontFamily.heading },
  actionLabel: { fontSize: 10, fontFamily: FontFamily.bodyMedium, color: T.textSec, letterSpacing: 0.2 },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2, flex: 1 },

  infoPanel: { borderRadius: 20, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 16, marginBottom: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: T.hairline },
  infoLabel: { fontSize: 13, fontFamily: FontFamily.bodyMedium, color: T.textSec },
  infoRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%' },
  infoValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },
  infoChevron: { fontSize: 17, color: T.textTer, marginTop: -2 },

  dangerPanel: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,107,122,0.18)', paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dangerText: { fontSize: 14, fontFamily: FontFamily.heading, color: T.loss },
  dangerChevron: { fontSize: 18, color: T.loss },

  // Sheet modal
  sheet: { backgroundColor: '#0B0C11', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, borderWidth: 1, borderColor: T.glassBorderHi, borderBottomWidth: 0 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: T.hairline, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetTitle: { fontSize: 17, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2 },
  sheetCloseBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },
  sheetCloseIcon: { fontSize: 12, color: T.textSec },

  sheetInputLabel: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.4, marginBottom: 7 },
  sheetInputBox: { backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 13, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 14 },
  sheetInputText: { fontSize: 14, fontFamily: FontFamily.body, color: T.textPri, paddingVertical: 13 },
  sheetHint: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, lineHeight: 16, marginBottom: 14 },

  sheetPrimaryBtn: { height: 50, borderRadius: 15, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  sheetPrimaryBtnText: { fontSize: 14, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 0.2 },
});
import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  Modal, Pressable, Alert,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../constants/typography';
import {
  useProfile, useUpdateProfile, useChangePassword,
  useSendPhoneOtp, useVerifyPhoneOtp, useLogout,
} from '../../hooks/useProfile';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

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

type Provider = 'LOCAL' | 'GOOGLE';

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

function AmbientField() {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) });
  }, []);
  const orb1 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-12, 16]) }, { translateY: interpolate(drift.value, [0, 1], [-10, 12]) }],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [12, -18]) }, { translateY: interpolate(drift.value, [0, 1], [8, -14]) }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -90, left: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 220, right: -110, backgroundColor: T.violet, opacity: 0.09 }, orb2]} />
    </View>
  );
}

const Pressy = memo(function Pressy({ onPress, children, style, disabled }: any) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(press.value, [0, 1], [1, 0.97]) }] }));
  return (
    <Animated.View style={[animStyle, style, disabled && { opacity: 0.45 }]}>
      <TouchableOpacity
        activeOpacity={1}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => { press.value = withSpring(1, { damping: 14 }); }}
        onPressOut={() => { press.value = withSpring(0, { damping: 10 }); }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
});

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Avatar = memo(function Avatar({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressy onPress={onPress} style={styles.avatarWrap}>
      <View style={styles.avatarBox}>
        <View style={styles.avatarRing}>
          <LinearGradient
            colors={[T.violet, T.accent, T.accentDeep]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.avatarRingGradient}
          />
        </View>
        <View style={styles.avatarInner}>
          <Text style={styles.avatarInitials}>{getInitials(name || 'Trader')}</Text>
        </View>
      </View>
    </Pressy>
  );
});

function ProviderBadge({ provider }: { provider: Provider }) {
  const isGoogle = provider === 'GOOGLE';
  return (
    <View style={[styles.badge, { borderColor: isGoogle ? 'rgba(124,138,255,0.28)' : 'rgba(232,182,86,0.28)' }]}>
      <Ionicons name={isGoogle ? 'logo-google' : 'mail-outline'} size={12} color={isGoogle ? T.accent : T.gold} />
      <Text style={[styles.badgeText, { color: isGoogle ? T.accent : T.gold }]}>
        {isGoogle ? 'Google Account' : 'Email & Password'}
      </Text>
    </View>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <View style={[styles.badge, { borderColor: verified ? 'rgba(61,220,151,0.28)' : T.hairline }]}>
      <Ionicons name={verified ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={verified ? T.gain : T.textTer} />
      <Text style={[styles.badgeText, { color: verified ? T.gain : T.textTer }]}>
        {verified ? 'Phone Verified' : 'Phone Unverified'}
      </Text>
    </View>
  );
}

function InfoRow({ icon, label, value, valueColor, isLast }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; valueColor?: string; isLast?: boolean }) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={15} color={T.textTer} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]} numberOfLines={1}>{value}</Text>
    </View>
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
                <Ionicons name="close" size={16} color={T.textSec} />
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
    <Pressy onPress={loading ? undefined : onPress} style={{ marginTop: 6 }} disabled={loading}>
      <View style={styles.sheetPrimaryBtn}>
        <LinearGradient colors={[T.accentDeep, T.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.sheetPrimaryBtnText}>{loading ? 'Please wait…' : label}</Text>
      </View>
    </Pressy>
  );
}

function SettingsMenuRow({ icon, label, sublabel, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; sublabel?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={disabled ? 1 : 0.65} onPress={disabled ? undefined : onPress} style={[styles.menuRow, disabled && { opacity: 0.4 }]}>
      <View style={styles.menuIconShell}>
        <Ionicons name={icon} size={17} color={T.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {sublabel ? <Text style={styles.menuSublabel}>{sublabel}</Text> : null}
      </View>
      {!disabled && <Ionicons name="chevron-forward" size={16} color={T.textTer} />}
    </TouchableOpacity>
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { profile: user, isLoading: profileLoading } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();
  const sendOtpMutation = useSendPhoneOtp();
  const verifyOtpMutation = useVerifyPhoneOtp();
  const logoutMutation = useLogout();

  const profile = useMemo(() => ({
    id: user?.id ?? '',
    name: user?.name ?? 'Trader',
    email: user?.email ?? '',
    provider: (user?.provider ?? 'LOCAL') as Provider,
    phoneNumber: user?.phoneNumber ?? null,
    phoneVerified: user?.phoneVerified ?? false,
    createdAt: user?.createdAt ?? new Date().toISOString(),
  }), [user]);

  const [settingsVisible, setSettingsVisible] = useState(false);

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
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  const memberSince = useMemo(() => {
    const d = new Date(profile.createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [profile.createdAt]);

  const openFromMenu = useCallback((open: () => void) => {
    setSettingsVisible(false);
    setTimeout(open, 280);
  }, []);

  const openEdit = useCallback(() => {
    setEditName(profile.name);
    setEditEmail(profile.email);
    setEditVisible(true);
  }, [profile.name, profile.email]);

  const openPassword = useCallback(() => setPwdVisible(true), []);

  const openPhone = useCallback(() => {
    setPhoneInput(profile.phoneNumber ?? '');
    setPhoneStep('enter');
    setDevOtpHint(null);
    setPhoneVisible(true);
  }, [profile.phoneNumber]);

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
    const cleaned = phoneInput.trim();
    if (!cleaned) return Alert.alert('Missing Field', 'Enter a phone number first.');
    if (!cleaned.startsWith('+')) {
      return Alert.alert('Include Country Code', 'Enter your number with a country code, e.g. +923001234567.');
    }
    setDevOtpHint(null);
    sendOtpMutation.mutate(cleaned, {
      onSuccess: (data: any) => {
        setPhoneStep('otp');
        if (data?.otp) setDevOtpHint(String(data.otp));
      },
      onError: (err: any) => Alert.alert('Failed to Send Code', err.response?.data?.error || 'Something went wrong'),
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
          setDevOtpHint(null);
        },
        onError: (err: any) => Alert.alert('Verification Failed', err.response?.data?.error || 'Something went wrong'),
      }
    );
  }, [phoneInput, otpInput, verifyOtpMutation]);

  const closePhoneSheet = useCallback(() => {
    setPhoneVisible(false);
    setPhoneStep('enter');
    setOtpInput('');
    setDevOtpHint(null);
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
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.delay(50).duration(450)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={T.textPri} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={18} color={T.textPri} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).springify().damping(16)} style={styles.heroWrap}>
          <GlassPanel style={styles.heroPanel} intensity={32}>
            <LinearGradient
              colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(124,138,255,0.12)', 'transparent']}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 0.8 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroCenter}>
              <Avatar name={profile.name} onPress={() => setSettingsVisible(true)} />
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
              <View style={[styles.statCell, styles.statCellDivider]}>
                <Text style={styles.statCellLabel}>ACCOUNT ID</Text>
                <Text style={styles.statCellValue}>#{profile.id ? profile.id.slice(0, 6).toUpperCase() : '------'}</Text>
              </View>
              <View style={[styles.statCell, styles.statCellDivider]}>
                <Text style={styles.statCellLabel}>STATUS</Text>
                <Text style={[styles.statCellValue, { color: T.gain }]}>{profileLoading ? 'Syncing' : 'Active'}</Text>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).springify().damping(16)}>
          <SectionLabel text="Personal Information" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <InfoRow icon="person-outline" label="Full Name" value={profile.name} />
            <InfoRow icon="mail-outline" label="Email Address" value={profile.email} />
            <InfoRow
              icon="call-outline"
              label="Phone Number"
              value={profile.phoneNumber ?? 'Not added'}
              valueColor={profile.phoneVerified ? T.gain : undefined}
              isLast
            />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(190).springify().damping(16)}>
          <SectionLabel text="Security" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <InfoRow
              icon="lock-closed-outline"
              label="Password"
              value={profile.provider === 'LOCAL' ? 'Set' : 'Managed by Google'}
            />
            <InfoRow
              icon="shield-checkmark-outline"
              label="Two-Step Verification"
              value={profile.phoneVerified ? 'Enabled' : 'Not enabled'}
              valueColor={profile.phoneVerified ? T.gain : undefined}
              isLast
            />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(230).springify().damping(16)} style={{ marginTop: 6 }}>
          <Pressy onPress={handleLogout}>
            <GlassPanel style={styles.logoutPanel} intensity={20}>
              <Ionicons name="log-out-outline" size={17} color={T.loss} />
              <Text style={styles.logoutText}>Log Out</Text>
            </GlassPanel>
          </Pressy>
        </Animated.View>
      </ScrollView>

      <SheetModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} title="Account Settings">
        <SettingsMenuRow icon="person-outline" label="Edit Profile" sublabel="Name and email address" onPress={() => openFromMenu(openEdit)} />
        <SettingsMenuRow
          icon="lock-closed-outline"
          label="Change Password"
          sublabel={profile.provider === 'GOOGLE' ? 'Managed by Google' : 'Update your password'}
          onPress={() => openFromMenu(openPassword)}
          disabled={profile.provider === 'GOOGLE'}
        />
        <SettingsMenuRow icon="call-outline" label="Phone Number" sublabel={profile.phoneNumber ? 'Update or re-verify' : 'Add and verify a number'} onPress={() => openFromMenu(openPhone)} />
      </SheetModal>

      <SheetModal visible={editVisible} onClose={() => setEditVisible(false)} title="Edit Profile">
        <SheetInput label="Full Name" value={editName} onChangeText={setEditName} placeholder="Your name" />
        <SheetInput label="Email Address" value={editEmail} onChangeText={setEditEmail} placeholder="you@example.com" keyboardType="email-address" />
        <SheetPrimaryButton label="Save Changes" onPress={handleSaveProfile} loading={saving} />
      </SheetModal>

      <SheetModal visible={pwdVisible} onClose={() => setPwdVisible(false)} title="Change Password">
        <SheetInput label="Current Password" value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="New Password" value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="Confirm New Password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder="••••••••" />
        <Text style={styles.sheetHint}>Min 8 characters, with uppercase, lowercase, a number and a symbol.</Text>
        <SheetPrimaryButton label="Update Password" onPress={handleChangePassword} loading={changingPwd} />
      </SheetModal>

      <SheetModal visible={phoneVisible} onClose={closePhoneSheet} title={phoneStep === 'enter' ? 'Add Phone Number' : 'Verify Code'}>
        {phoneStep === 'enter' ? (
          <>
            <SheetInput label="Phone Number" value={phoneInput} onChangeText={setPhoneInput} placeholder="+923001234567" keyboardType="phone-pad" />
            <Text style={styles.sheetHint}>Include your country code, starting with a plus sign.</Text>
            <SheetPrimaryButton label="Send Code" onPress={handleSendOtp} loading={sendingOtp} />
          </>
        ) : (
          <>
            <Text style={styles.sheetHint}>We sent a 6-digit code to {phoneInput}.</Text>
            {devOtpHint && (
              <View style={styles.devHintBox}>
                <Ionicons name="information-circle-outline" size={14} color={T.gold} />
                <Text style={styles.devHintText}>Development code: {devOtpHint}</Text>
              </View>
            )}
            <SheetInput label="Verification Code" value={otpInput} onChangeText={setOtpInput} placeholder="••••••" keyboardType="number-pad" />
            <SheetPrimaryButton label="Verify Phone" onPress={handleVerifyOtp} loading={verifyingOtp} />
          </>
        )}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },
  ambientOrb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.14 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 16, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2 },

  heroWrap: { marginBottom: 18, borderRadius: 26, shadowColor: T.accentDeep, shadowOpacity: 0.26, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  heroPanel: { borderRadius: 26, padding: 22, borderWidth: 1, borderColor: T.glassBorderHi },
  heroCenter: { alignItems: 'center' },

  avatarWrap: { marginBottom: 14 },
  avatarBox: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { position: 'absolute', top: 0, left: 0, width: 88, height: 88, borderRadius: 44, padding: 2.5 },
  avatarRingGradient: { flex: 1, borderRadius: 44 },
  avatarInner: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#14151C', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 25, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.5 },

  heroName: { fontSize: 21, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.3, marginBottom: 3 },
  heroEmail: { fontSize: 13, fontFamily: FontFamily.body, color: T.textSec, marginBottom: 15 },

  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },
  badgeText: { fontSize: 10.5, fontFamily: FontFamily.heading, letterSpacing: 0.2 },

  heroDivider: { height: 1, backgroundColor: T.hairline, marginVertical: 18 },
  statsStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  statCell: { alignItems: 'flex-start', flex: 1 },
  statCellDivider: { borderLeftWidth: 1, borderLeftColor: T.hairline, paddingLeft: 12 },
  statCellLabel: { fontSize: 8, fontFamily: FontFamily.body, color: T.textTer, letterSpacing: 0.6, marginBottom: 4 },
  statCellValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2, flex: 1 },

  infoPanel: { borderRadius: 20, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 16, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: T.hairline },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontSize: 13, fontFamily: FontFamily.bodyMedium, color: T.textSec },
  infoValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, maxWidth: '48%', textAlign: 'right' },

  logoutPanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,107,122,0.2)', paddingVertical: 16 },
  logoutText: { fontSize: 14, fontFamily: FontFamily.heading, color: T.loss },

  sheet: { backgroundColor: '#0B0C11', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, borderWidth: 1, borderColor: T.glassBorderHi, borderBottomWidth: 0 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: T.hairline, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetTitle: { fontSize: 17, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2 },
  sheetCloseBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },

  sheetInputLabel: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.4, marginBottom: 7 },
  sheetInputBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 13, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 14 },
  sheetInputText: { fontSize: 14, fontFamily: FontFamily.body, color: T.textPri, paddingVertical: 13 },
  sheetHint: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, lineHeight: 16, marginBottom: 14 },

  devHintBox: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(232,182,86,0.1)', borderWidth: 1, borderColor: 'rgba(232,182,86,0.24)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
  devHintText: { fontSize: 11.5, fontFamily: FontFamily.bodyMedium, color: T.gold },

  sheetPrimaryBtn: { height: 50, borderRadius: 15, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  sheetPrimaryBtnText: { fontSize: 14, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 0.2 },

  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  menuIconShell: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(124,138,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri },
  menuSublabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
});
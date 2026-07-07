import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  Modal, Pressable, Alert,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat, withSequence, Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../constants/typography';
import {
  useProfile, useUpdateProfile, useChangePassword, useLogout,
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

const PulseDot = memo(function PulseDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      return;
    }
    scale.value = withRepeat(withSequence(withTiming(2.2, { duration: 1100 }), withTiming(1, { duration: 0 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 1100 }), withTiming(0.9, { duration: 0 })), -1, false);
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [isFocused]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, position: 'absolute' }, ringStyle]} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
    </View>
  );
});

function AmbientField() {
  const drift = useSharedValue(0);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(drift);
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [isFocused]);
  const orb1 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-12, 16]) }, { translateY: interpolate(drift.value, [0, 1], [-10, 12]) }],
  }));
  const orb2 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [12, -18]) }, { translateY: interpolate(drift.value, [0, 1], [8, -14]) }],
  }));
  const orb3 = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drift.value, [0, 1], [-8, 10]) }, { translateY: interpolate(drift.value, [0, 1], [10, -8]) }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ambientOrb, { top: -90, left: -70, backgroundColor: T.accentDeep }, orb1]} />
      <Animated.View style={[styles.ambientOrb, { top: 220, right: -110, backgroundColor: T.violet, opacity: 0.09 }, orb2]} />
      <Animated.View style={[styles.ambientOrb, { top: 520, left: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: T.gold, opacity: 0.05 }, orb3]} />
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
        <View style={styles.avatarStatusDot}>
          <PulseDot color={T.gain} />
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

function InfoRow({ icon, label, value, valueColor, isLast }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; valueColor?: string; isLast?: boolean }) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconShell}>
          <Ionicons name={icon} size={14} color={T.accent} />
        </View>
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

function SheetInput({ label, value, onChangeText, secureTextEntry, keyboardType, placeholder, editable = true }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.sheetInputLabel}>{label}</Text>
      <View style={[styles.sheetInputBox, !editable && styles.sheetInputBoxDisabled]}>
        <TextInput
          style={styles.sheetInputText}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={T.textTer}
          autoCapitalize="none"
          editable={editable}
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
  const navigation = useNavigation<any>();
  const scrollRef = useRef<ScrollView>(null);

  const { profile: user, isLoading: profileLoading } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();
  const logoutMutation = useLogout();

  const profile = useMemo(() => ({
    id: user?.id ?? '',
    name: user?.name ?? 'Trader',
    email: user?.email ?? '',
    provider: (user?.provider ?? 'LOCAL') as Provider,
    createdAt: user?.createdAt ?? new Date().toISOString(),
  }), [user]);

  const [settingsVisible, setSettingsVisible] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState(profile.name);

  const [pwdVisible, setPwdVisible] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

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
    setEditVisible(true);
  }, [profile.name]);

  const openPassword = useCallback(() => setPwdVisible(true), []);

  const goToTerms = useCallback(() => {
    setSettingsVisible(false);
    router.push('/legal/terms');
  }, [router]);

  const goToPrivacy = useCallback(() => {
    setSettingsVisible(false);
    router.push('/legal/privacy');
  }, [router]);

  const handleSaveProfile = useCallback(() => {
    if (!editName.trim()) {
      return Alert.alert('Missing Field', 'Name cannot be empty.');
    }
    updateProfileMutation.mutate(
      { name: editName.trim() },
      {
        onSuccess: () => setEditVisible(false),
        onError: (err: any) => Alert.alert('Update Failed', err.response?.data?.error || 'Something went wrong'),
      }
    );
  }, [editName, updateProfileMutation]);

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

  const handleLogout = useCallback(() => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logoutMutation.mutate() },
    ]);
  }, [logoutMutation]);

  const saving = updateProfileMutation.isPending;
  const changingPwd = changePasswordMutation.isPending;

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.root}>
      <AmbientField />
      <ScrollView
        ref={scrollRef}
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
            <View style={styles.heroInnerBorder} pointerEvents="none" />

            <View style={styles.heroCenter}>
              <Avatar name={profile.name} onPress={() => setSettingsVisible(true)} />
              <Text style={styles.heroName}>{profile.name}</Text>
              <Text style={styles.heroEmail}>{profile.email}</Text>

              <View style={styles.badgeRow}>
                <ProviderBadge provider={profile.provider} />
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
                <View style={styles.statusValueRow}>
                  {!profileLoading && <PulseDot color={T.gain} />}
                  <Text style={[styles.statCellValue, { color: T.gain }]}>{profileLoading ? 'Syncing' : 'Active'}</Text>
                </View>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).springify().damping(16)}>
          <SectionLabel text="Personal Information" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <View style={styles.panelInnerBorder} pointerEvents="none" />
            <InfoRow icon="person-outline" label="Full Name" value={profile.name} />
            <InfoRow icon="mail-outline" label="Email Address" value={profile.email} isLast />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(190).springify().damping(16)}>
          <SectionLabel text="Security" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <View style={styles.panelInnerBorder} pointerEvents="none" />
            <InfoRow
              icon="lock-closed-outline"
              label="Password"
              value={profile.provider === 'LOCAL' ? 'Set' : 'Managed by Google'}
              isLast
            />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).springify().damping(16)}>
          <SectionLabel text="Legal" />
          <GlassPanel style={styles.infoPanel} intensity={24}>
            <View style={styles.panelInnerBorder} pointerEvents="none" />
            <SettingsMenuRow icon="document-text-outline" label="Terms & Conditions" onPress={goToTerms} />
            <View style={styles.menuRowDivider} />
            <SettingsMenuRow icon="shield-outline" label="Privacy Policy" onPress={goToPrivacy} />
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify().damping(16)} style={{ marginTop: 6 }}>
          <Pressy onPress={handleLogout}>
            <GlassPanel style={styles.logoutPanel} intensity={20}>
              <View style={styles.logoutInnerBorder} pointerEvents="none" />
              <View style={styles.logoutIconShell}>
                <Ionicons name="log-out-outline" size={16} color={T.loss} />
              </View>
              <Text style={styles.logoutText}>Log Out</Text>
            </GlassPanel>
          </Pressy>
        </Animated.View>
      </ScrollView>

      <SheetModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} title="Account Settings">
        <SettingsMenuRow icon="person-outline" label="Edit Profile" sublabel="Update your display name" onPress={() => openFromMenu(openEdit)} />
        <SettingsMenuRow
          icon="lock-closed-outline"
          label="Change Password"
          sublabel={profile.provider === 'GOOGLE' ? 'Managed by Google' : 'Update your password'}
          onPress={() => openFromMenu(openPassword)}
          disabled={profile.provider === 'GOOGLE'}
        />
        <SettingsMenuRow icon="document-text-outline" label="Terms & Conditions" onPress={goToTerms} />
        <SettingsMenuRow icon="shield-outline" label="Privacy Policy" onPress={goToPrivacy} />
      </SheetModal>

      <SheetModal visible={editVisible} onClose={() => setEditVisible(false)} title="Edit Profile">
        <SheetInput label="Full Name" value={editName} onChangeText={setEditName} placeholder="Your name" />
        <SheetInput label="Email Address" value={profile.email} onChangeText={() => {}} editable={false} />
        <Text style={styles.sheetHint}>Your email address is your account identifier and can't be changed here. Contact support if you need to update it.</Text>
        <SheetPrimaryButton label="Save Changes" onPress={handleSaveProfile} loading={saving} />
      </SheetModal>

      <SheetModal visible={pwdVisible} onClose={() => setPwdVisible(false)} title="Change Password">
        <SheetInput label="Current Password" value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="New Password" value={newPwd} onChangeText={setNewPwd} secureTextEntry placeholder="••••••••" />
        <SheetInput label="Confirm New Password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry placeholder="••••••••" />
        <Text style={styles.sheetHint}>Min 8 characters, with uppercase, lowercase, a number and a symbol.</Text>
        <SheetPrimaryButton label="Update Password" onPress={handleChangePassword} loading={changingPwd} />
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
  heroInnerBorder: { position: 'absolute', top: 1, left: 1, right: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  heroCenter: { alignItems: 'center' },

  avatarWrap: { marginBottom: 14 },
  avatarBox: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { position: 'absolute', top: 0, left: 0, width: 88, height: 88, borderRadius: 44, padding: 2.5 },
  avatarRingGradient: { flex: 1, borderRadius: 44 },
  avatarInner: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#14151C', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 25, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.5 },
  avatarStatusDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#14151C',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#14151C',
  },

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
  statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionAccentBar: { width: 3, height: 13, borderRadius: 2, backgroundColor: T.accent },
  sectionLabelText: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: 0.2, flex: 1 },

  infoPanel: { borderRadius: 20, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 16, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  panelInnerBorder: { position: 'absolute', top: 1, left: 1, right: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderTopLeftRadius: 19, borderTopRightRadius: 19 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: T.hairline },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoIconShell: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(124,138,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 13, fontFamily: FontFamily.bodyMedium, color: T.textSec },
  infoValue: { fontSize: 13, fontFamily: FontFamily.heading, color: T.textPri, maxWidth: '48%', textAlign: 'right' },

  menuRowDivider: { height: 1, backgroundColor: T.hairline },

  logoutPanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,107,122,0.2)', paddingVertical: 14 },
  logoutInnerBorder: { position: 'absolute', top: 1, left: 1, right: 1, height: 1, backgroundColor: 'rgba(255,107,122,0.14)', borderTopLeftRadius: 17, borderTopRightRadius: 17 },
  logoutIconShell: { width: 30, height: 30, borderRadius: 10, backgroundColor: T.lossDim, justifyContent: 'center', alignItems: 'center' },
  logoutText: { fontSize: 14, fontFamily: FontFamily.heading, color: T.loss },

  sheet: { backgroundColor: '#0B0C11', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, borderWidth: 1, borderColor: T.glassBorderHi, borderBottomWidth: 0 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: T.hairline, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetTitle: { fontSize: 17, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2 },
  sheetCloseBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },

  sheetInputLabel: { fontSize: 11, fontFamily: FontFamily.bodyMedium, color: T.textTer, letterSpacing: 0.4, marginBottom: 7 },
  sheetInputBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 13, borderWidth: 1, borderColor: T.glassBorder, paddingHorizontal: 14 },
  sheetInputBoxDisabled: { opacity: 0.5 },
  sheetInputText: { fontSize: 14, fontFamily: FontFamily.body, color: T.textPri, paddingVertical: 13 },
  sheetHint: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, lineHeight: 16, marginBottom: 14 },

  sheetPrimaryBtn: { height: 50, borderRadius: 15, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  sheetPrimaryBtnText: { fontSize: 14, fontFamily: FontFamily.heading, color: '#fff', letterSpacing: 0.2 },

  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  menuIconShell: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(124,138,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri },
  menuSublabel: { fontSize: 11, fontFamily: FontFamily.body, color: T.textTer, marginTop: 2 },
});

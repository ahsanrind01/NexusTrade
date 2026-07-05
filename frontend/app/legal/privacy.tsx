import { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../constants/typography';

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
  textPri: '#F7F8FA',
  textSec: '#9CA1B0',
  textTer: '#60657A',
};

const GlassPanel = memo(function GlassPanel({ style, children, intensity = 24 }: any) {
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

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 30).springify().damping(16)} style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionNumberBadge}>
          <Text style={styles.sectionNumberText}>{index}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionBody}>{children}</Text>
    </Animated.View>
  );
}

export default function PrivacyPolicy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={T.textPri} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Privacy Policy</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).springify().damping(16)} style={styles.introWrap}>
          <GlassPanel style={styles.introPanel} intensity={22}>
            <Text style={styles.introText}>
              This Privacy Policy explains what information NexusTrade collects, how it's used, and
              the choices you have. By using the app, you agree to the practices described here.
            </Text>
          </GlassPanel>
        </Animated.View>

        <Section index={1} title="Information We Collect">
          We collect information you provide directly, such as your name, email address, and
          password, when you create an account. We also collect information generated through your
          use of the app, such as order history, wallet balances, and device/session information used
          to keep your account secure.
        </Section>

        <Section index={2} title="How We Use Your Information">
          We use your information to operate your account, process trades, maintain wallet balances,
          provide customer support, and improve the app's features and reliability. We do not sell
          your personal information to third parties.
        </Section>

        <Section index={3} title="Account Credentials">
          Your password is stored using industry-standard one-way hashing and is never stored or
          transmitted in plain text. Your email address is used as your primary account identifier for
          login and account recovery, which is why it cannot be changed directly from within the app.
        </Section>

        <Section index={4} title="Data Sharing">
          We may share limited information with service providers who help us operate the app — for
          example, infrastructure and hosting providers — under obligations to protect that
          information. We may also disclose information if required to do so by law.
        </Section>

        <Section index={5} title="Data Retention">
          We retain account and transaction information for as long as your account is active, and
          for a reasonable period afterward as needed to comply with legal obligations, resolve
          disputes, and enforce our agreements.
        </Section>

        <Section index={6} title="Your Choices">
          You can update your display name at any time from your profile. If you'd like your account
          or personal data removed, or your email address changed, please contact support and we'll
          assist you with the request.
        </Section>

        <Section index={7} title="Security">
          We use reasonable technical and organizational measures designed to protect your
          information. However, no method of transmission or storage is completely secure, and we
          cannot guarantee absolute security.
        </Section>

        <Section index={8} title="Changes to This Policy">
          We may update this Privacy Policy periodically. If we make material changes, we'll let you
          know through the app. Continued use of NexusTrade after changes take effect constitutes
          acceptance of the updated policy.
        </Section>

        <Section index={9} title="Contact">
          If you have questions about this Privacy Policy or how your data is handled, please reach
          out through the support channels provided within the app.
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg0 },
  scroll: { paddingHorizontal: 18 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassBorder, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 15.5, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.2, justifyContent: 'center', flex: 1, textAlign: 'center' },

  introWrap: { marginBottom: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  introPanel: { borderRadius: 20, padding: 17, borderWidth: 1, borderColor: T.glassBorderHi },
  introText: { fontSize: 12.5, fontFamily: FontFamily.body, color: T.textSec, lineHeight: 19 },

  section: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sectionNumberBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(124,138,255,0.14)', borderWidth: 1, borderColor: 'rgba(124,138,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  sectionNumberText: { fontSize: 11, fontFamily: FontFamily.heading, color: T.accent },
  sectionTitle: { fontSize: 14, fontFamily: FontFamily.heading, color: T.textPri, letterSpacing: -0.1, flex: 1 },
  sectionBody: { fontSize: 12.5, fontFamily: FontFamily.body, color: T.textSec, lineHeight: 19, marginLeft: 34 },
});
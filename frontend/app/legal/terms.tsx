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

export default function TermsAndConditions() {
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
          <Text style={styles.topBarTitle}>Terms & Conditions</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).springify().damping(16)} style={styles.introWrap}>
          <GlassPanel style={styles.introPanel} intensity={22}>
            <Text style={styles.introText}>
              These Terms govern your access to and use of NexusTrade. By creating an account or using
              the app, you agree to be bound by them. Please read them carefully. This document was
              last updated and is provided for general informational purposes as part of the app
              experience.
            </Text>
          </GlassPanel>
        </Animated.View>

        <Section index={1} title="Acceptance of Terms">
          By registering for or using NexusTrade in any way, you confirm that you are at least 18
          years old, that you have the legal capacity to enter into a binding agreement, and that you
          accept these Terms in full. If you do not agree with any part of these Terms, you must not
          use the app.
        </Section>

        <Section index={2} title="Your Account">
          You are responsible for maintaining the confidentiality of your login credentials and for
          all activity that occurs under your account. Your email address is used as your account
          identifier and cannot be changed directly within the app — contact support if it needs to
          be updated. Notify us immediately if you suspect any unauthorized use of your account.
        </Section>

        <Section index={3} title="Trading & Market Data">
          Prices, charts, and order execution shown in the app may rely on simulated or delayed
          liquidity for demonstration purposes. Market conditions can change rapidly, and past
          performance is not indicative of future results. You are solely responsible for any
          decisions made based on information presented in the app.
        </Section>

        <Section index={4} title="Orders & Settlement">
          Placing an order reserves the required funds from your available balance. Market orders
          execute only against liquidity available at the time of placement; any unfilled portion is
          not charged and is released back to your available balance. Limit orders may rest until
          filled or cancelled, during which the corresponding funds remain reserved.
        </Section>

        <Section index={5} title="Prohibited Conduct">
          You agree not to misuse the app, including attempting to interfere with its normal
          operation, reverse-engineering its systems, manipulating market data, or using the service
          for any unlawful purpose. We reserve the right to suspend or terminate accounts that violate
          this policy.
        </Section>

        <Section index={6} title="Limitation of Liability">
          NexusTrade is provided on an "as is" and "as available" basis. To the fullest extent
          permitted by law, we disclaim liability for any indirect, incidental, or consequential
          damages arising from your use of the app, including losses related to trading activity.
        </Section>

        <Section index={7} title="Changes to These Terms">
          We may update these Terms from time to time to reflect changes in our services or legal
          requirements. Continued use of the app after changes take effect constitutes acceptance of
          the revised Terms.
        </Section>

        <Section index={8} title="Contact">
          If you have questions about these Terms, please reach out through the support channels
          provided within the app.
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
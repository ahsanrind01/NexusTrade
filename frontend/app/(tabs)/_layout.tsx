import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../constants/typography';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, interpolate,
} from 'react-native-reanimated';
import { useEffect } from 'react';

let BlurView: any = null;
try { BlurView = require('expo-blur').BlurView; } catch {}

const T = {
  bg0: '#06070A',
  glassBorderHi: 'rgba(255,255,255,0.12)',
  accent: '#7C8AFF',
  accentDeep: '#5B63E8',
  violet: '#B583FF',
  textPri: '#F7F8FA',
  textTer: '#60657A',
};

const TABS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'market', label: 'Market', icon: 'bar-chart-outline', iconFocused: 'bar-chart' },
  { name: 'trade', label: 'Trade', icon: 'swap-horizontal-outline', iconFocused: 'swap-horizontal' },
  { name: 'wallet', label: 'Wallet', icon: 'wallet-outline', iconFocused: 'wallet' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

function TabIcon({ label, focused, icon, iconFocused }: { label: string; focused: boolean; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap }) {
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 190 });
  }, [focused]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(lift.value, [0, 1], [0, -1]) }, { scale: interpolate(lift.value, [0, 1], [1, 1.08]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ scale: interpolate(lift.value, [0, 1], [0.7, 1]) }],
  }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ scaleX: interpolate(lift.value, [0, 1], [0.3, 1]) }],
  }));

  return (
    <View style={styles.tabItem}>
      <Animated.View style={[styles.iconWrap, iconWrapStyle]}>
        <Animated.View style={[styles.iconGlow, glowStyle]} />
        <Ionicons
          name={focused ? iconFocused : icon}
          size={21}
          color={focused ? T.textPri : T.textTer}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, focused ? styles.tabLabelFocused : styles.tabLabelUnfocused]}>
        {label}
      </Text>
      <Animated.View style={[styles.activePill, pillStyle]} />
    </View>
  );
}

function TabBarBackground() {
  return (
    <View style={styles.tabBarBg}>
      {BlurView ? (
        <>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.tabBarOverlay]} />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tabBarFallback]} />
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.topHairline}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const barHeight = 58 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: barHeight }],
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: ({ focused }) => (
              <TabIcon label={tab.label} focused={focused} icon={tab.icon} iconFocused={tab.iconFocused} />
            ),
          }}
        />
      ))}
      <Tabs.Screen
        name="cryptoGraph"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBg: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  tabBarOverlay: {
    backgroundColor: 'rgba(6,7,10,0.55)',
  },
  tabBarFallback: {
    backgroundColor: 'rgba(6,7,10,0.94)',
  },
  topHairline: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
  },

  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    gap: 5,
    paddingTop: 12,
    minWidth: 56,
  },
  iconWrap: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 34,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(124,138,255,0.16)',
  },

  tabLabel: {
    fontSize: 9.5,
    fontFamily: FontFamily.bodyMedium,
    letterSpacing: 0.5,
  },
  tabLabelFocused: { color: T.accent },
  tabLabelUnfocused: { color: T.textTer },

  activePill: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: T.accent,
    marginTop: 1,
  },
});
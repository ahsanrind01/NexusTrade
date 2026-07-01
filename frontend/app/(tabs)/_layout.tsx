import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
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
  glass: 'rgba(255,255,255,0.035)',
  glassBorderHi: 'rgba(255,255,255,0.13)',
  accent: '#7C8AFF',
  textPri: '#F4F5F7',
  textTer: '#5B6072',
};

const TABS = [
  { name: 'index',   label: 'Home',    icon: '⌂' },
  { name: 'market',  label: 'Market',  icon: '◈' },
  { name: 'trade',   label: 'Trade',   icon: '⇅' },
  { name: 'wallet',  label: 'Wallet',  icon: '◇' },
  { name: 'profile', label: 'Profile', icon: '○' },
];

// ─── TabIcon ──────────────────────────────────────────────────────────────────
// FIX [1]: Removed animated `color` from useAnimatedStyle — Reanimated cannot
//          interpolate text color on the UI thread. It was silently failing and
//          causing the press to feel broken. Color is now switched via static
//          conditional styles, which React handles natively and instantly.
//
// FIX [2]: Separated the glow background animation from the pill animation.
//          Previously both used `glowStyle` which contained a `scale` transform.
//          That scale was expanding the iconGlowBg OUTSIDE the tab bar bounds,
//          causing the visible "box jumping" effect. Now:
//          - glowBg: only animates opacity (fades in/out, no transform)
//          - pill:   only animates opacity (no scale, no transform)
//          - icon:   only animates scale (the container, not individual elements)
//
// FIX [3]: `withTiming` inside `useAnimatedStyle` return object is valid but
//          every focus change was creating new animation instances. Moved to
//          explicit `useEffect` → `withSpring/withTiming` on shared values only.

function TabIcon({ label, focused, icon }: { label: string; focused: boolean; icon: string }) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);  // FIX [2]: separate from scale

  useEffect(() => {
    // FIX [3]: animations only on shared values, not inside animatedStyle
    scale.value = withSpring(focused ? 1.06 : 1, { damping: 16, stiffness: 200 });
    glowOpacity.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused]);

  // Only scale the outer container — nothing else transforms
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // FIX [2]: glow bg only fades, never scales — this was the "box jumping outside" bug
  const glowBgStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // FIX [2]: pill only fades, no transform
  const pillStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // FIX [1]: icon opacity only — no color animation via Reanimated
  const iconOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowOpacity.value, [0, 1], [0.4, 1]),
  }));

  return (
    <Animated.View style={[styles.tabItem, containerStyle]}>
      <View style={styles.iconWrap}>
        {/* FIX [2]: glowBg uses only opacity, no scale transform */}
        <Animated.View style={[styles.iconGlowBg, glowBgStyle]} />

        {/* FIX [1]: color switched via static styles, not animated */}
        <Animated.Text
          style={[
            styles.tabIcon,
            iconOpacityStyle,
            focused ? styles.tabIconFocused : styles.tabIconUnfocused,
          ]}
        >
          {icon}
        </Animated.Text>
      </View>

      {/* FIX [1]: label color via static conditional style */}
      <Text
        style={[
          styles.tabLabel,
          focused ? styles.tabLabelFocused : styles.tabLabelUnfocused,
        ]}
      >
        {label}
      </Text>

      {/* FIX [2]: pill uses only opacity, no transform */}
      <Animated.View style={[styles.activePill, pillStyle]} />
    </Animated.View>
  );
}

// ─── Tab bar background ───────────────────────────────────────────────────────
function TabBarBackground() {
  if (BlurView) {
    return (
      <View style={styles.tabBarBg}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tabBarOverlay]} />
      </View>
    );
  }
  // Fallback: solid dark overlay, visually identical without blur
  return (
    <View style={[styles.tabBarBg, styles.tabBarFallback]} />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
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
              <TabIcon label={tab.label} focused={focused} icon={tab.icon} />
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
    height: Platform.OS === 'ios' ? 86 : 72,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  tabBarBg: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: T.glassBorderHi,
    overflow: 'hidden',
  },
  tabBarOverlay: {
    backgroundColor: 'rgba(6,7,10,0.55)',
  },
  tabBarFallback: {
    backgroundColor: 'rgba(6,7,10,0.92)',
  },

  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 10,
    minWidth: 56,
  },
  iconWrap: {
    width: 40,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // FIX [2]: position absolute so it never affects layout / never "jumps out"
  iconGlowBg: {
    position: 'absolute',
    width: 40,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(124,138,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(124,138,255,0.22)',
  },
  tabIcon: {
    fontSize: 18,
    fontFamily: FontFamily.heading,
  },
  tabIconFocused:   { color: T.textPri },
  tabIconUnfocused: { color: T.textTer },

  tabLabel: {
    fontSize: 9,
    fontFamily: FontFamily.bodyMedium,
    letterSpacing: 0.6,
  },
  tabLabelFocused:   { color: T.accent },
  tabLabelUnfocused: { color: T.textTer },

  activePill: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: T.accent,
    marginTop: 1,
  },
});
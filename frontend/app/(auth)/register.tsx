import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { FontFamily, FontSize } from '../../constants/typography';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.header}>
        <Text style={styles.logo}>NEXUS<Text style={{ color: Colors.accent }}>TRADE</Text></Text>
        <Text style={styles.tagline}>Professional Crypto Trading</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.form}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start trading in minutes</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.button} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.link}>
          <Text style={styles.linkText}>Already have an account? <Text style={{ color: Colors.accent }}>Sign In</Text></Text>
        </TouchableOpacity>
      </Animated.View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 32, fontFamily: FontFamily.heading, color: Colors.textPrimary, letterSpacing: 4 },
  tagline: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: Colors.textSecondary, marginTop: 6, letterSpacing: 1 },
  form: { backgroundColor: Colors.surface, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.heading, color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: FontSize.md, fontFamily: FontFamily.body, color: Colors.textSecondary, marginBottom: 28 },
  inputWrapper: { marginBottom: 16 },
  label: { fontSize: FontSize.sm, fontFamily: FontFamily.bodyMedium, color: Colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: FontSize.md, fontFamily: FontFamily.body, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  button: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: FontSize.md, fontFamily: FontFamily.subheading, color: Colors.white },
  link: { alignItems: 'center', marginTop: 20 },
  linkText: { fontSize: FontSize.sm, fontFamily: FontFamily.body, color: Colors.textSecondary },
});
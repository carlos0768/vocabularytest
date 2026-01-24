import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { Button, Input } from '../components/ui';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SignupScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validate = () => {
    const newErrors: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    if (!email.trim()) {
      newErrors.email = 'メールアドレスを入力してください';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = '有効なメールアドレスを入力してください';
    }

    if (!password) {
      newErrors.password = 'パスワードを入力してください';
    } else if (password.length < 6) {
      newErrors.password = 'パスワードは6文字以上で入力してください';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'パスワードを再入力してください';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'パスワードが一致しません';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      // TODO: Implement Supabase auth
      Alert.alert(
        '開発中',
        '登録機能は現在開発中です。無料プランでお使いください。'
      );
    } catch {
      Alert.alert('エラー', '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>新規登録</Text>
          <Text style={styles.subtitle}>
            アカウントを作成してクラウド同期を利用しましょう
          </Text>

          <View style={styles.form}>
            <Input
              label="メールアドレス"
              placeholder="email@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
            />

            <Input
              label="パスワード"
              placeholder="6文字以上"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              error={errors.password}
            />

            <Input
              label="パスワード（確認）"
              placeholder="パスワードを再入力"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="password-new"
              error={errors.confirmPassword}
            />

            <Button
              onPress={handleSignup}
              loading={loading}
              size="lg"
              style={styles.signupButton}
            >
              アカウントを作成
            </Button>
          </View>

          <Text style={styles.terms}>
            登録することで、利用規約とプライバシーポリシーに同意したことになります
          </Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>または</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.loginSection}>
            <Text style={styles.loginText}>既にアカウントをお持ちですか？</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>ログイン</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray[500],
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    gap: 8,
  },
  signupButton: {
    marginTop: 8,
  },
  terms: {
    fontSize: 12,
    color: colors.gray[400],
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray[200],
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.gray[400],
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  loginText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  loginLink: {
    fontSize: 14,
    color: colors.primary[600],
    fontWeight: '600',
  },
});

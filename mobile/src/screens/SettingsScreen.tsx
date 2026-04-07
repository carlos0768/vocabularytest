import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  ExternalLink,
  HardDrive,
  LogIn,
  LogOut,
  Mail,
  Pencil,
  Shield,
  User,
  X,
} from 'lucide-react-native';
import { SolidCard, PrimaryButton } from '../components/ui';
import theme from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { WEB_APP_BASE_URL, withWebAppBase } from '../lib/web-base-url';
import type { SettingsStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList>;

async function fetchProfile(token: string): Promise<{ username: string | null }> {
  const url = withWebAppBase('/api/profile');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('プロフィールの取得に失敗しました。');
  return res.json();
}

async function updateProfile(token: string, username: string): Promise<void> {
  const url = withWebAppBase('/api/profile');
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error('ユーザー名の更新に失敗しました。');
}

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    session,
    subscription,
    isAuthenticated,
    isPro,
    signOut,
    loading,
    configError,
  } = useAuth();

  const [username, setUsername] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Login form state (embedded for guests)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !session?.access_token) return;
    let active = true;
    setLoadingProfile(true);
    fetchProfile(session.access_token)
      .then((p) => { if (active) setUsername(p.username); })
      .catch((e) => console.warn('Failed to load profile:', e))
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [isAuthenticated, session?.access_token]);

  const handleSaveUsername = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed) { Alert.alert('ユーザー名を入力してください。'); return; }
    if (trimmed.length > 20) { Alert.alert('ユーザー名は20文字以内で入力してください。'); return; }
    if (!session?.access_token) return;
    setSavingUsername(true);
    try {
      await updateProfile(session.access_token, trimmed);
      setUsername(trimmed);
      setEditingUsername(false);
    } catch (e) {
      Alert.alert('エラー', e instanceof Error ? e.message : 'ユーザー名の更新に失敗しました。');
    } finally {
      setSavingUsername(false);
    }
  }, [editValue, session?.access_token]);

  const storageLabel = useMemo(() => {
    if (isPro) {
      const source = subscription?.proSource === 'test' ? 'Test Pro' : 'Pro';
      return `クラウド同期 (${source})`;
    }
    return 'ローカル保存';
  }, [isPro, subscription?.proSource]);

  const planBadge = useMemo(() => {
    if (!isAuthenticated) return 'Guest';
    if (isPro) return 'Pro';
    return 'Free';
  }, [isAuthenticated, isPro]);

  const openExternal = async (path: string) => {
    if (!WEB_APP_BASE_URL) {
      Alert.alert('リンク設定が不足しています', 'EXPO_PUBLIC_APP_URL を設定してください。');
      return;
    }
    await Linking.openURL(withWebAppBase(path));
  };

  const handleSignOut = () => {
    Alert.alert('ログアウトしますか？', '現在のセッションを終了します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          const result = await signOut();
          if (!result.success) {
            Alert.alert('エラー', result.error || 'ログアウトに失敗しました。');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Title */}
        <Text style={styles.title}>設定</Text>

        {/* Config error */}
        {configError ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>{configError}</Text>
          </View>
        ) : null}

        {/* Profile hero card */}
        <SolidCard style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.avatarCircle}>
              <User size={28} color={theme.white} />
            </View>
            <View style={styles.heroInfo}>
              <View style={[styles.planBadge, isPro ? styles.planBadgePro : isAuthenticated ? styles.planBadgeFree : styles.planBadgeGuest]}>
                <Text style={[styles.planBadgeText, isPro ? styles.planBadgeTextPro : null]}>{planBadge}</Text>
              </View>
              <Text style={styles.heroName} numberOfLines={1}>
                {isAuthenticated
                  ? (loadingProfile ? '...' : username || user?.email || 'ユーザー')
                  : 'ゲスト'}
              </Text>
              <Text style={styles.heroSub} numberOfLines={2}>
                {isAuthenticated ? user?.email ?? '' : 'ログインして全ての機能を使おう'}
              </Text>
            </View>
            <View style={styles.heroTrail}>
              <View style={styles.storageBadge}>
                {isPro
                  ? <Cloud size={12} color={theme.chartBlue} />
                  : <HardDrive size={12} color={theme.secondaryText} />
                }
                <Text style={styles.storageBadgeText}>{isPro ? 'Cloud' : 'Local'}</Text>
              </View>
            </View>
          </View>
        </SolidCard>

        {/* Guest: embedded login form */}
        {!isAuthenticated ? (
          <SolidCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ログイン</Text>
            <View style={styles.loginForm}>
              <View style={styles.loginField}>
                <Mail size={16} color={theme.mutedText} />
                <TextInput
                  style={styles.loginInput}
                  placeholder="メールアドレス"
                  placeholderTextColor={theme.mutedText}
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.loginField}>
                <Shield size={16} color={theme.mutedText} />
                <TextInput
                  style={styles.loginInput}
                  placeholder="パスワード"
                  placeholderTextColor={theme.mutedText}
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  secureTextEntry
                />
              </View>
              <PrimaryButton
                title="サインイン"
                icon={<ArrowRight size={16} color={theme.white} />}
                onPress={() => navigation.navigate('Login')}
              />
              <View style={styles.featureChips}>
                <View style={styles.featureChip}>
                  <Cloud size={12} color={theme.chartBlue} />
                  <Text style={styles.featureChipText}>クラウド同期</Text>
                </View>
                <View style={styles.featureChip}>
                  <Shield size={12} color={theme.success} />
                  <Text style={styles.featureChipText}>進捗を保持</Text>
                </View>
              </View>
            </View>
            <SettingsRow
              icon={<User size={16} color={theme.secondaryText} />}
              label="新規登録"
              trailing={<ArrowRight size={16} color={theme.mutedText} />}
              onPress={() => navigation.navigate('Signup')}
            />
          </SolidCard>
        ) : null}

        {/* Profile section */}
        {isAuthenticated ? (
          <SolidCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>プロフィール</Text>
            {/* Username */}
            {editingUsername ? (
              <View style={styles.usernameEditRow}>
                <TextInput
                  style={styles.usernameInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  maxLength={20}
                  autoFocus
                  placeholder="ユーザー名"
                  placeholderTextColor={theme.mutedText}
                />
                <TouchableOpacity style={styles.usernameBtn} onPress={handleSaveUsername} disabled={savingUsername}>
                  {savingUsername
                    ? <ActivityIndicator size="small" color={theme.chartBlue} />
                    : <Check size={16} color={theme.success} />
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.usernameBtn} onPress={() => setEditingUsername(false)}>
                  <X size={16} color={theme.secondaryText} />
                </TouchableOpacity>
              </View>
            ) : (
              <SettingsRow
                icon={<User size={16} color={theme.secondaryText} />}
                label="ユーザー名"
                value={loadingProfile ? '...' : username || '未設定'}
                trailing={<Pencil size={14} color={theme.mutedText} />}
                onPress={() => { setEditValue(username ?? ''); setEditingUsername(true); }}
              />
            )}
            <Divider />
            <SettingsRow
              icon={<Mail size={16} color={theme.secondaryText} />}
              label="ステータス"
              value={storageLabel}
            />
          </SolidCard>
        ) : null}


        {/* Support section */}
        <SolidCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>サポート</Text>
          <SettingsRow
            icon={<Mail size={16} color={theme.secondaryText} />}
            label="お問い合わせ"
            trailing={<ExternalLink size={14} color={theme.mutedText} />}
            onPress={() => Linking.openURL('mailto:support@merken.jp')}
          />
          <Divider />
          <SettingsRow
            icon={<ExternalLink size={16} color={theme.secondaryText} />}
            label="利用規約"
            trailing={<ExternalLink size={14} color={theme.mutedText} />}
            onPress={() => void openExternal('/terms')}
          />
          <Divider />
          <SettingsRow
            icon={<ExternalLink size={16} color={theme.secondaryText} />}
            label="プライバシーポリシー"
            trailing={<ExternalLink size={14} color={theme.mutedText} />}
            onPress={() => void openExternal('/privacy')}
          />
        </SolidCard>

        {/* Logout */}
        {isAuthenticated ? (
          <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut} activeOpacity={0.8}>
            <LogOut size={16} color={theme.danger} />
            <Text style={styles.logoutText}>ログアウト</Text>
          </TouchableOpacity>
        ) : null}

        {/* Version */}
        {isAuthenticated ? (
          <Text style={styles.version}>v1.0.0</Text>
        ) : null}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  trailing,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {trailing ?? null}
    </Container>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: theme.fontSize.title1,
    fontWeight: '700',
    color: theme.primaryText,
    paddingTop: 16,
    paddingBottom: 16,
  },
  warningBanner: {
    backgroundColor: theme.warningBg,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    fontSize: theme.fontSize.subheadline,
    color: theme.warning,
  },
  heroCard: {
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: theme.accentBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: {
    flex: 1,
    gap: 2,
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  planBadgePro: {
    backgroundColor: theme.chartBlueBg,
  },
  planBadgeFree: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planBadgeGuest: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.secondaryText,
  },
  planBadgeTextPro: {
    color: theme.chartBlue,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.primaryText,
  },
  heroSub: {
    fontSize: theme.fontSize.subheadline,
    color: theme.secondaryText,
    lineHeight: 18,
  },
  heroTrail: {
    alignItems: 'flex-end',
  },
  storageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  storageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.secondaryText,
  },
  sectionCard: {
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: theme.fontSize.body,
    fontWeight: '700',
    color: theme.secondaryText,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceAlt,
  },
  rowContent: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    fontSize: theme.fontSize.body,
    fontWeight: '600',
    color: theme.primaryText,
  },
  rowValue: {
    fontSize: theme.fontSize.subheadline,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  divider: {
    height: 1,
    backgroundColor: theme.borderLight,
    marginLeft: 44,
  },
  loginForm: {
    gap: 10,
  },
  loginField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loginInput: {
    flex: 1,
    fontSize: theme.fontSize.body,
    color: theme.primaryText,
    padding: 0,
  },
  featureChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  featureChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.secondaryText,
  },
  usernameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usernameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.primaryText,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.white,
  },
  usernameBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceAlt,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.dangerBg,
    marginBottom: 12,
  },
  logoutText: {
    fontSize: theme.fontSize.body,
    fontWeight: '600',
    color: theme.danger,
  },
  version: {
    textAlign: 'center',
    fontSize: theme.fontSize.footnote,
    color: theme.mutedText,
    marginBottom: 8,
  },
});

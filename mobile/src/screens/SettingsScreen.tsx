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
import { ArrowLeft, Check, ExternalLink, LogOut, Mail, Pencil, Shield, User, X } from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { WEB_APP_BASE_URL, withWebAppBase } from '../lib/web-base-url';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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

  useEffect(() => {
    if (!isAuthenticated || !session?.access_token) return;
    let active = true;
    setLoadingProfile(true);
    fetchProfile(session.access_token)
      .then((p) => {
        if (active) setUsername(p.username);
      })
      .catch((e) => {
        console.warn('Failed to load profile:', e);
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => { active = false; };
  }, [isAuthenticated, session?.access_token]);

  const handleSaveUsername = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      Alert.alert('ユーザー名を入力してください。');
      return;
    }
    if (trimmed.length > 20) {
      Alert.alert('ユーザー名は20文字以内で入力してください。');
      return;
    }
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

  const planLabel = useMemo(() => {
    if (!subscription) return 'free';
    if (subscription.proSource === 'test') {
      return `${subscription.plan} / ${subscription.status} / test`;
    }
    return `${subscription.plan} / ${subscription.status}`;
  }, [subscription]);

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
            return;
          }
          navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>設定</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>MERKEN</Text>
          <Text style={styles.sectionBody}>
            AI を使って写真から英単語を抽出し、クイズやフラッシュカードで効率的に学習できるアプリです。
          </Text>
        </View>

        {configError ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Supabase 設定が不足しています</Text>
            <Text style={styles.warningText}>{configError}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          {isAuthenticated ? (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <User size={18} color={colors.gray[700]} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoLabel}>ユーザー名</Text>
                {editingUsername ? (
                  <View style={styles.usernameEditRow}>
                    <TextInput
                      style={styles.usernameInput}
                      value={editValue}
                      onChangeText={setEditValue}
                      maxLength={20}
                      autoFocus
                      placeholder="ユーザー名"
                      placeholderTextColor={colors.gray[400]}
                    />
                    <TouchableOpacity
                      style={styles.usernameActionBtn}
                      onPress={handleSaveUsername}
                      disabled={savingUsername}
                    >
                      {savingUsername ? (
                        <ActivityIndicator size="small" color={colors.primary[600]} />
                      ) : (
                        <Check size={16} color={colors.emerald[600]} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.usernameActionBtn}
                      onPress={() => setEditingUsername(false)}
                    >
                      <X size={16} color={colors.gray[500]} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.usernameDisplayRow}
                    onPress={() => {
                      setEditValue(username ?? '');
                      setEditingUsername(true);
                    }}
                  >
                    <Text style={styles.infoValue}>
                      {loadingProfile ? '...' : username || '未設定'}
                    </Text>
                    <Pencil size={14} color={colors.gray[400]} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Mail size={18} color={colors.gray[700]} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>アカウント</Text>
              <Text style={styles.infoValue}>
                {isAuthenticated ? user?.email ?? 'ログイン中' : 'ゲスト'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Shield size={18} color={colors.gray[700]} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>保存方式</Text>
              <Text style={styles.infoValue}>{storageLabel}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Mail size={18} color={colors.gray[700]} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>プラン</Text>
              <Text style={styles.infoValue}>
                {planLabel}
              </Text>
            </View>
          </View>
        </View>

        {isAuthenticated ? (
          <Button
            variant={isPro ? 'secondary' : 'primary'}
            onPress={() => navigation.navigate('Subscription')}
            icon={<Shield size={16} color={isPro ? colors.gray[800] : colors.white} />}
          >
            {isPro ? 'Pro プランの状態を確認' : 'Pro プランにアップグレード'}
          </Button>
        ) : null}

        {!isAuthenticated ? (
          <View style={styles.authActions}>
            <Button variant="secondary" onPress={() => navigation.navigate('Signup')}>
              新規登録
            </Button>
            <Button onPress={() => navigation.navigate('Login')}>
              ログイン
            </Button>
          </View>
        ) : (
          <Button
            variant="danger"
            onPress={handleSignOut}
            loading={loading}
            icon={<LogOut size={16} color={colors.white} />}
          >
            ログアウト
          </Button>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>サポート</Text>
          <SettingsLinkItem label="お問い合わせ" onPress={() => Linking.openURL('mailto:support@merken.jp')} />
          <SettingsLinkItem label="利用規約" onPress={() => void openExternal('/terms')} />
          <SettingsLinkItem label="プライバシーポリシー" onPress={() => void openExternal('/privacy')} />
          <SettingsLinkItem label="Web サイト" onPress={() => WEB_APP_BASE_URL ? Linking.openURL(WEB_APP_BASE_URL) : Alert.alert('EXPO_PUBLIC_APP_URL を設定してください。')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsLinkItem({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress}>
      <Text style={styles.linkLabel}>{label}</Text>
      <ExternalLink size={16} color={colors.gray[500]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.gray[900],
  },
  headerSpacer: {
    width: 42,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  warningCard: {
    backgroundColor: colors.red[50],
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.red[200],
    gap: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.red[700],
  },
  warningText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.red[700],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
  },
  infoValue: {
    fontSize: 15,
    color: colors.gray[800],
    fontWeight: '600',
  },
  authActions: {
    flexDirection: 'row',
    gap: 10,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray[800],
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
    color: colors.gray[800],
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  usernameActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  usernameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

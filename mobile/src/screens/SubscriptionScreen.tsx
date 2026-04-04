import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Cloud,
  Crown,
  FlaskConical,
  Lock,
  Sparkles,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { migrateLocalDataToCloudIfNeeded } from '../lib/db/migration';
import { WEB_APP_BASE_URL, withWebAppBase } from '../lib/web-base-url';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TEST_PRO_ENABLED = ['1', 'true', 'yes'].includes(
  (process.env.EXPO_PUBLIC_ENABLE_TEST_PRO || '').trim().toLowerCase()
);

const featureRows = [
  'all スキャンをログイン後に利用可能',
  'circled / eiken / 例文クイズ / シェアを Pro 扱いで確認可能',
  'クラウド保存と Android 実機確認用の内部テスト導線',
];

export function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    session,
    isAuthenticated,
    isPro,
    subscription,
    refreshSubscription,
  } = useAuth();
  const [activating, setActivating] = useState(false);

  const statusLabel = useMemo(() => {
    if (isPro) {
      return subscription?.proSource === 'test' ? 'Test Pro 有効' : 'Pro 有効';
    }

    return isAuthenticated ? 'Free' : 'ゲスト';
  }, [isAuthenticated, isPro, subscription?.proSource]);

  const expiryLabel = useMemo(() => {
    const expiresAt = subscription?.testProExpiresAt || subscription?.currentPeriodEnd;
    if (!expiresAt) return null;

    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString('ja-JP');
  }, [subscription?.currentPeriodEnd, subscription?.testProExpiresAt]);

  const canActivateTestPro =
    TEST_PRO_ENABLED && Boolean(WEB_APP_BASE_URL) && isAuthenticated && Boolean(session?.access_token);

  const handleActivate = async () => {
    if (!isAuthenticated || !session?.access_token) {
      Alert.alert('ログインが必要です', 'Test Pro を有効化するにはログインしてください。', [
        { text: '閉じる', style: 'cancel' },
        { text: 'ログイン', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }

    if (!TEST_PRO_ENABLED) {
      Alert.alert('無効です', 'この build では Test Pro の付与が有効化されていません。');
      return;
    }

    if (!WEB_APP_BASE_URL) {
      Alert.alert('設定不足', 'EXPO_PUBLIC_APP_URL が未設定のため Test Pro API を呼び出せません。');
      return;
    }

    setActivating(true);

    try {
      const response = await fetch(withWebAppBase('/api/subscription/test-grant'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(
          typeof payload?.error === 'string' && payload.error.length > 0
            ? payload.error
            : 'Test Pro の有効化に失敗しました。'
        );
      }

      await refreshSubscription();

      let migrationSummary = '';
      if (user?.id) {
        const result = await migrateLocalDataToCloudIfNeeded(user.id);
        if (!result.skipped && result.projectsMigrated > 0) {
          migrationSummary = `\n${result.projectsMigrated}件の単語帳 / ${result.wordsMigrated}語をクラウドへコピーしました。`;
        }
      }

      Alert.alert(
        'Test Pro を有効化しました',
        `このアカウントで Pro 限定機能を確認できます。${migrationSummary}`
      );
      navigation.goBack();
    } catch (error) {
      console.error('Failed to activate test pro:', error);
      Alert.alert(
        '有効化に失敗しました',
        error instanceof Error ? error.message : 'Test Pro の有効化に失敗しました。'
      );
    } finally {
      setActivating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Pro</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <FlaskConical size={16} color={colors.orange[700]} />
            <Text style={styles.heroBadgeText}>Internal Build</Text>
          </View>
          <Text style={styles.heroTitle}>Android テスト版の Pro 機能を確認する</Text>
          <Text style={styles.heroText}>
            実課金ではなく、内部テスト用の Test Pro を付与してスキャン、例文クイズ、共有、クラウド保存を確認します。
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              {isPro ? (
                <Sparkles size={18} color={colors.amber[700]} />
              ) : (
                <Lock size={18} color={colors.gray[600]} />
              )}
            </View>
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>{statusLabel}</Text>
              <Text style={styles.statusSubtitle}>
                {isAuthenticated ? user?.email : 'ログイン前は手動入力のみ利用可能'}
              </Text>
            </View>
          </View>
          {expiryLabel ? (
            <Text style={styles.statusMeta}>有効期限: {expiryLabel}</Text>
          ) : null}
        </View>

        <View style={styles.featureCard}>
          <View style={styles.sectionHeader}>
            <Crown size={18} color={colors.amber[700]} />
            <Text style={styles.sectionTitle}>確認できる項目</Text>
          </View>
          <View style={styles.featureList}>
            {featureRows.map((label) => (
              <View key={label} style={styles.featureRow}>
                <Check size={16} color={colors.emerald[600]} />
                <Text style={styles.featureText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {!TEST_PRO_ENABLED || !WEB_APP_BASE_URL ? (
          <View style={styles.warningCard}>
            <AlertCircle size={18} color={colors.red[700]} />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>Test Pro を有効化できません</Text>
              <Text style={styles.warningText}>
                {!TEST_PRO_ENABLED
                  ? 'EXPO_PUBLIC_ENABLE_TEST_PRO が有効化されていません。'
                  : 'EXPO_PUBLIC_APP_URL が未設定です。'}
              </Text>
            </View>
          </View>
        ) : null}

        {!isAuthenticated ? (
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>先にログインが必要です</Text>
            <Text style={styles.loginText}>
              Test Pro は認証済みユーザーにだけ付与します。ログイン後にもう一度実行してください。
            </Text>
            <Button onPress={() => navigation.navigate('Login')}>
              ログインへ進む
            </Button>
          </View>
        ) : (
          <Button
            onPress={handleActivate}
            size="lg"
            style={styles.activateButton}
            loading={activating}
            disabled={!canActivateTestPro}
            icon={<Crown size={18} color={colors.white} />}
          >
            {isPro ? 'Test Pro を再付与する' : 'Test Pro を有効化する'}
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
    marginLeft: 12,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.orange[50],
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.orange[200],
    gap: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.orange[700],
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.gray[900],
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.gray[700],
  },
  statusCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  statusSubtitle: {
    fontSize: 13,
    color: colors.gray[600],
  },
  statusMeta: {
    fontSize: 13,
    color: colors.gray[500],
  },
  featureCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  featureList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[700],
  },
  warningCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.red[50],
    borderWidth: 1,
    borderColor: colors.red[200],
    borderRadius: 18,
    padding: 16,
  },
  warningCopy: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.red[700],
  },
  warningText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.red[700],
  },
  loginCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  loginTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  loginText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  activateButton: {
    marginTop: 4,
  },
});

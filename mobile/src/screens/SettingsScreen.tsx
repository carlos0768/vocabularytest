import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Mail,
  User,
  Sparkles,
  Check,
  Cloud,
  Smartphone,
  ExternalLink,
  ChevronRight,
  LogOut,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { getGuestUserId, getDailyScanInfo } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FREE_DAILY_SCAN_LIMIT = 3;
const FREE_WORD_LIMIT = 100;
const PRO_PRICE = 500;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, subscription, isPro, isAuthenticated, loading: authLoading, signOut } = useAuth();

  const [wordCount, setWordCount] = useState(0);
  const [wordCountLoading, setWordCountLoading] = useState(true);

  // Load word count
  useEffect(() => {
    const loadWordCount = async () => {
      try {
        // Authenticated users use remote repository (Supabase), guests use local SQLite
        const repository = getRepository(isAuthenticated ? 'active' : 'free');
        // Use authenticated user ID if logged in, otherwise use guest ID
        const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
        const projects = await repository.getProjects(userId);

        let count = 0;
        for (const project of projects) {
          const words = await repository.getWords(project.id);
          count += words.length;
        }
        setWordCount(count);
      } catch (error) {
        console.error('Failed to load word count:', error);
      } finally {
        setWordCountLoading(false);
      }
    };

    loadWordCount();
  }, [isAuthenticated, user]);

  const handleSignOut = async () => {
    Alert.alert(
      'ログアウト',
      'ログアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          },
        },
      ]
    );
  };

  const handleContact = () => {
    Linking.openURL('mailto:support@scanvocab.app');
  };

  const handleTerms = () => {
    Linking.openURL('https://scanvocab.vercel.app/terms');
  };

  const handlePrivacy = () => {
    Linking.openURL('https://scanvocab.vercel.app/privacy');
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
        <Text style={styles.headerTitle}>設定</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Account Section */}
        {authLoading ? (
          <View style={styles.accountCard}>
            <ActivityIndicator size="small" color={colors.gray[400]} />
          </View>
        ) : isAuthenticated ? (
          <View style={styles.accountCard}>
            <View style={styles.accountIcon}>
              <Mail size={20} color={colors.gray[500]} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountEmail} numberOfLines={1}>{user?.email}</Text>
              <Text style={styles.accountPlan}>{isPro ? 'Pro' : 'Free'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.accountCard}>
            <View style={styles.accountIcon}>
              <User size={20} color={colors.gray[500]} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountEmail}>ゲスト</Text>
              <Text style={styles.accountPlan}>ログインでクラウド同期</Text>
            </View>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => navigation.navigate('Login')}
            >
              ログイン
            </Button>
          </View>
        )}

        {/* Plan Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プラン</Text>
          <View style={styles.card}>
            {isPro ? (
              // Pro User View
              <View style={styles.planContent}>
                <View style={styles.planHeader}>
                  <View style={styles.planNameRow}>
                    <Sparkles size={16} color={colors.amber[500]} />
                    <Text style={styles.planName}>Pro</Text>
                  </View>
                  <Text style={styles.planPrice}>¥{PRO_PRICE.toLocaleString()}/月</Text>
                </View>

                <View style={styles.usageStats}>
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>スキャン</Text>
                    <View style={styles.usageValueRow}>
                      <Text style={styles.usageValueGreen}>無制限</Text>
                      <Check size={14} color={colors.emerald[600]} />
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>単語数</Text>
                    <Text style={styles.usageValue}>
                      {wordCountLoading ? '...' : `${wordCount}語`}
                      <Text style={styles.usageValueMuted}>（無制限）</Text>
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>保存</Text>
                    <View style={styles.usageValueRow}>
                      <Cloud size={14} color={colors.primary[500]} />
                      <Text style={styles.usageValueBlue}>クラウド同期中</Text>
                    </View>
                  </View>
                </View>

                {subscription?.currentPeriodEnd && (
                  <Text style={styles.nextBilling}>
                    次回更新: {new Date(subscription.currentPeriodEnd).toLocaleDateString('ja-JP')}
                  </Text>
                )}
              </View>
            ) : (
              // Free User View
              <View style={styles.planContent}>
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>Free</Text>
                </View>

                <View style={styles.usageStats}>
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>スキャン</Text>
                    <Text style={styles.usageValue}>{FREE_DAILY_SCAN_LIMIT}回/日</Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>単語数</Text>
                    <Text style={styles.usageValue}>
                      {wordCountLoading ? '...' : wordCount}/{FREE_WORD_LIMIT}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>保存</Text>
                    <View style={styles.usageValueRow}>
                      <Smartphone size={14} color={colors.gray[500]} />
                      <Text style={styles.usageValueMuted}>このデバイスのみ</Text>
                    </View>
                  </View>
                </View>

                {/* Pro Upgrade Card */}
                <View style={styles.upgradeCard}>
                  <View style={styles.upgradeHeader}>
                    <Sparkles size={16} color={colors.amber[500]} />
                    <Text style={styles.upgradeTitle}>Proにアップグレード</Text>
                  </View>
                  <View style={styles.upgradeFeatures}>
                    <View style={styles.upgradeFeatureRow}>
                      <Check size={12} color={colors.emerald[500]} />
                      <Text style={styles.upgradeFeatureText}>スキャン無制限</Text>
                    </View>
                    <View style={styles.upgradeFeatureRow}>
                      <Check size={12} color={colors.emerald[500]} />
                      <Text style={styles.upgradeFeatureText}>単語数無制限</Text>
                    </View>
                    <View style={styles.upgradeFeatureRow}>
                      <Check size={12} color={colors.emerald[500]} />
                      <Text style={styles.upgradeFeatureText}>クラウド同期</Text>
                    </View>
                  </View>
                  <Button
                    size="sm"
                    onPress={() => navigation.navigate('Subscription')}
                    style={styles.upgradeButton}
                  >
                    ¥{PRO_PRICE.toLocaleString()}/月で始める
                  </Button>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>サポート</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.linkItem} onPress={handleContact}>
              <Text style={styles.linkLabel}>お問い合わせ</Text>
              <ExternalLink size={16} color={colors.gray[400]} />
            </TouchableOpacity>

            <View style={styles.dividerFull} />

            <TouchableOpacity style={styles.linkItem} onPress={handleTerms}>
              <Text style={styles.linkLabel}>利用規約</Text>
              <ChevronRight size={16} color={colors.gray[400]} />
            </TouchableOpacity>

            <View style={styles.dividerFull} />

            <TouchableOpacity style={styles.linkItem} onPress={handlePrivacy}>
              <Text style={styles.linkLabel}>プライバシーポリシー</Text>
              <ChevronRight size={16} color={colors.gray[400]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sign Out Button */}
        {isAuthenticated && (
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut size={16} color={colors.gray[500]} />
            <Text style={styles.signOutText}>ログアウト</Text>
          </TouchableOpacity>
        )}

        {/* Version */}
        <Text style={styles.version}>v1.0.0</Text>
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
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
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
    padding: 16,
    paddingBottom: 32,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
    minHeight: 72,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[900],
  },
  accountPlan: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 2,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    overflow: 'hidden',
  },
  planContent: {
    padding: 16,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[900],
  },
  planPrice: {
    fontSize: 14,
    color: colors.gray[500],
  },
  usageStats: {
    gap: 8,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  usageLabel: {
    fontSize: 14,
    color: colors.gray[600],
  },
  usageValue: {
    fontSize: 14,
    color: colors.gray[900],
  },
  usageValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usageValueGreen: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.emerald[600],
  },
  usageValueBlue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary[600],
  },
  usageValueMuted: {
    fontSize: 14,
    color: colors.gray[400],
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[200],
  },
  dividerFull: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginHorizontal: 16,
  },
  nextBilling: {
    fontSize: 12,
    color: colors.gray[400],
    marginTop: 16,
  },
  upgradeCard: {
    backgroundColor: colors.amber[50],
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  upgradeTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[900],
  },
  upgradeFeatures: {
    marginLeft: 24,
    gap: 4,
  },
  upgradeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upgradeFeatureText: {
    fontSize: 12,
    color: colors.gray[600],
  },
  upgradeButton: {
    marginTop: 12,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkLabel: {
    fontSize: 14,
    color: colors.gray[900],
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 24,
  },
  signOutText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.gray[300],
    marginTop: 16,
  },
});

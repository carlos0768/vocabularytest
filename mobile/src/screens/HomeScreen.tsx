import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertCircle,
  BookOpen,
  Camera,
  Cloud,
  Crown,
  Flag,
  Lock,
  Plus,
  Settings,
  Sparkles,
} from 'lucide-react-native';
import { ScanModeModal } from '../components/scan/ScanModeModal';
import { Button, Input } from '../components/ui';
import { ProcessingModal } from '../components/ProcessingModal';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { migrateLocalDataToCloudIfNeeded } from '../lib/db/migration';
import { createScanJob, waitForScanJobCompletion, type ScanMode } from '../lib/scan-jobs';
import { getGuestUserId, getWrongAnswers } from '../lib/utils';
import type { ProgressStep, Project, RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SupportedScanMode = Extract<ScanMode, 'all' | 'circled' | 'eiken'>;

interface ProjectSummary {
  project: Project;
  totalWords: number;
  masteredWords: number;
  favoriteWords: number;
}

function formatScanProjectTitle() {
  const now = new Date();
  return `スキャン ${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    session,
    subscription,
    isAuthenticated,
    isPro,
    loading: authLoading,
    configError,
  } = useAuth();

  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [wrongAnswerCount, setWrongAnswerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([
    { id: 'upload', label: '画像をアップロード中...', status: 'pending' as const },
    { id: 'process', label: '単語を抽出中...', status: 'pending' as const },
    { id: 'save', label: '保存先を準備中...', status: 'pending' as const },
  ]);

  const migratedUserIdRef = useRef<string | null>(null);
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  const resolveActiveUserId = useCallback(async () => {
    if (isAuthenticated && user?.id) {
      return user.id;
    }

    return getGuestUserId();
  }, [isAuthenticated, user?.id]);

  const loadProjects = useCallback(async (showSpinner = true) => {
    if (authLoading) return;

    if (showSpinner) {
      setLoading(true);
    }

    try {
      if (isAuthenticated && isPro && user?.id && migratedUserIdRef.current !== user.id) {
        await migrateLocalDataToCloudIfNeeded(user.id);
        migratedUserIdRef.current = user.id;
      }

      if (!isAuthenticated) {
        migratedUserIdRef.current = null;
      }

      const activeUserId = await resolveActiveUserId();
      setCurrentUserId(activeUserId);

      const projects = await repository.getProjects(activeUserId);
      let nextFavoriteCount = 0;

      const summaries = await Promise.all(
        projects.map(async (project) => {
          const words = await repository.getWords(project.id);
          const masteredWords = words.filter((word) => word.status === 'mastered').length;
          const favoriteWords = words.filter((word) => word.isFavorite).length;
          nextFavoriteCount += favoriteWords;

          return {
            project,
            totalWords: words.length,
            masteredWords,
            favoriteWords,
          };
        })
      );

      const wrongAnswers = await getWrongAnswers();

      setProjectSummaries(summaries);
      setFavoriteCount(nextFavoriteCount);
      setWrongAnswerCount(wrongAnswers.length);
    } catch (error) {
      console.error('Failed to load home data:', error);
      Alert.alert('エラー', 'ホーム画面の読み込みに失敗しました。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, isAuthenticated, isPro, repository, resolveActiveUserId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadProjects();
    }, [loadProjects])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadProjects(false);
  }, [loadProjects]);

  const handleCreateProject = useCallback(async () => {
    const title = newProjectTitle.trim();
    if (!title) {
      Alert.alert('単語帳名を入力してください');
      return;
    }

    setCreating(true);

    try {
      const userId = currentUserId ?? (await resolveActiveUserId());
      const createdProject = await repository.createProject({
        userId,
        title,
        sourceLabels: [],
      });

      setShowCreateModal(false);
      setNewProjectTitle('');
      await loadProjects(false);
      navigation.navigate('Project', { projectId: createdProject.id });
    } catch (error) {
      console.error('Failed to create project:', error);
      Alert.alert('エラー', '単語帳の作成に失敗しました。');
    } finally {
      setCreating(false);
    }
  }, [currentUserId, loadProjects, navigation, newProjectTitle, repository, resolveActiveUserId]);

  const handleProtectedAction = useCallback(
    (options?: { requirePro?: boolean; featureName?: string }) => {
      if (!isAuthenticated || !session?.access_token) {
        Alert.alert(
          'ログインが必要です',
          `${options?.featureName ?? 'この機能'}を使うにはログインしてください。`,
          [
            { text: '閉じる', style: 'cancel' },
            { text: 'ログイン', onPress: () => navigation.navigate('Login') },
          ]
        );
        return false;
      }

      if (options?.requirePro && !isPro) {
        Alert.alert(
          'Test Pro / Pro が必要です',
          `${options.featureName ?? 'この機能'}は Test Pro または Pro で確認できます。`,
          [
            { text: '閉じる', style: 'cancel' },
            { text: 'Test Pro を開く', onPress: () => navigation.navigate('Subscription') },
          ]
        );
        return false;
      }

      return true;
    },
    [isAuthenticated, isPro, navigation, session?.access_token]
  );

  const promptImageSource = useCallback(
    (scanMode: SupportedScanMode, eikenLevel?: string | null) => {
      Alert.alert('画像を選択', 'カメラかライブラリを選んでください。', [
        {
          text: 'カメラ',
          onPress: () => {
            void startScan(scanMode, 'camera', eikenLevel ?? null);
          },
        },
        {
          text: 'ライブラリ',
          onPress: () => {
            void startScan(scanMode, 'library', eikenLevel ?? null);
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ]);
    },
    []
  );

  const handleOpenScan = useCallback(() => {
    if (!handleProtectedAction({ featureName: 'スキャン' })) {
      return;
    }

    setShowScanModeModal(true);
  }, [handleProtectedAction]);

  const startScan = useCallback(
    async (
      scanMode: SupportedScanMode,
      source: 'camera' | 'library',
      eikenLevel?: string | null
    ) => {
      if (!session?.access_token) {
        Alert.alert('ログインが必要です', '先にログインしてください。');
        return;
      }

      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permission.status !== 'granted') {
          Alert.alert('権限が必要です', source === 'camera' ? 'カメラの使用を許可してください。' : '写真ライブラリの使用を許可してください。');
          return;
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsMultipleSelection: false,
              });

        if (result.canceled || !result.assets[0]?.uri) {
          return;
        }

        const asset = result.assets[0];
        const projectTitle = formatScanProjectTitle();

        setProcessing(true);
        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'active' },
          { id: 'process', label: '単語を抽出中...', status: 'pending' },
          { id: 'save', label: '保存先を準備中...', status: 'pending' },
        ]);

        const created = await createScanJob({
          session,
          imageUri: asset.uri,
          projectTitle,
          scanMode,
          eikenLevel: eikenLevel ?? null,
          mimeType: asset.mimeType,
        });

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'active' },
          { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : 'クラウド単語帳を作成中...', status: 'pending' },
        ]);

        const completed = await waitForScanJobCompletion(session, created.jobId);
        const parsedResult = completed.parsedResult ?? {};

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'complete' },
          { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : 'クラウド単語帳を作成中...', status: 'active' },
        ]);

        if (created.saveMode === 'client_local') {
          const extractedWords = (parsedResult.extractedWords ?? []) as RootStackParamList['ScanConfirm']['words'];
          setProcessing(false);
          navigation.navigate('ScanConfirm', {
            words: extractedWords,
            projectName: projectTitle,
          });
          return;
        }

        const projectId =
          (typeof parsedResult.targetProjectId === 'string' ? parsedResult.targetProjectId : null)
          || completed.job.project_id
          || null;

        if (!projectId) {
          throw new Error('保存先の単語帳が見つかりませんでした。');
        }

        setProcessing(false);
        await loadProjects(false);
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Main' },
            { name: 'Project', params: { projectId } },
          ],
        });
      } catch (error) {
        console.error('Failed to scan from home:', error);
        setProcessingSteps((current) => {
          let handled = false;
          return current.map((step) => {
            if (!handled && (step.status === 'active' || step.status === 'pending')) {
              handled = true;
              return {
                ...step,
                status: 'error',
                label: error instanceof Error ? error.message : 'スキャンに失敗しました。',
              };
            }
            return step;
          });
        });
      }
    },
    [loadProjects, navigation, session]
  );

  const storageLabel = isPro ? 'クラウド同期' : 'この端末に保存';
  const accountLabel = isAuthenticated ? user?.email ?? 'ログイン中' : 'ゲスト利用中';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary[600]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MERKEN</Text>
            <Text style={styles.tagline}>Android Test Build</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Settings size={20} color={colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Sparkles size={14} color={colors.primary[700]} />
            <Text style={styles.heroBadgeText}>Internal Test</Text>
          </View>
          <Text style={styles.heroTitle}>単語帳、スキャン、復習機能を Android で確認する</Text>
          <Text style={styles.heroText}>
            手動 CRUD に加えて、ログイン後のスキャン、苦手単語、間違えた単語、Test Pro 導線まで確認できるテスト build です。
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              {isPro ? <Cloud size={14} color={colors.primary[700]} /> : <Lock size={14} color={colors.gray[700]} />}
              <Text style={styles.statusPillText}>{storageLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <BookOpen size={14} color={colors.gray[700]} />
              <Text style={styles.statusPillText}>{accountLabel}</Text>
            </View>
          </View>
        </View>

        {configError ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Supabase 設定が必要です</Text>
            <Text style={styles.warningText}>{configError}</Text>
          </View>
        ) : null}

        {!isAuthenticated ? (
          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>ログインするとスキャンと同期が使えます</Text>
            <Text style={styles.authText}>
              `all` スキャンはログイン済み Free でも確認できます。Pro 系の機能は Test Pro 付与後に開きます。
            </Text>
            <View style={styles.authButtons}>
              <Button size="sm" variant="secondary" onPress={() => navigation.navigate('Signup')}>
                新規登録
              </Button>
              <Button size="sm" onPress={() => navigation.navigate('Login')}>
                ログイン
              </Button>
            </View>
          </View>
        ) : !isPro ? (
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeHeader}>
              <Crown size={18} color={colors.amber[700]} />
              <Text style={styles.upgradeTitle}>Test Pro で残り機能を確認する</Text>
            </View>
            <Text style={styles.upgradeText}>
              circled/eiken スキャン、フラッシュカード、例文クイズ、共有は Test Pro を有効化すると使えます。
            </Text>
            <Button size="sm" onPress={() => navigation.navigate('Subscription')}>
              Test Pro を開く
            </Button>
          </View>
        ) : null}

        <View style={styles.toolsGrid}>
          <ActionCard
            title="スキャン作成"
            subtitle={isAuthenticated ? (isPro ? 'all / circled / eiken' : 'all スキャン') : 'ログイン必須'}
            icon={<Camera size={18} color={colors.primary[700]} />}
            accentColor={colors.primary[50]}
            onPress={handleOpenScan}
          />
          <ActionCard
            title="苦手単語"
            subtitle={`${favoriteCount}語を確認`}
            icon={<Flag size={18} color={colors.orange[700]} />}
            accentColor={colors.orange[50]}
            onPress={() => navigation.navigate('Favorites')}
          />
          <ActionCard
            title="間違えた単語"
            subtitle={`${wrongAnswerCount}語を復習`}
            icon={<AlertCircle size={18} color={colors.red[700]} />}
            accentColor={colors.red[50]}
            onPress={() => navigation.navigate('WrongAnswers')}
          />
          <ActionCard
            title={isPro ? 'Test Pro 有効' : 'Test Pro'}
            subtitle={isPro ? 'Pro 機能を確認中' : '残り機能を開く'}
            icon={<Crown size={18} color={colors.amber[700]} />}
            accentColor={colors.amber[50]}
            onPress={() => navigation.navigate('Subscription')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>単語帳</Text>
          <Button
            size="sm"
            onPress={() => setShowCreateModal(true)}
            icon={<Plus size={16} color={colors.white} />}
          >
            新規作成
          </Button>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.primary[600]} />
            <Text style={styles.loadingText}>単語帳を読み込み中...</Text>
          </View>
        ) : projectSummaries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>まだ単語帳がありません</Text>
            <Text style={styles.emptyText}>手動で作成するか、ログイン後にスキャンから始めてください。</Text>
            <View style={styles.emptyActions}>
              <Button size="lg" onPress={() => setShowCreateModal(true)}>
                単語帳を作る
              </Button>
              <Button size="lg" variant="secondary" onPress={handleOpenScan}>
                スキャンする
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.projectList}>
            {projectSummaries.map((summary) => (
              <ProjectRowCard
                key={summary.project.id}
                summary={summary}
                isPro={isPro}
                onPress={() => navigation.navigate('Project', { projectId: summary.project.id })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>新しい単語帳</Text>
            <Input
              label="単語帳名"
              value={newProjectTitle}
              onChangeText={setNewProjectTitle}
              placeholder="例: 英検準2級"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Button variant="secondary" onPress={() => setShowCreateModal(false)}>
                キャンセル
              </Button>
              <Button onPress={handleCreateProject} loading={creating}>
                作成
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <ProcessingModal
        visible={processing}
        steps={processingSteps}
        onClose={() => {
          setProcessing(false);
          setProcessingSteps([
            { id: 'upload', label: '画像をアップロード中...', status: 'pending' },
            { id: 'process', label: '単語を抽出中...', status: 'pending' },
            { id: 'save', label: '保存先を準備中...', status: 'pending' },
          ]);
        }}
      />

      <ScanModeModal
        visible={showScanModeModal}
        isPro={isPro}
        title="スキャンモード"
        subtitle="新しい単語帳をどう作るか選んでください。"
        onClose={() => setShowScanModeModal(false)}
        onRequirePro={() => {
          void handleProtectedAction({ requirePro: true, featureName: 'このスキャンモード' });
        }}
        onSelectMode={(mode, eikenLevel) => {
          promptImageSource(mode, eikenLevel ?? null);
        }}
      />
    </SafeAreaView>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  accentColor,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function ProjectRowCard({
  summary,
  isPro,
  onPress,
}: {
  summary: ProjectSummary;
  isPro: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.projectCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.projectCardHeader}>
        <Text style={styles.projectTitle}>{summary.project.title}</Text>
        <View style={[styles.modeBadge, isPro ? styles.modeBadgeCloud : styles.modeBadgeLocal]}>
          <Text style={[styles.modeBadgeText, isPro ? styles.modeBadgeTextCloud : styles.modeBadgeTextLocal]}>
            {isPro ? 'Cloud' : 'Local'}
          </Text>
        </View>
      </View>
      <View style={styles.projectMetaRow}>
        <StatPill label={`${summary.totalWords}語`} />
        <StatPill label={`習得 ${summary.masteredWords}語`} />
        <StatPill label={`苦手 ${summary.favoriteWords}語`} />
      </View>
      {summary.project.sourceLabels.length > 0 ? (
        <Text style={styles.projectLabels}>{summary.project.sourceLabels.join(' / ')}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function StatPill({ label }: { label: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.gray[900],
  },
  tagline: {
    marginTop: 4,
    fontSize: 13,
    color: colors.gray[500],
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
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primary[50],
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary[700],
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.gray[900],
    lineHeight: 30,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
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
  authCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 10,
  },
  authText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  authButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  upgradeCard: {
    backgroundColor: colors.amber[50],
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.amber[200],
    gap: 10,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  upgradeText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[700],
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 8,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  actionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.gray[900],
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 10,
  },
  projectList: {
    gap: 12,
  },
  projectCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  projectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  projectTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  modeBadgeCloud: {
    backgroundColor: colors.primary[50],
  },
  modeBadgeLocal: {
    backgroundColor: colors.gray[100],
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modeBadgeTextCloud: {
    color: colors.primary[700],
  },
  modeBadgeTextLocal: {
    color: colors.gray[700],
  },
  projectMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
  },
  statPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[700],
  },
  projectLabels: {
    fontSize: 13,
    color: colors.gray[500],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.3)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});

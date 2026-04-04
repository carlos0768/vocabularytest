import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  BookText,
  Camera,
  Flag,
  Layers,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react-native';
import { ScanModeModal } from '../components/scan/ScanModeModal';
import { Button, Input } from '../components/ui';
import { ProcessingModal } from '../components/ProcessingModal';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { buildDistractors, MINIMUM_QUIZ_WORDS } from '../lib/quiz-helpers';
import { createScanJob, waitForScanJobCompletion, type ScanMode } from '../lib/scan-jobs';
import { withWebAppBase } from '../lib/web-base-url';
import type { ProgressStep, Project, RootStackParamList, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProjectRoute = RouteProp<RootStackParamList, 'Project'>;
type SupportedScanMode = Extract<ScanMode, 'all' | 'circled' | 'eiken'>;

function generateShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let shareId = '';
  for (let index = 0; index < 12; index += 1) {
    shareId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return shareId;
}

export function ProjectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProjectRoute>();
  const {
    session,
    subscription,
    isAuthenticated,
    isPro,
    loading: authLoading,
  } = useAuth();

  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWord, setSavingWord] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showWordModal, setShowWordModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [wordEnglish, setWordEnglish] = useState('');
  const [wordJapanese, setWordJapanese] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([
    { id: 'upload', label: '画像をアップロード中...', status: 'pending' as const },
    { id: 'process', label: '単語を抽出中...', status: 'pending' as const },
    { id: 'save', label: '保存先を準備中...', status: 'pending' as const },
  ]);

  const loadProject = useCallback(async () => {
    if (authLoading) return;

    setLoading(true);
    try {
      const [projectData, wordData] = await Promise.all([
        repository.getProject(route.params.projectId),
        repository.getWords(route.params.projectId),
      ]);

      if (!projectData) {
        Alert.alert('単語帳が見つかりません');
        navigation.goBack();
        return;
      }

      setProject(projectData);
      setProjectTitle(projectData.title);
      setWords(wordData);
    } catch (error) {
      console.error('Failed to load project:', error);
      Alert.alert('エラー', '単語帳の読み込みに失敗しました。');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [authLoading, navigation, repository, route.params.projectId]);

  useFocusEffect(
    useCallback(() => {
      void loadProject();
    }, [loadProject])
  );

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

  const openCreateWordModal = () => {
    setEditingWord(null);
    setWordEnglish('');
    setWordJapanese('');
    setShowWordModal(true);
  };

  const openEditWordModal = (word: Word) => {
    setEditingWord(word);
    setWordEnglish(word.english);
    setWordJapanese(word.japanese);
    setShowWordModal(true);
  };

  const handleSaveProjectTitle = useCallback(async () => {
    if (!project) return;

    const nextTitle = projectTitle.trim();
    if (!nextTitle) {
      Alert.alert('単語帳名を入力してください');
      return;
    }

    setSavingProject(true);

    try {
      await repository.updateProject(project.id, { title: nextTitle });
      setProject((current) => (current ? { ...current, title: nextTitle } : current));
      setShowRenameModal(false);
    } catch (error) {
      console.error('Failed to rename project:', error);
      Alert.alert('エラー', '単語帳名の更新に失敗しました。');
    } finally {
      setSavingProject(false);
    }
  }, [project, projectTitle, repository]);

  const handleDeleteProject = useCallback(() => {
    if (!project) return;

    Alert.alert('単語帳を削除しますか？', 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await repository.deleteProject(project.id);
            navigation.goBack();
          } catch (error) {
            console.error('Failed to delete project:', error);
            Alert.alert('エラー', '単語帳の削除に失敗しました。');
          }
        },
      },
    ]);
  }, [navigation, project, repository]);

  const handleSaveWord = useCallback(async () => {
    if (!project) return;

    const english = wordEnglish.trim();
    const japanese = wordJapanese.trim();

    if (!english || !japanese) {
      Alert.alert('英単語と日本語訳を入力してください');
      return;
    }

    setSavingWord(true);

    try {
      if (editingWord) {
        await repository.updateWord(editingWord.id, {
          english,
          japanese,
          distractors: buildDistractors(words, japanese, editingWord.id),
        });
      } else {
        await repository.createWords([
          {
            projectId: project.id,
            english,
            japanese,
            distractors: buildDistractors(words, japanese),
          },
        ]);
      }

      setShowWordModal(false);
      setEditingWord(null);
      setWordEnglish('');
      setWordJapanese('');
      await loadProject();
    } catch (error) {
      console.error('Failed to save word:', error);
      Alert.alert('エラー', '単語の保存に失敗しました。');
    } finally {
      setSavingWord(false);
    }
  }, [editingWord, loadProject, project, repository, wordEnglish, wordJapanese, words]);

  const handleDeleteWord = useCallback((word: Word) => {
    Alert.alert('単語を削除しますか？', `${word.english} を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await repository.deleteWord(word.id);
            await loadProject();
          } catch (error) {
            console.error('Failed to delete word:', error);
            Alert.alert('エラー', '単語の削除に失敗しました。');
          }
        },
      },
    ]);
  }, [loadProject, repository]);

  const handleToggleFavorite = useCallback(async (word: Word) => {
    try {
      await repository.updateWord(word.id, { isFavorite: !word.isFavorite });
      setWords((currentWords) =>
        currentWords.map((currentWord) =>
          currentWord.id === word.id
            ? { ...currentWord, isFavorite: !currentWord.isFavorite }
            : currentWord
        )
      );
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      Alert.alert('エラー', '苦手フラグの更新に失敗しました。');
    }
  }, [repository]);

  const handleShareProject = useCallback(async () => {
    if (!project) return;
    if (!handleProtectedAction({ requirePro: true, featureName: '共有' })) {
      return;
    }

    setSharing(true);

    try {
      let shareId = project.shareId;
      if (!shareId) {
        shareId = generateShareId();
        await repository.updateProject(project.id, {
          shareId,
          shareScope: 'public',
        });
        setProject((current) =>
          current ? { ...current, shareId, shareScope: 'public' } : current
        );
      }

      const shareUrl = `${withWebAppBase('/share')}/${shareId}`;
      await Share.share({
        message: `「${project.title}」の単語帳を共有します\n${shareUrl}`,
        title: project.title,
        url: shareUrl,
      });
    } catch (error) {
      console.error('Failed to share project:', error);
      Alert.alert(
        '共有に失敗しました',
        error instanceof Error ? error.message : '共有リンクを生成できませんでした。'
      );
    } finally {
      setSharing(false);
    }
  }, [handleProtectedAction, project, repository]);

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
      if (!project || !session?.access_token) {
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

        setProcessing(true);
        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'active' },
          { id: 'process', label: '単語を抽出中...', status: 'pending' },
          { id: 'save', label: '単語帳に追加中...', status: 'pending' },
        ]);

        const created = await createScanJob({
          session,
          imageUri: asset.uri,
          projectTitle: project.title,
          scanMode,
          eikenLevel: eikenLevel ?? null,
          targetProjectId: project.id,
          mimeType: asset.mimeType,
        });

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'active' },
          { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : '単語帳に追加中...', status: 'pending' },
        ]);

        const completed = await waitForScanJobCompletion(session, created.jobId);
        const parsedResult = completed.parsedResult ?? {};

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'complete' },
          { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : '単語帳に追加中...', status: 'active' },
        ]);

        if (created.saveMode === 'client_local') {
          const extractedWords = (parsedResult.extractedWords ?? []) as RootStackParamList['ScanConfirm']['words'];
          setProcessing(false);
          navigation.navigate('ScanConfirm', {
            words: extractedWords,
            projectName: project.title,
            projectId: project.id,
          });
          return;
        }

        setProcessing(false);
        await loadProject();
        Alert.alert(
          'スキャン完了',
          `${typeof parsedResult.wordCount === 'number' ? parsedResult.wordCount : '複数'}語を単語帳へ追加しました。`
        );
      } catch (error) {
        console.error('Failed to scan project:', error);
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
    [loadProject, navigation, project, session]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>単語帳を読み込み中...</Text>
      </View>
    );
  }

  if (!project) {
    return null;
  }

  const quizReady = words.length >= MINIMUM_QUIZ_WORDS;
  const favoriteCount = words.filter((word) => word.isFavorite).length;
  const reviewCount = words.filter((word) => word.status === 'review').length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setShowRenameModal(true)}>
              <Pencil size={18} color={colors.gray[700]} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleDeleteProject}>
              <Trash2 size={18} color={colors.red[600]} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.projectTitle}>{project.title}</Text>
          <Text style={styles.projectMeta}>
            {words.length}語 / 苦手 {favoriteCount}語 / review {reviewCount}語
          </Text>
          {project.sourceLabels.length > 0 ? (
            <Text style={styles.projectLabels}>{project.sourceLabels.join(' / ')}</Text>
          ) : null}
          <View style={styles.statRow}>
            <StatPill label={`習得 ${words.filter((word) => word.status === 'mastered').length}語`} />
            <StatPill label={isPro ? 'Cloud 保存' : 'Local 保存'} />
          </View>
        </View>

        <View style={styles.primaryActions}>
          <Button
            size="lg"
            onPress={() => navigation.navigate('Quiz', { projectId: project.id })}
            icon={<Play size={16} color={colors.white} />}
            disabled={!quizReady}
            style={styles.primaryActionButton}
          >
            4択クイズ
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onPress={() => {
              if (!handleProtectedAction({ requirePro: true, featureName: 'フラッシュカード' })) return;
              navigation.navigate('Flashcard', { projectId: project.id });
            }}
            icon={<Layers size={16} color={colors.gray[800]} />}
            style={styles.primaryActionButton}
          >
            フラッシュカード
          </Button>
        </View>

        {!quizReady ? (
          <Text style={styles.helperText}>
            4択クイズには最低 {MINIMUM_QUIZ_WORDS} 語必要です。
          </Text>
        ) : null}

        <View style={styles.toolsGrid}>
          <ToolCard
            title="例文クイズ"
            subtitle={isPro ? 'AI 生成で復習' : 'Test Pro で解放'}
            icon={<BookText size={18} color={colors.purple[700]} />}
            accentColor={colors.purple[50]}
            onPress={() => {
              if (!handleProtectedAction({ requirePro: true, featureName: '例文クイズ' })) return;
              navigation.navigate('Grammar', { projectId: project.id });
            }}
          />
          <ToolCard
            title="スキャン追加"
            subtitle={isAuthenticated ? '画像から単語を追加' : 'ログイン必須'}
            icon={<Camera size={18} color={colors.primary[700]} />}
            accentColor={colors.primary[50]}
            onPress={handleOpenScan}
          />
          <ToolCard
            title="共有"
            subtitle={isPro ? '共有リンクを送る' : 'Test Pro で解放'}
            icon={<Share2 size={18} color={colors.amber[700]} />}
            accentColor={colors.amber[50]}
            onPress={() => {
              void handleShareProject();
            }}
          />
          <ToolCard
            title="苦手単語"
            subtitle={`${favoriteCount}語を確認`}
            icon={<Flag size={18} color={colors.orange[700]} />}
            accentColor={colors.orange[50]}
            onPress={() => navigation.navigate('Favorites')}
          />
        </View>

        <View style={styles.secondaryActions}>
          <Button
            variant="secondary"
            onPress={() => navigation.navigate('WrongAnswers')}
          >
            間違えた単語を見る
          </Button>
          {!isPro ? (
            <Button onPress={() => navigation.navigate('Subscription')}>
              Test Pro
            </Button>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>単語一覧</Text>
          <Button
            size="sm"
            onPress={openCreateWordModal}
            icon={<Plus size={16} color={colors.white} />}
          >
            単語を追加
          </Button>
        </View>

        {words.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>まだ単語がありません</Text>
            <Text style={styles.emptyText}>手動で追加するか、ログイン後にスキャンから追加してください。</Text>
          </View>
        ) : (
          <View style={styles.wordList}>
            {words.map((word) => (
              <View key={word.id} style={styles.wordCard}>
                <View style={styles.wordHeader}>
                  <View style={styles.wordCopy}>
                    <Text style={styles.wordEnglish}>{word.english}</Text>
                    <Text style={styles.wordJapanese}>{word.japanese}</Text>
                  </View>
                  <View style={styles.wordActions}>
                    <TouchableOpacity style={styles.wordActionButton} onPress={() => handleToggleFavorite(word)}>
                      <Flag
                        size={16}
                        color={word.isFavorite ? colors.orange[600] : colors.gray[500]}
                        fill={word.isFavorite ? colors.orange[600] : 'transparent'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wordActionButton} onPress={() => openEditWordModal(word)}>
                      <Pencil size={16} color={colors.gray[700]} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.wordActionButton} onPress={() => handleDeleteWord(word)}>
                      <Trash2 size={16} color={colors.red[600]} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.wordFooter}>
                  <StatusBadge status={word.status} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showWordModal} transparent animationType="fade" onRequestClose={() => setShowWordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingWord ? '単語を編集' : '単語を追加'}</Text>
            <Input
              label="英単語"
              value={wordEnglish}
              onChangeText={setWordEnglish}
              placeholder="example"
              autoCapitalize="none"
              autoFocus
            />
            <Input
              label="日本語訳"
              value={wordJapanese}
              onChangeText={setWordJapanese}
              placeholder="例"
            />
            <Text style={styles.modalHint}>誤答候補は同じ単語帳の語彙から自動で組み立てます。</Text>
            <View style={styles.modalButtons}>
              <Button variant="secondary" onPress={() => setShowWordModal(false)}>
                キャンセル
              </Button>
              <Button onPress={handleSaveWord} loading={savingWord}>
                保存
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>単語帳名を変更</Text>
            <Input
              label="単語帳名"
              value={projectTitle}
              onChangeText={setProjectTitle}
              placeholder="単語帳名"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Button variant="secondary" onPress={() => setShowRenameModal(false)}>
                キャンセル
              </Button>
              <Button onPress={handleSaveProjectTitle} loading={savingProject}>
                更新
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
        title="追加スキャン"
        subtitle="この単語帳に追加するモードを選んでください。"
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

function ToolCard({
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
    <TouchableOpacity style={styles.toolCard} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.toolIcon, { backgroundColor: accentColor }]}>{icon}</View>
      <Text style={styles.toolTitle}>{title}</Text>
      <Text style={styles.toolSubtitle}>{subtitle}</Text>
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

function StatusBadge({ status }: { status: Word['status'] }) {
  const label =
    status === 'mastered' ? 'mastered' : status === 'review' ? 'review' : 'new';

  const badgeStyle =
    status === 'mastered'
      ? styles.statusBadgeMastered
      : status === 'review'
        ? styles.statusBadgeReview
        : styles.statusBadgeNew;

  const textStyle =
    status === 'mastered'
      ? styles.statusTextMastered
      : status === 'review'
        ? styles.statusTextReview
        : styles.statusTextNew;

  return (
    <View style={[styles.statusBadge, badgeStyle]}>
      <Text style={[styles.statusText, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.gray[500],
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
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
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 10,
  },
  projectTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.gray[900],
  },
  projectMeta: {
    fontSize: 14,
    color: colors.gray[600],
  },
  projectLabels: {
    fontSize: 13,
    color: colors.gray[500],
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  primaryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionButton: {
    flex: 1,
  },
  helperText: {
    marginTop: -6,
    fontSize: 13,
    lineHeight: 20,
    color: colors.gray[600],
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 8,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  toolSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
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
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 10,
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
  wordList: {
    gap: 10,
  },
  wordCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  wordCopy: {
    flex: 1,
    gap: 4,
  },
  wordEnglish: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
  },
  wordJapanese: {
    fontSize: 14,
    color: colors.gray[600],
  },
  wordActions: {
    flexDirection: 'row',
    gap: 8,
  },
  wordActionButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeNew: {
    backgroundColor: colors.gray[100],
  },
  statusBadgeReview: {
    backgroundColor: colors.amber[100],
  },
  statusBadgeMastered: {
    backgroundColor: colors.emerald[100],
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextNew: {
    color: colors.gray[700],
  },
  statusTextReview: {
    color: colors.amber[800],
  },
  statusTextMastered: {
    color: colors.emerald[800],
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
  modalHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[500],
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});

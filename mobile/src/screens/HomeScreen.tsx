import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen,
  Orbit,
  Hexagon,
  Gem,
  Zap,
  X,
  Settings,
  Flag,
  Crown,
  Check,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { ProjectCard, ScanButton } from '../components/project';
import { ProcessingModal } from '../components/ProcessingModal';
import { getRepository } from '../lib/db';
import { extractWordsFromImage } from '../lib/ai';
import { useAuth } from '../hooks/use-auth';
import {
  getGuestUserId,
  getDailyScanInfo,
  incrementScanCount,
  getStreakDays,
  getDailyStats,
} from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Project, ProgressStep } from '../types';


type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isPro, isAuthenticated } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectWordCounts, setProjectWordCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: 10, canScan: true });
  const [streakDays, setStreakDays] = useState(0);
  const [dailyStats, setDailyStats] = useState({ todayCount: 0, correctCount: 0, masteredCount: 0 });
  const [totalMastered, setTotalMastered] = useState(0);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [pendingImageSource, setPendingImageSource] = useState<'camera' | 'library' | null>(null);
  const [totalFavorites, setTotalFavorites] = useState(0);

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(isAuthenticated ? 'active' : 'free');

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      // Use authenticated user ID if logged in, otherwise use guest ID
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Load word counts for each project
      const counts: Record<string, number> = {};
      let mastered = 0;
      let favorites = 0;
      for (const project of data) {
        const words = await repository.getWords(project.id);
        counts[project.id] = words.length;
        mastered += words.filter((w) => w.status === 'mastered').length;
        favorites += words.filter((w) => w.isFavorite).length;
      }
      setProjectWordCounts(counts);
      setTotalMastered(mastered);
      setTotalFavorites(favorites);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repository, isAuthenticated, user]);

  // Load stats
  const loadStats = useCallback(async () => {
    const [scanInfoData, streak, stats] = await Promise.all([
      getDailyScanInfo(),
      getStreakDays(),
      getDailyStats(),
    ]);
    setScanInfo(scanInfoData);
    setStreakDays(streak);
    setDailyStats(stats);
  }, []);

  // Initial load
  useEffect(() => {
    loadProjects();
    loadStats();
  }, [loadProjects, loadStats]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProjects();
      loadStats();
    });
    return unsubscribe;
  }, [navigation, loadProjects, loadStats]);

  // Handle pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProjects();
    loadStats();
  }, [loadProjects, loadStats]);

  // Handle image selection
  const handleScanPress = async () => {
    // Check scan limit (Pro users have unlimited scans)
    if (!isPro) {
      const currentScanInfo = await getDailyScanInfo();
      if (!currentScanInfo.canScan) {
        navigation.navigate('Subscription');
        return;
      }
    }

    // Request camera permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'カメラの使用を許可してください。');
      return;
    }

    // Generate default title
    const now = new Date();
    const defaultTitle = `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setProjectName(defaultTitle);

    // Show action sheet to select source first
    Alert.alert(
      '画像を選択',
      'どちらから画像を取得しますか？',
      [
        {
          text: 'カメラで撮影',
          onPress: () => {
            setPendingImageSource('camera');
            setShowProjectNameModal(true);
          },
        },
        {
          text: 'ライブラリから選択',
          onPress: () => {
            setPendingImageSource('library');
            setShowProjectNameModal(true);
          },
        },
        {
          text: 'キャンセル',
          style: 'cancel',
        },
      ]
    );
  };

  // Handle project name confirmation and start scan
  const handleProjectNameConfirm = () => {
    if (!projectName.trim()) {
      Alert.alert('エラー', 'プロジェクト名を入力してください');
      return;
    }
    const source = pendingImageSource;
    setShowProjectNameModal(false);
    setPendingImageSource(null);
    // Delay to allow modal to close before opening camera/library
    if (source) {
      setTimeout(() => {
        pickImage(source);
      }, 300);
    }
  };

  const pickImage = async (source: 'camera' | 'library') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          base64: true,
        });
      }

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('エラー', '画像の読み込みに失敗しました。');
        return;
      }

      await processImage(asset.base64);
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('エラー', '画像の選択に失敗しました。');
    }
  };

  const processImage = async (base64: string) => {
    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      { id: 'generate', label: '問題を作成中...', status: 'pending' },
    ]);

    try {
      const imageDataUrl = `data:image/jpeg;base64,${base64}`;

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload'
            ? { ...s, status: 'complete' }
            : s.id === 'analyze'
            ? { ...s, status: 'active' }
            : s
        )
      );

      // Extract words using server API
      const result = await extractWordsFromImage(imageDataUrl);

      if (!result.success) {
        throw new Error(result.error);
      }

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'analyze'
            ? { ...s, status: 'complete' }
            : s.id === 'generate'
            ? { ...s, status: 'active' }
            : s
        )
      );

      // Small delay for UX
      await new Promise((r) => setTimeout(r, 500));

      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === 'generate' ? { ...s, status: 'complete' } : s))
      );

      // Increment scan count
      await incrementScanCount();
      const newScanInfo = await getDailyScanInfo();
      setScanInfo(newScanInfo);

      // Navigate to confirm screen
      setTimeout(() => {
        setProcessing(false);
        setProcessingSteps([]);
        navigation.navigate('ScanConfirm', { words: result.words!, projectName: projectName.trim() });
      }, 300);
    } catch (error) {
      console.error('Scan error:', error);
      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? {
                ...s,
                status: 'error',
                label: error instanceof Error ? error.message : '予期しないエラーが発生しました',
              }
            : s
        )
      );
    }
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  const handleDeleteProject = async (id: string) => {
    Alert.alert(
      '削除の確認',
      'このプロジェクトを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await repository.deleteProject(id);
            setProjects((prev) => prev.filter((p) => p.id !== id));
          },
        },
      ]
    );
  };

  // Calculate accuracy
  const accuracy = dailyStats.todayCount > 0
    ? Math.round((dailyStats.correctCount / dailyStats.todayCount) * 100)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <Text style={styles.headerTitle}>WordSnap</Text>
          </View>
          {isPro && (
            <View style={styles.proBadge}>
              <Crown size={10} color={colors.white} />
              <Text style={styles.proBadgeText}>Pro</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {isPro ? (
            <View style={styles.unlimitedBadge}>
              <Check size={12} color={colors.emerald[600]} />
              <Text style={styles.unlimitedText}>無制限</Text>
            </View>
          ) : (
            <Text style={styles.scanRemaining}>残り{scanInfo.remaining}回</Text>
          )}
          <TouchableOpacity
            style={styles.flagButton}
            onPress={() => navigation.navigate('Favorites')}
          >
            <Flag size={20} color={colors.orange[500]} />
            {totalFavorites > 0 && (
              <View style={styles.flagBadge}>
                <Text style={styles.flagBadgeText}>
                  {totalFavorites > 99 ? '99+' : totalFavorites}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Settings size={20} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Orbit size={16} color={colors.primary[500]} />
          <Text style={[styles.statValue, dailyStats.todayCount > 0 && styles.statValueActive]}>
            {dailyStats.todayCount}
          </Text>
          <Text style={styles.statLabel}>今日</Text>
        </View>
        <View style={styles.statItem}>
          <Hexagon size={16} color={colors.gray[400]} />
          <Text style={[styles.statValue, accuracy > 0 && styles.statValueActive]}>
            {accuracy}%
          </Text>
          <Text style={styles.statLabel}>正答率</Text>
        </View>
        <View style={styles.statItem}>
          <Gem size={16} color={colors.emerald[500]} />
          <Text style={[styles.statValue, totalMastered > 0 && { color: colors.emerald[600] }]}>
            {totalMastered}
          </Text>
          <Text style={styles.statLabel}>習得</Text>
        </View>
        <View style={styles.statItem}>
          <Zap size={16} color={colors.amber[500]} />
          <Text style={[styles.statValue, streakDays > 0 && { color: colors.amber[500] }]}>
            {streakDays}
          </Text>
          <Text style={styles.statLabel}>連続</Text>
        </View>
      </View>

      {/* Main content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.gray[400]} />
          </View>
        ) : projects.length === 0 ? (
          // Empty state
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <BookOpen size={28} color={colors.gray[400]} />
            </View>
            <Text style={styles.emptyTitle}>単語帳がありません</Text>
            <Text style={styles.emptyText}>
              右下のボタンから{'\n'}ノートやプリントを撮影しましょう
            </Text>
          </View>
        ) : (
          // Project list
          <View style={styles.projectList}>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                wordCount={projectWordCounts[project.id] || 0}
                onPress={() => navigation.navigate('Project', { projectId: project.id })}
                onDelete={() => handleDeleteProject(project.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating action button */}
      <ScanButton onPress={handleScanPress} disabled={processing} />

      {/* Processing modal */}
      <ProcessingModal
        visible={processing}
        steps={processingSteps}
        onClose={
          processingSteps.some((s) => s.status === 'error')
            ? handleCloseModal
            : undefined
        }
      />

      {/* Project name input modal */}
      <Modal
        visible={showProjectNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectNameModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>プロジェクト名</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowProjectNameModal(false);
                  setPendingImageSource(null);
                }}
                style={styles.modalCloseButton}
              >
                <X size={20} color={colors.gray[500]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              スキャンする単語帳の名前を入力してください
            </Text>
            <TextInput
              style={styles.modalInput}
              value={projectName}
              onChangeText={setProjectName}
              placeholder="例: 英検2級 単語帳"
              placeholderTextColor={colors.gray[400]}
              autoFocus
              selectTextOnFocus
            />
            <Button
              onPress={handleProjectNameConfirm}
              size="lg"
              style={styles.modalButton}
            >
              スキャンを開始
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[500],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  unlimitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  unlimitedText: {
    fontSize: 12,
    color: colors.emerald[600],
    fontWeight: '500',
  },
  scanRemaining: {
    fontSize: 12,
    color: colors.gray[400],
  },
  flagButton: {
    position: 'relative',
    padding: 4,
  },
  flagBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.orange[500],
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  flagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  settingsButton: {
    padding: 4,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.gray[300],
  },
  statValueActive: {
    color: colors.primary[600],
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray[400],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  projectList: {
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
  },
  modalCloseButton: {
    padding: 4,
    marginRight: -4,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.gray[500],
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.gray[900],
    marginBottom: 16,
  },
  modalButton: {
    width: '100%',
  },
});

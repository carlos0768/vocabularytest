import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
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
} from 'lucide-react-native';
import { ProjectCard, ScanButton } from '../components/project';
import { ProcessingModal } from '../components/ProcessingModal';
import { getRepository } from '../lib/db';
import { extractWordsFromImage } from '../lib/ai';
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

  const repository = getRepository('free');

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const userId = await getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Load word counts for each project
      const counts: Record<string, number> = {};
      let mastered = 0;
      for (const project of data) {
        const words = await repository.getWords(project.id);
        counts[project.id] = words.length;
        mastered += words.filter((w) => w.status === 'mastered').length;
      }
      setProjectWordCounts(counts);
      setTotalMastered(mastered);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repository]);

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
    // Check scan limit
    const currentScanInfo = await getDailyScanInfo();
    if (!currentScanInfo.canScan) {
      navigation.navigate('Subscription');
      return;
    }

    // Request camera permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'カメラの使用を許可してください。');
      return;
    }

    // Show action sheet
    Alert.alert(
      '画像を選択',
      'どちらから画像を取得しますか？',
      [
        {
          text: 'カメラで撮影',
          onPress: () => pickImage('camera'),
        },
        {
          text: 'ライブラリから選択',
          onPress: () => pickImage('library'),
        },
        {
          text: 'キャンセル',
          style: 'cancel',
        },
      ]
    );
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
        navigation.navigate('ScanConfirm', { words: result.words! });
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
          <Text style={styles.headerTitle}>ScanVocab</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.scanRemaining}>残り{scanInfo.remaining}回</Text>
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
            {accuracy}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanRemaining: {
    fontSize: 12,
    color: colors.gray[400],
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
});

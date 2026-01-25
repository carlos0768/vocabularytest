import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen,
  Orbit,
  Target,
  Trophy,
  Zap,
  X,
  Settings,
  Flag,
  Crown,
  Check,
  ChevronDown,
  Plus,
  Play,
  Layers,
  Edit2,
  Trash2,
  Save,
  Share2,
  Link2,
  Camera,
  CircleDot,
  Loader2,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { ScanButton } from '../components/project';
import { ProcessingModal } from '../components/ProcessingModal';
import { getRepository } from '../lib/db';
import { extractWordsFromImage } from '../lib/ai';
import { useAuth } from '../hooks/use-auth';
import { supabase } from '../lib/supabase';
import {
  getGuestUserId,
  getDailyScanInfo,
  incrementScanCount,
  getStreakDays,
  getDailyStats,
} from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Project, Word, ProgressStep } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SHARE_BASE_URL = 'https://scanvocab.vercel.app/share';

// Extraction modes
type ExtractMode = 'all' | 'circled';

// EIKEN levels
type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

const EIKEN_LEVELS: { value: EikenLevel; label: string }[] = [
  { value: null, label: 'フィルターなし' },
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

// Scan Mode Modal Component
function ScanModeModal({
  visible,
  onClose,
  onSelectMode,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectMode: (mode: ExtractMode, eikenLevel: EikenLevel) => void;
}) {
  const [selectedEiken, setSelectedEiken] = useState<EikenLevel>(null);
  const [showEikenPicker, setShowEikenPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedEiken(null);
      setShowEikenPicker(false);
    }
  }, [visible]);

  const selectedLabel = EIKEN_LEVELS.find(l => l.value === selectedEiken)?.label || 'フィルターなし';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.scanModeContent}>
          <Text style={styles.scanModeTitle}>抽出モードを選択</Text>
          <Text style={styles.scanModeSubtitle}>どのように単語を抽出しますか？</Text>

          {/* EIKEN Level Filter */}
          <View style={styles.eikenSection}>
            <Text style={styles.eikenLabel}>英検レベルでフィルター</Text>
            <TouchableOpacity
              style={styles.eikenSelector}
              onPress={() => setShowEikenPicker(!showEikenPicker)}
            >
              <Text style={selectedEiken ? styles.eikenValueSelected : styles.eikenValue}>
                {selectedLabel}
              </Text>
              <ChevronDown
                size={16}
                color={colors.gray[500]}
                style={showEikenPicker ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
            </TouchableOpacity>
            {showEikenPicker && (
              <View style={styles.eikenDropdown}>
                <ScrollView style={styles.eikenDropdownScroll} nestedScrollEnabled>
                  {EIKEN_LEVELS.map((level) => (
                    <TouchableOpacity
                      key={level.value || 'none'}
                      style={[
                        styles.eikenOption,
                        selectedEiken === level.value && styles.eikenOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedEiken(level.value);
                        setShowEikenPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.eikenOptionText,
                          selectedEiken === level.value && styles.eikenOptionTextSelected,
                        ]}
                      >
                        {level.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Mode buttons */}
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => onSelectMode('all', selectedEiken)}
            >
              <View style={[styles.modeIcon, { backgroundColor: colors.primary[100] }]}>
                <Camera size={24} color={colors.primary[600]} />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={styles.modeButtonTitle}>すべての単語を抽出</Text>
                <Text style={styles.modeButtonDesc}>写真内のすべての英単語を抽出します</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => onSelectMode('circled', selectedEiken)}
            >
              <View style={[styles.modeIcon, { backgroundColor: colors.purple[100] }]}>
                <CircleDot size={24} color={colors.purple[600]} />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={styles.modeButtonTitle}>丸をつけた単語だけ</Text>
                <Text style={styles.modeButtonDesc}>マークした単語だけを抽出します</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Project Selection Sheet Component
function ProjectSelectionSheet({
  visible,
  onClose,
  projects,
  currentProjectIndex,
  onSelectProject,
  onSelectFavorites,
  showFavoritesOnly,
  favoriteCount,
}: {
  visible: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectIndex: number;
  onSelectProject: (index: number) => void;
  onSelectFavorites: () => void;
  showFavoritesOnly: boolean;
  favoriteCount: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseButton}>
              <X size={24} color={colors.emerald[600]} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>学習コース選択</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
            {/* Favorites Section */}
            {favoriteCount > 0 && (
              <View style={styles.sheetSection}>
                <View style={styles.sheetSectionHeader}>
                  <Flag size={20} color={colors.orange[500]} />
                  <Text style={styles.sheetSectionTitle}>苦手な単語</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.sheetItem,
                    showFavoritesOnly && styles.sheetItemSelected,
                  ]}
                  onPress={() => {
                    onSelectFavorites();
                    onClose();
                  }}
                >
                  <View style={styles.sheetItemContent}>
                    <Text style={styles.sheetItemTitle}>苦手な単語を復習</Text>
                    <Text style={styles.sheetItemSubtitle}>{favoriteCount}語の苦手な単語</Text>
                  </View>
                  {showFavoritesOnly && (
                    <View style={styles.sheetItemCheck}>
                      <Check size={16} color={colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Projects Section */}
            <View style={styles.sheetSection}>
              <View style={styles.sheetSectionHeader}>
                <BookOpen size={20} color={colors.primary[500]} />
                <Text style={styles.sheetSectionTitle}>単語帳一覧</Text>
              </View>
              {projects.map((project, index) => {
                const isSelected = index === currentProjectIndex && !showFavoritesOnly;
                return (
                  <TouchableOpacity
                    key={project.id}
                    style={[
                      styles.sheetItem,
                      isSelected && styles.sheetItemSelected,
                    ]}
                    onPress={() => {
                      onSelectProject(index);
                      onClose();
                    }}
                  >
                    <View style={styles.sheetItemContent}>
                      <Text style={styles.sheetItemTitle}>{project.title}</Text>
                      <Text style={styles.sheetItemSubtitle}>
                        {new Date(project.createdAt).toLocaleDateString('ja-JP')}に作成
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.sheetItemCheck}>
                        <Check size={16} color={colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Word Item Component
function WordItem({
  word,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleFavorite,
}: {
  word: Word;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (isEditing) {
    return (
      <View style={styles.wordItemEditing}>
        <TextInput
          style={styles.editInputLarge}
          value={english}
          onChangeText={setEnglish}
          autoFocus
        />
        <TextInput
          style={styles.editInputSmall}
          value={japanese}
          onChangeText={setJapanese}
        />
        <View style={styles.editActions}>
          <Button
            variant="secondary"
            size="sm"
            onPress={onCancel}
            style={styles.editButton}
            icon={<X size={16} color={colors.gray[600]} />}
          >
            キャンセル
          </Button>
          <Button
            size="sm"
            onPress={() => onSave(english, japanese)}
            style={styles.editButton}
            icon={<Save size={16} color={colors.white} />}
          >
            保存
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wordItem}>
      <View style={styles.wordItemContent}>
        <View style={styles.wordItemHeader}>
          <Text style={styles.wordItemEnglish}>{word.english}</Text>
          {word.isFavorite && (
            <Flag size={14} color={colors.orange[500]} fill={colors.orange[500]} />
          )}
        </View>
        <Text style={styles.wordItemJapanese}>{word.japanese}</Text>
        {word.exampleSentence && (
          <View style={styles.exampleSection}>
            <Text style={styles.exampleSentence}>{word.exampleSentence}</Text>
            {word.exampleSentenceJa && (
              <Text style={styles.exampleSentenceJa}>{word.exampleSentenceJa}</Text>
            )}
          </View>
        )}
      </View>
      <View style={styles.wordItemActions}>
        <TouchableOpacity onPress={onToggleFavorite} style={styles.wordActionButton}>
          <Flag
            size={16}
            color={word.isFavorite ? colors.orange[500] : colors.gray[400]}
            fill={word.isFavorite ? colors.orange[500] : 'transparent'}
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} style={styles.wordActionButton}>
          <Edit2 size={16} color={colors.gray[500]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.wordActionButton}>
          <Trash2 size={16} color={colors.red[500]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isPro, isAuthenticated, loading: authLoading } = useAuth();

  // Projects & navigation
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Word editing
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Stats
  const [dailyStats, setDailyStats] = useState({ todayCount: 0, correctCount: 0, masteredCount: 0 });
  const [streakDays, setStreakDays] = useState(0);
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: 10, canScan: true });

  // Sharing
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Scan processing
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);

  // Modals
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [isAddingToExisting, setIsAddingToExisting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [pendingImageSource, setPendingImageSource] = useState<'camera' | 'library' | null>(null);
  const [selectedScanMode, setSelectedScanMode] = useState<ExtractMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);

  // Repository
  const repository = useMemo(
    () => getRepository(isAuthenticated ? 'active' : 'free'),
    [isAuthenticated]
  );

  // Current project
  const currentProject = projects[currentProjectIndex] || null;

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repository, isAuthenticated, user]);

  // Load words for current project
  const loadWords = useCallback(async () => {
    if (!currentProject) {
      setWords([]);
      return;
    }

    try {
      setWordsLoading(true);
      const wordsData = await repository.getWords(currentProject.id);
      setWords(wordsData);
    } catch (error) {
      console.error('Failed to load words:', error);
    } finally {
      setWordsLoading(false);
    }
  }, [currentProject, repository]);

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
    if (!authLoading) {
      loadProjects();
      loadStats();
    }
  }, [authLoading, loadProjects, loadStats]);

  // Load words when project changes
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProjects();
      loadWords();
      loadStats();
    });
    return unsubscribe;
  }, [navigation, loadProjects, loadWords, loadStats]);

  // Stats calculations
  const stats = {
    total: words.length,
    favorites: words.filter((w) => w.isFavorite).length,
    mastered: words.filter((w) => w.status === 'mastered').length,
  };

  const accuracy = dailyStats.todayCount > 0
    ? Math.round((dailyStats.correctCount / dailyStats.todayCount) * 100)
    : 0;

  const filteredWords = showFavoritesOnly
    ? words.filter((w) => w.isFavorite)
    : words;

  // Navigation
  const selectProject = (index: number) => {
    setCurrentProjectIndex(index);
    setShowFavoritesOnly(false);
  };

  // Word handlers
  const handleDeleteWord = (wordId: string) => {
    Alert.alert('削除の確認', 'この単語を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await repository.deleteWord(wordId);
          setWords((prev) => prev.filter((w) => w.id !== wordId));
        },
      },
    ]);
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w))
    );
    setEditingWordId(null);
  };

  const handleToggleFavorite = async (wordId: string) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w))
    );
  };

  // Project handlers
  const handleDeleteProject = () => {
    if (!currentProject) return;
    Alert.alert('削除の確認', 'この単語帳とすべての単語が削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await repository.deleteProject(currentProject.id);
          const newProjects = projects.filter((p) => p.id !== currentProject.id);
          setProjects(newProjects);
          if (currentProjectIndex >= newProjects.length && newProjects.length > 0) {
            setCurrentProjectIndex(newProjects.length - 1);
          }
        },
      },
    ]);
  };

  // Share handler
  const handleShare = async () => {
    if (!currentProject) return;

    if (!isAuthenticated) {
      Alert.alert('共有機能', '共有機能を使用するにはログインが必要です。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'ログイン', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }

    setSharing(true);
    try {
      let shareId = currentProject.shareId;

      if (!shareId) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        shareId = '';
        for (let i = 0; i < 12; i++) {
          shareId += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const { error } = await supabase
          .from('projects')
          .update({ share_id: shareId })
          .eq('id', currentProject.id);

        if (error) throw error;

        setProjects((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, shareId } : p))
        );
      }

      const shareUrl = `${SHARE_BASE_URL}/${shareId}`;
      await Share.share({
        message: `「${currentProject.title}」の単語帳を共有します\n${shareUrl}`,
        url: shareUrl,
      });

      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to share:', error);
      Alert.alert('エラー', '共有リンクの生成に失敗しました');
    } finally {
      setSharing(false);
    }
  };

  // Scan handlers
  const handleScanButtonClick = (addToExisting: boolean = false) => {
    setIsAddingToExisting(addToExisting);
    setShowScanModeModal(true);
  };

  const handleScanModeSelect = async (mode: ExtractMode, eikenLevel: EikenLevel) => {
    setSelectedScanMode(mode);
    setSelectedEikenLevel(eikenLevel);
    setShowScanModeModal(false);

    // Check scan limit
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

    // If adding to existing project, go directly to image picker
    if (addToExisting && currentProject) {
      Alert.alert('画像を選択', 'どちらから画像を取得しますか？', [
        {
          text: 'カメラで撮影',
          onPress: () => pickImage('camera', true),
        },
        {
          text: 'ライブラリから選択',
          onPress: () => pickImage('library', true),
        },
        { text: 'キャンセル', style: 'cancel' },
      ]);
    } else {
      // New project - show name modal first
      const now = new Date();
      const defaultTitle = `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      setProjectName(defaultTitle);

      Alert.alert('画像を選択', 'どちらから画像を取得しますか？', [
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
        { text: 'キャンセル', style: 'cancel' },
      ]);
    }
  };

  const handleProjectNameConfirm = () => {
    if (!projectName.trim()) {
      Alert.alert('エラー', 'プロジェクト名を入力してください');
      return;
    }
    const source = pendingImageSource;
    setShowProjectNameModal(false);
    setPendingImageSource(null);

    if (source) {
      setTimeout(() => pickImage(source, false), 300);
    }
  };

  const pickImage = async (source: 'camera' | 'library', addToExisting: boolean) => {
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

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('エラー', '画像の読み込みに失敗しました。');
        return;
      }

      await processImage(asset.base64, addToExisting);
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('エラー', '画像の選択に失敗しました。');
    }
  };

  const processImage = async (base64: string, addToExisting: boolean) => {
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
          s.id === 'upload' ? { ...s, status: 'complete' } :
          s.id === 'analyze' ? { ...s, status: 'active' } : s
        )
      );

      const result = await extractWordsFromImage(imageDataUrl, {
        mode: selectedScanMode,
        eikenLevel: selectedEikenLevel,
        isPro,
      });

      if (!result.success) throw new Error(result.error);

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'analyze' ? { ...s, status: 'complete' } :
          s.id === 'generate' ? { ...s, status: 'active' } : s
        )
      );

      await new Promise((r) => setTimeout(r, 500));

      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === 'generate' ? { ...s, status: 'complete' } : s))
      );

      await incrementScanCount();
      setScanInfo(await getDailyScanInfo());

      setTimeout(() => {
        setProcessing(false);
        setProcessingSteps([]);
        navigation.navigate('ScanConfirm', {
          words: result.words!,
          projectName: addToExisting ? currentProject?.title : projectName.trim(),
          projectId: addToExisting ? currentProject?.id : undefined,
        });
      }, 300);
    } catch (error) {
      console.error('Scan error:', error);
      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: error instanceof Error ? error.message : '予期しないエラー' }
            : s
        )
      );
    }
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProjects();
    loadWords();
    loadStats();
  }, [loadProjects, loadWords, loadStats]);

  // Loading state
  if (loading || authLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  // Empty state - no projects
  if (projects.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
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
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Settings size={20} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <BookOpen size={28} color={colors.gray[400]} />
          </View>
          <Text style={styles.emptyTitle}>単語帳がありません</Text>
          <Text style={styles.emptyText}>
            右下のボタンから{'\n'}ノートやプリントを撮影しましょう
          </Text>
        </View>

        <ScanButton onPress={() => handleScanButtonClick()} disabled={processing} />

        <ScanModeModal
          visible={showScanModeModal}
          onClose={() => setShowScanModeModal(false)}
          onSelectMode={handleScanModeSelect}
        />

        <ProcessingModal
          visible={processing}
          steps={processingSteps}
          onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
        />

        {/* Project name modal */}
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
                <Text style={styles.modalTitle}>単語帳の名前</Text>
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
              <TextInput
                style={styles.modalInput}
                value={projectName}
                onChangeText={setProjectName}
                placeholder="例: 英検2級 単語帳"
                placeholderTextColor={colors.gray[400]}
                autoFocus
                selectTextOnFocus
              />
              <Button onPress={handleProjectNameConfirm} size="lg" style={styles.modalButton}>
                次へ
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    );
  }

  // Main view with project
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.projectSelector}
          onPress={() => setIsProjectDropdownOpen(true)}
        >
          <Text style={styles.projectTitle} numberOfLines={1}>
            {showFavoritesOnly ? '苦手な単語' : currentProject?.title}
          </Text>
          <ChevronDown size={16} color={colors.gray[500]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.newProjectButton}
          onPress={() => handleScanButtonClick()}
        >
          <Plus size={20} color={colors.white} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {isAuthenticated && (
            <TouchableOpacity onPress={handleShare} disabled={sharing} style={styles.headerButton}>
              {sharing ? (
                <ActivityIndicator size="small" color={colors.gray[400]} />
              ) : shareCopied ? (
                <Check size={20} color={colors.emerald[600]} />
              ) : currentProject?.shareId ? (
                <Link2 size={20} color={colors.primary[600]} />
              ) : (
                <Share2 size={20} color={colors.gray[400]} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleDeleteProject} style={styles.headerButton}>
            <Trash2 size={20} color={colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.headerButton}
          >
            <Settings size={20} color={colors.gray[500]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Orbit size={20} color={colors.primary[500]} />
          <Text style={[styles.statValue, dailyStats.todayCount > 0 && styles.statValueActive]}>
            {dailyStats.todayCount}
          </Text>
          <Text style={styles.statLabel}>今日</Text>
        </View>
        <View style={styles.statItem}>
          <Target size={20} color={colors.emerald[500]} />
          <Text style={[styles.statValue, accuracy > 0 && { color: colors.emerald[600] }]}>
            {accuracy}%
          </Text>
          <Text style={styles.statLabel}>正答率</Text>
        </View>
        <View style={styles.statItem}>
          <Trophy size={20} color={colors.purple[500]} />
          <Text style={[styles.statValue, stats.mastered > 0 && { color: colors.purple[600] }]}>
            {stats.mastered}
          </Text>
          <Text style={styles.statLabel}>習得</Text>
        </View>
        <View style={styles.statItem}>
          <Zap size={20} color={colors.amber[500]} />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Word list header */}
        <View style={styles.wordListHeader}>
          <Text style={styles.wordListTitle}>
            {showFavoritesOnly ? `苦手 (${stats.favorites}語)` : `単語一覧 (${stats.total}語)`}
          </Text>
          <View style={styles.wordListActions}>
            {stats.favorites > 0 && (
              <TouchableOpacity
                onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
                style={[
                  styles.filterButton,
                  showFavoritesOnly && styles.filterButtonActive,
                ]}
              >
                <Flag
                  size={14}
                  color={showFavoritesOnly ? colors.orange[600] : colors.gray[500]}
                  fill={showFavoritesOnly ? colors.orange[500] : 'transparent'}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    showFavoritesOnly && styles.filterButtonTextActive,
                  ]}
                >
                  苦手 {stats.favorites}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleScanButtonClick(true)}
              style={styles.addButton}
            >
              <Plus size={14} color={colors.primary[700]} />
              <Text style={styles.addButtonText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Word list */}
        {wordsLoading ? (
          <View style={styles.wordsLoading}>
            <ActivityIndicator size="small" color={colors.gray[400]} />
          </View>
        ) : filteredWords.length === 0 ? (
          <Text style={styles.emptyWordsText}>
            {showFavoritesOnly ? '苦手な単語がありません' : '単語がありません'}
          </Text>
        ) : (
          <View style={styles.wordList}>
            {filteredWords.map((word) => (
              <WordItem
                key={`${word.id}:${word.english}:${word.japanese}`}
                word={word}
                isEditing={editingWordId === word.id}
                onEdit={() => setEditingWordId(word.id)}
                onCancel={() => setEditingWordId(null)}
                onSave={(english, japanese) => handleUpdateWord(word.id, english, japanese)}
                onDelete={() => handleDeleteWord(word.id)}
                onToggleFavorite={() => handleToggleFavorite(word.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom action buttons */}
      {stats.total > 0 && (
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Quiz', { projectId: currentProject!.id })}
          >
            <Play size={20} color={colors.white} fill={colors.white} />
            <Text style={styles.actionButtonText}>クイズ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => navigation.navigate('Flashcard', { projectId: currentProject!.id })}
          >
            <Layers size={20} color={colors.primary[600]} />
            <Text style={styles.actionButtonTextSecondary}>カード</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modals */}
      <ProjectSelectionSheet
        visible={isProjectDropdownOpen}
        onClose={() => setIsProjectDropdownOpen(false)}
        projects={projects}
        currentProjectIndex={currentProjectIndex}
        onSelectProject={selectProject}
        onSelectFavorites={() => setShowFavoritesOnly(true)}
        showFavoritesOnly={showFavoritesOnly}
        favoriteCount={stats.favorites}
      />

      <ScanModeModal
        visible={showScanModeModal}
        onClose={() => setShowScanModeModal(false)}
        onSelectMode={handleScanModeSelect}
      />

      <ProcessingModal
        visible={processing}
        steps={processingSteps}
        onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
      />

      {/* Project name modal */}
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
              <Text style={styles.modalTitle}>単語帳の名前</Text>
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
            <TextInput
              style={styles.modalInput}
              value={projectName}
              onChangeText={setProjectName}
              placeholder="例: 英検2級 単語帳"
              placeholderTextColor={colors.gray[400]}
              autoFocus
              selectTextOnFocus
            />
            <Button onPress={handleProjectNameConfirm} size="lg" style={styles.modalButton}>
              次へ
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
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
  projectSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 8,
  },
  projectTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
  },
  newProjectButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerButton: {
    padding: 8,
  },
  settingsButton: {
    padding: 4,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: colors.white,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
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

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 120,
  },

  // Word list header
  wordListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  wordListTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
  },
  wordListActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
  },
  filterButtonActive: {
    backgroundColor: colors.orange[100],
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray[600],
  },
  filterButtonTextActive: {
    color: colors.orange[700],
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.primary[100],
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary[700],
  },

  // Word list
  wordList: {
    gap: 8,
  },
  wordsLoading: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyWordsText: {
    textAlign: 'center',
    color: colors.gray[500],
    paddingVertical: 32,
  },

  // Word item
  wordItem: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 16,
    flexDirection: 'row',
  },
  wordItemContent: {
    flex: 1,
  },
  wordItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordItemEnglish: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
  },
  wordItemJapanese: {
    fontSize: 14,
    color: colors.gray[500],
    marginTop: 4,
  },
  exampleSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  exampleSentence: {
    fontSize: 13,
    color: colors.gray[700],
    fontStyle: 'italic',
  },
  exampleSentenceJa: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 2,
  },
  wordItemActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginLeft: 8,
  },
  wordActionButton: {
    padding: 6,
    borderRadius: 6,
  },
  wordItemEditing: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary[500],
    padding: 16,
    gap: 12,
  },
  editInputLarge: {
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: colors.gray[900],
  },
  editInputSmall: {
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.gray[900],
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
  },

  // Bottom actions
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    backgroundColor: colors.white,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  actionButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[600],
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
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

  // Modal
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
    marginBottom: 16,
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

  // Scan mode modal
  scanModeContent: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  scanModeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
    textAlign: 'center',
    marginBottom: 4,
  },
  scanModeSubtitle: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    marginBottom: 16,
  },
  eikenSection: {
    marginBottom: 16,
  },
  eikenLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: 8,
  },
  eikenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  eikenValue: {
    fontSize: 16,
    color: colors.gray[500],
  },
  eikenValueSelected: {
    fontSize: 16,
    color: colors.gray[900],
  },
  eikenDropdown: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  eikenDropdownScroll: {
    maxHeight: 200,
  },
  eikenOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  eikenOptionSelected: {
    backgroundColor: colors.primary[50],
  },
  eikenOptionText: {
    fontSize: 16,
    color: colors.gray[700],
  },
  eikenOptionTextSelected: {
    color: colors.primary[600],
  },
  modeButtons: {
    gap: 12,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTextContainer: {
    flex: 1,
  },
  modeButtonTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray[900],
  },
  modeButtonDesc: {
    fontSize: 13,
    color: colors.gray[500],
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[700],
  },

  // Project selection sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.gray[50],
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  sheetCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sheetSection: {
    marginBottom: 24,
  },
  sheetSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[700],
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray[200],
    marginBottom: 8,
  },
  sheetItemSelected: {
    borderColor: colors.emerald[500],
  },
  sheetItemContent: {
    flex: 1,
  },
  sheetItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray[900],
  },
  sheetItemSubtitle: {
    fontSize: 13,
    color: colors.gray[500],
    marginTop: 2,
  },
  sheetItemCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.emerald[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});

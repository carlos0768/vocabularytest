import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Play,
  X,
  Save,
  Flag,
  Link2,
  Share2,
  Check,
  Layers,
  Plus,
  Edit2,
  Trash2,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { ProcessingModal } from '../components/ProcessingModal';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { supabase } from '../lib/supabase';
import { extractWordsFromImage } from '../lib/ai';
import { getDailyScanInfo, incrementScanCount } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Project, Word, ProgressStep } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Project'>;

const SHARE_BASE_URL = 'https://vocabularytest-omega.vercel.app/share';

export function ProjectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const projectId = route.params.projectId;
  const { user, subscription, isPro, isAuthenticated, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(subscription?.status || 'free');

  const loadData = useCallback(async () => {
    // Wait for auth to be ready before loading data
    if (authLoading) return;

    try {
      console.log('Loading project:', projectId, 'isAuthenticated:', isAuthenticated);
      const [projectData, wordsData] = await Promise.all([
        repository.getProject(projectId),
        repository.getWords(projectId),
      ]);

      console.log('Project data:', projectData);

      if (!projectData) {
        console.log('Project not found, going back');
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
        return;
      }

      setProject(projectData);
      setWords(wordsData);
    } catch (error) {
      console.error('Failed to load project:', error);
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, repository, navigation, authLoading, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [loadData, authLoading]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

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

  const handleUpdateWord = async (
    wordId: string,
    english: string,
    japanese: string
  ) => {
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
      prev.map((w) =>
        w.id === wordId ? { ...w, isFavorite: newFavorite } : w
      )
    );
  };

  const generateShareId = async (): Promise<string> => {
    // Generate a random 12-character alphanumeric string
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let shareId = '';
    for (let i = 0; i < 12; i++) {
      shareId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return shareId;
  };

  const handleShare = async () => {
    if (!project) return;

    // Check if user is authenticated (Pro feature)
    if (!isAuthenticated) {
      Alert.alert(
        '共有機能',
        '共有機能を使用するにはログインが必要です。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'ログイン', onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }

    setSharing(true);
    try {
      let shareId = project.shareId;

      // Generate share ID if not exists
      if (!shareId) {
        shareId = await generateShareId();

        // Update project in Supabase
        const { error } = await supabase
          .from('projects')
          .update({ share_id: shareId })
          .eq('id', project.id);

        if (error) {
          throw new Error(`Failed to generate share ID: ${error.message}`);
        }

        setProject((prev) => prev ? { ...prev, shareId } : null);
      }

      // Share URL
      const shareUrl = `${SHARE_BASE_URL}/${shareId}`;

      const result = await Share.share({
        message: `「${project.title}」の単語帳を共有します\n${shareUrl}`,
        url: shareUrl,
        title: project.title,
      });

      if (result.action === Share.sharedAction) {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (error) {
      console.error('Failed to share:', error);
      Alert.alert('エラー', '共有リンクの生成に失敗しました');
    } finally {
      setSharing(false);
    }
  };

  const handleStartQuiz = () => {
    navigation.navigate('Quiz', { projectId });
  };

  const handleStartFlashcard = () => {
    navigation.navigate('Flashcard', { projectId });
  };

  // Stats for favorites
  const stats = {
    total: words.length,
    favorites: words.filter((w) => w.isFavorite).length,
  };

  const filteredWords = showFavoritesOnly
    ? words.filter((w) => w.isFavorite)
    : words;

  const handleAddWords = async () => {
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

    // Show action sheet to select source
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

      // Navigate to confirm screen with existing project ID
      setTimeout(() => {
        setProcessing(false);
        setProcessingSteps([]);
        navigation.navigate('ScanConfirm', {
          words: result.words!,
          projectName: project?.title,
          projectId: projectId,
        });
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

  const handleCloseProcessingModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  if (!project) {
    return null;
  }

  // Determine share icon based on state
  const renderShareIcon = () => {
    if (sharing) {
      return <ActivityIndicator size="small" color={colors.gray[500]} />;
    }
    if (shareCopied) {
      return <Check size={20} color={colors.emerald[600]} />;
    }
    if (project.shareId) {
      return <Link2 size={20} color={colors.primary[500]} />;
    }
    return <Share2 size={20} color={colors.gray[500]} />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {project.title}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleAddWords}
            style={styles.addButton}
            disabled={processing}
          >
            <Plus size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.shareButton}
            disabled={sharing}
          >
            {renderShareIcon()}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Word list header */}
        <View style={styles.wordListHeader}>
          <Text style={styles.wordListTitle}>
            {showFavoritesOnly ? `苦手 (${stats.favorites}語)` : `単語一覧 (${stats.total}語)`}
          </Text>
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
        </View>

        {/* Word list */}
        <View style={styles.wordList}>
          {filteredWords.map((word) => (
            <WordItem
              key={`${word.id}:${word.english}:${word.japanese}`}
              word={word}
              isEditing={editingWordId === word.id}
              onEdit={() => setEditingWordId(word.id)}
              onCancel={() => setEditingWordId(null)}
              onSave={(english, japanese) =>
                handleUpdateWord(word.id, english, japanese)
              }
              onDelete={() => handleDeleteWord(word.id)}
              onToggleFavorite={() => handleToggleFavorite(word.id)}
            />
          ))}
        </View>

        {words.length === 0 && (
          <Text style={styles.emptyText}>単語がありません</Text>
        )}
      </ScrollView>

      {/* Bottom action buttons */}
      {words.length > 0 && (
        <View style={styles.bottomActions}>
          {showFavoritesOnly && stats.favorites > 0 ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonOrange]}
                onPress={() => navigation.navigate('FavoritesQuiz')}
              >
                <Play
                  size={20}
                  color={colors.white}
                  fill={colors.white}
                />
                <Text style={styles.actionButtonText}>苦手クイズ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonOrangeSecondary]}
                onPress={() => navigation.navigate('FavoritesFlashcard')}
              >
                <Layers size={20} color={colors.orange[600]} />
                <Text style={styles.actionButtonTextOrange}>苦手カード</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleStartQuiz}
              >
                <Play
                  size={20}
                  color={colors.white}
                  fill={colors.white}
                />
                <Text style={styles.actionButtonText}>クイズ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonTertiary]}
                onPress={handleStartFlashcard}
              >
                <Layers size={20} color={colors.primary[600]} />
                <Text style={styles.actionButtonTextTertiary}>カード</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Processing modal */}
      <ProcessingModal
        visible={processing}
        steps={processingSteps}
        onClose={
          processingSteps.some((s) => s.status === 'error')
            ? handleCloseProcessingModal
            : undefined
        }
      />
    </SafeAreaView>
  );
}

// Word item component
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
        {/* Example sentence (Pro feature) */}
        {word.exampleSentence && (
          <View style={styles.exampleSection}>
            <Text style={styles.exampleSentence}>{word.exampleSentence}</Text>
            {word.exampleSentenceJa && (
              <Text style={styles.exampleSentenceJa}>{word.exampleSentenceJa}</Text>
            )}
          </View>
        )}
      </View>
      {/* Action buttons */}
      <View style={styles.wordItemActions}>
        <TouchableOpacity
          onPress={onToggleFavorite}
          style={styles.wordActionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Flag
            size={16}
            color={word.isFavorite ? colors.orange[500] : colors.gray[400]}
            fill={word.isFavorite ? colors.orange[500] : 'transparent'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onEdit}
          style={styles.wordActionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Edit2 size={16} color={colors.gray[500]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.wordActionButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={16} color={colors.red[500]} />
        </TouchableOpacity>
      </View>
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButton: {
    padding: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButton: {
    padding: 6,
    marginRight: -6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
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
  wordList: {
    gap: 8,
  },
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
  wordItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordItemEnglish: {
    fontSize: 16,
    fontWeight: '500',
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
  emptyText: {
    textAlign: 'center',
    color: colors.gray[500],
    paddingVertical: 32,
  },
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
    backgroundColor: colors.gray[100],
  },
  actionButtonTertiary: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  actionButtonOrange: {
    backgroundColor: colors.orange[500],
  },
  actionButtonOrangeSecondary: {
    backgroundColor: colors.orange[50],
    borderWidth: 1,
    borderColor: colors.orange[200],
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  actionButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[700],
  },
  actionButtonTextTertiary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[600],
  },
  actionButtonTextOrange: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.orange[600],
  },
});

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Play,
  BookOpen,
  CheckCircle,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  Save,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { getRepository } from '../lib/db';
import colors from '../constants/colors';
import type { RootStackParamList, Project, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Project'>;

export function ProjectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const projectId = route.params.projectId;

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const repository = getRepository('free');

  const loadData = useCallback(async () => {
    try {
      const [projectData, wordsData] = await Promise.all([
        repository.getProject(projectId),
        repository.getWords(projectId),
      ]);

      if (!projectData) {
        navigation.goBack();
        return;
      }

      setProject(projectData);
      setWords(wordsData);
    } catch (error) {
      console.error('Failed to load project:', error);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [projectId, repository, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const stats = {
    total: words.length,
    new: words.filter((w) => w.status === 'new').length,
    review: words.filter((w) => w.status === 'review').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
  };

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Stats cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardNew]}>
            <BookOpen size={16} color={colors.primary[600]} />
            <Text style={[styles.statValue, styles.statValueNew]}>
              {stats.new}
            </Text>
            <Text style={[styles.statLabel, styles.statLabelNew]}>新規</Text>
          </View>
          <View style={[styles.statCard, styles.statCardReview]}>
            <RefreshCw size={16} color={colors.yellow[600]} />
            <Text style={[styles.statValue, styles.statValueReview]}>
              {stats.review}
            </Text>
            <Text style={[styles.statLabel, styles.statLabelReview]}>
              復習中
            </Text>
          </View>
          <View style={[styles.statCard, styles.statCardMastered]}>
            <CheckCircle size={16} color={colors.emerald[600]} />
            <Text style={[styles.statValue, styles.statValueMastered]}>
              {stats.mastered}
            </Text>
            <Text style={[styles.statLabel, styles.statLabelMastered]}>
              習得済み
            </Text>
          </View>
        </View>

        {/* Start quiz button */}
        {words.length > 0 && (
          <Button
            onPress={() => navigation.navigate('Quiz', { projectId })}
            size="lg"
            style={styles.quizButton}
            icon={<Play size={20} color={colors.white} />}
          >
            クイズを始める
          </Button>
        )}

        {/* Word list header */}
        <View style={styles.wordListHeader}>
          <Text style={styles.wordListTitle}>単語一覧 ({stats.total}語)</Text>
        </View>

        {/* Word list */}
        <View style={styles.wordList}>
          {words.map((word) => (
            <WordItem
              key={word.id}
              word={word}
              isEditing={editingWordId === word.id}
              onEdit={() => setEditingWordId(word.id)}
              onCancel={() => setEditingWordId(null)}
              onSave={(english, japanese) =>
                handleUpdateWord(word.id, english, japanese)
              }
              onDelete={() => handleDeleteWord(word.id)}
            />
          ))}
        </View>

        {words.length === 0 && (
          <Text style={styles.emptyText}>単語がありません</Text>
        )}
      </ScrollView>
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
}: {
  word: Word;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  useEffect(() => {
    setEnglish(word.english);
    setJapanese(word.japanese);
  }, [word.english, word.japanese]);

  const statusColors = {
    new: {
      bg: colors.primary[100],
      text: colors.primary[700],
    },
    review: {
      bg: colors.yellow[100],
      text: colors.yellow[700],
    },
    mastered: {
      bg: colors.emerald[100],
      text: colors.emerald[700],
    },
  };

  const statusLabels = {
    new: '新規',
    review: '復習中',
    mastered: '習得済み',
  };

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
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColors[word.status].bg },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: statusColors[word.status].text },
              ]}
            >
              {statusLabels[word.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.wordItemJapanese}>{word.japanese}</Text>
      </View>
      <View style={styles.wordItemActions}>
        <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
          <Edit2 size={16} color={colors.gray[500]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 4,
  },
  statCardNew: {
    backgroundColor: colors.primary[50],
  },
  statCardReview: {
    backgroundColor: colors.yellow[50],
  },
  statCardMastered: {
    backgroundColor: colors.emerald[50],
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statValueNew: {
    color: colors.primary[700],
  },
  statValueReview: {
    color: colors.yellow[700],
  },
  statValueMastered: {
    color: colors.emerald[700],
  },
  statLabel: {
    fontSize: 12,
  },
  statLabelNew: {
    color: colors.primary[600],
  },
  statLabelReview: {
    color: colors.yellow[600],
  },
  statLabelMastered: {
    color: colors.emerald[600],
  },
  quizButton: {
    marginBottom: 24,
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
    color: colors.gray[600],
    marginTop: 4,
  },
  wordItemActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  actionButton: {
    padding: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
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
});

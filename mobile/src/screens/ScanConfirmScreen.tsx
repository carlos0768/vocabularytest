import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Check, Trash2, Edit2, X, Save } from 'lucide-react-native';
import { Button } from '../components/ui';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { getGuestUserId } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, AIWordExtraction } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'ScanConfirm'>;

interface EditableWord extends AIWordExtraction {
  tempId: string;
  isEditing: boolean;
}

export function ScanConfirmScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { user, isAuthenticated } = useAuth();
  const initialWords = route.params?.words || [];
  const initialProjectName = route.params?.projectName;
  const existingProjectId = route.params?.projectId;

  // Check if we are adding words to an existing project
  const isAddingToExisting = !!existingProjectId;

  const [words, setWords] = useState<EditableWord[]>(
    initialWords.map((w, i) => ({
      ...w,
      tempId: `word-${i}`,
      isEditing: false,
    }))
  );

  // Use passed project name or generate default title
  const now = new Date();
  const defaultTitle = initialProjectName || `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [projectTitle, setProjectTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(isAuthenticated ? 'active' : 'free');

  const handleDeleteWord = (tempId: string) => {
    setWords((prev) => prev.filter((w) => w.tempId !== tempId));
  };

  const handleEditWord = (tempId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId ? { ...w, isEditing: true } : w
      )
    );
  };

  const handleSaveWord = (tempId: string, english: string, japanese: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId
          ? { ...w, english, japanese, isEditing: false }
          : w
      )
    );
  };

  const handleCancelEdit = (tempId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId ? { ...w, isEditing: false } : w
      )
    );
  };

  const handleSaveProject = async () => {
    if (words.length === 0) {
      Alert.alert('エラー', '保存する単語がありません');
      return;
    }

    if (!isAddingToExisting && !projectTitle.trim()) {
      Alert.alert('エラー', 'プロジェクト名を入力してください');
      return;
    }

    setSaving(true);
    try {
      let targetProjectId: string;

      if (isAddingToExisting) {
        // Add words to existing project
        targetProjectId = existingProjectId!;
      } else {
        // Use authenticated user ID if logged in, otherwise use guest ID
        const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();

        // Create new project
        const project = await repository.createProject({
          userId,
          title: projectTitle.trim(),
        });
        targetProjectId = project.id;
      }

      // Add words to project
      await repository.createWords(
        words.map((w) => ({
          projectId: targetProjectId,
          english: w.english,
          japanese: w.japanese,
          distractors: w.distractors,
          exampleSentence: w.exampleSentence,
          exampleSentenceJa: w.exampleSentenceJa,
        }))
      );

      // Navigate to project page
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          { name: 'Project', params: { projectId: targetProjectId } },
        ],
      });
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('エラー', '保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

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
        <Text style={styles.headerTitle}>
          {isAddingToExisting ? '単語を追加' : '確認・編集'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Project title input - only show for new projects */}
          {!isAddingToExisting && (
            <View style={styles.titleSection}>
              <Text style={styles.label}>プロジェクト名</Text>
              <TextInput
                style={styles.titleInput}
                value={projectTitle}
                onChangeText={setProjectTitle}
                placeholder="例: ノート P21-23"
                placeholderTextColor={colors.gray[400]}
              />
            </View>
          )}

          {/* Info text for adding to existing project */}
          {isAddingToExisting && (
            <View style={styles.addingInfo}>
              <Text style={styles.addingInfoText}>
                「{initialProjectName}」に単語を追加します
              </Text>
            </View>
          )}

          {/* Word count */}
          <View style={styles.wordCountRow}>
            <Text style={styles.wordCountLabel}>
              {isAddingToExisting ? '追加する単語' : '抽出された単語'}{' '}
              <Text style={styles.wordCountValue}>({words.length}語)</Text>
            </Text>
          </View>

          {/* Word list */}
          <View style={styles.wordList}>
            {words.map((word) => (
              <WordCard
                key={word.tempId}
                word={word}
                onDelete={() => handleDeleteWord(word.tempId)}
                onEdit={() => handleEditWord(word.tempId)}
                onSave={(english, japanese) =>
                  handleSaveWord(word.tempId, english, japanese)
                }
                onCancel={() => handleCancelEdit(word.tempId)}
              />
            ))}
          </View>

          {words.length === 0 && (
            <Text style={styles.emptyText}>
              単語がありません。戻って再度スキャンしてください。
            </Text>
          )}
        </ScrollView>

        {/* Bottom action bar */}
        <View style={styles.bottomBar}>
          <Button
            onPress={handleSaveProject}
            disabled={saving || words.length === 0}
            loading={saving}
            size="lg"
            style={styles.saveButton}
            icon={<Check size={20} color={colors.white} />}
          >
            {isAddingToExisting ? `${words.length}語を追加` : '保存して学習を始める'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Word card component
function WordCard({
  word,
  onDelete,
  onEdit,
  onSave,
  onCancel,
}: {
  word: EditableWord;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (english: string, japanese: string) => void;
  onCancel: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (word.isEditing) {
    return (
      <View style={styles.wordCardEditing}>
        <View style={styles.editField}>
          <Text style={styles.editLabel}>英単語</Text>
          <TextInput
            style={styles.editInput}
            value={english}
            onChangeText={setEnglish}
            autoFocus
          />
        </View>
        <View style={styles.editField}>
          <Text style={styles.editLabel}>日本語訳</Text>
          <TextInput
            style={styles.editInput}
            value={japanese}
            onChangeText={setJapanese}
          />
        </View>
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
    <View style={styles.wordCard}>
      <View style={styles.wordContent}>
        <Text style={styles.wordEnglish}>{word.english}</Text>
        <Text style={styles.wordJapanese}>{word.japanese}</Text>
        <View style={styles.distractors}>
          {word.distractors.map((d, i) => (
            <View key={i} style={styles.distractorTag}>
              <Text style={styles.distractorText}>{d}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.wordActions}>
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
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 120,
  },
  titleSection: {
    marginBottom: 24,
  },
  addingInfo: {
    backgroundColor: colors.primary[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  addingInfoText: {
    fontSize: 14,
    color: colors.primary[700],
    textAlign: 'center',
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[700],
    marginBottom: 6,
  },
  titleInput: {
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.gray[900],
  },
  wordCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  wordCountLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray[500],
  },
  wordCountValue: {
    color: colors.primary[600],
  },
  wordList: {
    gap: 12,
  },
  wordCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
  },
  wordContent: {
    flex: 1,
  },
  wordEnglish: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
  },
  wordJapanese: {
    fontSize: 14,
    color: colors.gray[500],
    marginTop: 4,
  },
  distractors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  distractorTag: {
    backgroundColor: colors.gray[200],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  distractorText: {
    fontSize: 12,
    color: colors.gray[500],
  },
  wordActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  actionButton: {
    padding: 6,
  },
  wordCardEditing: {
    backgroundColor: colors.primary[50],
    borderRadius: 12,
    padding: 16,
  },
  editField: {
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.gray[500],
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
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
    color: colors.gray[400],
    fontSize: 14,
    paddingVertical: 32,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  saveButton: {
    width: '100%',
  },
});

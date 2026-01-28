import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Trash2,
  Play,
  AlertCircle,
  X,
} from 'lucide-react-native';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';
import { getWrongAnswers, removeWrongAnswer, clearAllWrongAnswers, WrongAnswer } from '../lib/utils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function WrongAnswersScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWrongAnswers = useCallback(async () => {
    try {
      const answers = await getWrongAnswers();
      // Sort by wrongCount descending
      answers.sort((a, b) => b.wrongCount - a.wrongCount);
      setWrongAnswers(answers);
    } catch (error) {
      console.error('Failed to load wrong answers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWrongAnswers();
    }, [loadWrongAnswers])
  );

  const handleRemove = async (wordId: string) => {
    Alert.alert(
      '削除の確認',
      'この単語を苦手リストから削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await removeWrongAnswer(wordId);
            setWrongAnswers(prev => prev.filter(w => w.wordId !== wordId));
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'すべて削除',
      'すべての苦手な単語を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'すべて削除',
          style: 'destructive',
          onPress: async () => {
            await clearAllWrongAnswers();
            setWrongAnswers([]);
          },
        },
      ]
    );
  };

  const handleStartQuiz = () => {
    if (wrongAnswers.length === 0) {
      Alert.alert('エラー', '苦手な単語がありません');
      return;
    }
    // Navigate to wrong answers quiz
    navigation.navigate('WrongAnswersQuiz');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
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
        <Text style={styles.headerTitle}>苦手な単語</Text>
        {wrongAnswers.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
            <Trash2 size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {wrongAnswers.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <AlertCircle size={40} color={colors.gray[400]} />
          </View>
          <Text style={styles.emptyTitle}>苦手な単語がありません</Text>
          <Text style={styles.emptyText}>
            クイズで間違えた単語がここに表示されます
          </Text>
        </View>
      ) : (
        <>
          {/* Stats */}
          <View style={styles.statsBar}>
            <Text style={styles.statsText}>
              {wrongAnswers.length}語の苦手な単語
            </Text>
            <TouchableOpacity
              style={styles.quizButton}
              onPress={handleStartQuiz}
            >
              <Play size={16} color={colors.white} />
              <Text style={styles.quizButtonText}>復習クイズ</Text>
            </TouchableOpacity>
          </View>

          {/* Word List */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
          >
            {wrongAnswers.map((item) => (
              <View key={item.wordId} style={styles.wordCard}>
                <View style={styles.wordContent}>
                  <View style={styles.wordHeader}>
                    <Text style={styles.wordEnglish}>{item.english}</Text>
                    <View style={styles.wrongCountBadge}>
                      <Text style={styles.wrongCountText}>
                        {item.wrongCount}回
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.wordJapanese}>{item.japanese}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemove(item.wordId)}
                  style={styles.removeButton}
                >
                  <X size={18} color={colors.gray[400]} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
  },
  clearButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.gray[50],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  statsText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  quizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.red[500],
    borderRadius: 20,
  },
  quizButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  wordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginBottom: 12,
  },
  wordContent: {
    flex: 1,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordEnglish: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
  },
  wrongCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.red[100],
    borderRadius: 10,
  },
  wrongCountText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.red[700],
  },
  wordJapanese: {
    fontSize: 14,
    color: colors.gray[500],
    marginTop: 4,
  },
  removeButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
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
  },
});

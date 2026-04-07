import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Pencil, Volume2, Bookmark } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import theme from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { VocabularyTypeBadge } from '../components/project/VocabularyTypeBadge';
import type { HomeStackParamList, Word, VocabularyType } from '../types';

const POS_JA: Record<string, string> = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
  preposition: '前置詞', conjunction: '接続詞', pronoun: '代名詞',
  phrase: '熟語', phrasal_verb: '句動詞', idiom: '熟語',
  interjection: '感嘆詞', determiner: '限定詞', article: '冠詞',
};

function posToJapanese(tag: string): string {
  return POS_JA[tag.toLowerCase()] ?? POS_JA[tag] ?? tag;
}

type NavigationProp = NativeStackNavigationProp<HomeStackParamList>;
type WordDetailRoute = RouteProp<HomeStackParamList, 'WordDetail'>;

const STATUS_MAP: Record<string, { text: string; color: string; bg: string; borderColor: string }> = {
  new: { text: '未学習', color: theme.secondaryText, bg: theme.white, borderColor: theme.border },
  review: { text: '学習中', color: theme.chartBlue, bg: theme.chartBlueBg, borderColor: theme.chartBlue },
  mastered: { text: '習得済', color: theme.success, bg: theme.successBg, borderColor: theme.success },
};

export function WordDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<WordDetailRoute>();
  const { subscription } = useAuth();
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  const [word, setWord] = useState<Word>(route.params.word);
  const statusInfo = STATUS_MAP[word.status] ?? STATUS_MAP.new;

  const handleSpeak = useCallback((text: string) => {
    Speech.speak(text, { language: 'en-US', rate: 0.85 });
  }, []);

  const handleToggleFavorite = useCallback(async () => {
    const next = !word.isFavorite;
    try {
      await repository.updateWord(word.id, { isFavorite: next });
      setWord((w) => ({ ...w, isFavorite: next }));
    } catch {
      Alert.alert('エラー', 'ブックマークの更新に失敗しました。');
    }
  }, [repository, word]);

  const handleVocabTypeCycle = useCallback(async (next: VocabularyType | undefined) => {
    try {
      await repository.updateWord(word.id, { vocabularyType: next ?? (null as any) });
      setWord((w) => ({ ...w, vocabularyType: next }));
    } catch {
      Alert.alert('エラー', '語彙タイプの更新に失敗しました。');
    }
  }, [repository, word]);

  const renderExample = useCallback((sentence: string, target: string) => {
    const lower = sentence.toLowerCase();
    const idx = lower.indexOf(target.toLowerCase());
    if (idx < 0) return <Text style={s.exampleText}>{sentence}</Text>;
    return (
      <Text style={s.exampleText}>
        {sentence.slice(0, idx)}
        <Text style={s.exampleHighlight}>{sentence.slice(idx, idx + target.length)}</Text>
        {sentence.slice(idx + target.length)}
      </Text>
    );
  }, []);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header: back + edit ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={theme.primaryText} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={s.headerBtn} onPress={() => { /* edit placeholder */ }}>
          <Pencil size={18} color={theme.primaryText} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── English word + status badge ── */}
        <View style={s.wordRow}>
          <Text style={s.englishWord}>{word.english}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.borderColor }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          </View>
        </View>

        {/* ── Pronunciation row: IPA + speaker | A/P badge + bookmark ── */}
        <View style={s.pronunciationRow}>
          <View style={s.pronunciationLeft}>
            {word.pronunciation ? (
              <View style={s.ipaPill}>
                <Text style={s.ipaText}>{word.pronunciation}</Text>
                <TouchableOpacity onPress={() => handleSpeak(word.english)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Volume2 size={16} color={theme.secondaryText} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.speakOnlyBtn} onPress={() => handleSpeak(word.english)}>
                <Volume2 size={18} color={theme.secondaryText} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.pronunciationRight}>
            <VocabularyTypeBadge value={word.vocabularyType} onCycle={handleVocabTypeCycle} />
            <TouchableOpacity onPress={handleToggleFavorite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Bookmark
                size={22}
                color={word.isFavorite ? theme.primaryText : theme.mutedText}
                fill={word.isFavorite ? theme.primaryText : 'transparent'}
                strokeWidth={1.8}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Japanese meaning with POS ── */}
        <View style={s.meaningSection}>
          <Text style={s.meaningText}>
            {word.partOfSpeechTags && word.partOfSpeechTags.length > 0 && (
              <Text style={s.posPrefix}>({word.partOfSpeechTags.map(posToJapanese).join('・')}) </Text>
            )}
            {word.japanese}
          </Text>
        </View>

        <View style={s.divider} />

        {/* ── Example sentence ── */}
        <View style={s.exampleSection}>
          <Text style={s.sectionTitle}>例文</Text>
          {word.exampleSentence ? (
            <View style={s.exampleContent}>
              <View style={s.exampleRow}>
                <View style={{ flex: 1 }}>
                  {renderExample(word.exampleSentence, word.english)}
                </View>
                <TouchableOpacity
                  style={s.exampleSpeakBtn}
                  onPress={() => handleSpeak(word.exampleSentence!)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Volume2 size={18} color={theme.secondaryText} />
                </TouchableOpacity>
              </View>
              {word.exampleSentenceJa ? (
                <Text style={s.exampleJa}>{word.exampleSentenceJa}</Text>
              ) : null}
            </View>
          ) : (
            <Text style={s.emptyLabel}>まだ生成されていません</Text>
          )}
        </View>

        {/* ── Related words ── */}
        {word.relatedWords && word.relatedWords.length > 0 ? (
          <>
            <View style={s.divider} />
            <View style={s.section}>
              <Text style={s.sectionTitle}>関連語</Text>
              <View style={s.tagsRow}>
                {word.relatedWords.map((rw, i) => (
                  <View key={i} style={s.tag}>
                    <Text style={s.tagText}>
                      {typeof rw === 'string' ? rw : `${rw.word} (${rw.type})`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {/* ── Usage patterns ── */}
        {word.usagePatterns && word.usagePatterns.length > 0 ? (
          <>
            <View style={s.divider} />
            <View style={s.section}>
              <Text style={s.sectionTitle}>使い方</Text>
              {word.usagePatterns.map((up, i) => (
                <View key={i} style={s.usageItem}>
                  <Text style={s.usagePattern}>{typeof up === 'string' ? up : up.pattern}</Text>
                  {typeof up !== 'string' && up.meaningJa ? (
                    <Text style={s.usageMeaning}>{up.meaningJa}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.white,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    paddingHorizontal: 20,
  },

  // ── Word + status ──
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  englishWord: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.primaryText,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Pronunciation row ──
  pronunciationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pronunciationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ipaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ipaText: {
    fontSize: 15,
    color: theme.primaryText,
    fontFamily: 'monospace',
  },
  speakOnlyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pronunciationRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: theme.border,
  },

  // ── Meaning ──
  meaningSection: {
    paddingVertical: 16,
  },
  posPrefix: {
    fontSize: 16,
    color: theme.mutedText,
  },
  meaningText: {
    fontSize: 18,
    fontWeight: '500',
    color: theme.primaryText,
    lineHeight: 26,
  },

  // ── Example ──
  exampleSection: {
    paddingVertical: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primaryText,
    marginBottom: 4,
  },
  exampleContent: {
    gap: 6,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  exampleText: {
    fontSize: 17,
    color: theme.primaryText,
    lineHeight: 26,
  },
  exampleHighlight: {
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  exampleSpeakBtn: {
    marginTop: 4,
  },
  exampleJa: {
    fontSize: 15,
    color: theme.secondaryText,
    lineHeight: 22,
  },
  emptyLabel: {
    fontSize: 14,
    color: theme.mutedText,
    fontStyle: 'italic',
  },

  // ── Shared section ──
  section: {
    paddingVertical: 16,
    gap: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  usageItem: {
    gap: 2,
    marginBottom: 6,
  },
  usagePattern: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.primaryText,
  },
  usageMeaning: {
    fontSize: 13,
    color: theme.secondaryText,
  },
});

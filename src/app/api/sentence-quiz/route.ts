import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import OpenAI from 'openai';
import { z } from 'zod';
import { generateWordEmbedding } from '@/lib/embeddings';
import type {
  SentenceQuizQuestion,
  FillInBlankQuestion,
  WordOrderQuestion,
  MultiFillInBlankQuestion,
  EnhancedBlankSlot,
  VectorSearchResult,
  BlankPrediction,
} from '@/types';

// リクエストスキーマ
const requestSchema = z.object({
  words: z.array(z.object({
    id: z.string(),
    english: z.string(),
    japanese: z.string(),
    status: z.enum(['new', 'review', 'mastered']),
  })).min(1).max(15),
  // 新機能: VectorDB検索を使うかどうか（デフォルトはtrue）
  useVectorSearch: z.boolean().optional().default(true),
});

// AIレスポンススキーマ（従来の穴埋め問題）
const fillInBlankAISchema = z.object({
  sentence: z.string(),
  blanks: z.array(z.object({
    correctAnswer: z.string(),
    options: z.array(z.string()).length(4),
  })).length(1),
  japaneseMeaning: z.string(),
});

// AIレスポンススキーマ（複数空欄問題 - Phase 1）
// 最低1つの空欄を受け入れ（理想は3つだが、LLMが少なく返す場合もある）
const multiBlankAISchema = z.object({
  sentence: z.string(),
  blanks: z.array(z.object({
    position: z.number(),
    word: z.string(),
    type: z.enum(['target', 'content', 'grammar']),
    contextHint: z.string().optional(),
  })).min(1), // 最低1つに緩和（少なくともtargetは必要）
  japaneseMeaning: z.string(),
});

// AIレスポンススキーマ（誤答生成 - Phase 3）
const distractorsAISchema = z.object({
  options: z.array(z.string()).length(4),
});

// AIレスポンススキーマ（並び替え問題）
const wordOrderAISchema = z.object({
  correctOrder: z.array(z.string()).min(4),
  japaneseMeaning: z.string(),
});

// 複数空欄問題生成プロンプト（Phase 1）
const MULTI_BLANK_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、【必ず3つの空欄】がある穴埋め問題を生成してください。

【最重要：sentenceの___の数とblanks配列の要素数を一致させる】
- sentenceに含まれる「___」の数と、blanks配列の要素数は【必ず同じ】にしてください
- 例: sentenceに「___」が3つあるなら、blanks配列も3要素
- これが一致しないとエラーになります

【重要：空欄は絶対に3つ必要です】
- sentenceには「___」を必ず3つ入れてください
- blanks配列には必ず3つの要素を入れてください

【重要：空欄は必ず単語1つだけ】
- 各空欄には必ず「単語1つだけ」を入れてください
- 熟語やフレーズ（例: "look forward to", "take care of"）を1つの空欄にしないでください
- 熟語が与えられた場合は、その中の1単語だけを空欄にし、残りは文中に表示してください
- 例: "look forward to" → "I ___ forward to meeting you." (空欄は "look" のみ)
【重要：空欄には文中で正しい活用形を入れる】
- 例: be → is/are/was、have → has/had、do → does/did など文脈に合わせた形
- sentenceに入れる語と、blanksのwordは必ず一致させる

【ルール】
1. 与えられた単語/熟語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 空欄は【必ず3つ】：
   - 空欄1（type: "target"）: 与えられた単語（熟語の場合は核となる1単語のみ）【必須】
   - 空欄2（type: "content"）: 文脈に合う内容語（名詞、動詞、形容詞など）【必須】
   - 空欄3（type: "grammar"）: 文法的要素（前置詞、副詞、冠詞、時を表す語など）【必須】
4. content空欄には、その位置に最も適切な単語を予測して入れてください
5. 文は十分な長さ（7単語以上）にして、3つの空欄が自然に入るようにしてください

【出力形式】JSON - sentenceの___の数 = blanks配列の要素数 = 3
{
  "sentence": "I ___ to the ___ every ___.",
  "blanks": [
    { "position": 0, "word": "go", "type": "target" },
    { "position": 1, "word": "library", "type": "content", "contextHint": "場所" },
    { "position": 2, "word": "day", "type": "grammar" }
  ],
  "japaneseMeaning": "私は毎日図書館に行く。"
}`;

// 誤答生成プロンプト（Phase 3）
const DISTRACTORS_SYSTEM_PROMPT = `あなたは英語教師です。穴埋め問題の誤答選択肢を生成してください。

【最重要：選択肢は必ず単語1つだけ】
- 各選択肢は必ず「単語1つだけ」にしてください
- 熟語やフレーズを選択肢にしないでください

【重要：正解と同じ意味の単語は誤答にしない】
- 誤答には、正解と同じ意味や類義語を含めないでください
- 例: 正解が "favor" なら、"support", "back", "endorse" は誤答に使わない

【重要：文脈に関連する単語を誤答にする】
- 誤答は文の内容やトピックに関連した単語を選んでください
- 全く無関係な単語（例: 料理の文に "gaseous"、スポーツの文に "liquid"）は使わない
- 誤答は「惜しいけど間違い」という感じの単語を選ぶ
- 例: "practice speaking" の誤答なら "writing", "reading", "listening" など関連する活動を選ぶ

【ルール】
1. 正解を含めて4つの選択肢を生成（全て単語1つのみ）
2. 誤答は単純な活用形変化（三人称形、過去形等）を使わない
3. 誤答は正解の類義語を絶対に使わない
4. 誤答は同じ品詞で、文の内容に関連するが正解ではない単語を選ぶ
5. 誤答に全く無関係な単語（科学用語、専門用語など）を使わない
6. 難易度は中学〜高校レベル

【出力形式】JSON
{
  "options": ["正解", "誤答1", "誤答2", "誤答3"]
}`;

// 並び替え問題生成プロンプト
const WORD_ORDER_SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、Duolingo形式の並び替え問題を生成してください。

【ルール】
1. 与えられた単語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 4〜8単語程度の長さ（並び替えしやすい長さ）
4. 文を単語単位で分割（ピリオドは最後の単語に含める）

【出力形式】JSON
{
  "correctOrder": ["I", "go", "to", "school", "every", "day."],
  "japaneseMeaning": "私は毎日学校に行く。"
}`;

// 配列をシャッフル
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// VectorDB検索でユーザーの学習済み単語から類似語を探す
async function findSimilarUserWord(
  supabase: ReturnType<typeof createRouteHandlerClient> extends Promise<infer T> ? T : never,
  userId: string,
  prediction: string,
  excludeWordIds: string[]
): Promise<VectorSearchResult | null> {
  try {
    // 予測単語のembeddingを生成
    const embedding = await generateWordEmbedding(prediction);

    // pgvector関数を呼び出して類似単語を検索
    // 類似度しきい値を0.75に設定（高い類似度のみ採用）
    const { data, error } = await supabase.rpc('match_words_by_embedding', {
      query_embedding: embedding,
      user_id_filter: userId,
      exclude_word_ids: excludeWordIds,
      match_threshold: 0.75, // 高いしきい値で厳密にマッチ
      match_count: 1,
    });

    if (error) {
      console.error('VectorDB search error:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // 類似度が十分に高いかログ出力（デバッグ用）
    console.log(`VectorDB match: "${prediction}" → "${data[0].english}" (similarity: ${data[0].similarity.toFixed(3)})`);

    return {
      id: data[0].id,
      projectId: data[0].project_id,
      english: data[0].english,
      japanese: data[0].japanese,
      similarity: data[0].similarity,
    };
  } catch (error) {
    console.error('findSimilarUserWord error:', error);
    return null;
  }
}

// Phase 3: 誤答選択肢を生成
async function generateDistractors(
  openai: OpenAI,
  correctAnswer: string,
  context: string,
  blankType: 'target' | 'content' | 'grammar'
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: DISTRACTORS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `文: "${context}"
空欄タイプ: ${blankType}
正解: "${correctAnswer}"

この空欄に対する4択（正解1つ + 誤答3つ）を生成してください。`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [correctAnswer, 'option1', 'option2', 'option3'];
    }

    const parsed = JSON.parse(content);
    const validated = distractorsAISchema.parse(parsed);

    // 正解が含まれていることを確認
    if (!validated.options.includes(correctAnswer)) {
      validated.options[0] = correctAnswer;
    }

    return shuffleArray(validated.options);
  } catch (error) {
    console.error('generateDistractors error:', error);
    return shuffleArray([correctAnswer, 'alternative1', 'alternative2', 'alternative3']);
  }
}

// 複数空欄穴埋め問題を生成（VectorDB統合）
async function generateMultiFillInBlank(
  openai: OpenAI,
  supabase: ReturnType<typeof createRouteHandlerClient> extends Promise<infer T> ? T : never,
  userId: string,
  wordId: string,
  english: string,
  japanese: string,
  excludeWordIds: string[]
): Promise<MultiFillInBlankQuestion | null> {
  try {
    // ============================================
    // Phase 1: LLMで3空欄の例文を生成（予測付き）
    // ============================================
    const phase1Response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: MULTI_BLANK_SYSTEM_PROMPT },
        { role: 'user', content: `単語: "${english}" (意味: ${japanese})` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const phase1Content = phase1Response.choices[0]?.message?.content;
    if (!phase1Content) return null;

    const phase1Parsed = JSON.parse(phase1Content);
    const phase1Validated = multiBlankAISchema.parse(phase1Parsed);

    // 文中の空欄数（___の数）とblanks配列の長さを検証
    const blankCountInSentence = (phase1Validated.sentence.match(/___/g) || []).length;
    const blanksArrayLength = phase1Validated.blanks.length;

    if (blankCountInSentence !== blanksArrayLength) {
      console.warn(`Blank count mismatch for word "${english}": sentence has ${blankCountInSentence} blanks, but blanks array has ${blanksArrayLength} items. Falling back to single-blank question.`);
      return null; // フォールバックして従来の1空欄問題を使用
    }

    // 空欄数が3未満の場合はログ出力（デバッグ用）
    if (phase1Validated.blanks.length < 3) {
      console.warn(`LLM returned ${phase1Validated.blanks.length} blanks instead of 3 for word: ${english}`);
    }

    // ============================================
    // Phase 2: VectorDB検索でcontent空欄の単語を置換
    // ============================================
    const blanks: EnhancedBlankSlot[] = [];
    const relatedWordIds: string[] = [];

    for (const blankPrediction of phase1Validated.blanks) {
      let finalWord = blankPrediction.word;
      let source: EnhancedBlankSlot['source'] = blankPrediction.type === 'target'
        ? 'target'
        : blankPrediction.type === 'grammar'
          ? 'grammar'
          : 'llm-predicted';
      let sourceWordId: string | undefined;
      let sourceJapanese: string | undefined;

      // content空欄の場合、VectorDB検索を試みる
      if (blankPrediction.type === 'content') {
        const vectorResult = await findSimilarUserWord(
          supabase,
          userId,
          blankPrediction.word,
          [...excludeWordIds, wordId]
        );

        if (vectorResult) {
          // 文法的な互換性をチェック（単数/複数、品詞など）
          const originalWord = blankPrediction.word.toLowerCase();
          const matchedWord = vectorResult.english.toLowerCase();

          // 単語が1語かどうかチェック（熟語は除外）
          const isSingleWord = !matchedWord.includes(' ');

          // 簡易的な単数/複数チェック
          const isOriginalPlural = originalWord.endsWith('s') || originalWord.endsWith('es') || ['people', 'children', 'men', 'women'].includes(originalWord);
          const isMatchedPlural = matchedWord.endsWith('s') || matchedWord.endsWith('es') || ['people', 'children', 'men', 'women'].includes(matchedWord);

          // 文の前後の文脈をチェック（"a" や "an" があるかどうか）
          const sentenceLower = phase1Validated.sentence.toLowerCase();
          const blankIndex = phase1Validated.sentence.split('___').slice(0, blankPrediction.position + 1).join('___').lastIndexOf('___');
          const beforeBlank = phase1Validated.sentence.substring(0, blankIndex).toLowerCase();
          const hasIndefiniteArticle = beforeBlank.endsWith('a ') || beforeBlank.endsWith('an ');

          // 文法的に互換性があるかチェック
          const isGrammaticallyCompatible =
            isSingleWord &&
            (isOriginalPlural === isMatchedPlural) &&
            !(hasIndefiniteArticle && isMatchedPlural); // "a/an" + 複数形は不可

          if (isGrammaticallyCompatible) {
            // VectorDBでマッチした単語を使用
            finalWord = vectorResult.english;
            source = 'vector-matched';
            sourceWordId = vectorResult.id;
            sourceJapanese = vectorResult.japanese;
            relatedWordIds.push(vectorResult.id);
          } else {
            console.warn(`Skipping VectorDB match "${vectorResult.english}" for "${blankPrediction.word}" due to grammatical incompatibility`);
          }
        }
      }

      // Phase 3: 誤答選択肢を生成
      const options = await generateDistractors(
        openai,
        finalWord,
        phase1Validated.sentence,
        blankPrediction.type
      );

      blanks.push({
        index: blankPrediction.position,
        correctAnswer: finalWord,
        options,
        source,
        sourceWordId,
        sourceJapanese,
      });
    }

    // ============================================
    // Phase 4: VectorDB置換があった場合、日本語訳を再生成
    // ============================================
    // blanksを文中の順序に揃える（position順）
    const sortedBlanks = [...blanks].sort((a, b) => a.index - b.index);

    let finalJapaneseMeaning = phase1Validated.japaneseMeaning;

    if (relatedWordIds.length > 0) {
      // 完成した英文を作成
      const completedSentence = phase1Validated.sentence
        .split('___')
        .map((part, idx) => idx < sortedBlanks.length ? part + sortedBlanks[idx].correctAnswer : part)
        .join('');

      try {
        const translationResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: '与えられた英文を自然な日本語に翻訳してください。翻訳のみを出力してください。',
            },
            { role: 'user', content: completedSentence },
          ],
          temperature: 0.3,
        });

        const translatedText = translationResponse.choices[0]?.message?.content;
        if (translatedText) {
          finalJapaneseMeaning = translatedText.trim();
        }
      } catch (translationError) {
        console.warn('Failed to regenerate Japanese translation:', translationError);
        // 失敗した場合は元の翻訳を使用
      }
    }

    return {
      type: 'multi-fill-in-blank',
      wordId,
      targetWord: english,
      sentence: phase1Validated.sentence,
      blanks: sortedBlanks,
      japaneseMeaning: finalJapaneseMeaning,
      relatedWordIds,
    };
  } catch (error) {
    console.error('Multi fill-in-blank generation error:', error);
    return null;
  }
}

// 従来の穴埋め問題を生成（フォールバック用）
async function generateFillInBlank(
  openai: OpenAI,
  wordId: string,
  english: string,
  japanese: string
): Promise<FillInBlankQuestion | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `あなたは英語教師です。与えられた英単語を使った自然な例文を作成し、Duolingo形式の穴埋め問題を生成してください。

【ルール】
1. 与えられた単語を必ず含む、自然で実用的な例文を作成
2. 例文は中学〜高校レベルの難易度
3. 空欄は1つだけ（対象単語の部分）
4. 選択肢は4つ（1つが正解、3つが誤答）
5. 空欄に入れる語は文脈に合った正しい活用形にする（be→is/are/was 等）

【選択肢のルール - 重要】
誤答は単純な活用形変化（三人称形、過去形等）を使わないでください！
意味が似ている別の単語、または同じ品詞で文脈に合いそうな別の単語を使用してください。

例: "go"の誤答 → "come", "arrive", "leave"（×goes, went, goingは禁止）
例: "happy"の誤答 → "glad", "pleased", "excited"（×happier, happiestは禁止）

【出力形式】JSON
{
  "sentence": "She ___ to the store to buy some food.",
  "blanks": [
    { "correctAnswer": "went", "options": ["went", "came", "arrived", "returned"] }
  ],
  "japaneseMeaning": "彼女は食べ物を買いにお店に行った。"
}`,
        },
        { role: 'user', content: `単語: "${english}" (意味: ${japanese})` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = fillInBlankAISchema.parse(parsed);

    return {
      type: 'fill-in-blank',
      wordId,
      targetWord: english,
      sentence: validated.sentence,
      blanks: validated.blanks.map((blank, index) => ({
        index,
        correctAnswer: blank.correctAnswer,
        options: shuffleArray(blank.options),
      })),
      japaneseMeaning: validated.japaneseMeaning,
    };
  } catch (error) {
    console.error('Fill-in-blank generation error:', error);
    return null;
  }
}

// 並び替え問題を生成
async function generateWordOrder(
  openai: OpenAI,
  wordId: string,
  english: string,
  japanese: string
): Promise<WordOrderQuestion | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: WORD_ORDER_SYSTEM_PROMPT },
        { role: 'user', content: `単語: "${english}" (意味: ${japanese})` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = wordOrderAISchema.parse(parsed);

    return {
      type: 'word-order',
      wordId,
      targetWord: english,
      shuffledWords: shuffleArray(validated.correctOrder),
      correctOrder: validated.correctOrder,
      japaneseMeaning: validated.japaneseMeaning,
    };
  } catch (error) {
    console.error('Word-order generation error:', error);
    return null;
  }
}

// API Route: POST /api/sentence-quiz
// 例文クイズの問題を生成（Pro限定）
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. CHECK PRO SUBSCRIPTION
    // ============================================
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json(
        { success: false, error: '例文クイズはProプラン限定機能です。' },
        { status: 403 }
      );
    }

    // ============================================
    // 3. PARSE REQUEST BODY
    // ============================================
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストの解析に失敗しました' },
        { status: 400 }
      );
    }

    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const { words, useVectorSearch } = parseResult.data;

    // ============================================
    // 4. CHECK OPENAI API KEY
    // ============================================
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // ============================================
    // 5. GENERATE QUESTIONS
    // ============================================
    const questions: (SentenceQuizQuestion | MultiFillInBlankQuestion)[] = [];
    const allWordIds = words.map(w => w.id);

    // 並列で問題生成（パフォーマンス向上）
    const generatePromises = words.map(async (word) => {
      // status === 'new' なら穴埋め問題、それ以外は並び替え問題
      const shouldUseFillIn = word.status === 'new';

      if (shouldUseFillIn) {
        // VectorDB検索を使う場合は複数空欄問題を生成
        if (useVectorSearch) {
          const multiResult = await generateMultiFillInBlank(
            openai,
            supabase,
            user.id,
            word.id,
            word.english,
            word.japanese,
            allWordIds
          );
          if (multiResult) return multiResult;
        }

        // フォールバック: 従来の1空欄問題
        return generateFillInBlank(openai, word.id, word.english, word.japanese);
      } else {
        return generateWordOrder(openai, word.id, word.english, word.japanese);
      }
    });

    const results = await Promise.all(generatePromises);

    // null を除外
    for (const result of results) {
      if (result) {
        questions.push(result);
      }
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: '問題の生成に失敗しました。もう一度お試しください。' },
        { status: 500 }
      );
    }

    // ============================================
    // 6. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error('Sentence quiz API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

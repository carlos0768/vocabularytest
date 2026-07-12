/**
 * 接辞カタログ（接頭語・接尾語・接中語）
 *
 * 早慶レベルの受験英語で頻出する接辞のマスターデータ。
 * - このTSファイルが正本（source of truth）。DBの public.affixes テーブルへは
 *   scripts/import-affixes.ts が service role で upsert する。
 * - 綴りが同じでも意味が異なるものは **必ず別エントリ**（別 id）にする。
 *   例: un-not（否定: unhappy）と uni-one（1つ: unanimous）は別物。
 * - 語根（root）はカタログ化しない。AI が formula 内で自由記述する。
 * - id は安定 slug（`{form}-{意味キー}`）。一度公開した id は変更しない
 *   （words.morphology / lexicon_entries.morphology から参照されるため）。
 */

export type AffixKind = 'prefix' | 'suffix' | 'infix';

export interface AffixSense {
  /** 安定 slug。例: 'un-not', 'uni-one', 'er-agent', 'er-comparative' */
  id: string;
  /** 小文字・ハイフンなしの綴り。例: 'un' */
  form: string;
  /**
   * 単語中に現れる同化・短縮形（候補マッチ専用）。
   * 例: uni-（1つ）は unanimous では「un」として現れる。
   */
  altForms?: string[];
  kind: AffixKind;
  /** 短い日本語の意味ラベル。式内の括弧表示にも使う。例: '否定' */
  meaningJa: string;
  /** ニュアンス・使い分けの解説（豆知識ページにも表示） */
  nuanceJa?: string;
  /** 語感の傾向（negative / positive など）。任意 */
  connotation?: string;
  /** 代表例（受験頻出語を優先） */
  examples: string[];
  level?: 'basic' | 'advanced';
}

export const AFFIX_CATALOG: readonly AffixSense[] = [
  // ============ 接頭語: 否定・反対 ============
  { id: 'un-not', form: 'un', kind: 'prefix', meaningJa: '否定', nuanceJa: '形容詞・副詞に付いて「〜でない」と打ち消す。最も基本的な否定の接頭語。', connotation: 'negative', examples: ['unhappy', 'unable', 'unfair', 'unkind'], level: 'basic' },
  { id: 'un-reverse', form: 'un', kind: 'prefix', meaningJa: '逆転・除去', nuanceJa: '動詞に付いて「動作を逆向きにする・取り除く」。un-not（否定）とは別物。', examples: ['undo', 'unlock', 'unpack', 'unfold'], level: 'basic' },
  { id: 'uni-one', form: 'uni', altForms: ['un'], kind: 'prefix', meaningJa: '1つ', nuanceJa: 'ラテン語 unus（1）由来。unanimous は「un（否定）」ではなく「uni（1つ）＋anim（心）」＝心が1つ→満場一致。', examples: ['uniform', 'unify', 'unanimous', 'unique'], level: 'basic' },
  { id: 'in-not', form: 'in', kind: 'prefix', meaningJa: '否定', nuanceJa: 'ラテン語系の否定。in-into（中へ）と綴りが同じなので文脈で判断する。', connotation: 'negative', examples: ['incorrect', 'invisible', 'independent', 'incapable'], level: 'basic' },
  { id: 'in-into', form: 'in', kind: 'prefix', meaningJa: '中へ', nuanceJa: '「中へ・上に」の方向を表す。in-not（否定）と同綴りだが意味は正反対に近い。', examples: ['include', 'invade', 'insight', 'income'], level: 'basic' },
  { id: 'im-not', form: 'im', kind: 'prefix', meaningJa: '否定', nuanceJa: 'in-not が b/m/p の前で im- に変化した形。', connotation: 'negative', examples: ['impossible', 'impatient', 'impolite'], level: 'basic' },
  { id: 'im-into', form: 'im', kind: 'prefix', meaningJa: '中へ', nuanceJa: 'in-into が b/m/p の前で im- に変化した形。', examples: ['import', 'immigrate', 'implant'], level: 'basic' },
  { id: 'il-not', form: 'il', kind: 'prefix', meaningJa: '否定', nuanceJa: 'in-not が l の前で il- に変化した形。', connotation: 'negative', examples: ['illegal', 'illogical', 'illiterate'], level: 'advanced' },
  { id: 'ir-not', form: 'ir', kind: 'prefix', meaningJa: '否定', nuanceJa: 'in-not が r の前で ir- に変化した形。', connotation: 'negative', examples: ['irregular', 'irrelevant', 'irresponsible'], level: 'advanced' },
  { id: 'dis-not', form: 'dis', kind: 'prefix', meaningJa: '否定・反対', nuanceJa: '「〜しない・反対の」。動詞にも形容詞にも付く。', connotation: 'negative', examples: ['disagree', 'dishonest', 'disappear', 'dislike'], level: 'basic' },
  { id: 'dis-apart', form: 'dis', kind: 'prefix', meaningJa: '分離・除去', nuanceJa: '「離す・ばらばらにする」。dis-not（否定）と同綴りだが「分離」のイメージ。', examples: ['dismiss', 'distract', 'distribute'], level: 'advanced' },
  { id: 'non-not', form: 'non', kind: 'prefix', meaningJa: '非', nuanceJa: '中立的な「〜でない」。un- より感情を含まず、単なる分類を表すことが多い。', examples: ['nonsense', 'nonfiction', 'nonverbal'], level: 'basic' },
  { id: 'an-not', form: 'an', kind: 'prefix', meaningJa: '無', nuanceJa: 'ギリシャ語系の「無い」。anonymous＝an（無）＋onym（名前）＝匿名の。', connotation: 'negative', examples: ['anonymous', 'anarchy'], level: 'advanced' },
  { id: 'anti-against', form: 'anti', kind: 'prefix', meaningJa: '反対・対抗', nuanceJa: '「〜に対抗する」。antibody＝体に入った異物に対抗するもの＝抗体。', examples: ['antibody', 'antisocial', 'antibiotic'], level: 'basic' },
  { id: 'counter-against', form: 'counter', kind: 'prefix', meaningJa: '反対・対抗', nuanceJa: '「反撃・対応」のイメージ。counterattack＝反撃。', examples: ['counterattack', 'counterpart', 'counterclockwise'], level: 'advanced' },
  { id: 'contra-against', form: 'contra', kind: 'prefix', meaningJa: '反対', nuanceJa: 'contradict＝contra（反対）＋dict（言う）＝矛盾する。', examples: ['contradict', 'contrary', 'contrast'], level: 'advanced' },
  { id: 'mis-wrong', form: 'mis', kind: 'prefix', meaningJa: '誤り', nuanceJa: '「誤って〜する」。', connotation: 'negative', examples: ['mistake', 'misunderstand', 'mislead'], level: 'basic' },
  { id: 'mal-bad', form: 'mal', kind: 'prefix', meaningJa: '悪い', nuanceJa: 'ラテン語 malus（悪い）。malfunction＝故障（悪い機能）。', connotation: 'negative', examples: ['malfunction', 'malnutrition', 'malice'], level: 'advanced' },
  { id: 'pseudo-false', form: 'pseudo', kind: 'prefix', meaningJa: '偽の', nuanceJa: 'pseudonym＝偽の名前＝ペンネーム。', examples: ['pseudonym', 'pseudoscience'], level: 'advanced' },

  // ============ 接頭語: 方向・位置 ============
  { id: 'ex-out', form: 'ex', kind: 'prefix', meaningJa: '外へ', nuanceJa: '「外に出す」イメージ。export＝港の外へ運ぶ＝輸出する。', examples: ['export', 'exclude', 'expand', 'exit'], level: 'basic' },
  { id: 'ex-former', form: 'ex', kind: 'prefix', meaningJa: '前の・元', nuanceJa: '「元〜」。ex-president＝前大統領。ハイフン付きで使われることが多い。', examples: ['ex-president', 'ex-wife'], level: 'advanced' },
  { id: 'extra-outside', form: 'extra', kind: 'prefix', meaningJa: '外・範囲外', nuanceJa: 'extraordinary＝ordinary（普通）の枠の外＝並外れた。', examples: ['extraordinary', 'extracurricular'], level: 'advanced' },
  { id: 'inter-between', form: 'inter', kind: 'prefix', meaningJa: '間・相互', nuanceJa: '「〜の間で・お互いに」。international＝国家間の。', examples: ['international', 'interact', 'interpret', 'interrupt'], level: 'basic' },
  { id: 'intra-within', form: 'intra', kind: 'prefix', meaningJa: '内部', nuanceJa: 'inter-（間）との対比で「内側の」。intranet＝組織内ネットワーク。', examples: ['intranet', 'intramural'], level: 'advanced' },
  { id: 'trans-across', form: 'trans', kind: 'prefix', meaningJa: '越えて・移動', nuanceJa: '「別の場所・状態へ移す」。translate＝言語を越えて運ぶ＝翻訳する。', examples: ['transport', 'translate', 'transform'], level: 'basic' },
  { id: 'sub-under', form: 'sub', kind: 'prefix', meaningJa: '下・下位', nuanceJa: '「下に・補助の」。subconscious＝意識の下＝潜在意識。', examples: ['subway', 'submarine', 'subtitle', 'subconscious'], level: 'basic' },
  { id: 'sur-over', form: 'sur', kind: 'prefix', meaningJa: '上・超えて', nuanceJa: 'super- のフランス語形。surpass＝上を通り過ぎる＝上回る。', examples: ['surface', 'surpass', 'surcharge'], level: 'advanced' },
  { id: 'super-above', form: 'super', kind: 'prefix', meaningJa: '上・超越', nuanceJa: '「上の・並を超えた」。supervise＝上から見る＝監督する。', examples: ['superior', 'supernatural', 'supervise'], level: 'basic' },
  { id: 'over-excess', form: 'over', kind: 'prefix', meaningJa: '過度・上方', nuanceJa: '「やりすぎ・上から」。overestimate＝過大評価する。', examples: ['overwork', 'overcome', 'overestimate', 'overlook'], level: 'basic' },
  { id: 'under-below', form: 'under', kind: 'prefix', meaningJa: '下・不足', nuanceJa: '「下に・足りない」。underestimate＝過小評価する。', examples: ['underestimate', 'undergo', 'underground'], level: 'basic' },
  { id: 'out-beyond', form: 'out', kind: 'prefix', meaningJa: '外・上回る', nuanceJa: '「外へ」に加えて動詞に付くと「〜より勝る」。outlive＝〜より長生きする。', examples: ['outcome', 'outdoor', 'outlive', 'outnumber'], level: 'basic' },
  { id: 'up-upward', form: 'up', kind: 'prefix', meaningJa: '上へ', nuanceJa: '「上へ・向上」。upgrade＝等級を上げる。', examples: ['upgrade', 'uphold', 'upload'], level: 'basic' },
  { id: 'fore-before', form: 'fore', kind: 'prefix', meaningJa: '前・先', nuanceJa: '「時間的・位置的に前」。forecast＝前もって投げる＝予報する。', examples: ['forecast', 'foresee', 'forehead'], level: 'advanced' },
  { id: 'pre-before', form: 'pre', kind: 'prefix', meaningJa: '前・事前', nuanceJa: '「あらかじめ」。predict＝pre（前）＋dict（言う）＝予言する。', examples: ['predict', 'prepare', 'preview', 'prevent'], level: 'basic' },
  { id: 'post-after', form: 'post', kind: 'prefix', meaningJa: '後', nuanceJa: '「後の」。postpone＝後ろに置く＝延期する。', examples: ['postpone', 'postwar', 'postgraduate'], level: 'basic' },
  { id: 'ante-before', form: 'ante', kind: 'prefix', meaningJa: '前', nuanceJa: 'ラテン語系の「前」。antecedent＝前に行くもの＝先行詞。', examples: ['antecedent', 'anticipate'], level: 'advanced' },
  { id: 're-again', form: 're', kind: 'prefix', meaningJa: '再び', nuanceJa: '「もう一度」。rebuild＝再建する。', examples: ['rebuild', 'renew', 'review', 'repeat'], level: 'basic' },
  { id: 're-back', form: 're', kind: 'prefix', meaningJa: '後ろへ・元へ', nuanceJa: '「再び」だけでなく「後ろへ・元へ」の意味もある。reject＝後ろへ投げ返す＝拒絶する。', examples: ['reject', 'retreat', 'resist', 'refund'], level: 'advanced' },
  { id: 'de-down', form: 'de', kind: 'prefix', meaningJa: '下降・除去・逆転', nuanceJa: '「下げる・取り除く・逆にする」。decode＝暗号を解く。', examples: ['decrease', 'deforest', 'decode', 'defrost'], level: 'basic' },
  { id: 'ab-away', form: 'ab', kind: 'prefix', meaningJa: '離れて', nuanceJa: '「離脱」のイメージ。absent＝離れて存在する＝欠席の。', examples: ['absent', 'abnormal', 'abstract'], level: 'advanced' },
  { id: 'ad-toward', form: 'ad', kind: 'prefix', meaningJa: '〜の方へ・付加', nuanceJa: '「〜に向かって」。advance＝前方へ進む。後続の子音に同化して ac-/at- などに変化する。', examples: ['advance', 'adapt', 'adjust', 'adhere'], level: 'advanced' },
  { id: 'se-apart', form: 'se', kind: 'prefix', meaningJa: '分離', nuanceJa: '「離れて」。select＝離して選び取る＝選ぶ。secure＝se（離れて）＋cure（心配）＝心配から離れた＝安全な。', examples: ['separate', 'select', 'secure', 'secret'], level: 'advanced' },
  { id: 'circum-around', form: 'circum', kind: 'prefix', meaningJa: '周り', nuanceJa: 'circumstance＝周りに立つもの＝状況。', examples: ['circumstance', 'circumference'], level: 'advanced' },
  { id: 'peri-around', form: 'peri', kind: 'prefix', meaningJa: '周り', nuanceJa: 'ギリシャ語系の「周り」。perimeter＝周囲の長さ。', examples: ['perimeter', 'period', 'periodical'], level: 'advanced' },
  { id: 'dia-through', form: 'dia', kind: 'prefix', meaningJa: '通して・横切って', nuanceJa: 'dialogue＝dia（間を通して）＋logue（話す）＝対話。', examples: ['dialogue', 'diameter', 'diagnosis'], level: 'advanced' },
  { id: 'per-through', form: 'per', kind: 'prefix', meaningJa: '通して・完全に', nuanceJa: '「最初から最後まで貫く」。perfect＝完全に作り上げた。persist＝貫いて立つ＝固執する。', examples: ['perfect', 'permanent', 'persist', 'perceive'], level: 'advanced' },
  { id: 'pro-forward', form: 'pro', kind: 'prefix', meaningJa: '前へ', nuanceJa: '「前進」。progress＝前へ歩む＝進歩。', examples: ['progress', 'promote', 'proceed', 'propose'], level: 'basic' },
  { id: 'pro-favor', form: 'pro', kind: 'prefix', meaningJa: '賛成・支持', nuanceJa: '「〜寄りの・賛成の」。anti-（反対）の対義。pro-environment＝環境保護派の。', examples: ['pro-environment', 'pro-American'], level: 'advanced' },
  { id: 'retro-backward', form: 'retro', kind: 'prefix', meaningJa: '後ろへ・過去へ', nuanceJa: 'retrospect＝後ろを見ること＝回顧。', examples: ['retrospect', 'retroactive'], level: 'advanced' },
  { id: 'epi-upon', form: 'epi', kind: 'prefix', meaningJa: '上に・後に', nuanceJa: 'epidemic＝epi（上に）＋dem（民衆）＝民衆の上に広がる＝流行病。', examples: ['epidemic', 'episode', 'epilogue'], level: 'advanced' },
  { id: 'hyper-over', form: 'hyper', kind: 'prefix', meaningJa: '過度', nuanceJa: '「超・過剰」。hyperactive＝過度に活動的な。', examples: ['hyperactive', 'hypertension'], level: 'advanced' },
  { id: 'hypo-under', form: 'hypo', kind: 'prefix', meaningJa: '下・不足', nuanceJa: 'hyper-（過度）の対義。hypothesis＝下に置くもの＝仮説（結論の下に置く土台）。', examples: ['hypothesis', 'hypodermic'], level: 'advanced' },
  { id: 'meta-beyond', form: 'meta', kind: 'prefix', meaningJa: '超越・変化', nuanceJa: 'metaphor＝意味を別の場所へ運ぶ＝隠喩。', examples: ['metaphor', 'metabolism', 'metaphysics'], level: 'advanced' },
  { id: 'para-beside', form: 'para', kind: 'prefix', meaningJa: '側に・並行', nuanceJa: 'parallel＝互いに並んで＝平行の。paradox＝通説の脇にある説＝逆説。', examples: ['parallel', 'paradox', 'paragraph'], level: 'advanced' },
  { id: 'mid-middle', form: 'mid', kind: 'prefix', meaningJa: '中間', nuanceJa: 'midnight＝夜の真ん中＝深夜0時。', examples: ['midnight', 'midterm', 'midway'], level: 'basic' },

  // ============ 接頭語: 共同・数量 ============
  { id: 'co-together', form: 'co', kind: 'prefix', meaningJa: '共に', nuanceJa: '「一緒に」。cooperate＝共に働く＝協力する。', examples: ['cooperate', 'coexist', 'coworker', 'coauthor'], level: 'basic' },
  { id: 'con-together', form: 'con', kind: 'prefix', meaningJa: '共に・強意', nuanceJa: 'co- のラテン語形。「一緒に」または意味の強調。conclude＝完全に閉じる＝結論づける。', examples: ['connect', 'conclude', 'confirm', 'contain'], level: 'basic' },
  { id: 'com-together', form: 'com', kind: 'prefix', meaningJa: '共に', nuanceJa: 'con- が b/m/p の前で com- に変化した形。combine＝2つを共に結ぶ。', examples: ['combine', 'compose', 'compassion', 'companion'], level: 'basic' },
  { id: 'col-together', form: 'col', kind: 'prefix', meaningJa: '共に', nuanceJa: 'con- が l の前で col- に変化した形。collaborate＝共に働く。', examples: ['collaborate', 'collect', 'collide'], level: 'advanced' },
  { id: 'cor-together', form: 'cor', kind: 'prefix', meaningJa: '共に', nuanceJa: 'con- が r の前で cor- に変化した形。correspond＝共に応じる＝一致する・文通する。', examples: ['correspond', 'correlate'], level: 'advanced' },
  { id: 'syn-together', form: 'syn', kind: 'prefix', meaningJa: '共に', nuanceJa: 'ギリシャ語系の「共に」。synthesis＝共に置くこと＝統合・合成。', examples: ['synthesis', 'synchronize', 'syndrome'], level: 'advanced' },
  { id: 'sym-together', form: 'sym', kind: 'prefix', meaningJa: '共に', nuanceJa: 'syn- が b/m/p の前で sym- に変化した形。sympathy＝共に感じること＝同情。', examples: ['sympathy', 'symphony', 'symbol'], level: 'advanced' },
  { id: 'mono-one', form: 'mono', kind: 'prefix', meaningJa: '1つ', nuanceJa: 'ギリシャ語系の「1」。monologue＝1人で話すこと＝独白。', examples: ['monologue', 'monotone', 'monopoly'], level: 'basic' },
  { id: 'bi-two', form: 'bi', kind: 'prefix', meaningJa: '2つ', nuanceJa: 'bilingual＝2言語を話す。', examples: ['bicycle', 'bilingual', 'biannual'], level: 'basic' },
  { id: 'tri-three', form: 'tri', kind: 'prefix', meaningJa: '3つ', nuanceJa: 'triangle＝3つの角＝三角形。', examples: ['triangle', 'triple', 'trilogy'], level: 'basic' },
  { id: 'semi-half', form: 'semi', kind: 'prefix', meaningJa: '半分', nuanceJa: 'semifinal＝決勝の半分手前＝準決勝。', examples: ['semifinal', 'semicircle'], level: 'basic' },
  { id: 'multi-many', form: 'multi', kind: 'prefix', meaningJa: '多数', nuanceJa: 'multicultural＝多文化の。', examples: ['multiple', 'multicultural', 'multitask'], level: 'basic' },
  { id: 'poly-many', form: 'poly', kind: 'prefix', meaningJa: '多数', nuanceJa: 'ギリシャ語系の「多」。polygon＝多くの角＝多角形。', examples: ['polygon', 'polyglot'], level: 'advanced' },
  { id: 'omni-all', form: 'omni', kind: 'prefix', meaningJa: '全て', nuanceJa: 'omnipresent＝どこにでも存在する＝遍在する。', examples: ['omnipresent', 'omnivore'], level: 'advanced' },
  { id: 'pan-all', form: 'pan', kind: 'prefix', meaningJa: '全て', nuanceJa: 'ギリシャ語系の「全」。pandemic＝pan（全）＋dem（民衆）＝全民衆に及ぶ＝世界的流行。', examples: ['pandemic', 'panorama'], level: 'advanced' },
  { id: 'ambi-both', form: 'ambi', kind: 'prefix', meaningJa: '両方', nuanceJa: 'ambiguous＝両方に取れる＝曖昧な。', examples: ['ambiguous', 'ambivalent'], level: 'advanced' },
  { id: 'micro-small', form: 'micro', kind: 'prefix', meaningJa: '微小', nuanceJa: 'microscope＝小さいものを見る器具＝顕微鏡。', examples: ['microscope', 'microorganism'], level: 'basic' },
  { id: 'mini-small', form: 'mini', kind: 'prefix', meaningJa: '小さい', nuanceJa: 'minimize＝最小にする。', examples: ['miniature', 'minimize'], level: 'basic' },

  // ============ 接頭語: 性質・その他 ============
  { id: 'auto-self', form: 'auto', kind: 'prefix', meaningJa: '自分', nuanceJa: 'autobiography＝自分で書く伝記＝自伝。autonomy＝自分で law（規範）を持つ＝自治・自律。', examples: ['automatic', 'autobiography', 'autonomy'], level: 'basic' },
  { id: 'self-self', form: 'self', kind: 'prefix', meaningJa: '自己', nuanceJa: '英語本来の「自分」。self-esteem＝自尊心。', examples: ['selfless', 'self-esteem', 'self-control'], level: 'basic' },
  { id: 'tele-far', form: 'tele', kind: 'prefix', meaningJa: '遠い', nuanceJa: 'telescope＝遠くを見る器具＝望遠鏡。', examples: ['telephone', 'telescope', 'telepathy'], level: 'basic' },
  { id: 'bio-life', form: 'bio', kind: 'prefix', meaningJa: '生命', nuanceJa: 'biology＝生命の学問＝生物学。', examples: ['biology', 'biography', 'biotechnology'], level: 'basic' },
  { id: 'geo-earth', form: 'geo', kind: 'prefix', meaningJa: '地球・土地', nuanceJa: 'geography＝土地を記述する学問＝地理学。', examples: ['geography', 'geology', 'geometry'], level: 'advanced' },
  { id: 'eco-house', form: 'eco', kind: 'prefix', meaningJa: '環境・家', nuanceJa: 'ギリシャ語 oikos（家）由来。economy＝家の管理→経済。ecology＝環境の学問。', examples: ['ecology', 'economy', 'ecosystem'], level: 'basic' },
  { id: 'bene-good', form: 'bene', kind: 'prefix', meaningJa: '良い', nuanceJa: 'benefit＝良い行い→利益。mal-（悪い）の対義。', connotation: 'positive', examples: ['benefit', 'benevolent', 'benefactor'], level: 'advanced' },
  { id: 'en-make', form: 'en', kind: 'prefix', meaningJa: '〜にする', nuanceJa: '名詞・形容詞に付いて動詞化。enable＝可能にする。enrich＝豊かにする。', examples: ['enable', 'enrich', 'encourage', 'enlarge'], level: 'basic' },
  { id: 'em-make', form: 'em', kind: 'prefix', meaningJa: '〜にする', nuanceJa: 'en- が b/p の前で em- に変化した形。empower＝力を与える。', examples: ['empower', 'embody', 'embrace'], level: 'advanced' },
  { id: 'be-make', form: 'be', kind: 'prefix', meaningJa: '〜にする・すっかり', nuanceJa: '英語本来の接頭語。befriend＝友達になる。belittle＝小さく扱う＝見くびる。', examples: ['befriend', 'belittle', 'beware'], level: 'advanced' },
  { id: 'vice-deputy', form: 'vice', kind: 'prefix', meaningJa: '副・代理', nuanceJa: 'vice-president＝副大統領・副社長。', examples: ['vice-president', 'vice-chairman'], level: 'advanced' },
  { id: 'neo-new', form: 'neo', kind: 'prefix', meaningJa: '新しい', nuanceJa: 'ギリシャ語系の「新」。neologism＝新語。', examples: ['neoclassical', 'neologism'], level: 'advanced' },

  // ============ 接尾語: 人・行為者 ============
  { id: 'er-agent', form: 'er', kind: 'suffix', meaningJa: '〜する人・物', nuanceJa: '動詞に付いて「〜する人・道具」。teacher＝教える人。er-comparative（比較級）とは別物。', examples: ['teacher', 'singer', 'employer', 'computer'], level: 'basic' },
  { id: 'er-comparative', form: 'er', kind: 'suffix', meaningJa: '比較級', nuanceJa: '形容詞・副詞に付いて「より〜」。er-agent（〜する人）とは別物。', examples: ['bigger', 'stronger', 'earlier'], level: 'basic' },
  { id: 'or-agent', form: 'or', kind: 'suffix', meaningJa: '〜する人・物', nuanceJa: '-er と同じ「行為者」。ラテン語系の動詞に付くことが多い。actor＝演じる人。', examples: ['actor', 'inventor', 'editor'], level: 'basic' },
  { id: 'ist-person', form: 'ist', kind: 'suffix', meaningJa: '〜する人・主義者', nuanceJa: '「専門家・信奉者」。scientist＝科学者。optimist＝楽観主義者。', examples: ['artist', 'scientist', 'specialist'], level: 'basic' },
  { id: 'ian-person', form: 'ian', kind: 'suffix', meaningJa: '〜の人・専門家', nuanceJa: 'musician＝音楽の専門家。歴史・地域名にも付く（historian, Italian）。', examples: ['musician', 'historian', 'politician'], level: 'basic' },
  { id: 'ee-receiver', form: 'ee', kind: 'suffix', meaningJa: '〜される人', nuanceJa: '-er（する側）に対して「される側」。employer（雇う人）⇔ employee（雇われる人）。', examples: ['employee', 'trainee', 'interviewee'], level: 'basic' },
  { id: 'ant-person', form: 'ant', kind: 'suffix', meaningJa: '〜する人', nuanceJa: '行為者を表す名詞を作る。applicant＝応募する人。ant-adj（形容詞化）とは別物。', examples: ['assistant', 'applicant', 'participant'], level: 'advanced' },
  { id: 'ant-adj', form: 'ant', kind: 'suffix', meaningJa: '形容詞化', nuanceJa: '「〜の性質を持つ」形容詞を作る。distant＝離れている。ant-person（〜する人）とは別物。', examples: ['important', 'distant', 'significant'], level: 'advanced' },
  { id: 'ent-person', form: 'ent', kind: 'suffix', meaningJa: '〜する人', nuanceJa: '行為者を表す名詞を作る。resident＝住む人＝住民。ent-adj（形容詞化）とは別物。', examples: ['student', 'president', 'resident'], level: 'advanced' },
  { id: 'ent-adj', form: 'ent', kind: 'suffix', meaningJa: '形容詞化', nuanceJa: '「〜している状態の」形容詞を作る。confident＝自信のある。ent-person（〜する人）とは別物。', examples: ['different', 'confident', 'sufficient'], level: 'advanced' },

  // ============ 接尾語: 名詞化 ============
  { id: 'tion-noun', form: 'tion', kind: 'suffix', meaningJa: '名詞化（こと）', nuanceJa: '動詞を「〜すること・〜の結果」の名詞にする。act→action。', examples: ['action', 'education', 'information'], level: 'basic' },
  { id: 'sion-noun', form: 'sion', kind: 'suffix', meaningJa: '名詞化（こと）', nuanceJa: '-tion の変化形。decide→decision。', examples: ['decision', 'conclusion', 'permission'], level: 'basic' },
  { id: 'ment-noun', form: 'ment', kind: 'suffix', meaningJa: '名詞化（こと・結果）', nuanceJa: '動詞を「行為・結果・手段」の名詞にする。develop→development。', examples: ['development', 'government', 'movement'], level: 'basic' },
  { id: 'ness-noun', form: 'ness', kind: 'suffix', meaningJa: '名詞化（状態・性質）', nuanceJa: '形容詞を「〜であること」の名詞にする。happy→happiness。', examples: ['happiness', 'kindness', 'awareness'], level: 'basic' },
  { id: 'ity-noun', form: 'ity', kind: 'suffix', meaningJa: '名詞化（性質）', nuanceJa: '形容詞を「〜という性質」の名詞にする。able→ability。', examples: ['ability', 'reality', 'curiosity'], level: 'basic' },
  { id: 'ance-noun', form: 'ance', kind: 'suffix', meaningJa: '名詞化（状態・行為）', nuanceJa: '-ant 系の形容詞・動詞と対応する名詞を作る。important→importance。', examples: ['importance', 'performance', 'appearance'], level: 'basic' },
  { id: 'ence-noun', form: 'ence', kind: 'suffix', meaningJa: '名詞化（状態・行為）', nuanceJa: '-ent 系の形容詞・動詞と対応する名詞を作る。different→difference。', examples: ['difference', 'existence', 'confidence'], level: 'basic' },
  { id: 'ship-state', form: 'ship', kind: 'suffix', meaningJa: '状態・関係・身分', nuanceJa: 'friendship＝友人である関係。leadership＝指導者としての資質・地位。', examples: ['friendship', 'leadership', 'relationship'], level: 'basic' },
  { id: 'hood-state', form: 'hood', kind: 'suffix', meaningJa: '状態・時期・集団', nuanceJa: 'childhood＝子どもである時期。neighborhood＝近隣（の人々）。', examples: ['childhood', 'neighborhood', 'adulthood'], level: 'basic' },
  { id: 'dom-state', form: 'dom', kind: 'suffix', meaningJa: '領域・状態', nuanceJa: 'kingdom＝王の領域＝王国。freedom＝自由である状態。', examples: ['freedom', 'kingdom', 'wisdom'], level: 'advanced' },
  { id: 'ism-doctrine', form: 'ism', kind: 'suffix', meaningJa: '主義・行動様式', nuanceJa: 'capitalism＝資本主義。criticism＝批評（する行為）。', examples: ['capitalism', 'criticism', 'optimism'], level: 'basic' },
  { id: 'age-noun', form: 'age', kind: 'suffix', meaningJa: '名詞化（集合・状態・行為）', nuanceJa: 'shortage＝足りない状態＝不足。marriage＝結婚（という行為・状態）。', examples: ['marriage', 'passage', 'shortage'], level: 'advanced' },
  { id: 'ure-noun', form: 'ure', kind: 'suffix', meaningJa: '名詞化（行為・結果）', nuanceJa: 'fail→failure、depart→departure。', examples: ['failure', 'pressure', 'departure'], level: 'advanced' },
  { id: 'th-noun', form: 'th', kind: 'suffix', meaningJa: '名詞化（状態）', nuanceJa: '形容詞・動詞を名詞にする古い接尾語。grow→growth、deep→depth、strong→strength。', examples: ['growth', 'depth', 'warmth', 'strength'], level: 'advanced' },
  { id: 'tude-noun', form: 'tude', kind: 'suffix', meaningJa: '名詞化（状態）', nuanceJa: 'attitude＝姿勢・態度。gratitude＝感謝の気持ち。', examples: ['attitude', 'gratitude', 'altitude'], level: 'advanced' },

  // ============ 接尾語: 形容詞化 ============
  { id: 'al-adj', form: 'al', kind: 'suffix', meaningJa: '形容詞化（〜の）', nuanceJa: '名詞に付いて「〜に関する」。nation→national。al-noun（名詞化）とは別物。', examples: ['national', 'cultural', 'personal'], level: 'basic' },
  { id: 'al-noun', form: 'al', kind: 'suffix', meaningJa: '名詞化（こと）', nuanceJa: '動詞に付いて「〜すること」。arrive→arrival、propose→proposal。al-adj（形容詞化）とは別物。', examples: ['arrival', 'proposal', 'refusal', 'approval'], level: 'advanced' },
  { id: 'ic-adj', form: 'ic', kind: 'suffix', meaningJa: '形容詞化（〜の）', nuanceJa: '「〜の性質の」。economy→economic、science→scientific。', examples: ['economic', 'scientific', 'energetic'], level: 'basic' },
  { id: 'ous-adj', form: 'ous', kind: 'suffix', meaningJa: '形容詞化（〜に満ちた）', nuanceJa: '「〜が多い・〜の性質に満ちた」。danger→dangerous。unanimous＝uni（1つ）＋anim（心）＋ous＝心が1つの。', examples: ['famous', 'dangerous', 'unanimous'], level: 'basic' },
  { id: 'ful-full', form: 'ful', kind: 'suffix', meaningJa: '〜に満ちた', nuanceJa: '「full」由来。care→careful（注意深い）。-less（〜のない）の対義。', examples: ['beautiful', 'careful', 'successful'], level: 'basic' },
  { id: 'less-without', form: 'less', kind: 'suffix', meaningJa: '〜のない', nuanceJa: '「〜が無い」。care→careless（不注意な）。-ful の対義。', connotation: 'negative', examples: ['careless', 'endless', 'homeless'], level: 'basic' },
  { id: 'able-can', form: 'able', kind: 'suffix', meaningJa: '〜できる', nuanceJa: '「〜されうる・〜に適した」。rely→reliable（信頼できる）。', examples: ['available', 'comfortable', 'reliable'], level: 'basic' },
  { id: 'ible-can', form: 'ible', kind: 'suffix', meaningJa: '〜できる', nuanceJa: '-able の変化形（ラテン語系）。visible＝見ることができる。', examples: ['possible', 'visible', 'flexible'], level: 'basic' },
  { id: 'ive-adj', form: 'ive', kind: 'suffix', meaningJa: '形容詞化（〜の性質）', nuanceJa: '「〜する傾向がある」。create→creative、act→active。', examples: ['active', 'creative', 'effective'], level: 'basic' },
  { id: 'ary-adj', form: 'ary', kind: 'suffix', meaningJa: '〜に関する', nuanceJa: '形容詞・名詞を作る。necessary＝必要な。dictionary＝言葉に関するもの＝辞書。', examples: ['necessary', 'ordinary', 'voluntary'], level: 'advanced' },
  { id: 'ory-adj', form: 'ory', kind: 'suffix', meaningJa: '〜の性質・場所', nuanceJa: '形容詞（compulsory＝強制的な）や場所の名詞（factory, laboratory）を作る。', examples: ['factory', 'laboratory', 'compulsory'], level: 'advanced' },
  { id: 'some-adj', form: 'some', kind: 'suffix', meaningJa: '〜を引き起こす', nuanceJa: '「〜しがちな・〜をもたらす」。troublesome＝厄介な。awesome＝畏敬の念を起こさせる→すごい。', examples: ['troublesome', 'awesome', 'tiresome'], level: 'advanced' },
  { id: 'proof-resist', form: 'proof', kind: 'suffix', meaningJa: '耐〜', nuanceJa: '「〜を通さない・〜に耐える」。waterproof＝防水の。', examples: ['waterproof', 'foolproof', 'soundproof'], level: 'advanced' },
  { id: 'ate-adj', form: 'ate', kind: 'suffix', meaningJa: '形容詞化', nuanceJa: '「〜の性質を持つ」形容詞を作る。accurate＝正確な。ate-verb（動詞化）とは別物。', examples: ['accurate', 'delicate', 'fortunate'], level: 'advanced' },

  // ============ 接尾語: 副詞・動詞化・方向 ============
  { id: 'ly-adverb', form: 'ly', kind: 'suffix', meaningJa: '副詞化', nuanceJa: '形容詞に付いて副詞を作る。quick→quickly。ly-adj（形容詞化）とは別物。', examples: ['quickly', 'carefully', 'finally'], level: 'basic' },
  { id: 'ly-adj', form: 'ly', kind: 'suffix', meaningJa: '形容詞化（〜らしい）', nuanceJa: '名詞に付くと形容詞になる。friend→friendly（友好的な）、cost→costly（高価な）。副詞化の -ly とは別物。', examples: ['friendly', 'lovely', 'costly', 'daily'], level: 'basic' },
  { id: 'ward-direction', form: 'ward', kind: 'suffix', meaningJa: '方向', nuanceJa: '「〜の方向へ」。forward＝前方へ、backward＝後方へ。', examples: ['forward', 'backward', 'toward'], level: 'basic' },
  { id: 'wise-manner', form: 'wise', kind: 'suffix', meaningJa: '〜の点で・〜の方向に', nuanceJa: 'clockwise＝時計回りに。otherwise＝別のやり方で→さもなければ。', examples: ['otherwise', 'clockwise', 'likewise'], level: 'advanced' },
  { id: 'en-verb', form: 'en', kind: 'suffix', meaningJa: '動詞化（〜にする）', nuanceJa: '形容詞に付いて「〜にする」。wide→widen（広げる）。en-material（〜製の）とは別物。', examples: ['widen', 'strengthen', 'shorten'], level: 'basic' },
  { id: 'en-material', form: 'en', kind: 'suffix', meaningJa: '〜製の', nuanceJa: '素材の名詞に付いて「〜でできた」。wood→wooden（木製の）。en-verb（動詞化）とは別物。', examples: ['wooden', 'golden', 'woolen'], level: 'advanced' },
  { id: 'ize-verb', form: 'ize', kind: 'suffix', meaningJa: '動詞化（〜化する）', nuanceJa: '「〜の状態にする」。real→realize、organ→organize。英式綴りは -ise。', examples: ['realize', 'organize', 'memorize'], level: 'basic' },
  { id: 'ify-verb', form: 'ify', kind: 'suffix', meaningJa: '動詞化（〜化する）', nuanceJa: '「〜にする」。simple→simplify（単純化する）。', examples: ['simplify', 'identify', 'justify'], level: 'basic' },
  { id: 'ate-verb', form: 'ate', kind: 'suffix', meaningJa: '動詞化', nuanceJa: '「〜する・〜にする」動詞を作る。active→activate。ate-adj（形容詞化）とは別物。', examples: ['create', 'activate', 'communicate'], level: 'advanced' },

  // ============ 接尾語: 学問・専門 ============
  { id: 'logy-study', form: 'logy', kind: 'suffix', meaningJa: '学問・論', nuanceJa: 'ギリシャ語 logos（言葉・論理）由来。bio（生命）＋logy＝生物学。', examples: ['biology', 'psychology', 'technology'], level: 'basic' },
  { id: 'graphy-writing', form: 'graphy', kind: 'suffix', meaningJa: '記述・記録法', nuanceJa: '「書く・記録する」。geo（土地）＋graphy＝地理学。photo（光）＋graphy＝写真。', examples: ['geography', 'photography', 'biography'], level: 'advanced' },
  { id: 'cide-kill', form: 'cide', kind: 'suffix', meaningJa: '殺す', nuanceJa: 'ラテン語 caedere（切る・殺す）由来。pesticide＝害虫を殺すもの＝殺虫剤。', examples: ['suicide', 'pesticide', 'homicide'], level: 'advanced' },
  { id: 'cracy-rule', form: 'cracy', kind: 'suffix', meaningJa: '政治・支配', nuanceJa: 'demo（民衆）＋cracy＝民主主義。bureau（役所）＋cracy＝官僚制。', examples: ['democracy', 'bureaucracy'], level: 'advanced' },

  // ============ 接中語（連結母音） ============
  { id: 'o-link', form: 'o', kind: 'infix', meaningJa: '連結母音', nuanceJa: 'ギリシャ語系の語根同士をつなぐ「つなぎの o」。therm（熱）-o-meter（計）＝温度計。', examples: ['thermometer', 'speedometer'], level: 'advanced' },
  { id: 'i-link', form: 'i', kind: 'infix', meaningJa: '連結母音', nuanceJa: 'ラテン語系の語根同士をつなぐ「つなぎの i」。herb（草）-i-vore（食べる）＝草食動物。', examples: ['herbivore', 'carnivore', 'insecticide'], level: 'advanced' },
] as const;

/** id → AffixSense の索引 */
export const AFFIX_BY_ID: ReadonlyMap<string, AffixSense> = new Map(
  AFFIX_CATALOG.map((sense) => [sense.id, sense]),
);

export function getAffixesByKind(kind: AffixKind): AffixSense[] {
  return AFFIX_CATALOG.filter((sense) => sense.kind === kind);
}

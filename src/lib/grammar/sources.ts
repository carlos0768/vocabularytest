// 文法マップの問題バンクが依拠する公開ソースの台帳。
//
// 収録できるのは「商用利用・改変・再配布が明示的に可能なもの」だけに限る。
// すなわち public domain (保護期間満了) と CC BY のみを採用し、
// CC BY-SA (継承義務がアプリ全体の配布条件に跳ね返る) と
// NC / ND / 権利未整理のものは採用しない。
//
// CC BY は「原著者名・作品名・ライセンスへのリンク・変更した旨」の表示が必要なので、
// アイテム単位で sourceId を持たせ、画面と /grammar/map/licenses で必ず表示する。
// 画像・図版・埋め込みメディアは元のオープンライセンスに含まれない場合があるため
// ("except where otherwise noted")、本文テキストのみを扱い、素材は取り込まない。

export type GrammarSourceLicense = 'public-domain' | 'cc-by-4.0';

export type GrammarSource = {
  id: string;
  /** 作品名 */
  title: string;
  /** 著者・編者 (public domain の古典は原著者) */
  author: string;
  /** 底本・原典のURL */
  url: string;
  /** ライセンス原文へのリンク (public domain は所蔵機関の権利表示) */
  licenseUrl: string;
  license: GrammarSourceLicense;
  /** 表示用のライセンス名 */
  licenseLabel: string;
  /** このバンクでの利用のしかた (CC BY が要求する「変更した旨」に相当) */
  modifications: string;
  /** 帰属表示の一行版 */
  attribution: string;
};

export const GRAMMAR_SOURCES: GrammarSource[] = [
  {
    id: 'pd-1001-questions',
    title: '1001 Questions and Answers on English Grammar',
    author: 'B. A. Hathaway',
    url: 'https://babel.hathitrust.org/cgi/pt?id=uiug.30112056432740',
    licenseUrl: 'https://babel.hathitrust.org/cgi/pt?id=uiug.30112056432740',
    license: 'public-domain',
    licenseLabel: 'Public Domain',
    modifications:
      '古典的な品詞・構文別のQ&Aを出題項目の参照に用い、現代英語の用例・4択・日本語解説はMERKENで新規に作成。',
    attribution:
      '1001 Questions and Answers on English Grammar (B. A. Hathaway) — Public Domain, HathiTrust Digital Library',
  },
  {
    id: 'cc-by-digital-workbook-esol',
    title: 'A Digital Workbook for Beginning ESOL',
    author: 'Eric Dodson, Davida Jordan, Justin Parnell, Jennifer Stair',
    url: 'https://openoregon.pressbooks.pub/esol23/',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    license: 'cc-by-4.0',
    licenseLabel: 'CC BY 4.0',
    modifications:
      '基礎レベルの文法項目の並び (be動詞・冠詞・前置詞・現在形・比較級など) を参照。設問文・選択肢・日本語解説はMERKENで新規に作成し、H5P演習・画像は取り込んでいない。',
    attribution:
      'A Digital Workbook for Beginning ESOL by Eric Dodson, Davida Jordan, Justin Parnell, and Jennifer Stair, licensed under CC BY 4.0',
  },
  {
    id: 'cc-by-advanced-academic-grammar',
    title: 'Advanced Academic Grammar for ESL Students',
    author: 'Rachel Lee',
    url: 'https://open.umn.edu/opentextbooks/textbooks/advanced-academic-grammar-for-esl-students',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    license: 'cc-by-4.0',
    licenseLabel: 'CC BY 4.0',
    modifications:
      '発展レベルの項目 (関係詞節・受動態・時制の一貫性・冠詞など) を参照。設問文・選択肢・日本語解説はMERKENで新規に作成。',
    attribution:
      'Advanced Academic Grammar for ESL Students by Rachel Lee, licensed under CC BY 4.0',
  },
  {
    id: 'mext-course-of-study',
    title: '高等学校学習指導要領解説 外国語編 付録9「言語材料」',
    author: '文部科学省',
    url: 'https://www.mext.go.jp/a_menu/shotou/new-cs/1407074.htm',
    licenseUrl: 'https://www.mext.go.jp/b_menu/link/mext_00001.html',
    license: 'public-domain',
    licenseLabel: '公的資料（出典明示で利用可）',
    modifications: '高校段階で扱う言語材料の範囲を、26大単元・76小単元の学年配当の根拠として参照。',
    attribution: '文部科学省「高等学校学習指導要領解説 外国語編」付録9',
  },
];

const sourceById = new Map(GRAMMAR_SOURCES.map((source) => [source.id, source]));

export function findGrammarSource(id: string): GrammarSource | null {
  return sourceById.get(id) ?? null;
}

/** バンクが実際に使っているソースだけを、帰属表示のために返す */
export function grammarSourcesFor(sourceIds: Iterable<string>): GrammarSource[] {
  const used = new Set(sourceIds);
  return GRAMMAR_SOURCES.filter((source) => used.has(source.id));
}

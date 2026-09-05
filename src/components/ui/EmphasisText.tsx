import { parseEmphasisMarkup } from '@/lib/ui/emphasis-markup';

/**
 * `**重要語**` を太字・赤字で描画する。教材（豆知識）の文章に使う。
 * 色は globals.css の `.keyword-emphasis` で持ち、ダークテーマでも読める赤にしてある。
 */
export function EmphasisText({ text }: { text: string }) {
  const segments = parseEmphasisMarkup(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.emphasis ? (
          <strong key={index} className="keyword-emphasis">
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

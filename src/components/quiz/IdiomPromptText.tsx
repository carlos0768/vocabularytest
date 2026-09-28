import type { IdiomSegment } from '@/lib/quiz/idiom-preposition';

interface IdiomPromptTextProps {
  segments: IdiomSegment[];
  /** 答えた後は前置詞を戻して、どこが隠れていたか分かるよう下線で示す。 */
  revealed: boolean;
}

/**
 * 四択 (Passive) の出題文でイディオムの前置詞だけを伏せる。
 * 伏せ字の幅は前置詞の長さに関係なく一定にして、文字数から答えが割れないようにする。
 */
export function IdiomPromptText({ segments, revealed }: IdiomPromptTextProps) {
  return (
    <>
      {segments.map((segment, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {!segment.hidden ? (
            segment.text
          ) : revealed ? (
            <span
              className="underline decoration-[3px] underline-offset-[6px]"
              style={{ color: 'var(--color-accent-ink)', textDecorationColor: 'var(--color-accent)' }}
            >
              {segment.text}
            </span>
          ) : (
            <span
              aria-label="前置詞"
              className="inline-block min-w-[2.2em] border-b-[3px] align-baseline"
              style={{ borderColor: 'currentColor', opacity: 0.55 }}
            >
              {' '}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

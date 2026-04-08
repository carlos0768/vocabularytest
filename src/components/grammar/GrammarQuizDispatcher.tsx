'use client';

import type { GrammarQuizQuestion } from '@/types';
import { GrammarSingleSelect } from './GrammarSingleSelect';
import { GrammarWordTap } from './GrammarWordTap';
import { GrammarSentenceBuild } from './GrammarSentenceBuild';

interface GrammarQuizDispatcherProps {
  question: GrammarQuizQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

export function GrammarQuizDispatcher({ question, onAnswer }: GrammarQuizDispatcherProps) {
  switch (question.questionType) {
    case 'single_select':
      return <GrammarSingleSelect question={question} onAnswer={onAnswer} />;
    case 'word_tap':
      return <GrammarWordTap question={question} onAnswer={onAnswer} />;
    case 'sentence_build':
      return <GrammarSentenceBuild question={question} onAnswer={onAnswer} />;
    default:
      return <GrammarSingleSelect question={question} onAnswer={onAnswer} />;
  }
}

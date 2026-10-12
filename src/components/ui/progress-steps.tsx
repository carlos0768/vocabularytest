'use client';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

// Progress steps component for showing AI processing status
// Displays: "文字を解析中..." → "問題を作成中..." → "誤答を生成中..."

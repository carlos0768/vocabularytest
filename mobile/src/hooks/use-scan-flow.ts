import React, { createContext, useContext, useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { useAuth } from './use-auth';
import { createScanJob, waitForScanJobCompletion, type ScanMode } from '../lib/scan-jobs';
import type { ProgressStep } from '../types';

type SupportedScanMode = Extract<ScanMode, 'all' | 'circled' | 'eiken'>;

type ScanResult = {
  type: 'client_local';
  words: unknown[];
  projectName: string;
} | {
  type: 'server';
  projectId: string;
};

interface ScanFlowContextValue {
  showScanModeModal: boolean;
  setShowScanModeModal: (v: boolean) => void;
  processing: boolean;
  processingSteps: ProgressStep[];
  closeProcessing: () => void;
  handleOpenScan: () => boolean;
  promptImageSource: (scanMode: SupportedScanMode, eikenLevel?: string | null) => void;
  lastScanResult: ScanResult | null;
  clearScanResult: () => void;
}

const defaultSteps: ProgressStep[] = [
  { id: 'upload', label: '画像をアップロード中...', status: 'pending' },
  { id: 'process', label: '単語を抽出中...', status: 'pending' },
  { id: 'save', label: '保存先を準備中...', status: 'pending' },
];

const ScanFlowContext = createContext<ScanFlowContextValue>({
  showScanModeModal: false,
  setShowScanModeModal: () => {},
  processing: false,
  processingSteps: defaultSteps,
  closeProcessing: () => {},
  handleOpenScan: () => false,
  promptImageSource: () => {},
  lastScanResult: null,
  clearScanResult: () => {},
});

function formatScanProjectTitle() {
  const now = new Date();
  return `スキャン ${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function ScanFlowProvider({
  children,
  onNavigateLogin,
  onNavigateSubscription,
  onNavigateScanConfirm,
  onNavigateProject,
}: {
  children: React.ReactNode;
  onNavigateLogin: () => void;
  onNavigateSubscription: () => void;
  onNavigateScanConfirm: (words: unknown[], projectName: string) => void;
  onNavigateProject: (projectId: string) => void;
}) {
  const { session, isAuthenticated, isPro } = useAuth();
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>(defaultSteps);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);

  const closeProcessing = useCallback(() => {
    setProcessing(false);
    setProcessingSteps([...defaultSteps]);
  }, []);

  const clearScanResult = useCallback(() => setLastScanResult(null), []);

  const handleProtectedAction = useCallback(
    (options?: { requirePro?: boolean; featureName?: string }) => {
      if (!isAuthenticated || !session?.access_token) {
        Alert.alert(
          'ログインが必要です',
          `${options?.featureName ?? 'この機能'}を使うにはログインしてください。`,
          [
            { text: '閉じる', style: 'cancel' },
            { text: 'ログイン', onPress: onNavigateLogin },
          ]
        );
        return false;
      }
      if (options?.requirePro && !isPro) {
        Alert.alert(
          'Test Pro / Pro が必要です',
          `${options.featureName ?? 'この機能'}は Test Pro または Pro で確認できます。`,
          [
            { text: '閉じる', style: 'cancel' },
            { text: 'Test Pro を開く', onPress: onNavigateSubscription },
          ]
        );
        return false;
      }
      return true;
    },
    [isAuthenticated, isPro, session?.access_token, onNavigateLogin, onNavigateSubscription]
  );

  const handleOpenScan = useCallback(() => {
    if (!handleProtectedAction({ featureName: 'スキャン' })) {
      return false;
    }
    setShowScanModeModal(true);
    return true;
  }, [handleProtectedAction]);

  const startScan = useCallback(
    async (
      scanMode: SupportedScanMode,
      source: 'camera' | 'library',
      eikenLevel?: string | null
    ) => {
      if (!session?.access_token) {
        Alert.alert('ログインが必要です', '先にログインしてください。');
        return;
      }

      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permission.status !== 'granted') {
          Alert.alert(
            '権限が必要です',
            source === 'camera'
              ? 'カメラの使用を許可してください。'
              : '写真ライブラリの使用を許可してください。'
          );
          return;
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
                allowsMultipleSelection: false,
              });

        if (result.canceled || !result.assets[0]?.uri) return;

        const asset = result.assets[0];
        const projectTitle = formatScanProjectTitle();

        setProcessing(true);
        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'active' },
          { id: 'process', label: '単語を抽出中...', status: 'pending' },
          { id: 'save', label: '保存先を準備中...', status: 'pending' },
        ]);

        const created = await createScanJob({
          session,
          imageUri: asset.uri,
          projectTitle,
          scanMode,
          eikenLevel: eikenLevel ?? null,
          mimeType: asset.mimeType,
        });

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'active' },
          {
            id: 'save',
            label:
              created.saveMode === 'client_local'
                ? '確認画面を準備中...'
                : 'クラウド単語帳を作成中...',
            status: 'pending',
          },
        ]);

        const completed = await waitForScanJobCompletion(session, created.jobId);
        const parsedResult = completed.parsedResult ?? {};

        setProcessingSteps([
          { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
          { id: 'process', label: '単語を抽出中...', status: 'complete' },
          {
            id: 'save',
            label:
              created.saveMode === 'client_local'
                ? '確認画面を準備中...'
                : 'クラウド単語帳を作成中...',
            status: 'active',
          },
        ]);

        if (created.saveMode === 'client_local') {
          const extractedWords = (parsedResult.extractedWords ?? []) as unknown[];
          setProcessing(false);
          setLastScanResult({ type: 'client_local', words: extractedWords, projectName: projectTitle });
          onNavigateScanConfirm(extractedWords, projectTitle);
          return;
        }

        const projectId =
          (typeof parsedResult.targetProjectId === 'string'
            ? parsedResult.targetProjectId
            : null) ||
          completed.job.project_id ||
          null;

        if (!projectId) {
          throw new Error('保存先の単語帳が見つかりませんでした。');
        }

        setProcessing(false);
        setLastScanResult({ type: 'server', projectId });
        onNavigateProject(projectId);
      } catch (error) {
        console.error('Scan failed:', error);
        setProcessingSteps((current) => {
          let handled = false;
          return current.map((step) => {
            if (!handled && (step.status === 'active' || step.status === 'pending')) {
              handled = true;
              return {
                ...step,
                status: 'error' as const,
                label: error instanceof Error ? error.message : 'スキャンに失敗しました。',
              };
            }
            return step;
          });
        });
      }
    },
    [session, onNavigateScanConfirm, onNavigateProject]
  );

  const promptImageSource = useCallback(
    (scanMode: SupportedScanMode, eikenLevel?: string | null) => {
      Alert.alert('画像を選択', 'カメラかライブラリを選んでください。', [
        { text: 'カメラ', onPress: () => void startScan(scanMode, 'camera', eikenLevel ?? null) },
        { text: 'ライブラリ', onPress: () => void startScan(scanMode, 'library', eikenLevel ?? null) },
        { text: 'キャンセル', style: 'cancel' },
      ]);
    },
    [startScan]
  );

  const value: ScanFlowContextValue = {
    showScanModeModal,
    setShowScanModeModal,
    processing,
    processingSteps,
    closeProcessing,
    handleOpenScan,
    promptImageSource,
    lastScanResult,
    clearScanResult,
  };

  return React.createElement(ScanFlowContext.Provider, { value }, children);
}

export function useScanFlow() {
  return useContext(ScanFlowContext);
}

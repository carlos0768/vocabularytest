import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { ProgressSteps } from './ui/ProgressSteps';
import colors from '../constants/colors';
import type { ProgressStep } from '../types';

interface ProcessingModalProps {
  visible: boolean;
  steps: ProgressStep[];
  onClose?: () => void;
}

export function ProcessingModal({ visible, steps, onClose }: ProcessingModalProps) {
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            {hasError ? 'エラーが発生しました' : '解析中'}
          </Text>

          <ProgressSteps steps={steps} />

          {hasError && onClose && (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
    textAlign: 'center',
    marginBottom: 20,
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 14,
    color: colors.gray[700],
    textAlign: 'center',
    fontWeight: '500',
  },
});

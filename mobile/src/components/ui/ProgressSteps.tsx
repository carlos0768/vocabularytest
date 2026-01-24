import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Check, AlertCircle } from 'lucide-react-native';
import colors from '../../constants/colors';
import type { ProgressStep } from '../../types';

interface ProgressStepsProps {
  steps: ProgressStep[];
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.step}>
          <View style={styles.iconContainer}>
            {step.status === 'pending' && (
              <View style={styles.pendingDot} />
            )}
            {step.status === 'active' && (
              <ActivityIndicator size="small" color={colors.primary[600]} />
            )}
            {step.status === 'complete' && (
              <View style={styles.completeIcon}>
                <Check size={14} color={colors.white} strokeWidth={3} />
              </View>
            )}
            {step.status === 'error' && (
              <View style={styles.errorIcon}>
                <AlertCircle size={14} color={colors.white} strokeWidth={2} />
              </View>
            )}
          </View>

          <Text
            style={[
              styles.label,
              step.status === 'complete' && styles.labelComplete,
              step.status === 'error' && styles.labelError,
              step.status === 'pending' && styles.labelPending,
            ]}
            numberOfLines={2}
          >
            {step.label}
          </Text>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <View
              style={[
                styles.connector,
                step.status === 'complete' && styles.connectorComplete,
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    position: 'relative',
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gray[300],
  },
  completeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.emerald[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: colors.gray[900],
    lineHeight: 20,
  },
  labelComplete: {
    color: colors.gray[500],
  },
  labelError: {
    color: colors.red[600],
  },
  labelPending: {
    color: colors.gray[400],
  },
  connector: {
    position: 'absolute',
    left: 11,
    top: 28,
    width: 2,
    height: 12,
    backgroundColor: colors.gray[200],
  },
  connectorComplete: {
    backgroundColor: colors.emerald[500],
  },
});

import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';
import colors from '../../constants/colors';

interface QuizOptionProps {
  label: string;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  onSelect: () => void;
  disabled: boolean;
}

export function QuizOption({
  label,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  onSelect,
  disabled,
}: QuizOptionProps) {
  const optionLabels = ['A', 'B', 'C', 'D'];
  const flashAnim = useMemo(() => new Animated.Value(1), []);

  // Flash animation for correct answer
  useEffect(() => {
    if (isRevealed && isCorrect) {
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.7,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0.7,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isRevealed, isCorrect, flashAnim]);

  const getBackgroundColor = () => {
    if (!isRevealed) return colors.gray[50];
    if (isCorrect) return colors.emerald[50];
    if (isSelected) return colors.red[50];
    return colors.gray[50];
  };

  const getLabelBackgroundColor = () => {
    if (!isRevealed) return colors.gray[200];
    if (isCorrect) return colors.emerald[500];
    if (isSelected) return colors.red[500];
    return colors.gray[200];
  };

  const getLabelTextColor = () => {
    if (!isRevealed) return colors.gray[600];
    if (isCorrect || isSelected) return colors.white;
    return colors.gray[400];
  };

  const getTextColor = () => {
    if (!isRevealed) return colors.gray[900];
    if (isCorrect) return colors.emerald[700];
    if (isSelected) return colors.red[700];
    return colors.gray[400];
  };

  const getOpacity = () => {
    if (!isRevealed) return disabled ? 0.6 : 1;
    if (!isSelected && !isCorrect) return 0.4;
    return 1;
  };

  return (
    <Animated.View style={{ opacity: flashAnim }}>
      <TouchableOpacity
        onPress={onSelect}
        disabled={disabled}
        activeOpacity={0.8}
        style={[
          styles.container,
          { backgroundColor: getBackgroundColor(), opacity: getOpacity() },
        ]}
      >
        {/* Option label (A, B, C, D) */}
        <View
          style={[
            styles.labelContainer,
            { backgroundColor: getLabelBackgroundColor() },
          ]}
        >
          <Text style={[styles.labelText, { color: getLabelTextColor() }]}>
            {optionLabels[index]}
          </Text>
        </View>

        {/* Answer text */}
        <Text
          style={[
            styles.answerText,
            { color: getTextColor() },
            isRevealed && isCorrect && styles.answerTextBold,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  labelContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  answerText: {
    flex: 1,
    fontSize: 16,
  },
  answerTextBold: {
    fontWeight: '600',
  },
});

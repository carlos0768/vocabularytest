import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';
import { CheckCircle, XCircle } from 'lucide-react-native';
import colors from '../../constants/colors';
import theme from '../../constants/theme';

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

  const getFaceColor = () => {
    if (!isRevealed) return colors.white;
    if (isCorrect) return theme.successBg;
    if (isSelected) return theme.dangerBg;
    return colors.white;
  };

  const getLabelBackgroundColor = () => {
    if (!isRevealed) return colors.white;
    if (isCorrect) return theme.success;
    if (isSelected) return theme.danger;
    return colors.white;
  };

  const getBorderColor = () => {
    if (!isRevealed) return theme.solidInk;
    if (isCorrect) return theme.success;
    if (isSelected) return theme.danger;
    return colors.gray[200];
  };

  const getShadowColor = () => {
    if (!isRevealed) return theme.solidInk;
    if (isCorrect) return theme.success;
    if (isSelected) return theme.danger;
    return colors.gray[200];
  };

  const getLabelTextColor = () => {
    if (!isRevealed) return theme.solidInk;
    if (isCorrect || isSelected) return colors.white;
    return colors.gray[400];
  };

  const getTextColor = () => {
    if (!isRevealed) return theme.solidInk;
    if (isCorrect || isSelected) return theme.solidInk;
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
          {
            backgroundColor: getFaceColor(),
            borderColor: getBorderColor(),
            shadowColor: getShadowColor(),
            opacity: getOpacity(),
          },
          (isRevealed && (isCorrect || isSelected)) && styles.containerRevealed,
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
            isRevealed && isSelected && styles.answerTextBold,
          ]}
        >
          {label}
        </Text>
        {isRevealed && isCorrect ? (
          <CheckCircle size={20} color={theme.success} fill={theme.success} />
        ) : null}
        {isRevealed && isSelected && !isCorrect ? (
          <XCircle size={20} color={theme.danger} fill={theme.danger} />
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1.25,
    shadowOpacity: 1,
    shadowOffset: { width: 2, height: 2 },
    shadowRadius: 0,
    elevation: 2,
  },
  containerRevealed: {
    borderWidth: 2,
  },
  labelContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.25,
    borderColor: theme.solidInk,
  },
  labelText: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 13,
    fontWeight: '700',
  },
  answerText: {
    fontFamily: 'NotoSansJP_400Regular',
    flex: 1,
    fontSize: 15,
  },
  answerTextBold: {
    fontWeight: '900',
  },
});

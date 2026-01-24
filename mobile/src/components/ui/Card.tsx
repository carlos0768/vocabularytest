import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import colors from '../../constants/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

interface CardHeaderProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

interface CardTitleProps {
  children: React.ReactNode;
  style?: TextStyle;
  numberOfLines?: number;
}

interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHeader({ children, style }: CardHeaderProps) {
  return <View style={[styles.header, style]}>{children}</View>;
}

export function CardTitle({ children, style, numberOfLines }: CardTitleProps) {
  return (
    <Text style={[styles.title, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function CardContent({ children, style }: CardContentProps) {
  return <View style={[styles.content, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});

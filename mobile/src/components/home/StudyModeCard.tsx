import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import colors from '../../constants/colors';

type ColorVariant = 'red' | 'blue' | 'green' | 'purple' | 'orange';

interface StudyModeCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onPress: () => void;
  variant: ColorVariant;
  disabled?: boolean;
  badge?: string;
}

const variantStyles: Record<ColorVariant, {
  borderColor: string;
  bgColor: string;
  iconBgColor: string;
  iconColor: string;
}> = {
  red: {
    borderColor: colors.red[200],
    bgColor: colors.red[50],
    iconBgColor: colors.red[100],
    iconColor: colors.red[600],
  },
  blue: {
    borderColor: colors.primary[200],
    bgColor: colors.primary[50],
    iconBgColor: colors.primary[100],
    iconColor: colors.primary[600],
  },
  green: {
    borderColor: colors.emerald[200],
    bgColor: colors.emerald[50],
    iconBgColor: colors.emerald[100],
    iconColor: colors.emerald[600],
  },
  purple: {
    borderColor: colors.purple[200],
    bgColor: colors.purple[50],
    iconBgColor: colors.purple[100],
    iconColor: colors.purple[600],
  },
  orange: {
    borderColor: colors.orange[200],
    bgColor: colors.orange[50],
    iconBgColor: colors.orange[100],
    iconColor: colors.orange[600],
  },
};

export function StudyModeCard({
  title,
  description,
  icon: Icon,
  onPress,
  variant,
  disabled = false,
  badge,
}: StudyModeCardProps) {
  const variantStyle = variantStyles[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        styles.container,
        {
          borderColor: variantStyle.borderColor,
          backgroundColor: variantStyle.bgColor,
        },
        disabled && styles.disabled,
      ]}
    >
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: variantStyle.iconBgColor }]}>
          <Icon size={20} color={variantStyle.iconColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.purple[500],
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    padding: 8,
    borderRadius: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[900],
  },
  description: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 2,
  },
});

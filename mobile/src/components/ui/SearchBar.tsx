import React from 'react';
import { Search } from 'lucide-react-native';
import theme from '../../constants/theme';
import { SolidTextField } from './SolidTextField';
import type { StyleProp, ViewStyle } from 'react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Reusable search bar with magnifying glass icon */
export function SearchBar({
  value,
  onChangeText,
  placeholder = '検索',
  containerStyle,
}: SearchBarProps) {
  return (
    <SolidTextField
      icon={<Search size={16} color={theme.mutedText} />}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      containerStyle={containerStyle}
    />
  );
}

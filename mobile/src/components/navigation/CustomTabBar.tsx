import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  Home,
  Users,
  BarChart3,
  Settings,
  Plus,
} from 'lucide-react-native';
import theme from '../../constants/theme';
import { useScanFlow } from '../../hooks/use-scan-flow';

const TAB_ICONS: Record<string, typeof Home> = {
  HomeTab: Home,
  SharedTab: Users,
  StatsTab: BarChart3,
  SettingsTab: Settings,
};

const TAB_LABELS: Record<string, string> = {
  HomeTab: 'ホーム',
  SharedTab: '共有',
  StatsTab: '進歩',
  SettingsTab: '設定',
};

// Only show tab bar when on root screen of each tab
const ROOT_SCREENS = new Set(['Home', 'ProjectList', 'SharedProjects', 'Stats', 'Settings']);

function getNestedRouteIndex(tabRoute: any): number {
  const nestedState = tabRoute?.state;
  if (!nestedState) return 0; // No state yet = initial screen (index 0)
  return nestedState.index ?? 0;
}

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { handleOpenScan } = useScanFlow();

  // Hide tab bar when navigated deeper than the root screen of the active tab
  const focusedTab = state.routes[state.index];
  const nestedIndex = getNestedRouteIndex(focusedTab);
  const isOnRootScreen = nestedIndex === 0;

  if (!isOnRootScreen) return null;

  return (
    <View style={styles.wrapper}>
      {/* Floating scan button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 60 + Math.max(insets.bottom, 8) }]}
        activeOpacity={0.85}
        onPress={() => handleOpenScan()}
        accessibilityLabel="スキャン"
      >
        <Plus size={28} color={theme.white} strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Full-width tab bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const Icon = TAB_ICONS[route.name] ?? Home;
          const label = TAB_LABELS[route.name] ?? route.name;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              activeOpacity={0.7}
              style={styles.tab}
            >
              <Icon
                size={22}
                strokeWidth={isFocused ? 2.2 : 1.6}
                color={isFocused ? theme.primaryText : theme.mutedText}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.accentBlack,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.white,
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.mutedText,
  },
  tabLabelActive: {
    color: theme.primaryText,
    fontWeight: '600',
  },
});

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
  User,
  Plus,
} from 'lucide-react-native';
import theme from '../../constants/theme';
import { useScanFlow } from '../../hooks/use-scan-flow';

const TAB_ICONS: Record<string, typeof Home> = {
  HomeTab: Home,
  SharedTab: Users,
  StatsTab: BarChart3,
  SettingsTab: User,
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
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Floating scan button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => handleOpenScan()}
        accessibilityLabel="スキャン"
      >
        <Plus size={26} color={theme.white} strokeWidth={2.6} />
      </TouchableOpacity>

      {/* Full-width tab bar */}
      <View style={styles.bar}>
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
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.solidInk,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: theme.solidShadow,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  bar: {
    flexDirection: 'row',
    width: '88%',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.10)',
    borderRadius: 28,
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 8,
    shadowColor: theme.solidShadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    fontFamily: 'NotoSansJP_500Medium',
    fontSize: 11,
    fontWeight: '500',
    color: theme.mutedText,
  },
  tabLabelActive: {
    color: theme.primaryText,
    fontWeight: '600',
  },
});

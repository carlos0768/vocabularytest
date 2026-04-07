import React, { createContext, useContext, useState, useCallback } from 'react';

interface TabBarContextValue {
  visible: boolean;
  hide: () => void;
  show: () => void;
}

const TabBarContext = createContext<TabBarContextValue>({
  visible: true,
  hide: () => {},
  show: () => {},
});

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const hide = useCallback(() => setVisible(false), []);
  const show = useCallback(() => setVisible(true), []);

  return React.createElement(
    TabBarContext.Provider,
    { value: { visible, hide, show } },
    children
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}

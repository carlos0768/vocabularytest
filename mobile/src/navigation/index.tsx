import React, { useCallback } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import theme from '../constants/theme';
import { CustomTabBar } from '../components/navigation/CustomTabBar';
import { TabBarProvider } from '../hooks/use-tab-bar';
import { ScanFlowProvider, useScanFlow } from '../hooks/use-scan-flow';
import { ScanModeModal } from '../components/scan/ScanModeModal';
import { ProcessingModal } from '../components/ProcessingModal';
import { useAuth } from '../hooks/use-auth';
import type {
  HomeStackParamList,
  SharedStackParamList,
  StatsStackParamList,
  SettingsStackParamList,
  TabParamList,
} from '../types';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectListScreen } from '../screens/ProjectListScreen';
import { ProjectScreen } from '../screens/ProjectScreen';
import { WordDetailScreen } from '../screens/WordDetailScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { FavoritesFlashcardScreen } from '../screens/FavoritesFlashcardScreen';
import { FavoritesQuizScreen } from '../screens/FavoritesQuizScreen';
import { ScanConfirmScreen } from '../screens/ScanConfirmScreen';
import { SentenceQuizScreen } from '../screens/SentenceQuizScreen';
import { WrongAnswersScreen } from '../screens/WrongAnswersScreen';
import { WrongAnswersQuizScreen } from '../screens/WrongAnswersQuizScreen';
import { SharedProjectsScreen } from '../screens/SharedProjectsScreen';
import { SharedProjectDetailScreen } from '../screens/SharedProjectDetailScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';

// ---------- Stack navigators ----------

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SharedStack = createNativeStackNavigator<SharedStackParamList>();
const StatsStack = createNativeStackNavigator<StatsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const stackOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: theme.white },
  animation: 'slide_from_right' as const,
};

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={stackOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="ProjectList" component={ProjectListScreen} />
      <HomeStack.Screen name="Project" component={ProjectScreen} />
      <HomeStack.Screen name="WordDetail" component={WordDetailScreen} />
      <HomeStack.Screen name="Quiz" component={QuizScreen} options={{ animation: 'fade' }} />
      <HomeStack.Screen
        name="Flashcard"
        component={FlashcardScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <HomeStack.Screen
        name="Grammar"
        component={SentenceQuizScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <HomeStack.Screen name="Favorites" component={FavoritesScreen} />
      <HomeStack.Screen
        name="FavoritesFlashcard"
        component={FavoritesFlashcardScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <HomeStack.Screen
        name="FavoritesQuiz"
        component={FavoritesQuizScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <HomeStack.Screen name="WrongAnswers" component={WrongAnswersScreen} />
      <HomeStack.Screen
        name="WrongAnswersQuiz"
        component={WrongAnswersQuizScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <HomeStack.Screen
        name="ScanConfirm"
        component={ScanConfirmScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </HomeStack.Navigator>
  );
}

function SharedStackScreen() {
  return (
    <SharedStack.Navigator screenOptions={stackOptions}>
      <SharedStack.Screen name="SharedProjects" component={SharedProjectsScreen} />
      <SharedStack.Screen name="SharedProjectDetail" component={SharedProjectDetailScreen} />
    </SharedStack.Navigator>
  );
}

function StatsStackScreen() {
  return (
    <StatsStack.Navigator screenOptions={stackOptions}>
      <StatsStack.Screen name="Stats" component={StatsScreen} />
    </StatsStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={stackOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <SettingsStack.Screen name="Login" component={LoginScreen} />
      <SettingsStack.Screen name="Signup" component={SignupScreen} />
    </SettingsStack.Navigator>
  );
}

// ---------- Tab navigator ----------

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} />
      <Tab.Screen name="SharedTab" component={SharedStackScreen} />
      <Tab.Screen name="StatsTab" component={StatsStackScreen} />
      <Tab.Screen name="SettingsTab" component={SettingsStackScreen} />
    </Tab.Navigator>
  );
}

// ---------- Global overlays (scan mode + processing) ----------

function ScanOverlays() {
  const { isPro } = useAuth();
  const {
    showScanModeModal,
    setShowScanModeModal,
    processing,
    processingSteps,
    closeProcessing,
    promptImageSource,
  } = useScanFlow();

  return (
    <>
      <ScanModeModal
        visible={showScanModeModal}
        isPro={isPro}
        title="スキャンモード"
        subtitle="新しい単語帳をどう作るか選んでください。"
        onClose={() => setShowScanModeModal(false)}
        onRequirePro={() => {
          // handled inside ScanFlowProvider
        }}
        onSelectMode={(mode, eikenLevel) => {
          promptImageSource(mode, eikenLevel ?? null);
        }}
      />
      <ProcessingModal
        visible={processing}
        steps={processingSteps}
        onClose={closeProcessing}
      />
    </>
  );
}

// ---------- Root navigation ----------

export function Navigation() {
  // We need a ref to navigation so ScanFlowProvider can navigate
  const navigationRef = React.useRef<any>(null);

  const onNavigateLogin = useCallback(() => {
    navigationRef.current?.navigate('SettingsTab', {
      screen: 'Login',
    });
  }, []);

  const onNavigateSubscription = useCallback(() => {
    navigationRef.current?.navigate('SettingsTab', {
      screen: 'Subscription',
    });
  }, []);

  const onNavigateScanConfirm = useCallback((words: unknown[], projectName: string) => {
    navigationRef.current?.navigate('HomeTab', {
      screen: 'ScanConfirm',
      params: { words, projectName },
    });
  }, []);

  const onNavigateProject = useCallback((projectId: string) => {
    navigationRef.current?.navigate('HomeTab', {
      screen: 'Project',
      params: { projectId },
    });
  }, []);

  return (
    <TabBarProvider>
      <ScanFlowProvider
        onNavigateLogin={onNavigateLogin}
        onNavigateSubscription={onNavigateSubscription}
        onNavigateScanConfirm={onNavigateScanConfirm}
        onNavigateProject={onNavigateProject}
      >
        <NavigationContainer ref={navigationRef}>
          <TabNavigator />
        </NavigationContainer>
        <ScanOverlays />
      </ScanFlowProvider>
    </TabBarProvider>
  );
}

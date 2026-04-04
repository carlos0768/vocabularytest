import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { ProjectScreen } from '../screens/ProjectScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { FavoritesFlashcardScreen } from '../screens/FavoritesFlashcardScreen';
import { FavoritesQuizScreen } from '../screens/FavoritesQuizScreen';
import { ScanConfirmScreen } from '../screens/ScanConfirmScreen';
import { SentenceQuizScreen } from '../screens/SentenceQuizScreen';
import { WrongAnswersScreen } from '../screens/WrongAnswersScreen';
import { WrongAnswersQuizScreen } from '../screens/WrongAnswersQuizScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.white },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Main" component={HomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen
          name="Subscription"
          component={SubscriptionScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="Project" component={ProjectScreen} />
        <Stack.Screen
          name="Quiz"
          component={QuizScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="Flashcard"
          component={FlashcardScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen
          name="FavoritesFlashcard"
          component={FavoritesFlashcardScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="FavoritesQuiz"
          component={FavoritesQuizScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="ScanConfirm"
          component={ScanConfirmScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Grammar"
          component={SentenceQuizScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="WrongAnswers" component={WrongAnswersScreen} />
        <Stack.Screen
          name="WrongAnswersQuiz"
          component={WrongAnswersQuizScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

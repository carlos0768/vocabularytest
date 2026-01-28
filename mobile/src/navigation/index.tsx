import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectScreen } from '../screens/ProjectScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { FavoritesFlashcardScreen } from '../screens/FavoritesFlashcardScreen';
import { FavoritesQuizScreen } from '../screens/FavoritesQuizScreen';
import { ScanConfirmScreen } from '../screens/ScanConfirmScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { SentenceQuizScreen } from '../screens/SentenceQuizScreen';
import { WrongAnswersScreen } from '../screens/WrongAnswersScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.white,
          },
          animation: 'slide_from_right',
        }}
      >
        {/* Main screens */}
        <Stack.Screen name="Main" component={HomeScreen} />
        <Stack.Screen name="Project" component={ProjectScreen} />
        <Stack.Screen
          name="Quiz"
          component={QuizScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Flashcard"
          component={FlashcardScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Grammar"
          component={SentenceQuizScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen
          name="FavoritesFlashcard"
          component={FavoritesFlashcardScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="FavoritesQuiz"
          component={FavoritesQuizScreen}
          options={{
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ScanConfirm"
          component={ScanConfirmScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />

        {/* Auth screens */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Signup"
          component={SignupScreen}
          options={{
            animation: 'slide_from_bottom',
          }}
        />

        {/* Settings & Subscription */}
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />

        {/* Wrong Answers */}
        <Stack.Screen name="WrongAnswers" component={WrongAnswersScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

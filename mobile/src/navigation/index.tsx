import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';

// Screens
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectScreen } from '../screens/ProjectScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ScanConfirmScreen } from '../screens/ScanConfirmScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';

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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

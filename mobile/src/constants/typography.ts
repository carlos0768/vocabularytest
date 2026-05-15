import { Text, TextInput } from 'react-native';
import {
  Lexend_700Bold,
  Lexend_800ExtraBold,
  Lexend_900Black,
} from '@expo-google-fonts/lexend';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_600SemiBold,
  NotoSansJP_700Bold,
  NotoSansJP_800ExtraBold,
  NotoSansJP_900Black,
} from '@expo-google-fonts/noto-sans-jp';
import theme from './theme';

export const appFonts = {
  [theme.fontFamily.body]: NotoSansJP_400Regular,
  [theme.fontFamily.bodyMedium]: NotoSansJP_500Medium,
  [theme.fontFamily.bodySemiBold]: NotoSansJP_600SemiBold,
  [theme.fontFamily.bodyBold]: NotoSansJP_700Bold,
  [theme.fontFamily.bodyExtraBold]: NotoSansJP_800ExtraBold,
  [theme.fontFamily.bodyBlack]: NotoSansJP_900Black,
  [theme.fontFamily.display]: Lexend_700Bold,
  [theme.fontFamily.displayExtraBold]: Lexend_800ExtraBold,
  [theme.fontFamily.displayBlack]: Lexend_900Black,
};

export function configureDefaultTypography() {
  const baseText = {
    fontFamily: theme.fontFamily.body,
    includeFontPadding: false,
  };

  (Text as any).defaultProps = (Text as any).defaultProps ?? {};
  (Text as any).defaultProps.style = [baseText, (Text as any).defaultProps.style];

  (TextInput as any).defaultProps = (TextInput as any).defaultProps ?? {};
  (TextInput as any).defaultProps.style = [baseText, (TextInput as any).defaultProps.style];
}

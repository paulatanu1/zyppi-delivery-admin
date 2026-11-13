import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Logo purple scale (Material Deep Purple, brand = 600). */
const zyppi = {
  50: '#f5f1fb',
  100: '#ede7f6',
  200: '#d1c4e9',
  300: '#b39ddb',
  400: '#9575cd',
  500: '#7e57c2',
  600: '#673ab7',
  700: '#5e35b1',
  800: '#4527a0',
  900: '#311b92',
  950: '#1f1533',
} as const;

/**
 * Zyppi brand on top of Aura. The purple scale is the customer app's logo
 * purple (`zyppi-APP/lib/core/theme/app_colors.dart`, brand #673AB7) so
 * the panel and the app feel like one product.
 */
export const ZyppiPreset = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '18px' },
  },
  semantic: {
    primary: { ...zyppi },
    formField: { borderRadius: '{border.radius.md}' },
    colorScheme: {
      light: {
        primary: {
          color: zyppi[600],
          contrastColor: '#ffffff',
          hoverColor: zyppi[700],
          activeColor: zyppi[800],
        },
        highlight: {
          background: zyppi[100],
          focusBackground: zyppi[200],
          color: zyppi[800],
          focusColor: zyppi[900],
        },
        surface: {
          0: '#ffffff',
          50: '#f6f5f2',
          100: '#f0eee9',
          200: '#e8e5df',
          300: '#d6d2c9',
          400: '#a9a59c',
          500: '#83868d',
          600: '#55585f',
          700: '#3a3c42',
          800: '#26272c',
          900: '#141519',
          950: '#0d0e11',
        },
      },
      dark: {
        primary: {
          color: zyppi[300],
          contrastColor: zyppi[950],
          hoverColor: zyppi[200],
          activeColor: zyppi[100],
        },
        highlight: {
          background: 'rgba(179, 157, 219, .16)',
          focusBackground: 'rgba(179, 157, 219, .24)',
          color: 'rgba(255, 255, 255, .87)',
          focusColor: 'rgba(255, 255, 255, .87)',
        },
        surface: {
          0: '#ffffff',
          50: '#f2f2f4',
          100: '#a8aab2',
          200: '#787b84',
          300: '#4a4d55',
          400: '#383b43',
          500: '#2a2c33',
          600: '#272930',
          700: '#1e2026',
          800: '#16171c',
          900: '#111216',
          950: '#0d0e11',
        },
      },
    },
  },
});

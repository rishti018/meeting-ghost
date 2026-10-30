/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ghost: {
          bg: '#F4F6FA',             // App & main workspace background
          surface: '#FFFFFF',        // Card background
          muted: '#F0F3F8',          // Subtle light inner row / table header
          border: '#DCE2EB',         // Card borders and dividers
          borderHover: '#C2CBDA',    // Focused / hovered border
          text: '#172033',           // Primary text on light backgrounds
          secondary: '#526078',      // Secondary text on light backgrounds
          placeholder: '#8F9CAE',    // Input placeholder text
          // Dark navigation surfaces (Sidebar & Top Navbar)
          nav: {
            bg: '#172033',           // Sidebar & top navigation background
            border: '#23304B',       // Navigation dividers / borders
            hover: '#26334B',        // Sidebar item hover
            active: '#303F5B',       // Active navigation item background
            text: '#F8FAFC',        // Primary text on dark backgrounds
            secondary: '#C2CBDA',   // Secondary text on dark backgrounds
          },
          // Accent & Brand Colors
          accent: '#5145CD',         // Primary buttons & links
          accentHover: '#4338B8',    // Button hover
          accentSoft: '#EEF2FF',     // Subtle badge background
          accentText: '#3730A3',     // Badge text
          accentBorder: '#C7D2FE',   // Badge border
          // Semantic colors
          success: '#15803D',
          successBg: '#ECFDF5',
          successBorder: '#A7F3D0',
          warning: '#B45309',
          warningBg: '#FFFBEB',
          warningBorder: '#FDE68A',
          error: '#B91C1C',
          errorBg: '#FEF2F2',
          errorBorder: '#FECACA',
          brick: '#B91C1C',
          brickBg: '#FEF2F2',
          brickBorder: '#FECACA',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(23, 32, 51, 0.05), 0 1px 2px 0 rgba(23, 32, 51, 0.03)',
        'dropdown': '0 4px 16px -2px rgba(23, 32, 51, 0.12), 0 2px 4px -2px rgba(23, 32, 51, 0.06)',
      }
    },
  },
  plugins: [],
}

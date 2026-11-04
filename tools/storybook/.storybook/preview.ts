import type { Preview } from '@storybook/react-vite';
import './preview.css';

// Inter is shipped by the design system with font-display: swap, so the first paint may use the
// fallback face. Stories that measure geometry, and Chromatic snapshots, must start from the real
// metrics: load one Latin and one Latin Extended (Polish) sample, then wait for the font set.
async function loadShippedFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('400 14px Inter', 'Abc'),
    document.fonts.load('400 14px Inter', 'ąćęłńóśźż'),
  ]);
  await document.fonts.ready;
}

const preview: Preview = {
  loaders: [loadShippedFonts],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'NEvo canvas',
      values: [
        { name: 'NEvo canvas', value: '#0e1015' },
        { name: 'Light', value: '#ffffff' },
      ],
    },
    controls: { expanded: true },
    chromatic: { disableSnapshot: true },
    options: {
      storySort: {
        order: [
          'Nevo UI',
          [
            'Foundations',
            'Layout',
            'Actions',
            'Forms',
            'Navigation',
            'Data',
            'Content',
            'Feedback',
            'Surfaces',
            'Overlays',
            'Patterns',
            '*',
          ],
          'SpecFlow',
          ['Brand', 'Components', 'Features', 'Screens', '*'],
          'Examples',
          ['CRM', '*'],
          '*',
        ],
      },
    },
    a11y: {
      test: 'error',
      options: {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    },
  },
};

export default preview;

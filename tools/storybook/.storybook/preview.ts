import type { Preview } from '@storybook/react-vite';
import './preview.css';

const preview: Preview = {
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


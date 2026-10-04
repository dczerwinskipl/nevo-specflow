import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './capture.css';

import { Gallery } from './Gallery';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root capture mount');

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);

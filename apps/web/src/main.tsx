import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import '@fontsource/mukta-malar/700.css';
import '@fontsource-variable/figtree';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

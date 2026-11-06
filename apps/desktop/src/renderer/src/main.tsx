import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopPet } from './DesktopPet.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopPet />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './design-system.css';
import { App } from './App';

const container = document.createElement('div');
container.id = 'app';
document.body.append(container);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

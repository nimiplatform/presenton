import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../servers/nextjs/app/globals.css';
import '../../servers/nextjs/app/motion.css';
import 'katex/dist/katex.min.css';
import { SpaRouterProvider } from './shims/next-navigation';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SpaRouterProvider>
      <App />
    </SpaRouterProvider>
  </React.StrictMode>,
);

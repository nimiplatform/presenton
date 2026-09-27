'use client';

import { Provider } from 'react-redux';
import { store } from '../store/store';
import NimiSessionBoundary from '@/components/NimiSessionBoundary';

export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>
      <NimiSessionBoundary>{children}</NimiSessionBoundary>
  </Provider>;
}

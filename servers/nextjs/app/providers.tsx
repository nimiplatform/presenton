'use client';

import { Provider } from 'react-redux';
import { store } from '../store/store';
import MotionPreferences from '@/components/motion/MotionPreferences';
import NimiSessionBoundary from '@/components/NimiSessionBoundary';

export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>
      <MotionPreferences />
      <NimiSessionBoundary>{children}</NimiSessionBoundary>
  </Provider>;
}

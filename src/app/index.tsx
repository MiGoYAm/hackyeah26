import { isRunningInExpoGo } from 'expo';

import { ExpoGoNotice } from '@/components/expo-go-notice';

// Importing the chat screen in Expo Go throws at module load, so it is only required in native builds.
export default isRunningInExpoGo()
  ? ExpoGoNotice
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/components/chat-screen') as typeof import('@/components/chat-screen')).ChatScreen;

import { NoticeScreen } from '@/components/notice-screen';

// Expo Go ships without the ExecuTorch and op-sqlite native libraries the chat depends on.
export function ExpoGoNotice() {
  return <NoticeScreen>Asystent nie działa w Expo Go. Zainstaluj natywny build aplikacji.</NoticeScreen>;
}

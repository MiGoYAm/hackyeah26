import { Stack } from 'expo-router';

export default function LibraryLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Biblioteka' }}>
      <Stack.Screen name="index" options={{ title: 'Biblioteka' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}

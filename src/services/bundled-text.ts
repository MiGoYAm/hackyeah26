import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export async function readBundledText(moduleId: number) {
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  // Web has no local copy of the asset, only its address.
  if (Platform.OS === 'web') return (await fetch(asset.uri)).text();
  if (!asset.localUri) throw new Error('Brak lokalnego pliku z danymi.');
  return new File(asset.localUri).text();
}

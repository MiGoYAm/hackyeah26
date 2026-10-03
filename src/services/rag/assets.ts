import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { ANDROID_FILES_PATH, IOS_LIBRARY_PATH } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';

import manifest from '../../../assets/offline/rag/manifest.json';
import databaseAsset from '../../../assets/offline/rag/knowledge_pl.db';
import embeddingAsset from '../../../assets/offline/rag/models/multilingual_minilm_fp32.pte';
import tokenizerAsset from '../../../assets/offline/rag/models/multilingual_minilm.tokenizer';

async function copyAsset(moduleId: number, target: File, expectedSize: number, md5?: string) {
  if (target.exists && target.size === expectedSize && (!md5 || target.info({ md5: true }).md5 === md5)) {
    return;
  }
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  if (!asset.localUri) throw new Error('Brak lokalnego pliku bazy wiedzy.');
  const temporary = new File(`${target.uri}.partial`);
  if (temporary.exists) temporary.delete();
  await new File(asset.localUri).copy(temporary);
  if (temporary.size !== expectedSize || (md5 && temporary.info({ md5: true }).md5 !== md5)) {
    temporary.delete();
    throw new Error('Plik bazy wiedzy jest uszkodzony.');
  }
  if (target.exists) target.delete();
  await temporary.move(target);
}

// Versioned names never overwrite a copy that is still open, so older ones pile up.
function removeStale(directory: Directory, pattern: RegExp, current: string) {
  try {
    for (const entry of directory.list()) {
      if (pattern.test(entry.name) && !entry.name.startsWith(current)) entry.delete();
    }
  } catch {
    // Leftovers only cost storage; the chat works without this cleanup.
  }
}

export async function prepareKnowledgeAssets() {
  // On Android expo-file-system can create files only inside the app's files and
  // cache directories, so the default "databases" directory is out of reach.
  const databasePath = Platform.OS === 'ios' ? IOS_LIBRARY_PATH : ANDROID_FILES_PATH;
  if (!databasePath) throw new Error('Nie można otworzyć lokalnej bazy wiedzy.');
  const databaseDirectory = new Directory(databasePath.startsWith('file://') ? databasePath : `file://${databasePath}`);
  databaseDirectory.create({ intermediates: true, idempotent: true });
  const modelsDirectory = new Directory(Paths.document, 'rag-models', manifest.model.revision);
  modelsDirectory.create({ intermediates: true, idempotent: true });
  const model = new File(modelsDirectory, 'multilingual_minilm_fp32.pte');
  const tokenizer = new File(modelsDirectory, 'multilingual_minilm.tokenizer');
  await copyAsset(databaseAsset, new File(databaseDirectory, manifest.database.filename), manifest.database.size, manifest.database.md5);
  await copyAsset(embeddingAsset, model, manifest.model.size);
  await copyAsset(tokenizerAsset, tokenizer, manifest.model.tokenizerSize, manifest.model.tokenizerMd5);
  removeStale(databaseDirectory, /^knowledge_pl_[0-9a-f]+\.db/, manifest.database.filename);
  removeStale(new Directory(Paths.document, 'rag-models'), /./, manifest.model.revision);
  return {
    databaseName: manifest.database.filename,
    databaseLocation: databasePath.replace(/^file:\/\//, ''),
    modelPath: model.uri.replace(/^file:\/\//, ''),
    tokenizerPath: tokenizer.uri.replace(/^file:\/\//, ''),
  };
}

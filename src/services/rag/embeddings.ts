import type { Embeddings } from 'react-native-rag';
import { createTextEmbedder, type TextEmbedder } from 'react-native-executorch';

export class PolishEmbeddings implements Embeddings {
  private model?: TextEmbedder;

  constructor(private readonly paths: { modelPath: string; tokenizerPath: string }) {}

  async load(): Promise<this> {
    this.model ??= await createTextEmbedder(this.paths);
    return this;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.model) throw new Error('Model wyszukiwania nie jest wczytany.');
    return Array.from(await this.model.embed(text));
  }

  async unload(): Promise<void> {
    this.model?.dispose();
    this.model = undefined;
  }
}

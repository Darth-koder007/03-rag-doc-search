export type ChunkSection = "api" | "usage";

export interface Chunk {
  id: string;
  componentName: string;
  section: ChunkSection;
  sourceFile: string;
  text: string;
}

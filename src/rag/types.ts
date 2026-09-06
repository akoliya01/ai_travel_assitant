export type SourceRecord = {
  id: string;
  title: string;
  url: string;
  localFile: string;
  publisher?: string;
  license?: string;
  contentType?: string;
  accessedAt?: string;
};

export type IndexedChunk = {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    sourceId: string;
    sourceTitle: string;
    sourceUrl: string;
    chunkIndex: number;
  };
};

export type RetrievedChunk = {
  content: string;
  score: number;
  sourceTitle: string;
  sourceUrl: string;
};

import { config } from "../config";
import { IndexedChunk, RetrievedChunk } from "./types";

const SEARCH_API_VERSION = "2024-07-01";

function buildUrl(path: string): string {
  const base = config.azureSearchEndpoint.replace(/\/$/, "");
  return `${base}${path}`;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key": config.azureSearchApiKey
  };
}

export async function ensureSearchIndex(vectorDimensions: number): Promise<void> {
  const url = buildUrl(`/indexes/${encodeURIComponent(config.azureSearchIndexName)}?api-version=${SEARCH_API_VERSION}`);

  const payload = {
    name: config.azureSearchIndexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "content", type: "Edm.String", searchable: true },
      {
        name: "contentVector",
        type: "Collection(Edm.Single)",
        searchable: true,
        dimensions: vectorDimensions,
        vectorSearchProfile: "vector-profile"
      },
      { name: "sourceTitle", type: "Edm.String", searchable: true },
      { name: "sourceUrl", type: "Edm.String" },
      { name: "sourceId", type: "Edm.String", filterable: true },
      { name: "chunkIndex", type: "Edm.Int32", filterable: true, sortable: true }
    ],
    vectorSearch: {
      algorithms: [{ name: "hnsw-config", kind: "hnsw" }],
      profiles: [{ name: "vector-profile", algorithm: "hnsw-config" }]
    }
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create/update Azure Search index: ${response.status} ${body}`);
  }
}

export async function upsertChunksToSearch(chunks: IndexedChunk[]): Promise<void> {
  const batches = chunkArray(chunks, 200);

  for (const batch of batches) {
    const url = buildUrl(
      `/indexes/${encodeURIComponent(config.azureSearchIndexName)}/docs/index?api-version=${SEARCH_API_VERSION}`
    );

    const value = batch.map((chunk) => ({
      "@search.action": "mergeOrUpload",
      id: chunk.id,
      content: chunk.content,
      contentVector: chunk.embedding,
      sourceTitle: chunk.metadata.sourceTitle,
      sourceUrl: chunk.metadata.sourceUrl,
      sourceId: chunk.metadata.sourceId,
      chunkIndex: chunk.metadata.chunkIndex
    }));

    const response = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to upsert documents to Azure Search: ${response.status} ${body}`);
    }
  }
}

export async function retrieveRelevantChunksFromSearch(
  queryEmbedding: number[],
  topK = 5
): Promise<RetrievedChunk[]> {
  const url = buildUrl(
    `/indexes/${encodeURIComponent(config.azureSearchIndexName)}/docs/search?api-version=${SEARCH_API_VERSION}`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      top: topK,
      count: true,
      select: "content,sourceTitle,sourceUrl",
      vectorQueries: [
        {
          kind: "vector",
          fields: "contentVector",
          vector: queryEmbedding,
          k: topK
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to query Azure Search: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    value: Array<{ content: string; sourceTitle: string; sourceUrl: string; "@search.score": number }>;
  };

  return data.value.map((doc) => ({
    content: doc.content,
    sourceTitle: doc.sourceTitle,
    sourceUrl: doc.sourceUrl,
    score: doc["@search.score"] ?? 0
  }));
}

function chunkArray<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

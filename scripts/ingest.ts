import fs from "fs";
import path from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { hasOpenAiConfig, hasSearchConfig } from "../src/config";
import { embedDocuments } from "../src/rag/embeddings";
import { ensureSearchIndex, upsertChunksToSearch } from "../src/rag/azureSearchVectorStore";
import { IndexedChunk, SourceRecord } from "../src/rag/types";

async function ingest(): Promise<void> {
  if (!hasOpenAiConfig()) {
    throw new Error("Missing Azure OpenAI configuration. Check .env file.");
  }
  if (!hasSearchConfig()) {
    throw new Error("Missing Azure Search configuration. Check .env file.");
  }

  const manifestPath = path.join(process.cwd(), "data", "sources", "singapore-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as SourceRecord[];

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 850,
    chunkOverlap: 120
  });
  const indexedChunks: IndexedChunk[] = [];
  let vectorDimensions = 0;

  for (const source of manifest) {
    const filePath = path.join(process.cwd(), source.localFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Declared knowledge source is missing: ${source.localFile}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const split = await splitter.splitText(content);
    const vectors = await embedDocuments(split);
    if (vectors[0] && vectorDimensions === 0) {
      vectorDimensions = vectors[0].length;
    }

    split.forEach((chunk, index) => {
      indexedChunks.push({
        id: `${source.id}-${index}`,
        content: chunk,
        embedding: vectors[index],
        metadata: {
          sourceId: source.id,
          sourceTitle: source.title,
          sourceUrl: source.url,
          chunkIndex: index
        }
      });
    });
  }

  if (indexedChunks.length === 0) {
    throw new Error("No chunks generated from sources. Check data/kb files.");
  }

  await ensureSearchIndex(vectorDimensions);
  await upsertChunksToSearch(indexedChunks);
  console.log(`Indexed ${indexedChunks.length} chunks into Azure AI Search index.`);
}

void ingest();

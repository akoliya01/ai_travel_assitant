import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8080),
  destination: process.env.DEFAULT_DESTINATION ?? "Singapore",
  azureOpenAiApiKey: process.env.AZURE_OPENAI_API_KEY ?? "",
  azureOpenAiEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
  azureOpenAiApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
  chatDeployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "gpt-4o-mini",
  embeddingDeployment:
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-small",
  azureSearchEndpoint: process.env.AZURE_SEARCH_ENDPOINT ?? "",
  azureSearchApiKey: process.env.AZURE_SEARCH_API_KEY ?? "",
  azureSearchIndexName: process.env.AZURE_SEARCH_INDEX_NAME ?? "travel-kb-index",
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:8080",
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 60),
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH ?? 4000)
};

export function hasOpenAiConfig(): boolean {
  return Boolean(config.azureOpenAiApiKey && config.azureOpenAiEndpoint);
}

export function hasSearchConfig(): boolean {
  return Boolean(config.azureSearchEndpoint && config.azureSearchApiKey && config.azureSearchIndexName);
}

import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { config } from "../config";

export function createEmbeddingModel(): AzureOpenAIEmbeddings {
  validateEmbeddingDeployment();

  return new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: config.azureOpenAiApiKey,
    azureOpenAIApiInstanceName: extractInstanceName(config.azureOpenAiEndpoint),
    azureOpenAIApiEmbeddingsDeploymentName: config.embeddingDeployment,
    azureOpenAIApiVersion: config.azureOpenAiApiVersion
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  try {
    return await createEmbeddingModel().embedQuery(text);
  } catch (error) {
    throw improveOpenAiError(error, "embedding", config.embeddingDeployment);
  }
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  try {
    return await createEmbeddingModel().embedDocuments(texts);
  } catch (error) {
    throw improveOpenAiError(error, "embedding", config.embeddingDeployment);
  }
}

function improveOpenAiError(error: unknown, kind: "chat" | "embedding", deployment: string): Error {
  const message = String(error);
  if (/deployment.*does not exist|MODEL_NOT_FOUND|404/i.test(message)) {
    return new Error(
      `Azure OpenAI ${kind} deployment '${deployment}' was not found on ${config.azureOpenAiEndpoint}. Check the exact deployment name in Azure AI Foundry/Portal and update .env.`
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function validateEmbeddingDeployment(): void {
  if (config.embeddingDeployment === config.chatDeployment) {
    throw new Error(
      "AZURE_OPENAI_EMBEDDING_DEPLOYMENT must be a separate embeddings deployment, not the chat deployment. Use an Azure OpenAI deployment backed by an embeddings model such as text-embedding-3-small."
    );
  }

  if (/^gpt-|^o\d|chat/i.test(config.embeddingDeployment)) {
    throw new Error(
      `AZURE_OPENAI_EMBEDDING_DEPLOYMENT is set to '${config.embeddingDeployment}', which looks like a chat model deployment. Set it to an embeddings deployment, for example text-embedding-3-small.`
    );
  }
}

function extractInstanceName(endpoint: string): string {
  const normalized = endpoint.replace("https://", "").replace("http://", "");
  return normalized.split(".")[0];
}

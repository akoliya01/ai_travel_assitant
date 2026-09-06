import { AzureChatOpenAI } from "@langchain/openai";
import { config } from "../config";
import { groundedTravelPrompt } from "./prompts";

function extractInstanceName(endpoint: string): string {
  const normalized = endpoint.replace("https://", "").replace("http://", "");
  return normalized.split(".")[0];
}

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: config.azureOpenAiApiKey,
  azureOpenAIApiInstanceName: extractInstanceName(config.azureOpenAiEndpoint),
  azureOpenAIApiDeploymentName: config.chatDeployment,
  azureOpenAIApiVersion: config.azureOpenAiApiVersion
});

export async function composeAnswer(input: {
  context: string;
  question: string;
  knowledgeChunks: string;
  toolData: string;
  planningEstimate: string;
  preferences: string;
}): Promise<string> {
  try {
    const chain = groundedTravelPrompt.pipe(llm);
    const response = await chain.invoke(input);
    return response.content.toString();
  } catch (error) {
    throw improveChatError(error);
  }
}

function improveChatError(error: unknown): Error {
  const message = String(error);
  if (/deployment.*does not exist|MODEL_NOT_FOUND|404/i.test(message)) {
    return new Error(
      `Azure OpenAI chat deployment '${config.chatDeployment}' was not found on ${config.azureOpenAiEndpoint}. Check the exact deployment name in Azure AI Foundry/Portal and update AZURE_OPENAI_CHAT_DEPLOYMENT in .env.`
    );
  }
  return error instanceof Error ? error : new Error(message);
}

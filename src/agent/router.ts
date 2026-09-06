import { composeAnswer } from "./answerComposer";
import { currencyTool, weatherTool } from "./tools";
import { embedQuery } from "../rag/embeddings";
import { getSession, updatePreferences, updateSessionHistory } from "./sessionStore";
import { retrieveRelevantChunksFromSearch } from "../rag/azureSearchVectorStore";

export type AssistantResponse = {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  toolResults: Array<{ tool: string; status: "success" | "failed"; payload: unknown }>;
};

export async function handleTravelQuestion(sessionId: string, question: string): Promise<AssistantResponse> {
  updatePreferences(sessionId, question);
  const session = getSession(sessionId);

  const requiresWeather = /weather|forecast|rain|indoor|outdoor/i.test(question);
  const requiresCurrency = /convert|currency|budget|exchange|inr|usd|sgd|\bsg\b|singapore dollar/i.test(question);
  const requiresCostEstimate = /cost|price|expense|spend|approx|estimate|budget/i.test(question);

  const queryEmbedding = await embedQuery(question);
  const chunks = await retrieveRelevantChunksFromSearch(queryEmbedding, 6);
  const sources = uniqueSources(chunks.map((chunk) => ({ title: chunk.sourceTitle, url: chunk.sourceUrl })));

  const toolResults: AssistantResponse["toolResults"] = [];
  let toolData = "No tool data used.";

  if (requiresWeather) {
    try {
      const weather = JSON.parse(await weatherTool.invoke({ days: 3 }));
      toolResults.push({ tool: "weather", status: "success", payload: weather });
    } catch (error) {
      toolResults.push({ tool: "weather", status: "failed", payload: String(error) });
    }
  }

  const parsedConversion = parseConversionRequest(question);
  if (requiresCurrency && parsedConversion) {
    try {
      const conversion = JSON.parse(await currencyTool.invoke(parsedConversion));
      toolResults.push({ tool: "currency", status: "success", payload: conversion });
    } catch (error) {
      toolResults.push({ tool: "currency", status: "failed", payload: String(error) });
    }
  } else if (requiresCurrency) {
    toolResults.push({
      tool: "currency",
      status: "failed",
      payload:
        "Could not identify amount, source currency, and target currency. Example: Convert INR 50,000 to SGD."
    });
  }

  if (toolResults.length > 0) {
    toolData = JSON.stringify(toolResults, null, 2);
  }

  const knowledgeChunks =
    chunks.length === 0
      ? "Knowledge base currently has insufficient relevant information for this question."
      : chunks
          .map(
            (chunk, index) =>
              `Chunk ${index + 1} (score ${chunk.score.toFixed(3)}): ${chunk.content} | source: ${chunk.sourceTitle}`
          )
          .join("\n\n");

  const answer = await composeAnswer({
    context: session.history.join("\n"),
    question,
    knowledgeChunks,
    toolData,
    planningEstimate: requiresCostEstimate ? buildPlanningEstimate() : "No planning estimate requested.",
    preferences: JSON.stringify(session.preferences)
  });

  updateSessionHistory(sessionId, question, answer);

  return {
    answer,
    sources,
    toolResults
  };
}

function uniqueSources(sources: Array<{ title: string; url: string }>): Array<{ title: string; url: string }> {
  const keyMap = new Map<string, { title: string; url: string }>();
  for (const source of sources) {
    keyMap.set(`${source.title}|${source.url}`, source);
  }
  return Array.from(keyMap.values());
}

export function parseConversionRequest(question: string):
  | {
      amount: number;
      fromCurrency: string;
      toCurrency: string;
    }
  | undefined {
  const amountMatch = question.match(/(\d+[\d,]*(?:\.\d+)?)/);
  const currencyMatches = extractCurrencies(question);

  if (!amountMatch || currencyMatches.length === 0) {
    return undefined;
  }

  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const fromCurrency = currencyMatches[0];
  const toCurrency = currencyMatches[1] ?? inferDestinationCurrency(fromCurrency, question);

  if (!toCurrency || fromCurrency === toCurrency) {
    return undefined;
  }

  return {
    amount,
    fromCurrency,
    toCurrency
  };
}

function extractCurrencies(question: string): string[] {
  const matches: Array<{ index: number; code: string }> = [];
  const patterns: Array<{ pattern: RegExp; code: string }> = [
    { pattern: /\bINR\b|\bIndian rupees?\b|\brupees?\b/gi, code: "INR" },
    { pattern: /\bSGD\b|\bSG\b|\bSingapore dollars?\b/gi, code: "SGD" },
    { pattern: /\bUSD\b|\bUS dollars?\b|\bdollars?\b/gi, code: "USD" },
    { pattern: /\bEUR\b|\beuros?\b/gi, code: "EUR" },
    { pattern: /\bGBP\b|\bpounds?\b/gi, code: "GBP" },
    { pattern: /\bJPY\b|\byen\b/gi, code: "JPY" },
    { pattern: /\bAUD\b|\bAustralian dollars?\b/gi, code: "AUD" },
    { pattern: /\bCAD\b|\bCanadian dollars?\b/gi, code: "CAD" }
  ];

  for (const { pattern, code } of patterns) {
    for (const match of question.matchAll(pattern)) {
      if (match.index !== undefined) {
        matches.push({ index: match.index, code });
      }
    }
  }

  return matches
    .sort((first, second) => first.index - second.index)
    .map((match) => match.code)
    .filter((code, index, codes) => index === 0 || code !== codes[index - 1]);
}

function inferDestinationCurrency(fromCurrency: string, question: string): string | undefined {
  if (fromCurrency !== "SGD" && /\b(destination currency|singapore currency|singapore dollars?|sg)\b/i.test(question)) {
    return "SGD";
  }
  return undefined;
}

function buildPlanningEstimate(): string {
  return [
    "Approximate cost estimate requested by user.",
    "Currency: SGD unless user asks for another currency.",
    "Assumption: one adult, three-day/two-night Singapore city trip, excluding flights and visa fees.",
    "Budget style estimate: SGD 260-520 total. Breakdown: accommodation SGD 160-300, local transport SGD 20-35, hawker/simple meals SGD 60-105, paid attractions/museums/indoor alternatives SGD 20-80.",
    "Comfort style estimate: SGD 560-1,150 total. Breakdown: accommodation SGD 320-700, local transport/taxis SGD 40-100, meals SGD 120-220, paid attractions SGD 80-130.",
    "Explain that these are planning assumptions, not live price quotes. Recommend checking official attraction and hotel prices before booking."
  ].join("\n");
}

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { config, hasOpenAiConfig, hasSearchConfig } from "./config";
import { handleTravelQuestion } from "./agent/router";

const app = express();
app.use(cors({ origin: config.allowedOrigin }));
app.use(express.json({ limit: "64kb" }));

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(config.maxMessageLength),
  sessionId: z.string().uuid().nullable().optional()
});

const responseLogPath = path.join(process.cwd(), "Evidence", "response.txt");

function writeResponseLog(entry: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(responseLogPath), { recursive: true });
  fs.appendFileSync(responseLogPath, `${JSON.stringify(entry, null, 2)}\n${"-".repeat(80)}\n`, "utf-8");
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    openAiConfigured: hasOpenAiConfig(),
    searchConfigured: hasSearchConfig()
  });
});

app.post("/api/chat", async (request, response) => {
  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    writeResponseLog({
      timestamp: new Date().toISOString(),
      question: typeof request.body?.message === "string" ? request.body.message : "",
      error: "Invalid request"
    });
    response.status(400).json({ error: "Provide a message up to the configured length limit." });
    return;
  }

  const message = parsed.data.message;
  const sessionId = parsed.data.sessionId || randomUUID();

  if (!hasOpenAiConfig() || !hasSearchConfig()) {
    writeResponseLog({
      timestamp: new Date().toISOString(),
      sessionId,
      question: message,
      error: "Required Azure configuration is missing"
    });
    response.status(400).json({
      error:
        "Azure OpenAI and Azure Search environment variables are required. Configure .env using .env.example and re-run ingestion."
    });
    return;
  }

  try {
    const result = await handleTravelQuestion(sessionId, message);
    writeResponseLog({
      timestamp: new Date().toISOString(),
      sessionId,
      question: message,
      answer: result.answer,
      sources: result.sources,
      toolResults: result.toolResults.map((tool) => ({
        tool: tool.tool,
        status: tool.status,
        payload: tool.payload
      }))
    });
    response.json({ sessionId, ...result });
  } catch (error) {
    console.error("Travel assistant request failed", error);
    writeResponseLog({
      timestamp: new Date().toISOString(),
      sessionId,
      question: message,
      error: "Request failed"
    });
    response.status(500).json({
      error: "Failed to process request",
      detail: "The request could not be completed. Check the server configuration and try again."
    });
  }
});

const publicDir = path.join(process.cwd(), "public");
app.use(express.static(publicDir));
app.get("*", (_request, response) => {
  response.sendFile(path.join(publicDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Travel assistant is running on http://localhost:${config.port}`);
});

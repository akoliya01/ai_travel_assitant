# AI Travel Planning Assistant

An Azure-backed, context-aware travel assistant for Singapore. It combines stable destination knowledge from a document-based RAG system with current weather and currency information retrieved through MCP tools.

The application intentionally does not book flights or hotels, process payments, navigate routes, or make reservations.

## What the Application Does

The assistant separates travel information into two categories:

1. **Destination knowledge**: attractions, neighbourhoods, transport guidance, cultural advice, food experiences, indoor/outdoor activities, and sample itineraries. This information is retrieved from the knowledge base.
2. **Current information**: weather forecasts and exchange rates. This information is requested from external services through MCP tools when the question requires it.

For a combined question such as:

> Create a three-day Singapore itinerary and adjust it based on weather. Also include the approximate cost.

the application retrieves relevant Singapore documents, calls the weather MCP tool, creates a clearly labeled planning estimate, and asks the Azure OpenAI chat model to produce a weather-aware answer.

## Architecture

```text
                 +----------------------+
                 |  Browser planner UI  |
                 +----------+-----------+
                            |
                            v
                 +----------------------+
                 | Express /api/chat    |
                 +----------+-----------+
                            |
              +-------------+-------------+
              |                           |
              v                           v
     +------------------+        +----------------------+
     | RAG retrieval    |        | Intent router         |
     | Azure Search     |        | weather/currency      |
     +--------+---------+        +----------+-----------+
              ^                             |
              |                             v
     +--------+---------+        +----------------------+
     | Azure OpenAI     |        | MCP client            |
     | embeddings       |        +----------+-----------+
     +------------------+                   |
                                  +--------+--------+
                                  | Weather MCP     |
                                  | Currency MCP    |
                                  +-----------------+
                            |
                            v
                 +----------------------+
                 | LangChain prompt     |
                 | + Azure OpenAI chat  |
                 +----------------------+
```

### Main code areas

- [src/server.ts](src/server.ts): Express server, API validation, CORS, static UI hosting, and error boundary.
- [src/agent/router.ts](src/agent/router.ts): Coordinates retrieval, intent selection, MCP calls, preferences, and final answer generation.
- [src/agent/answerComposer.ts](src/agent/answerComposer.ts): LangChain prompt-to-Azure-OpenAI runnable.
- [src/agent/prompts.ts](src/agent/prompts.ts): Grounding, provenance, safety, and output-structure instructions.
- [src/agent/tools.ts](src/agent/tools.ts): LangChain structured wrappers around the MCP tools.
- [src/agent/sessionStore.ts](src/agent/sessionStore.ts): Bounded conversation context, preferences, and session expiration.
- [src/rag/embeddings.ts](src/rag/embeddings.ts): Azure OpenAI embedding model configuration and validation.
- [src/rag/azureSearchVectorStore.ts](src/rag/azureSearchVectorStore.ts): Azure AI Search index creation, vector upsert, and vector query operations.
- [src/mcp/client.ts](src/mcp/client.ts): MCP-compatible client using stdio transport.
- [src/mcp/weatherServer.ts](src/mcp/weatherServer.ts): Weather MCP server backed by Open-Meteo.
- [src/mcp/currencyServer.ts](src/mcp/currencyServer.ts): Currency MCP server backed by Frankfurter.
- [scripts/ingest.ts](scripts/ingest.ts): Chunks source snapshots, creates embeddings, and populates Azure AI Search.
- [public/index.html](public/index.html): Responsive planner UI with itinerary cards, weather table, cost table, source links, and loading state.
- [Evidence/response.txt](Evidence/response.txt): Append-only local assessment log for questions, answers, citations, MCP status, and request failures.
- [Evidence/SS1.png](Evidence/SS1.png), [Evidence/SS2.png](Evidence/SS2.png), [Evidence/SS3.png](Evidence/SS3.png), and [Evidence/SS4.png](Evidence/SS4.png): UI screenshots for assessment.

## Technology Requirement Mapping

| Assignment requirement | Implementation |
| --- | --- |
| LangChain orchestration | `ChatPromptTemplate.pipe(AzureChatOpenAI)` in `src/agent/answerComposer.ts` |
| LangChain prompts | `src/agent/prompts.ts` |
| LangChain chunking | `RecursiveCharacterTextSplitter` in `scripts/ingest.ts` |
| LangChain embeddings | `AzureOpenAIEmbeddings` in `src/rag/embeddings.ts` |
| LangChain tool integration | `DynamicStructuredTool` wrappers in `src/agent/tools.ts` |
| Embedding model | Azure OpenAI deployment configured by `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` |
| Vector store | Azure AI Search `contentVector` field with HNSW vector profile |
| LLM | Azure OpenAI deployment configured by `AZURE_OPENAI_CHAT_DEPLOYMENT` |
| MCP-compatible client | `Client` and `StdioClientTransport` in `src/mcp/client.ts` |
| MCP weather tool | `get_weather_forecast` in `src/mcp/weatherServer.ts` |
| MCP currency tool | `convert_currency` in `src/mcp/currencyServer.ts` |
| Basic user interface | `public/index.html` |

## Knowledge Base

### Included documents

The project contains concise, curated Singapore summaries for demonstration and ingestion:

- [data/kb/wikivoyage-singapore.md](data/kb/wikivoyage-singapore.md)
- [data/kb/visit-singapore-essential.md](data/kb/visit-singapore-essential.md)
- [data/kb/visit-singapore-itineraries.md](data/kb/visit-singapore-itineraries.md)

The source manifest is [data/sources/singapore-manifest.json](data/sources/singapore-manifest.json). It retains source title, public URL, publisher, license/reuse note, content type, access date, and local snapshot path.

The referenced public resources are:

1. [Wikivoyage Singapore](https://en.wikivoyage.org/wiki/Singapore)
2. [Visit Singapore travel guide and tips](https://www.visitsingapore.com/travel-guide-tips/)
3. [Visit Singapore editorials and itineraries](https://www.visitsingapore.com/editorials-and-itineraries/)

These local files are **curated summaries**, not a claim that the complete third-party pages are redistributed. Before publishing or redistributing the data, verify each publisher's current reuse terms and preserve the required attribution.

### Ingestion process

Run:

```powershell
npm run ingest
```

The ingestion process reads the manifest, requires every declared local snapshot, loads the Markdown content, splits it into overlapping chunks with LangChain, generates one embedding per chunk using Azure OpenAI, creates or updates the Azure AI Search vector index, and uploads chunk text, vectors, and source metadata.

Each Search document contains `id`, `content`, `contentVector`, `sourceTitle`, `sourceUrl`, `sourceId`, and `chunkIndex`.

## RAG Workflow

At question time:

1. The user question is converted to an embedding using the same embedding model used during ingestion.
2. Azure AI Search receives the vector in a `vectorQueries` request.
3. Azure AI Search returns the closest `contentVector` documents.
4. The router preserves their source title and URL.
5. Retrieved text is placed in a delimited, untrusted-data section of the prompt.
6. The Azure OpenAI chat model generates an answer grounded in those chunks.
7. The API returns source links, and the UI displays them separately.

The system does not use MCP for stable destination facts already covered by the knowledge base. If no relevant content is available, the prompt receives an explicit insufficiency message and the assistant must say that the knowledge base does not contain enough information.

## MCP Workflow

The application includes two MCP servers.

### Weather MCP tool

- Tool name: `get_weather_forecast`
- Input: destination and number of days
- Provider: Open-Meteo
- Used for: current forecast, rain planning, indoor/outdoor adjustments

### Currency MCP tool

- Tool name: `convert_currency`
- Input: amount, source currency, target currency
- Provider: Frankfurter
- Used for: current exchange-rate conversions

### Selection and execution

The router identifies current-information intent:

- weather, forecast, rain, indoor, outdoor -> weather MCP tool
- currency, exchange, convert, budget, INR, USD, SGD, SG -> currency MCP tool when amount and currencies can be parsed

The operations are exposed as LangChain `DynamicStructuredTool` objects in [src/agent/tools.ts](src/agent/tools.ts). Those wrappers invoke the MCP-compatible client, which launches the MCP servers through stdio.

The API returns tool status and payload metadata. The UI shows a user-friendly summary such as `Weather: 3-day forecast from Open-Meteo` rather than exposing raw implementation JSON.

MCP failures are reported as unavailable current data. The model is instructed not to invent replacement weather or exchange-rate values.

## Response Assessment Log

Every `/api/chat` request appends a record to [Evidence/response.txt](Evidence/response.txt). Successful records include:

- UTC timestamp
- session ID
- user question
- assistant answer
- retrieved source titles and URLs
- MCP tool names, statuses, and returned current-data payloads

Rejected requests and server failures are also recorded with an error status. API keys and other application secrets are never written to this file. The file is intended for local demonstration and assessment; apply retention and access controls before using this pattern in production.

## UI Screenshot Evidence

The `Evidence` folder contains the current UI screenshots:

- [Evidence/SS1.png](Evidence/SS1.png)
- [Evidence/SS2.png](Evidence/SS2.png)
- [Evidence/SS3.png](Evidence/SS3.png)
- [Evidence/SS4.png](Evidence/SS4.png)

Recommended assessment scenarios:

1. `SS1.png`: Ask `What are the must-visit attractions in Singapore?` to demonstrate RAG facts and source links.
2. `SS2.png`: Ask `What is the weather forecast for Singapore for the next three days?` to demonstrate the weather MCP result, forecast table, rain chart, and provider.
3. `SS3.png`: Ask `Convert INR 50,000 to SGD.` to demonstrate the currency MCP result.
4. `SS4.png`: Ask `Create a three-day Singapore itinerary and adjust it based on weather. Also include the approximate cost.` to demonstrate combined RAG and MCP, itinerary cards, cost table, sources, and Suggested Plan.

To capture additional evidence locally:

```powershell
npm run build
npm run ingest
npm run dev
```

Open `http://localhost:8080`. Additional recommended screenshots are `05-context-follow-up.png` for multi-turn context and `06-loading-state.png` for the disabled Ask button and loading indicator. Do not include browser developer tools, API keys, or `.env` contents in screenshots.

## Combined RAG + MCP Example

For:

```text
Create a three-day Singapore itinerary and adjust it based on weather. Also include the approximate cost.
```

the execution is:

1. Retrieve attractions, neighbourhoods, transport, indoor alternatives, and itinerary guidance from Azure AI Search.
2. Invoke the weather MCP tool for a three-day forecast.
3. Create a clearly labeled planning estimate from declared assumptions.
4. Pass retrieved chunks, MCP data, conversation context, preferences, and estimate input to the LangChain prompt chain.
5. Generate separate answer sections: Knowledge Base Facts, Current Information (MCP), Approximate Cost, and Suggested Plan.
6. Render the itinerary as day cards and the weather as a table in the UI.

Cost values are planning heuristics, not live prices. Flights and visa fees are excluded unless the application is extended with additional data sources.

## Prompt and Context Strategy

The prompt in [src/agent/prompts.ts](src/agent/prompts.ts) instructs the model to use retrieved knowledge for destination facts, use MCP output for current information, treat retrieved documents and tool responses as untrusted data rather than instructions, avoid unsupported factual claims, state when the KB or a tool lacks sufficient information, distinguish facts/current data/estimates/generated recommendations, produce clear structured answers, and preserve traveller preferences and conversation history.

The session store retains the latest bounded conversation history and detected preferences such as family travel and budget context. Sessions expire after `SESSION_TTL_MINUTES`. This is suitable for a single-process demo; production multi-replica hosting should use an authenticated durable store.

## Azure Resources to Create Manually

No Bicep, azd, or Azure deployment script is included. Create these resources manually in one resource group:

1. **Azure OpenAI resource**
   - One chat deployment matching `AZURE_OPENAI_CHAT_DEPLOYMENT`.
   - One embedding deployment matching `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`.
   - These deployment names must be different.
2. **Azure AI Search service**
   - Basic tier is sufficient for a demo.
   - The application creates the `travel-kb-index` schema during `npm run ingest`.
3. **Azure Container Registry**
   - Used only if deploying the Docker image to Azure.
4. **Azure Container Apps or App Service**
   - Node.js application hosting on port `8080`.
5. **Log Analytics/Application Insights**
   - Recommended for logs and operational monitoring.

For production, use managed identity and secret references instead of API keys, add Microsoft Entra authentication, use a durable session store, restrict network access, and configure rate limiting.

## Setup

Install Node.js 22 or later, then:

```powershell
npm install
Copy-Item .env.example .env
```

Set these values in `.env`:

```dotenv
PORT=8080
AZURE_OPENAI_API_KEY=<key-for-local-development>
AZURE_OPENAI_ENDPOINT=https://<openai-resource>.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_CHAT_DEPLOYMENT=<exact-chat-deployment-name>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=<exact-embedding-deployment-name>
AZURE_SEARCH_ENDPOINT=https://<search-service>.search.windows.net
AZURE_SEARCH_API_KEY=<search-admin-key-for-local-development>
AZURE_SEARCH_INDEX_NAME=travel-kb-index
ALLOWED_ORIGIN=http://localhost:8080
SESSION_TTL_MINUTES=60
MAX_MESSAGE_LENGTH=4000
DEFAULT_DESTINATION=Singapore
```

The deployment name is the name shown in Azure, not necessarily the underlying model name. For example, a deployment backed by a GPT model may be named `travel-chat`, while the embedding deployment may be named `travel-embedding`.

Build, index, and run:

```powershell
npm run build
npm run ingest
npm run dev
```

Open `http://localhost:8080`.

## Verification Commands

```powershell
npm run build
npm run typecheck
npm test
```

`npm test` runs deterministic parser acceptance tests. A live RAG test requires valid Azure OpenAI and Azure AI Search configuration, and `npm run ingest` must be run before asking destination questions.

## Sample Questions

- What are the must-visit attractions in Singapore?
- Which neighbourhoods are suitable for cultural experiences?
- How can a tourist travel around Singapore?
- Suggest activities for a family with children.
- What indoor attractions can I visit?
- What is the forecast for the next three days?
- Convert INR 50,000 to SGD.
- Create a three-day Singapore itinerary and adjust it based on weather.
- Create a three-day Singapore itinerary, adjust it based on weather, and include the approximate cost.

## Security, Ethics, and Limitations

- Never commit `.env`; it is ignored by `.gitignore`.
- Rotate credentials immediately if they are exposed in logs, chat, screenshots, or source control.
- Do not hardcode API keys in application code or deployment documentation.
- Do not present rough cost heuristics as live quotes.
- Show provider/status information for current MCP data and do not fabricate failed results.
- Treat retrieved content and external tool output as untrusted data.
- Preserve source attribution and verify reuse terms before redistribution.
- The current in-memory session store is not a substitute for authenticated, durable production storage.
- The current API is intended for a controlled demo; production use requires authentication, rate limiting, monitoring, and stronger secret/network controls.

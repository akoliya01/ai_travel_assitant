import fs from "fs";
import path from "path";

type McpClient = {
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
};

async function withClient<T>(
  serverScript: string,
  callback: (client: McpClient) => Promise<T>
): Promise<T> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const distPath = path.join(process.cwd(), "dist", "src", serverScript);
  const sourcePath = path.join(process.cwd(), "src", serverScript.replace(".js", ".ts"));

  const transport = fs.existsSync(distPath)
    ? new StdioClientTransport({
        command: "node",
        args: [distPath]
      })
    : new StdioClientTransport({
        command: "npx",
        args: ["tsx", sourcePath]
      });

  const client = new Client({ name: "travel-assistant-client", version: "1.0.0" });

  await client.connect(transport);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

export async function getWeatherForecast(days = 3): Promise<Record<string, unknown>> {
  return withClient("mcp/weatherServer.js", async (client) => {
    const result = (await client.callTool({
      name: "get_weather_forecast",
      arguments: { destination: "Singapore", days }
    })) as { content?: Array<{ text?: string }> };
    const content = result.content?.[0];
    const text = content?.text ?? "{}";
    return JSON.parse(text);
  });
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<Record<string, unknown>> {
  return withClient("mcp/currencyServer.js", async (client) => {
    const result = (await client.callTool({
      name: "convert_currency",
      arguments: { amount, fromCurrency, toCurrency }
    })) as { content?: Array<{ text?: string }> };
    const content = result.content?.[0];
    const text = content?.text ?? "{}";
    return JSON.parse(text);
  });
}

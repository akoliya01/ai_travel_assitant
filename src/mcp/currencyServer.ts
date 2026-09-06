import { z } from "zod";

async function convert(amount: number, fromCurrency: string, toCurrency: string): Promise<Record<string, unknown>> {
  const url =
    `https://api.frankfurter.app/latest?amount=${encodeURIComponent(String(amount))}&from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Currency API failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    amount: number;
    base: string;
    date: string;
    rates: Record<string, number>;
  };

  return {
    provider: "Frankfurter",
    date: data.date,
    fromCurrency: data.base,
    toCurrency,
    inputAmount: data.amount,
    convertedAmount: data.rates[toCurrency]
  };
}

async function main(): Promise<void> {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = new McpServer({
    name: "currency-server",
    version: "1.0.0"
  });

  const unsafeServer: any = server;

  unsafeServer.tool(
    "convert_currency",
    "Convert an amount between currencies",
    {
      amount: z.number().positive(),
      fromCurrency: z.string().length(3),
      toCurrency: z.string().length(3)
    },
    async ({ amount, fromCurrency, toCurrency }: { amount: number; fromCurrency: string; toCurrency: string }) => {
      const conversion = await convert(amount, fromCurrency.toUpperCase(), toCurrency.toUpperCase());
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(conversion)
          }
        ]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();

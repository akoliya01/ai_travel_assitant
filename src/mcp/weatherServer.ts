import { z } from "zod";

async function fetchForecast(days: number): Promise<Array<Record<string, unknown>>> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=1.3521&longitude=103.8198&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSingapore&forecast_days=" +
    String(days);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API failed with status ${response.status}`);
  }
  const data = (await response.json()) as {
    daily: {
      time: string[];
      weathercode: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };

  return data.daily.time.map((date, index) => ({
    date,
    conditionCode: data.daily.weathercode[index],
    maxTempC: data.daily.temperature_2m_max[index],
    minTempC: data.daily.temperature_2m_min[index],
    rainProbabilityPercent: data.daily.precipitation_probability_max[index]
  }));
}

async function main(): Promise<void> {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = new McpServer({
    name: "weather-server",
    version: "1.0.0"
  });

  const unsafeServer: any = server;

  unsafeServer.tool(
    "get_weather_forecast",
    "Get forecast for Singapore for the next N days",
    {
      destination: z.string().default("Singapore"),
      days: z.number().int().min(1).max(7).default(3)
    },
    async ({ destination, days }: { destination: string; days: number }) => {
      const forecast = await fetchForecast(days);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              destination,
              provider: "Open-Meteo",
              unit: "celsius",
              forecast
            })
          }
        ]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();

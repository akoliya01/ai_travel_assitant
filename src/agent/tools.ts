import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { convertCurrency, getWeatherForecast } from "../mcp/client";

export const weatherTool = new DynamicStructuredTool({
  name: "weather_forecast",
  description: "Retrieve current Singapore weather forecast through the MCP weather server.",
  schema: z.object({
    days: z.number().int().min(1).max(7).default(3)
  }),
  func: async ({ days }) => JSON.stringify(await getWeatherForecast(days))
});

export const currencyTool = new DynamicStructuredTool({
  name: "currency_conversion",
  description: "Convert currencies through the MCP currency server.",
  schema: z.object({
    amount: z.number().positive(),
    fromCurrency: z.string().length(3),
    toCurrency: z.string().length(3)
  }),
  func: async ({ amount, fromCurrency, toCurrency }) =>
    JSON.stringify(await convertCurrency(amount, fromCurrency, toCurrency))
});
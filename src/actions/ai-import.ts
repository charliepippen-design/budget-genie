'use server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Define the output schema strictly as requested
const MediaPlanSchema = z.object({
    data: z.array(z.object({
        channel: z.string().describe("Normalized channel name"),
        month: z.string().describe("ISO Date (YYYY-MM-DD), representing the first day of the month"),
        budget: z.number().describe("Planned investment amount"),
        spend: z.number().optional().describe("Actual spend if available"),
        revenue: z.number().optional().describe("Revenue if available"),
        impressions: z.number().optional().describe("Impressions if available")
    }))
});

export async function parseMessyCSVWithAI(rawCSV: string) {
    try {
        // Optimization: Truncate input to save tokens (first 200 lines)
        const lines = rawCSV.split('\n');
        const truncatedCSV = lines.slice(0, 200).join('\n');

        const result = await generateObject({
            model: openai('gpt-4o'),
            schema: MediaPlanSchema,
            system: `
        You are an expert Data Engineer specializing in parsing messy media plan CSVs.
        Your task is to extract structured investment data from the provided CSV content.

        Rules:
        1. Scan the first 50 lines to identify the "real" header row. Ignore titles, dates, or metadata at the top.
        2. Map vague column names to the schema:
           - "Planned Inv", "Est. Cost", "Budget", "Allocated" -> budget
           - "Spends", "Actuals", "Cost" -> spend
        3. Infer the month from the context, file headers, or row data. If multiple months are present, ensure correct mapping. Format as YYYY-MM-DD (e.g., 2024-01-01).
        4. Ignore "Total", "Grand Total", or "Average" rows at the bottom.
        5. Normalize channel names (e.g. "FB Ads" -> "Facebook", "G. Search" -> "Google Search").
        
        Return ONLY the structured data object.
      `,
            prompt: `Parse the following CSV data:\n\n${truncatedCSV}`,
        });

        return { success: true, data: result.object.data };
    } catch (error) {
        console.error("AI Import Failed:", error);
        return { success: false, error: "Failed to parse CSV with AI." };
    }
}

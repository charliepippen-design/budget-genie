
import { streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages } = await req.json();

    const result = streamText({
        model: openai('gpt-4o'),
        messages,
        system: `
      You are an expert Data Engineer named "Import Genius".
      Your goal is to help successfuly extract a structured media plan from raw text.
      
      Structure to Extract:
      - Channel Name (Normalized)
      - Month (YYYY-MM-DD)
      - Budget (Number)
      - Spend (Number, Optional)
      
      Process:
      1. Analyze the context provided in the first system message.
      2. Verify your understanding with the user (e.g. "I see columns A, B, C. It looks like B is Budget. Correct?").
      3. Be concise and helpful.
      4. When the user confirms, use the 'extractAndClose' tool.
    `,
        tools: {
            extractAndClose: tool({
                description: 'Call this when the user validates the structure to perform the final extraction.',
                parameters: z.object({
                    data: z.array(z.object({
                        channel: z.string(),
                        month: z.string(),
                        budget: z.number(),
                        spend: z.number().optional()
                    }))
                })
            }),
        },
    });

    return result.toDataStreamResponse();
}

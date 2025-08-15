
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import {
    ExtractSalesInputSchema,
    ExtractSalesOutputSchema,
} from '@/ai/schemas/extract-sales-schema';

export type ExtractSalesInput = z.infer<typeof ExtractSalesInputSchema>;
export type ExtractSalesOutput = z.infer<typeof ExtractSalesOutputSchema>;

const extractionPrompt = ai.definePrompt({
    name: 'extractSalesPrompt',
    input: { schema: ExtractSalesInputSchema },
    output: { schema: ExtractSalesOutputSchema },
    prompt: `You are an expert data extraction agent. Your task is to analyze the provided document (image or PDF) containing one or more shipping labels or delivery notes ("Daftar Pengiriman").

You have been provided with a list of existing products in the database. Use this list as your primary reference for matching items.
Existing Products:
{{#if products}}
  {{#each products}}
- SKU/ID: {{id}}, Name: {{name}}
  {{/each}}
{{else}}
- No products in the database.
{{/if}}

Go through the document line by line. For **every single product line item** you find, extract the following information:
1.  **sku**: Match the product from the file to an "Existing Product". Use the existing product's SKU/ID if a confident match is found. If no match is found, generate a logical, consistent, and unique SKU based on the product name (e.g., 'GLASWOOL 1M KUNING' could become 'GLW-KNG-1M'). If the SKU is empty or missing, provide an empty string "".
2.  **name**: The full name or description of the product as written on the note (e.g., 'GLASWOOL 1M KUNING').
3.  **quantity**: The quantity for that specific line item.
4.  **price**: The price per unit for that specific line item.

Then, extract the grand total amount for the entire delivery note.

If a document contains multiple delivery notes, return each one as a separate object in the 'sales' array.

**IMPORTANT**: Do NOT add up quantities yourself. Extract each product line item exactly as you see it. If a product appears multiple times, extract it multiple times. Every item object in the output must contain all required fields ('sku', 'name', 'quantity', 'price').

Analyze this file: {{media url=fileDataUri}}
`,
});

const extractSalesFlow = ai.defineFlow(
    {
        name: 'extractSalesFlow',
        inputSchema: ExtractSalesInputSchema,
        outputSchema: ExtractSalesOutputSchema,
    },
    async (input) => {
        const { output } = await extractionPrompt(input);
        
        if (!output || !Array.isArray(output.sales)) {
            return { sales: [] };
        }

        const sanitizedSales = output.sales.map(sale => {
            const sanitizedItems = sale.items.map(item => ({
                sku: item.sku ?? '',
                name: item.name ?? 'N/A',
                quantity: item.quantity ?? 0,
                price: item.price ?? 0,
            }));
            return { ...sale, items: sanitizedItems };
        });

        return { sales: sanitizedSales };
    }
);

export async function extractSales(input: ExtractSalesInput): Promise<ExtractSalesOutput> {
    return await extractSalesFlow(input);
}

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
 plugins: [
    // Only initialize googleAI plugin if API key is available
    process.env.GEMINI_API_KEY
      ? googleAI({ apiKey: process.env.GEMINI_API_KEY })
 : [], // Provide an empty array if API key is not available
 ],
 model: 'googleai/gemini-1.5-flash-latest',
});


import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { GenkitPlugin } from '@genkit-ai/core';

const plugins: GenkitPlugin[] = [];

if (process.env.GEMINI_API_KEY) {
  plugins.push(googleAI({
    apiKey: process.env.GEMINI_API_KEY,
  }));
}

export const ai = genkit({
 plugins: plugins,
 model: 'googleai/gemini-1.5-flash-latest',
});


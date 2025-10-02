// Implemented Genkit flow for AI scene detection in videos.
'use server';
/**
 * @fileOverview Detects scene changes in a video using AI to suggest potential clip boundaries.
 *
 * - detectSceneChanges - A function that handles the scene detection process.
 * - DetectSceneChangesInput - The input type for the detectSceneChanges function.
 * - DetectSceneChangesOutput - The return type for the detectSceneChanges function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectSceneChangesInputSchema = z.object({
  videoDataUri: z
    .string()
    .describe(
      'A video file as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' 
    ),
});
export type DetectSceneChangesInput = z.infer<typeof DetectSceneChangesInputSchema>;

const DetectSceneChangesOutputSchema = z.object({
  sceneTimestamps: z
    .array(z.number())
    .describe('Array of timestamps (in seconds) where scene changes are detected.'),
});
export type DetectSceneChangesOutput = z.infer<typeof DetectSceneChangesOutputSchema>;

export async function detectSceneChanges(input: DetectSceneChangesInput): Promise<DetectSceneChangesOutput> {
  return detectSceneChangesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectSceneChangesPrompt',
  input: {schema: DetectSceneChangesInputSchema},
  output: {schema: DetectSceneChangesOutputSchema},
  prompt: `You are an AI video scene detector. Analyze the video and detect scene changes.

  Return a JSON array of timestamps (in seconds) where scene changes occur.

  Video: {{media url=videoDataUri}}

  Format your response as a JSON object conforming to the following schema:
  {
    "sceneTimestamps": [number, number, ...]
  }
  `,
});

const detectSceneChangesFlow = ai.defineFlow(
  {
    name: 'detectSceneChangesFlow',
    inputSchema: DetectSceneChangesInputSchema,
    outputSchema: DetectSceneChangesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

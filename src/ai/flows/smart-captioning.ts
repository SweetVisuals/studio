'use server';

/**
 * @fileOverview A flow for automatically generating captions for short video clips using speech-to-text.
 *
 * - generateCaptions - A function that handles the caption generation process.
 * - GenerateCaptionsInput - The input type for the generateCaptions function, which includes the audio data URI.
 * - GenerateCaptionsOutput - The return type for the generateCaptions function, which includes the generated captions.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import wav from 'wav';

const GenerateCaptionsInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      'The audio data URI of the short video clip, including MIME type and Base64 encoding (e.g., data:audio/wav;base64,...).'
    ),
});
export type GenerateCaptionsInput = z.infer<typeof GenerateCaptionsInputSchema>;

const GenerateCaptionsOutputSchema = z.object({
  captions: z.string().describe('The generated captions for the short video clip.'),
});
export type GenerateCaptionsOutput = z.infer<typeof GenerateCaptionsOutputSchema>;

export async function generateCaptions(input: GenerateCaptionsInput): Promise<GenerateCaptionsOutput> {
  return generateCaptionsFlow(input);
}

const generateCaptionsPrompt = ai.definePrompt({
  name: 'generateCaptionsPrompt',
  input: {schema: GenerateCaptionsInputSchema},
  output: {schema: GenerateCaptionsOutputSchema},
  prompt: `You are an AI expert in generating captions for short video clips. Use the provided audio data to generate accurate and concise captions. 

Audio Data: {{media url=audioDataUri}}`,
});

const generateCaptionsFlow = ai.defineFlow(
  {
    name: 'generateCaptionsFlow',
    inputSchema: GenerateCaptionsInputSchema,
    outputSchema: GenerateCaptionsOutputSchema,
  },
  async input => {
    const {output} = await generateCaptionsPrompt(input);
    return output!;
  }
);

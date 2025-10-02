
'use server';

import { generateCaptions } from '@/ai/flows/smart-captioning';
import { formatTime } from '@/lib/utils';
import { detectSceneChanges } from '@/ai/ai-scene-detection';

export async function generateCaptionsAction(data: {
  audioDataUri: string; 
}): Promise<{ captions: string }> {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    const result = await generateCaptions({ audioDataUri: data.audioDataUri });
    return result;
  } catch (error) {
    console.error('AI caption generation failed:', error);
    return { captions: 'Fallback caption: Edit me!' };
  }
}

export async function detectScenesAction(videoData: {
  videoDataUri: string;
}): Promise<{ sceneTimestamps: number[] }> {
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Mock response
    return {
        sceneTimestamps: [0, 15, 30, 45, 60, 75, 90]
    };
}

    
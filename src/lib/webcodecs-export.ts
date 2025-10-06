import type { VideoFilter } from '../app/page';
import { Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, AudioBufferSource, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, VideoSample } from 'mediabunny';

/**
 * Mediabunny-based video export utilities for high-performance encoding
 */

// Check WebCodecs support (still used for frame processing)
export function checkWebCodecsSupport(): { supported: boolean; videoEncoder: boolean; audioEncoder: boolean } {
  // On mobile devices, WebCodecs support is limited and often unreliable
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    // Force fallback to MediaRecorder on mobile for better compatibility
    return {
      supported: false,
      videoEncoder: false,
      audioEncoder: false
    };
  }

  const videoEncoder = 'VideoEncoder' in window;
  const audioEncoder = 'AudioEncoder' in window;

  return {
    supported: videoEncoder && audioEncoder,
    videoEncoder,
    audioEncoder
  };
}

// Encoder configuration for mediabunny quality settings
export function getVideoEncoderConfig(quality: 'low' | 'medium' | 'high', width: number, height: number) {
  const qualityMap = {
    low: QUALITY_LOW,
    medium: QUALITY_MEDIUM,
    high: QUALITY_HIGH
  };

  // H.264/AVC requires even dimensions - round to nearest even numbers
  const evenWidth = Math.round(width / 2) * 2;
  const evenHeight = Math.round(height / 2) * 2;

  console.log(`Original dimensions: ${width}x${height}, adjusted to: ${evenWidth}x${evenHeight}`);

  return {
    codec: 'avc',
    bitrate: qualityMap[quality],
    width: evenWidth,
    height: evenHeight,
    framerate: quality === 'low' ? 24 : 30
  };
}

export function getAudioEncoderConfig(quality: 'low' | 'medium' | 'high') {
  const qualityMap = {
    low: QUALITY_LOW,
    medium: QUALITY_MEDIUM,
    high: QUALITY_HIGH
  };

  return {
    codec: 'aac',
    bitrate: qualityMap[quality],
    sampleRate: 44100,
    numberOfChannels: 2
  };
}

// Frame processing utilities (unchanged)
export class FrameProcessor {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private videoElement: HTMLVideoElement;
  private nightVisionColor: string;
  private nightVisionOpacity: number;
  private grainIntensity: number;

  constructor(width: number, height: number, videoElement: HTMLVideoElement, nightVisionColor: string = '#00ff00', nightVisionOpacity: number = 100, grainIntensity: number = 50) {
    this.canvas = new OffscreenCanvas(width, height);
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    })!;
    this.videoElement = videoElement;
    this.nightVisionColor = nightVisionColor;
    this.nightVisionOpacity = nightVisionOpacity;
    this.grainIntensity = grainIntensity;

    // Performance optimizations
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.globalCompositeOperation = 'copy';
  }

  // Render a frame with scaling and positioning
  renderFrame(time: number, scale: number = 1.0, filters: VideoFilter[] = []): VideoFrame | null {
    try {
      // Fast clear
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Apply filters to the canvas context
      this.ctx.filter = this.getFilterString(filters);

      // Calculate scaling to fill canvas (object-cover behavior) while maintaining aspect ratio
      const scaleX = this.canvas.width / this.videoElement.videoWidth;
      const scaleY = this.canvas.height / this.videoElement.videoHeight;
      const finalScale = Math.max(scaleX, scaleY) * scale;

      const scaledWidth = this.videoElement.videoWidth * finalScale;
      const scaledHeight = this.videoElement.videoHeight * finalScale;
      const offsetX = (this.canvas.width - scaledWidth) / 2;
      const offsetY = (this.canvas.height - scaledHeight) / 2;

      // Draw the frame
      this.ctx.drawImage(
        this.videoElement,
        offsetX, offsetY, scaledWidth, scaledHeight
      );

      // Reset filter for next frame
      this.ctx.filter = 'none';

      // Create VideoFrame from canvas
      return new VideoFrame(this.canvas, {
        timestamp: time * 1000000, // Convert to microseconds
        duration: 1000000 / 30 // Assume 30fps for now
      });
    } catch (error) {
      console.error('Frame rendering error:', error);
      return null;
    }
  }

  private getFilterString(filters: VideoFilter[]): string {
    if (!filters || filters.length === 0 || filters.includes('none')) return 'none';

    const filterStrings = filters.map(filter => {
      switch (filter) {
        case 'bw':
          return 'grayscale(100%)';
        case 'night-vision':
          const opacityFactor = this.nightVisionOpacity / 100;
          if (this.nightVisionColor === '#default') {
            // Interpolate filter values based on opacity
            const grayscale = 100 * opacityFactor; // 0% to 100%
            const brightness = 1.0 + (0.2 * opacityFactor); // 1.0 to 1.2
            const sepia = 100 * opacityFactor; // 0% to 100%
            const saturate = 100 + (100 * opacityFactor); // 100% to 200%
            return `grayscale(${grayscale}%) brightness(${brightness}) sepia(${sepia}%) hue-rotate(80deg) saturate(${saturate}%)`;
          } else {
            // Convert hex color to HSL for hue-rotate
            const hexToHsl = (hex: string) => {
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;

              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              let h = 0;
              let s = 0;
              const l = (max + min) / 2;

              if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                  case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                  case g: h = (b - r) / d + 2; break;
                  case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
              }

              return [h * 360, s * 100, l * 100];
            };

            const [h] = hexToHsl(this.nightVisionColor);
            // Interpolate filter values based on opacity
            const grayscale = 100 * opacityFactor; // 0% to 100%
            const brightness = 1.0 + (0.2 * opacityFactor); // 1.0 to 1.2
            const sepia = 100 * opacityFactor; // 0% to 100%
            const saturate = 100 + (100 * opacityFactor); // 100% to 200%
            return `grayscale(${grayscale}%) brightness(${brightness}) sepia(${sepia}%) hue-rotate(${h}deg) saturate(${saturate}%)`;
          }
        case 'vhs':
          // VHS effect using canvas operations - simplified CSS approximation
          return 'contrast(1.1) brightness(1.1) saturate(1.2)';
        case 'grain':
          // For grain, we can't easily apply noise in canvas filter, so skip for now
          return 'none';
        case 'noise':
          // For noise, we can't easily apply noise in canvas filter, so skip for now
          return 'none';
        default:
          return 'none';
      }
    });

    return filterStrings.filter(f => f !== 'none').join(' ');
  }

  destroy() {
    // Clean up resources
  }
}

// Audio processing utilities (enhanced for continuous audio rendering)
export class AudioProcessor {
  private audioContext: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private sampleRate: number;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate });
  }

  async loadAudio(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  // Render the entire audio file as continuous throughout the video duration
  // This treats audio as a separate continuous track, not cut-based segments
  renderContinuousAudio(_cuts: Array<{ start: number; end: number; sourceVideo?: number }>, totalDuration: number): AudioBuffer | null {
    if (!this.audioBuffer) return null;

    const totalSamples = Math.ceil(totalDuration * this.sampleRate);
    const continuousAudioBuffer = new AudioBuffer({
      length: totalSamples,
      numberOfChannels: this.audioBuffer.numberOfChannels,
      sampleRate: this.sampleRate
    });

    console.log(`Rendering continuous audio: ${totalDuration.toFixed(2)}s total duration, source audio has ${(this.audioBuffer.length / this.sampleRate).toFixed(2)}s available`);

    // Copy the entire source audio file, looping if necessary, or truncating if too long
    for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
      const sourceChannelData = this.audioBuffer.getChannelData(channel);
      const destChannelData = continuousAudioBuffer.getChannelData(channel);

      // Copy audio data, either truncating if source is longer, or repeating if source is shorter
      const samplesToCopy = Math.min(this.audioBuffer.length, totalSamples);

      if (samplesToCopy > 0) {
        destChannelData.set(sourceChannelData.subarray(0, samplesToCopy), 0);

        // If video is longer than audio, the rest will be silence (already zero-initialized)
        if (totalSamples > this.audioBuffer.length) {
          console.log(`  Audio source (${(this.audioBuffer.length / this.sampleRate).toFixed(2)}s) shorter than video (${totalDuration.toFixed(2)}s), padding with silence`);
        } else {
          console.log(`  Using full audio source (${(this.audioBuffer.length / this.sampleRate).toFixed(2)}s) for video duration`);
        }
      }
    }

    console.log(`Continuous audio rendered successfully: ${totalSamples} total samples`);
    return continuousAudioBuffer;
  }

  // Legacy method for backwards compatibility - single chunk extraction
  getAudioChunk(startTime: number, duration: number): AudioBuffer | null {
    if (!this.audioBuffer) return null;

    const startSample = Math.floor(startTime * this.sampleRate);
    const numSamples = Math.floor(duration * this.sampleRate);

    if (startSample >= this.audioBuffer.length) return null;

    const actualSamples = Math.min(numSamples, this.audioBuffer.length - startSample);

    // Create a new AudioBuffer with the chunk data
    const audioBufferSlice = new AudioBuffer({
      length: actualSamples,
      numberOfChannels: this.audioBuffer.numberOfChannels,
      sampleRate: this.sampleRate
    });

    // Copy channel data
    for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
      const channelData = this.audioBuffer.getChannelData(channel);
      const sliceData = channelData.slice(startSample, startSample + actualSamples);
      audioBufferSlice.getChannelData(channel).set(sliceData);
    }

    return audioBufferSlice;
  }

  destroy() {
    this.audioContext.close();
  }
}

// Mediabunny-based export system
// Replaces the original WebCodecs approach with mediabunny's Output/Input API
export class WebCodecsExporter {
  private output: Output;
  private videoSource: VideoSampleSource | null = null;
  private audioSource: AudioBufferSource | null = null;
  private pendingVideoFrames: VideoFrame[] = [];
  private pendingAudioBuffers: AudioBuffer[] = [];
  private outputStarted = false;

  constructor() {
    this.output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget()
    });
  }

  async initializeVideoEncoder(config: any): Promise<boolean> {
    try {
      // Initialize video source with mediabunny config
      this.videoSource = new VideoSampleSource(config);
      this.output.addVideoTrack(this.videoSource);
      return true;
    } catch (error) {
      console.error('Failed to initialize mediabunny video encoder:', error);
      return false;
    }
  }

  async initializeAudioEncoder(config: any): Promise<boolean> {
    try {
      // Initialize audio source with mediabunny config
      this.audioSource = new AudioBufferSource(config);
      this.output.addAudioTrack(this.audioSource);
      return true;
    } catch (error) {
      console.error('Failed to initialize mediabunny audio encoder:', error);
      return false;
    }
  }

  async encodeVideoFrame(frame: VideoFrame): Promise<void> {
    // Store frames for later processing - mediabunny requires output.start() before adding data
    this.pendingVideoFrames.push(frame);
  }

  async encodeAudioData(audioBuffer: AudioBuffer): Promise<void> {
    // Store audio buffers for later processing - mediabunny requires output.start() before adding data
    this.pendingAudioBuffers.push(audioBuffer);
  }

  async finalize(): Promise<Blob> {
    try {
      // Start the output (required before adding media data in mediabunny)
      await this.output.start();
      this.outputStarted = true;

      const totalFrames = this.pendingVideoFrames.length;
      console.log(`Processing ${totalFrames} video frames and ${this.pendingAudioBuffers.length} audio buffers`);

      // Process video frames in batches to avoid memory pressure
      const batchSize = 100;
      for (let i = 0; i < this.pendingVideoFrames.length; i += batchSize) {
        const batch = this.pendingVideoFrames.slice(i, i + batchSize);
        console.log(`Processing video batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(totalFrames/batchSize)}`);

        for (const frame of batch) {
          if (this.videoSource) {
            try {
              // Convert VideoFrame to VideoSample for mediabunny
              const videoSample = new VideoSample(frame);
              await this.videoSource.add(videoSample);
              videoSample.close();
            } catch (error) {
              console.error(`Video frame encoding error at frame ${i + batch.indexOf(frame)}:`, error);
            }
          }
          frame.close();
        }
      }
      this.pendingVideoFrames = [];

      // Process audio buffers efficiently
      for (let i = 0; i < this.pendingAudioBuffers.length; i++) {
        const audioBuffer = this.pendingAudioBuffers[i];
        if (this.audioSource) {
          try {
            await this.audioSource.add(audioBuffer);
          } catch (error) {
            console.error(`Audio buffer encoding error at buffer ${i}:`, error);
          }
        }
      }
      this.pendingAudioBuffers = [];

      console.log('Encoding complete, finalizing output...');

      // Finalize and get buffer
      await this.output.finalize();

      const bufferTarget = this.output.target as BufferTarget;
      return new Blob([bufferTarget.buffer!], { type: 'video/mp4' });
    } catch (error) {
      console.error('Finalization error:', error);
      throw error;
    }
  }
}

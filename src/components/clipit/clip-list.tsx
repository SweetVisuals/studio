'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, Play, Trash2, Film, Ratio, AudioWaveform, VolumeX, Video, Copy, Wand2, Pause } from 'lucide-react';
import type { Clip, VideoFilter, AspectRatio, VideoSource, ClipCut } from '@/app/page';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { Input } from '../ui/input';
import {
  checkWebCodecsSupport,
  getVideoEncoderConfig,
  getAudioEncoderConfig,
  FrameProcessor,
  AudioProcessor,
  WebCodecsExporter
} from '@/lib/webcodecs-export';

type ClipListProps = {
  clips: Clip[];
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  onPreview: (clip: Clip) => void;
  aspectRatio: AspectRatio;
  videoSources: VideoSource[];
  activePreviewClipId?: number | null;
  isPreviewing?: boolean;
  sourceScaleFactors?: {[key: number]: number};
};

export default function ClipList({
  clips,
  setClips,
  onPreview,
  aspectRatio,
  videoSources,
  activePreviewClipId,
  isPreviewing,
  exportFormat = 'mp4',
  exportQuality = 'high',
  exportFrameRate = 30,
  sourceScaleFactors = {}
}: ClipListProps & {
  exportFormat?: 'mp4' | 'webm';
  exportQuality?: 'low' | 'medium' | 'high';
  exportFrameRate?: 24 | 30 | 60;
}) {
  const [exportingClipId, setExportingClipId] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const { toast } = useToast();

  // MediaRecorder codec and quality configurations
  const getMediaRecorderConfig = (format: 'mp4' | 'webm', quality: 'low' | 'medium' | 'high') => {
    const configs = {
      mp4: {
        low: { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', videoBitsPerSecond: 1000000, audioBitsPerSecond: 64000 },
        medium: { mimeType: 'video/mp4;codecs=avc1.4D401E,mp4a.40.2', videoBitsPerSecond: 3000000, audioBitsPerSecond: 128000 },
        high: { mimeType: 'video/mp4;codecs=avc1.64001F,mp4a.40.2', videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000 }
      },
      webm: {
        low: { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 1000000, audioBitsPerSecond: 64000 },
        medium: { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 3000000, audioBitsPerSecond: 128000 },
        high: { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000 }
      }
    };
    return configs[format][quality];
  };

  useEffect(() => {
    // This effect handles the cleanup of Object URLs for overlay audio.
    // It runs when the component unmounts.
    return () => {
        // Create a set of all unique audio URLs currently in use by the clips.
        const audioUrls = new Set(clips.map(c => c.overlayAudioUrl));
        // Revoke each unique URL to free up memory.
        audioUrls.forEach(url => {
            if(url) URL.revokeObjectURL(url);
        });
    };
  }, []); // The empty dependency array ensures this runs only once on unmount.

  const deleteClip = (id: number) => {
    setClips((prev) => {
        const clipToDelete = prev.find(c => c.id === id);
        const remainingClips = prev.filter((c) => c.id !== id);

        // If the deleted clip had an audio URL, check if it's still used by other clips.
        if (clipToDelete?.overlayAudioUrl) {
            const isAudioUrlStillInUse = remainingClips.some(c => c.overlayAudioUrl === clipToDelete.overlayAudioUrl);
            // If the URL is no longer in use, revoke it.
            if (!isAudioUrlStillInUse) {
                URL.revokeObjectURL(clipToDelete.overlayAudioUrl);
            }
        }
        return remainingClips;
    });
    toast({ title: 'Clip removed.'});
  };

  const getFilterString = (filters: VideoFilter[]): string => {
    return filters.map(filter => {
        switch (filter) {
            case 'bw': return 'grayscale(100%)';
            case 'night-vision': return 'grayscale(100%) brightness(1.2) sepia(100%) hue-rotate(80deg) saturate(200%)';
            case 'vhs': return ''; 
            default: return '';
        }
    }).filter(f => f).join(' ');
  };

  const exportFrameRateAdjusted = exportFrameRate > 30 ? 30 : exportFrameRate;

  const exportClip = async (clip: Clip) => {
    setExportingClipId(clip.id);
    setExportProgress(0);
    toast({ title: `Exporting "${clip.title}"...`, description: 'Please wait, this can take a moment.' });

    try {
      // Check for WebCodecs support and try using it for better performance
      const webCodecsSupport = checkWebCodecsSupport();

      if (webCodecsSupport.videoEncoder) {
        // Use WebCodecs for hardware-accelerated export
        await exportClipWithWebCodecs(clip);
      } else {
        // Fall back to canvas-based MediaRecorder approach
        console.warn('WebCodecs not supported, falling back to MediaRecorder');
        await exportClipWithMediaRecorder(clip);
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast({ variant: 'destructive', title: 'Export failed', description: (error as Error).message });
      setExportingClipId(null);
    }
  };

  const exportClipWithWebCodecs = async (clip: Clip) => {
    const firstVidSourceIndex = clip.cuts && clip.cuts.length > 0 ? clip.cuts[0].sourceVideo : clip.sourceVideo;
    if (firstVidSourceIndex < 0 || firstVidSourceIndex >= videoSources.length) {
      throw new Error('Invalid video source for clip.');
    }

    const firstVidSource = videoSources[firstVidSourceIndex];
    const tempVideo = document.createElement('video');
    tempVideo.src = firstVidSource.url;
    await new Promise(res => tempVideo.onloadedmetadata = res);

    let exportWidth: number;
    let exportHeight: number;

    if (aspectRatio === 'source') {
      exportWidth = tempVideo.videoWidth;
      exportHeight = tempVideo.videoHeight;
    } else {
      // Match preview behavior: create fixed canvas with target aspect ratio
      // The FrameProcessor will handle cropping to fill like object-cover CSS
      const [w, h] = aspectRatio.split(':').map(Number);
      const targetAspectRatio = w / h;

      // Use a reasonable base size for the target canvas
      // We'll use 1920 as the larger dimension for high quality
      if (targetAspectRatio > 1) {
        // Landscape/horizontal
        exportWidth = 1920;
        exportHeight = Math.round(1920 / targetAspectRatio);
        // Ensure even dimensions for H.264
        exportWidth = Math.round(exportWidth / 2) * 2;
        exportHeight = Math.round(exportHeight / 2) * 2;
      } else {
        // Portrait/vertical
        exportHeight = 1920;
        exportWidth = Math.round(1920 * targetAspectRatio);
        // Ensure even dimensions for H.264
        exportWidth = Math.round(exportWidth / 2) * 2;
        exportHeight = Math.round(exportHeight / 2) * 2;
      }

      console.log(`Target aspect ratio ${aspectRatio}: canvas ${exportWidth}x${exportHeight}`);
    }

    // Initialize WebCodecs exporter
    const exporter = new WebCodecsExporter();
    const videoConfig = getVideoEncoderConfig(exportQuality, exportWidth, exportHeight);
    const audioConfig = getAudioEncoderConfig(exportQuality);

    const videoEncoderInitialized = await exporter.initializeVideoEncoder(videoConfig);
    if (!videoEncoderInitialized) {
      throw new Error('Failed to initialize video encoder');
    }

    let audioEncoderInitialized = false;
    if (clip.overlayAudioUrl) {
      audioEncoderInitialized = await exporter.initializeAudioEncoder(audioConfig);
    }

    // Pre-load and pre-buffer all video sources
    const videoElements = await Promise.all(videoSources.map((source, index) => {
      return new Promise<HTMLVideoElement>(async (resolve) => {
        const video = document.createElement('video');
        video.src = source.url;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';

        await new Promise(res => video.onloadedmetadata = res);

        // Buffer up to 80% or 30 seconds, whichever is smaller
        const requiredBuffer = Math.min(30, video.duration * 0.8);
        if (video.buffered.length > 0) {
          while (video.buffered.end(0) < requiredBuffer) {
            await new Promise(res => setTimeout(res, 100));
            if (video.readyState >= 3) break;
          }
        }

        console.log(`Video ${index} ready for WebCodecs export`);
        resolve(video);
      });
    }));

    // Audio processing - pre-render continuous audio for all cuts
    let continuousAudioBuffer: AudioBuffer | null = null;
    if (clip.overlayAudioUrl) {
      const audioProcessor = new AudioProcessor();
      await audioProcessor.loadAudio(clip.overlayAudioUrl);

      const cuts = clip.cuts || [{ sourceVideo: clip.sourceVideo, start: clip.start, end: clip.end }];
      const totalDuration = cuts.reduce((acc, cut) => acc + (cut.end - cut.start), 0);
      continuousAudioBuffer = audioProcessor.renderContinuousAudio(cuts, totalDuration);

      console.log(`Pre-rendered continuous audio: ${totalDuration.toFixed(2)}s, ${continuousAudioBuffer ? continuousAudioBuffer.length : 0} samples`);

      audioProcessor.destroy();
    }

    const cuts = clip.cuts || [{ sourceVideo: clip.sourceVideo, start: clip.start, end: clip.end }];
    const totalDuration = cuts.reduce((acc, cut) => acc + (cut.end - cut.start), 0);

    let processedDuration = 0;

    // Calculate total number of frames to process
    const fps = exportFrameRateAdjusted;
    const totalFrames = Math.ceil(totalDuration * fps);
    const frameInterval = 1 / fps;
    let processedFrameCount = 0;

    console.log(`Processing ${cuts.length} cuts with ${totalFrames} total frames at ${fps} fps`);

    // Process cuts in timeline order by maintaining absolute timestamps
    for (let cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
      const cut = cuts[cutIndex];
      const videoElement = videoElements[cut.sourceVideo];
      const frameProcessor = new FrameProcessor(exportWidth, exportHeight, videoElement);

      console.log(`Processing cut ${cutIndex + 1}/${cuts.length}: source video ${cut.sourceVideo + 1}, time ${cut.start.toFixed(2)}-${cut.end.toFixed(2)}s`);

      // Seek to cut start with improved precision
      videoElement.currentTime = cut.start;
      await new Promise<void>((seekResolve) => {
        let seekAttempts = 0;
        const maxSeekAttempts = 50; // Reduced attempts but more precise

        const checkSeek = () => {
          seekAttempts++;
          const seekDiff = Math.abs(videoElement.currentTime - cut.start);
          const isReady = videoElement.readyState >= 3;

          // More precise seek completion criteria
          if (seekDiff < 0.015 && isReady && !videoElement.seeking) {
            seekResolve();
          } else if (seekAttempts >= maxSeekAttempts) {
            console.log(`Seek timeout after ${seekAttempts} attempts, diff: ${seekDiff}s, readyState: ${videoElement.readyState}`);
            seekResolve();
          } else {
            setTimeout(checkSeek, 20); // Slightly longer delay for seek precision
          }
        };
        checkSeek();
      });

      // Calculate this cut's contribution to the timeline
      const cutStartTimeline = processedDuration;
      const cutEndTimeline = cutStartTimeline + (cut.end - cut.start);

      // Pre-calculate frame timestamps for this cut
      const cutFrameTimestamps: number[] = [];
      let frameStartTime = cut.start;
      const nextCut = cuts[cutIndex + 1];
      const nextCutStart = nextCut ? nextCut.start + processedDuration + (nextCut.end - nextCut.start) : cutEndTimeline;

      while (frameStartTime < cut.end) {
        const timelineTime = cutStartTimeline + (frameStartTime - cut.start);
        // Ensure we don't create frames that extend beyond the next cut boundary
        if (nextCut && timelineTime >= nextCutStart) break;
        cutFrameTimestamps.push(frameStartTime);
        frameStartTime += frameInterval;
      }

      console.log(`Cut ${cutIndex + 1} will render ${cutFrameTimestamps.length} frames`);

      // Process each frame in the cut
      for (let frameIndex = 0; frameIndex < cutFrameTimestamps.length; frameIndex++) {
        const frameTime = cutFrameTimestamps[frameIndex];
        const timelineTime = cutStartTimeline + (frameTime - cut.start);

        // Ensure precise video seeking for each frame
        videoElement.currentTime = frameTime;
        await new Promise<void>((seekResolve) => {
          let seekAttempts = 0;
          const maxSeekAttempts = 30;

          const checkSeek = () => {
            seekAttempts++;
            const seekDiff = Math.abs(videoElement.currentTime - frameTime);

            if (seekDiff < 0.008 && videoElement.readyState >= 2 && !videoElement.seeking) {
              seekResolve();
            } else if (seekAttempts >= maxSeekAttempts) {
              seekResolve();
            } else {
              setTimeout(checkSeek, 8); // Faster, more precise seeking
            }
          };
          checkSeek();
        });

        // Stable frame capture with multiple attempts
        const scaleFactor = sourceScaleFactors[cut.sourceVideo] || 1.0;
        let frame: VideoFrame | null = null;
        for (let attempt = 0; attempt < 3 && !frame; attempt++) {
          frame = frameProcessor.renderFrame(timelineTime, scaleFactor, clip.filters);
          if (!frame && attempt < 2) {
            await new Promise(res => setTimeout(res, 5)); // Brief delay between attempts
          }
        }

        if (frame) {
          await exporter.encodeVideoFrame(frame);
        } else {
          console.warn(`Failed to render frame at time ${frameTime.toFixed(3)}s for cut ${cutIndex + 1}`);
        }

        processedFrameCount++;
        setExportProgress((processedFrameCount / totalFrames) * 90); // Leave last 10% for audio
      }

      processedDuration += cut.end - cut.start;
      frameProcessor.destroy();

      console.log(`Cut ${cutIndex + 1} completed. Total progress: ${processedFrameCount}/${totalFrames} frames`);
    }

    // Encode continuous audio (if available)
    if (continuousAudioBuffer && audioEncoderInitialized) {
      console.log('Encoding continuous audio...');
      await exporter.encodeAudioData(continuousAudioBuffer);
      setExportProgress(95);
    }

    // Finalize and download
    const blob = await exporter.finalize();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportingClipId(null);
    toast({ title: 'WebCodecs Export complete!', description: 'Your video has been downloaded with hardware acceleration.' });
  };

  const exportClipWithMediaRecorder = async (clip: Clip) => {
    // Fallback implementation - identical to the original for comparison
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!context) throw new Error('Could not get canvas context');

    context.imageSmoothingEnabled = false;
    context.imageSmoothingQuality = 'low';
    context.globalCompositeOperation = 'copy';

    const firstVidSourceIndex = clip.cuts && clip.cuts.length > 0 ? clip.cuts[0].sourceVideo : clip.sourceVideo;
    if (firstVidSourceIndex < 0 || firstVidSourceIndex >= videoSources.length) {
      throw new Error('Invalid video source for clip.');
    }

    const firstVidSource = videoSources[firstVidSourceIndex];
    const tempVideo = document.createElement('video');
    tempVideo.src = firstVidSource.url;
    await new Promise(res => tempVideo.onloadedmetadata = res);

    let canvasWidth = tempVideo.videoWidth;
    let canvasHeight = tempVideo.videoHeight;

    if (aspectRatio !== 'source') {
      const [w, h] = aspectRatio.split(':').map(Number);
      const targetAspectRatio = w / h;
      const videoAr = tempVideo.videoWidth / tempVideo.videoHeight;

      if (targetAspectRatio > videoAr) {
        canvasWidth = tempVideo.videoWidth;
        canvasHeight = Math.round(canvasWidth / targetAspectRatio);
      } else {
        canvasHeight = tempVideo.videoHeight;
        canvasWidth = Math.round(canvasHeight * targetAspectRatio);
      }
    }
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const audioContext = new AudioContext();
    const mainAudioDestination = audioContext.createMediaStreamDestination();

    const cuts = clip.cuts || [{ sourceVideo: clip.sourceVideo, start: clip.start, end: clip.end }];
    const totalDuration = cuts.reduce((acc, cut) => acc + (cut.end - cut.start), 0);

    const exportFrameRateAdjusted = exportFrameRate > 30 ? 30 : exportFrameRate;
    const canvasStream = canvas.captureStream(exportFrameRateAdjusted);
    const videoTrack = canvasStream.getVideoTracks()[0];
    const audioStream = mainAudioDestination.stream;
    const audioTrack = audioStream.getAudioTracks()[0];

    const combinedStream = new MediaStream([videoTrack]);
    if(audioTrack) combinedStream.addTrack(audioTrack);

    const recorderConfig = getMediaRecorderConfig(exportFormat, exportQuality);
    const recorder = new MediaRecorder(combinedStream, recorderConfig);

    const exportTimeout = setTimeout(() => {
      recorder.stop();
    }, totalDuration * 1000 + 200);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: exportFormat === 'mp4' ? 'video/mp4' : 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extension = exportFormat === 'mp4' ? 'mp4' : 'webm';
      a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportingClipId(null);
      toast({ title: 'Export complete!', description: 'Your video has been downloaded.' });
      audioContext.close();
    };

    recorder.start();

    // Load video elements (simplified for fallback)
    const videoElements = await Promise.all(videoSources.map((source, index) => {
      return new Promise<HTMLVideoElement>(async (resolve) => {
        const video = document.createElement('video');
        video.src = source.url;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';
        await new Promise(res => video.onloadedmetadata = res);
        resolve(video);
      });
    }));

    if (clip.overlayAudioUrl) {
      const mainAudioElement = new Audio(clip.overlayAudioUrl);
      mainAudioElement.crossOrigin = "anonymous";
      await new Promise(res => mainAudioElement.oncanplaythrough = res);
      const mainAudioSourceNode = audioContext.createMediaElementSource(mainAudioElement);
      mainAudioSourceNode.connect(mainAudioDestination);
      mainAudioElement.currentTime = 0;
      mainAudioElement.play().catch(e => console.warn('Audio playback failed:', e));
    }

    // Process cuts with original logic (simplified)
    for (let cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
      const cut = cuts[cutIndex];
      const videoElement = videoElements[cut.sourceVideo];

      videoElement.currentTime = cut.start;
      await new Promise(res => setTimeout(res, 100));

      await videoElement.play();

      if (cutIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, 16));
      }

      await new Promise<void>((frameResolve) => {
        const drawFrame = (time: number, metadata: any) => {
          if (videoElement.currentTime >= cut.end) {
            videoElement.pause();
            frameResolve();
            return;
          }

          if (!context) {
            frameResolve();
            return;
          }

          context.clearRect(0, 0, canvas.width, canvas.height);

          // Apply filters to the canvas context
          context.filter = clip.filters && clip.filters.length > 0 && !clip.filters.includes('none')
            ? clip.filters.map(filter => {
                switch (filter) {
                  case 'bw': return 'grayscale(100%)';
                  case 'night-vision': return 'grayscale(100%) brightness(1.2) sepia(100%) hue-rotate(80deg) saturate(200%)';
                  case 'vhs': return 'contrast(1.1) brightness(1.1) saturate(1.2)';
                  default: return 'none';
                }
              }).filter(f => f !== 'none').join(' ')
            : 'none';

          const scale = Math.min(canvas.width / videoElement.videoWidth, canvas.height / videoElement.videoHeight);
          const scaledWidth = videoElement.videoWidth * scale;
          const scaledHeight = videoElement.videoHeight * scale;
          const offsetX = (canvas.width - scaledWidth) / 2;
          const offsetY = (canvas.height - scaledHeight) / 2;

          try {
            context.drawImage(videoElement, offsetX, offsetY, scaledWidth, scaledHeight);
          } catch (e) {
            console.warn('Frame drawing error:', e);
          }

          // Reset filter for next frame
          context.filter = 'none';

          if (videoElement.currentTime < cut.end) {
            videoElement.requestVideoFrameCallback(drawFrame);
          } else {
            frameResolve();
          }
        };

        videoElement.requestVideoFrameCallback(drawFrame);
      });
    }

    recorder.stop();
  };

  if (clips.length === 0) {
    return (
        <div className="text-center py-10 border-2 border-dashed rounded-lg">
            <h3 className="text-lg font-semibold text-muted-foreground">No Clips Yet</h3>
            <p className="text-sm text-muted-foreground">Use the controls to create clips manually or with AI.</p>
        </div>
    );
  }

  const getFilterNames = (filters: VideoFilter[]) => {
    if (filters.includes('none') || filters.length === 0) return 'None';
    return filters.map(filter => {
      switch (filter) {
        case 'bw': return 'B&W';
        case 'night-vision': return 'Night Vision';
        case 'vhs': return 'VHS';
        default: return '';
      }
    }).filter(f => f).join(', ');
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h2 className="font-headline text-2xl font-bold">Your Clips</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
        {clips.map((clip) => (
          <Card key={clip.id} className="transition-all duration-300">
            {exportingClipId === clip.id ? (
                <CardContent className="p-3 flex flex-col items-center justify-center gap-2">
                    <Progress value={exportProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground">Exporting clip...</p>
                </CardContent>
            ) : (
                <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Input
                        type="text"
                        value={clip.title}
                        onChange={(e) =>
                          setClips((prev) =>
                            prev.map((c) =>
                              c.id === clip.id ? { ...c, title: e.target.value } : c
                            )
                          )
                        }
                        className="text-sm font-medium bg-transparent border-0 border-b border-transparent focus:ring-0 focus:outline-none focus:border-primary p-0 h-5 leading-tight"
                      />
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {formatTime(clip.start)} - {formatTime(clip.end)}
                      </span>
                    </div>
                    <div className='flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground items-center'>
                      {clip.cuts && clip.cuts.length > 0 ? (
                          <span className="flex items-center gap-1"><Wand2 className="size-3 text-accent" /> {clip.cuts.length} cuts</span>
                      ) : (
                          <span className="flex items-center gap-1"><Video className="size-3" /> S{clip.sourceVideo + 1}</span>
                      )}
                      {getFilterNames(clip.filters) !== 'None' && <span className="flex items-center gap-1"><Film className="size-3" /> {getFilterNames(clip.filters)}</span>}
                      {clip.overlayAudioUrl && <AudioWaveform className="size-3 text-accent" />}
                      {clip.isMuted && <VolumeX className="size-3 text-destructive" />}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => onPreview(clip)}>
                      {isPreviewing && activePreviewClipId === clip.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button variant="default" size="sm" className="h-7 px-2" onClick={() => exportClip(clip)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteClip(clip.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

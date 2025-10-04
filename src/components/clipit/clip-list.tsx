'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, Play, Trash2, Film, Ratio, AudioWaveform, VolumeX, Video, Copy, Wand2, Pause } from 'lucide-react';
import type { Clip, VideoFilter, AspectRatio, VideoSource } from '@/app/page';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { Input } from '../ui/input';

type ClipListProps = {
  clips: Clip[];
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  onPreview: (clip: Clip) => void;
  aspectRatio: AspectRatio;
  videoSources: VideoSource[];
  activePreviewClipId?: number | null;
  isPreviewing?: boolean;
};

export default function ClipList({ clips, setClips, onPreview, aspectRatio, videoSources, activePreviewClipId, isPreviewing }: ClipListProps) {
  const [exportingClipId, setExportingClipId] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const { toast } = useToast();

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

  const exportClip = async (clip: Clip) => {
    setExportingClipId(clip.id);
    setExportProgress(0);
    toast({ title: `Exporting "${clip.title}"...`, description: 'Please wait, this can take a moment.' });
  
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Could not get canvas context');
  
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

        if (targetAspectRatio > videoAr) { // Target is wider than video, letterbox top/bottom
            canvasWidth = tempVideo.videoWidth;
            canvasHeight = Math.round(canvasWidth / targetAspectRatio);
        } else { // Target is narrower than video, letterbox left/right
            canvasHeight = tempVideo.videoHeight;
            canvasWidth = Math.round(canvasHeight * targetAspectRatio);
        }
      }
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
  
      const audioContext = new AudioContext();
      const mainAudioDestination = audioContext.createMediaStreamDestination();
  
      const canvasStream = canvas.captureStream(30);
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioStream = mainAudioDestination.stream;
      const audioTrack = audioStream.getAudioTracks()[0];
      
      const combinedStream = new MediaStream([videoTrack]);
      if(audioTrack) combinedStream.addTrack(audioTrack);

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
  
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${clip.title.replace(/[^a-zA-Z0-9]/g, '_')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportingClipId(null);
        toast({ title: 'Export complete!', description: 'Your video has been downloaded.' });
        audioContext.close();
      };
  
      recorder.start();
  
      const videoElements = await Promise.all(videoSources.map(source => {
        const video = document.createElement('video');
        video.src = source.url;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        return new Promise<HTMLVideoElement>(res => {
          video.onloadedmetadata = () => res(video);
        });
      }));
  
      if (clip.overlayAudioUrl) {
        const mainAudioElement = new Audio(clip.overlayAudioUrl);
        mainAudioElement.crossOrigin = "anonymous";
        await new Promise(res => mainAudioElement.oncanplaythrough = res);
        const mainAudioSourceNode = audioContext.createMediaElementSource(mainAudioElement);
        mainAudioSourceNode.connect(mainAudioDestination);
        mainAudioElement.currentTime = 0;
        await mainAudioElement.play();
      }
      
      const cuts = clip.cuts || [{ sourceVideo: clip.sourceVideo, start: clip.start, end: clip.end }];
      const totalDuration = cuts.reduce((acc, cut) => acc + (cut.end - cut.start), 0);
      let durationProcessed = 0;
  
      for (const cut of cuts) {
        const videoElement = videoElements[cut.sourceVideo];
        if(!clip.isMuted) {
            const videoAudioSource = audioContext.createMediaElementSource(videoElement);
            videoAudioSource.connect(mainAudioDestination);
        }

        videoElement.currentTime = cut.start;
        await videoElement.play();
  
        await new Promise<void>(resolve => {
          const drawFrame = (time: number, metadata: any) => {
            if (videoElement.currentTime >= cut.end) {
              videoElement.pause();
              resolve();
              return;
            }
  
            context.save();
            context.clearRect(0, 0, canvas.width, canvas.height);
  
            if (clip.filters.includes('vhs')) {
              // Not applied via filter
            } else {
              context.filter = getFilterString(clip.filters);
            }
  
            const videoAr = videoElement.videoWidth / videoElement.videoHeight;
            const canvasAr = canvas.width / canvas.height;
            let drawWidth = canvas.width, drawHeight = canvas.height, offsetX = 0, offsetY = 0;
            
            // This is "contain" logic - fit video inside canvas, with black bars
            if (videoAr > canvasAr) { // video is wider than canvas
              drawWidth = canvas.width;
              drawHeight = canvas.width / videoAr;
              offsetY = (canvas.height - drawHeight) / 2;
            } else { // video is taller than canvas
              drawHeight = canvas.height;
              drawWidth = canvas.height * videoAr;
              offsetX = (canvas.width - drawWidth) / 2;
            }
  
            context.drawImage(videoElement, offsetX, offsetY, drawWidth, drawHeight);
            context.restore();
  
            const frameDuration = metadata.mediaTime - (metadata.previousTime || metadata.mediaTime);
            durationProcessed += frameDuration;
            setExportProgress(Math.round((durationProcessed / totalDuration) * 100));
            
            videoElement.requestVideoFrameCallback(drawFrame);
          };
          videoElement.requestVideoFrameCallback(drawFrame);
        });
      }
      
      recorder.stop();
  
    } catch (error) {
      console.error('Export failed:', error);
      toast({ variant: 'destructive', title: 'Export failed', description: (error as Error).message });
      setExportingClipId(null);
    }
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
      <div className="space-y-4">
        {clips.map((clip) => (
          <Card key={clip.id} className="w-full transition-all duration-300">
            {exportingClipId === clip.id ? (
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
                    <Progress value={exportProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground">Exporting clip...</p>
                </CardContent>
            ) : (
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
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
                    className="text-lg font-semibold bg-transparent border-0 border-b-2 border-transparent focus:ring-0 focus:outline-none focus:border-primary p-1 h-auto font-headline"
                    />
                    <p className="text-sm text-muted-foreground font-mono">
                    {formatTime(clip.start)} - {formatTime(clip.end)} ({formatTime(clip.end - clip.start)})
                    </p>
                    <div className='flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground items-center'>
                        {clip.cuts && clip.cuts.length > 0 ? (
                           <span className="flex items-center gap-1"><Wand2 className="size-3 text-accent" /> Multi-Cam Edit ({clip.cuts.length} cuts)</span>
                        ) : (
                           <span className="flex items-center gap-1"><Video className="size-3" /> Source {clip.sourceVideo + 1}</span>
                        )}
                        <span className="flex items-center gap-1"><Ratio className="size-3" /> {aspectRatio}</span>
                        <span className="flex items-center gap-1"><Film className="size-3" /> {getFilterNames(clip.filters)}</span>
                        {clip.overlayAudioUrl && <span className="flex items-center gap-1"><AudioWaveform className="size-3 text-accent" /> Custom Audio</span>}
                        {clip.isMuted && <span className="flex items-center gap-1"><VolumeX className="size-3 text-destructive" /> Muted</span>}
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => onPreview(clip)}>
                        { isPreviewing && activePreviewClipId === clip.id ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" /> }
                        { isPreviewing && activePreviewClipId === clip.id ? 'Stop' : 'Preview' }
                    </Button>
                    <Button variant="default" size="sm" onClick={() => exportClip(clip)}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => deleteClip(clip.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    </div>
                </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

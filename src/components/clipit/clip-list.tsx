'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, Play, Trash2, Film, Ratio, AudioWaveform, VolumeX, Video } from 'lucide-react';
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
};

export default function ClipList({ clips, setClips, onPreview, aspectRatio, videoSources }: ClipListProps) {
  const [exportingClipId, setExportingClipId] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const { toast } = useToast();

  useEffect(() => {
    return () => {
        clips.forEach(clip => {
            if (clip.overlayAudioUrl) {
                URL.revokeObjectURL(clip.overlayAudioUrl);
            }
        });
    };
  }, [clips]);

  const deleteClip = (id: number) => {
    const clipToDelete = clips.find(c => c.id === id);
    if(clipToDelete?.overlayAudioUrl) {
        URL.revokeObjectURL(clipToDelete.overlayAudioUrl);
    }
    setClips((prev) => prev.filter((c) => c.id !== id));
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

  const exportMultiCamEdit = async () => {
    if (clips.length === 0) {
        toast({ variant: 'destructive', title: 'No clips to export.' });
        return;
    }
    
    setExportingClipId(-1); // Use a special ID for full export
    setExportProgress(0);
    toast({ title: 'Exporting Multi-Cam Edit...', description: 'Please wait, this will take some time.' });

    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not get canvas context');

        // Assuming all videos have similar dimensions, use the first one for setup
        const firstVideoEl = document.createElement('video');
        firstVideoEl.src = videoSources[0].url;
        await new Promise(res => firstVideoEl.onloadedmetadata = res);

        const [w, h] = aspectRatio.split(':').map(Number);
        
        let canvasWidth = firstVideoEl.videoWidth;
        let canvasHeight = firstVideoEl.videoHeight;

        if (aspectRatio !== 'source') {
            const videoAspectRatio = firstVideoEl.videoWidth / firstVideoEl.videoHeight;
            const targetAspectRatio = w/h;
            if (targetAspectRatio > videoAspectRatio) {
                canvasHeight = Math.round(firstVideoEl.videoWidth / targetAspectRatio);
            } else {
                canvasWidth = Math.round(firstVideoEl.videoHeight * targetAspectRatio);
            }
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const audioContext = new AudioContext();
        const canvasStream = canvas.captureStream(30);
        const videoTracks = canvasStream.getVideoTracks();
        const audioDestination = audioContext.createMediaStreamDestination();
        const audioTracks = audioDestination.stream.getAudioTracks();

        const combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `multi-cam-edit.webm`;
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

        let totalFrames = 0;
        for (const clip of clips) {
            totalFrames += (clip.end - clip.start) * 30;
        }
        let framesProcessed = 0;

        for (const clip of clips) {
            const videoElement = videoElements[clip.sourceVideo];
            videoElement.currentTime = clip.start;
            await videoElement.play();

            if (!clip.isMuted) {
                const sourceNode = audioContext.createMediaElementSource(videoElement);
                sourceNode.connect(audioDestination);
            }

            let overlayAudioElement: HTMLAudioElement | null = null;
            if (clip.overlayAudioUrl) {
                overlayAudioElement = new Audio(clip.overlayAudioUrl);
                overlayAudioElement.crossOrigin = "anonymous";
                await overlayAudioElement.load();
                overlayAudioElement.currentTime = 0;
                overlayAudioElement.play();
                const overlaySourceNode = audioContext.createMediaElementSource(overlayAudioElement);
                overlaySourceNode.connect(audioDestination);
            }

            await new Promise<void>(resolve => {
                const drawFrame = () => {
                    if (videoElement.currentTime >= clip.end) {
                        videoElement.pause();
                        if (overlayAudioElement) overlayAudioElement.pause();
                        resolve();
                        return;
                    }
                    context.save();
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.filter = getFilterString(clip.filters);
                    let sourceX = 0, sourceY = 0, sourceWidth = videoElement.videoWidth, sourceHeight = videoElement.videoHeight;
                    if(aspectRatio !== 'source') {
                        sourceWidth = canvas.width;
                        sourceHeight = canvas.height;
                        sourceX = (videoElement.videoWidth - sourceWidth) / 2;
                        sourceY = (videoElement.videoHeight - sourceHeight) / 2;
                    }
                    context.drawImage(videoElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
                    context.restore();
                    
                    framesProcessed++;
                    setExportProgress((framesProcessed / totalFrames) * 100);

                    requestAnimationFrame(drawFrame);
                };
                drawFrame();
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
        {exportingClipId === -1 ? (
             <div className="w-full md:w-1/3">
                <Progress value={exportProgress} className="w-full" />
                <p className="text-sm text-center mt-1 text-muted-foreground">Exporting Edit...</p>
            </div>
        ) : (
            <Button
                size="lg"
                onClick={exportMultiCamEdit}
                disabled={exportingClipId !== null}
            >
                <Download className="h-5 w-5 mr-2" />
                Export Full Edit
            </Button>
        )}
      </div>
      <div className="space-y-4">
        {clips.map((clip) => (
          <Card key={clip.id} className="w-full transition-all duration-300">
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
                  {formatTime(clip.start)} - {formatTime(clip.end)}
                </p>
                <div className='flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground items-center'>
                    <span className="flex items-center gap-1"><Video className="size-3" /> Source {clip.sourceVideo + 1}</span>
                    <span className="flex items-center gap-1"><Ratio className="size-3" /> {aspectRatio}</span>
                    <span className="flex items-center gap-1"><Film className="size-3" /> {getFilterNames(clip.filters)}</span>
                    {clip.overlayAudioUrl && <span className="flex items-center gap-1"><AudioWaveform className="size-3 text-accent" /> Custom Audio</span>}
                    {clip.isMuted && <span className="flex items-center gap-1"><VolumeX className="size-3 text-destructive" /> Muted</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => onPreview(clip)}>
                    <Play className="h-4 w-4 mr-2" />
                    Preview
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
          </Card>
        ))}
      </div>
    </div>
  );
}

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
    // This effect is to revoke Object URLs to prevent memory leaks.
    return () => {
        const audioUrls = new Set(clips.map(c => c.overlayAudioUrl));
        audioUrls.forEach(url => {
            if(url) URL.revokeObjectURL(url);
        });
    };
  }, [clips]);

  const deleteClip = (id: number) => {
    setClips((prev) => {
        const clipToDelete = prev.find(c => c.id === id);
        const remainingClips = prev.filter((c) => c.id !== id);

        // Check if the audio URL from the deleted clip is still used by other clips
        if (clipToDelete?.overlayAudioUrl) {
            const isAudioUrlStillInUse = remainingClips.some(c => c.overlayAudioUrl === clipToDelete.overlayAudioUrl);
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

        // Determine canvas dimensions from the first video and aspect ratio
        const firstVidSource = videoSources[clips[0].sourceVideo];
        const tempVideo = document.createElement('video');
        tempVideo.src = firstVidSource.url;
        await new Promise(res => tempVideo.onloadedmetadata = res);
        
        const videoAspectRatio = tempVideo.videoWidth / tempVideo.videoHeight;
        let canvasWidth = tempVideo.videoWidth;
        let canvasHeight = tempVideo.videoHeight;
        
        if (aspectRatio !== 'source') {
            const [w, h] = aspectRatio.split(':').map(Number);
            const targetAspectRatio = w/h;
            
            // Letterbox/Pillarbox logic
            if (targetAspectRatio > videoAspectRatio) { // Target is wider
                canvasHeight = Math.round(canvasWidth / targetAspectRatio);
            } else { // Target is taller
                canvasWidth = Math.round(canvasHeight * targetAspectRatio);
            }
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Setup streams
        const audioContext = new AudioContext();
        const mainAudioDestination = audioContext.createMediaStreamDestination();
        
        const canvasStream = canvas.captureStream(30);
        const videoTrack = canvasStream.getVideoTracks()[0];
        const audioTrack = mainAudioDestination.stream.getAudioTracks()[0];
        
        const combinedStream = new MediaStream([videoTrack, audioTrack]);
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9,opus' });
        
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
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
        
        // Prepare all video elements
        const videoElements = await Promise.all(videoSources.map(source => {
            const video = document.createElement('video');
            video.src = source.url;
            video.crossOrigin = 'anonymous';
            video.muted = true; // All video elements should be muted
            return new Promise<HTMLVideoElement>(res => {
                video.onloadedmetadata = () => res(video);
            });
        }));

        // Handle the main audio track
        if (clips[0].overlayAudioUrl) {
            const mainAudioElement = new Audio(clips[0].overlayAudioUrl);
            mainAudioElement.crossOrigin = "anonymous";
            await mainAudioElement.load();
            const mainAudioSourceNode = audioContext.createMediaElementSource(mainAudioElement);
            mainAudioSourceNode.connect(mainAudioDestination);
            mainAudioElement.play();
        }

        const totalFrames = clips.reduce((acc, clip) => acc + ((clip.end - clip.start) * 30), 0);
        let framesProcessed = 0;

        for (const clip of clips) {
            const videoElement = videoElements[clip.sourceVideo];
            videoElement.currentTime = clip.start;
            await videoElement.play();
            
            // If individual clips have audio and are not muted, connect them.
            // This is for sound effects, etc. The main audio is already playing.
            if (!clip.isMuted && clip.overlayAudioUrl !== clips[0].overlayAudioUrl) {
                const sfxAudio = new Audio(clip.overlayAudioUrl);
                sfxAudio.crossOrigin = 'anonymous';
                await sfxAudio.load();
                const sfxSource = audioContext.createMediaElementSource(sfxAudio);
                sfxSource.connect(mainAudioDestination);
                sfxAudio.play();
            }

            await new Promise<void>(resolve => {
                const drawFrame = () => {
                    if (videoElement.currentTime >= clip.end) {
                        videoElement.pause();
                        resolve();
                        return;
                    }

                    context.save();
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    
                    if (clip.filters.includes('vhs')) {
                        // VHS requires class on parent, not filter on context
                    } else {
                        context.filter = getFilterString(clip.filters);
                    }
                    
                    const videoAr = videoElement.videoWidth / videoElement.videoHeight;
                    const canvasAr = canvas.width / canvas.height;
                    
                    let drawWidth = canvas.width;
                    let drawHeight = canvas.height;
                    let offsetX = 0;
                    let offsetY = 0;

                    if (videoAr > canvasAr) { // Video is wider than canvas
                        drawHeight = canvas.width / videoAr;
                        offsetY = (canvas.height - drawHeight) / 2;
                    } else { // Video is taller or same AR
                        drawWidth = canvas.height * videoAr;
                        offsetX = (canvas.width - drawWidth) / 2;
                    }
                    
                    context.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight, offsetX, offsetY, drawWidth, drawHeight);
                    context.restore();
                    
                    framesProcessed++;
                    setExportProgress(Math.round((framesProcessed / totalFrames) * 100));

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

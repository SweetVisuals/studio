'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Captions, Download, Play, Trash2, Loader2, Film, Ratio, AudioWaveform, VolumeX } from 'lucide-react';
import type { Clip } from '@/app/page';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { Input } from '../ui/input';

type ClipListProps = {
  clips: Clip[];
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  onPreview: (clip: Clip) => void;
  videoUrl: string;
  videoElement: HTMLVideoElement | null;
};

export default function ClipList({ clips, setClips, onPreview, videoElement }: ClipListProps) {
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [isCaptionDialogOpen, setIsCaptionDialogOpen] = useState(false);
  const [editableCaptions, setEditableCaptions] = useState('');
  const [exportingClipId, setExportingClipId] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const { toast } = useToast();

  useEffect(() => {
    return () => {
        // Clean up audio object URLs
        clips.forEach(clip => {
            if (clip.overlayAudioUrl) {
                URL.revokeObjectURL(clip.overlayAudioUrl);
            }
        });
    };
  }, [clips]);

  const openCaptionEditor = (clip: Clip) => {
    setSelectedClip(clip);
    setEditableCaptions(clip.captions);
    setIsCaptionDialogOpen(true);
  };

  const saveCaptions = () => {
    if (selectedClip) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === selectedClip.id ? { ...c, captions: editableCaptions } : c
        )
      );
      setIsCaptionDialogOpen(false);
      setSelectedClip(null);
      toast({ title: 'Captions saved!' });
    }
  };

  const deleteClip = (id: number) => {
    const clipToDelete = clips.find(c => c.id === id);
    if(clipToDelete?.overlayAudioUrl) {
        URL.revokeObjectURL(clipToDelete.overlayAudioUrl);
    }
    setClips((prev) => prev.filter((c) => c.id !== id));
    toast({ title: 'Clip removed.'});
  };

  const exportClip = async (clip: Clip) => {
    if (!videoElement) {
      toast({ variant: 'destructive', title: 'Video element not found.' });
      return;
    }

    setExportingClipId(clip.id);
    setExportProgress(0);
    toast({ title: 'Exporting clip...', description: 'Please wait, this can take a moment.' });

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      const [w, h] = clip.aspectRatio.split(':').map(Number);
      const targetAspectRatio = w/h;
      
      let canvasWidth = videoElement.videoWidth;
      let canvasHeight = videoElement.videoHeight;

      if (clip.aspectRatio !== 'source') {
          const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
          if (targetAspectRatio > videoAspectRatio) { // Target is wider
              canvasHeight = Math.round(videoElement.videoWidth / targetAspectRatio);
          } else { // Target is taller or same
              canvasWidth = Math.round(videoElement.videoHeight * targetAspectRatio);
          }
      }
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;


      let overlayAudio: HTMLAudioElement | null = null;
      let combinedStream: MediaStream | null = null;

      if(clip.overlayAudioUrl) {
          overlayAudio = new Audio(clip.overlayAudioUrl);
          overlayAudio.currentTime = 0;
          
          const audioContext = new AudioContext();
          const audioDestination = audioContext.createMediaStreamDestination();
          
          const sourceNode = audioContext.createMediaElementSource(overlayAudio);
          sourceNode.connect(audioDestination);
          
          const videoStream = canvas.captureStream(30);
          combinedStream = new MediaStream([
              ...videoStream.getVideoTracks(), 
              ...audioDestination.stream.getAudioTracks()
          ]);
      }

      const streamToRecord = combinedStream || canvas.captureStream(30);

      const recorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm;codecs=vp9,opus' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${clip.title.replace(/ /g, '_')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setExportingClipId(null);
        toast({ title: 'Export complete!', description: 'Your video has been downloaded.' });
      };

      recorder.start();

      videoElement.currentTime = clip.start;
      videoElement.muted = clip.isMuted;
      if (overlayAudio) overlayAudio.play();
      await videoElement.play();

      const totalFrames = (clip.end - clip.start) * 30;
      let frameCount = 0;

      const drawFrame = () => {
        if (videoElement.currentTime >= clip.end || videoElement.paused) {
          videoElement.pause();
          if (overlayAudio) overlayAudio.pause();
          recorder.stop();
          videoElement.muted = false;
          return;
        }
        
        context.save();
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        let filter = 'none';
        if (clip.filter === 'bw') filter = 'grayscale(100%)';
        if (clip.filter === 'night-vision') filter = 'grayscale(100%) brightness(1.5) contrast(1.5) sepia(20%) invert(10%)';
        context.filter = filter;

        // Calculate cropping
        let sourceX = 0, sourceY = 0, sourceWidth = videoElement.videoWidth, sourceHeight = videoElement.videoHeight;
        if(clip.aspectRatio !== 'source') {
            sourceWidth = canvas.width;
            sourceHeight = canvas.height;
            sourceX = (videoElement.videoWidth - sourceWidth) / 2;
            sourceY = (videoElement.videoHeight - sourceHeight) / 2;
        }

        context.drawImage(videoElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        context.filter = 'none';

        if (clip.filter === 'vhs') {
            context.fillStyle = 'rgba(0, 0, 0, 0.1)';
            for (let i = 0; i < canvas.height; i += 4) {
                context.fillRect(0, i, canvas.width, 2);
            }
            context.globalAlpha = 0.1 + Math.random() * 0.1;
            context.drawImage(canvas, (Math.random()-0.5) * 10, (Math.random()-0.5) * 10);
            context.globalAlpha = 1.0;
        }
        
        if (clip.captions) {
            const fontSize = Math.max(24, canvas.width / 30);
            context.font = `bold ${fontSize}px Poppins, sans-serif`;
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.shadowColor = 'black';
            context.shadowBlur = 10;
            context.fillText(clip.captions, canvas.width / 2, canvas.height - (fontSize * 1.5));
        }

        context.restore();

        frameCount++;
        setExportProgress((frameCount / totalFrames) * 100);
        requestAnimationFrame(drawFrame);
      };

      drawFrame();
    } catch (error) {
      console.error('Export failed:', error);
      toast({ variant: 'destructive', title: 'Export failed', description: (error as Error).message });
      if(videoElement) videoElement.muted = false;
      setExportingClipId(null);
    }
  };

  if (clips.length === 0) {
    return null;
  }

  const getFilterName = (filter: string) => {
    switch (filter) {
      case 'bw': return 'B&W';
      case 'night-vision': return 'Night Vision';
      case 'vhs': return 'VHS';
      default: return 'None';
    }
  };

  return (
    <div>
      <h2 className="font-headline text-2xl font-bold mb-4">Your Clips</h2>
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
                <div className='flex flex-wrap gap-2 text-xs text-muted-foreground items-center'>
                    <span className="flex items-center gap-1"><Ratio className="size-3" /> {clip.aspectRatio}</span>
                    <span className="flex items-center gap-1"><Film className="size-3" /> {getFilterName(clip.filter)}</span>
                    {clip.overlayAudioUrl && <span className="flex items-center gap-1"><AudioWaveform className="size-3 text-accent" /> Custom Audio</span>}
                    {clip.isMuted && <span className="flex items-center gap-1"><VolumeX className="size-3 text-destructive" /> Muted</span>}
                </div>
              </div>
              {exportingClipId === clip.id ? (
                <div className="w-full md:w-1/3">
                  <Progress value={exportProgress} className="w-full" />
                  <p className="text-sm text-center mt-1 text-muted-foreground">Exporting...</p>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => onPreview(clip)}>
                    <Play className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openCaptionEditor(clip)}>
                    <Captions className="h-4 w-4 mr-2" />
                    {clip.captions ? 'Edit' : 'Add'} Captions
                    {clip.captions === '' && !isCaptionDialogOpen && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => exportClip(clip)}
                    disabled={exportingClipId !== null}
                  >
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
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isCaptionDialogOpen} onOpenChange={setIsCaptionDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="font-headline">Edit Captions</DialogTitle>
            <DialogDescription>
              AI-generated captions for your clip. Edit the text below for accuracy.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editableCaptions}
              onChange={(e) => setEditableCaptions(e.target.value)}
              rows={10}
              className="w-full text-base"
              placeholder="Captions will appear here..."
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={saveCaptions}>
              Save Captions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

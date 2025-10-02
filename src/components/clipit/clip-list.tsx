
'use client';

import { useState } from 'react';
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
import { Captions, Download, Play, Trash2, Loader2 } from 'lucide-react';
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

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
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
      // Mute the video to prevent recording audio from the original track
      videoElement.muted = true;
      await videoElement.play();

      const totalFrames = (clip.end - clip.start) * 30;
      let frameCount = 0;

      const drawFrame = () => {
        if (videoElement.currentTime >= clip.end || videoElement.paused) {
          videoElement.pause();
          recorder.stop();
          // Unmute for normal playback
          videoElement.muted = false;
          return;
        }

        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Draw captions
        if (clip.captions) {
            const fontSize = Math.max(24, canvas.width / 30);
            context.font = `bold ${fontSize}px Poppins, sans-serif`;
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.shadowColor = 'black';
            context.shadowBlur = 10;
            context.fillText(clip.captions, canvas.width / 2, canvas.height - (fontSize * 1.5));
        }

        frameCount++;
        setExportProgress((frameCount / totalFrames) * 100);
        requestAnimationFrame(drawFrame);
      };

      drawFrame();
    } catch (error) {
      console.error('Export failed:', error);
      toast({ variant: 'destructive', title: 'Export failed', description: (error as Error).message });
      videoElement.muted = false; // Ensure video is unmuted on error
      setExportingClipId(null);
    }
  };

  if (clips.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="font-headline text-2xl font-bold mb-4">Your Clips</h2>
      <div className="space-y-4">
        {clips.map((clip) => (
          <Card key={clip.id} className="w-full transition-all duration-300">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
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
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {formatTime(clip.start)} - {formatTime(clip.end)}
                </p>
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
                    {clip.captions ? 'Edit Captions' : 'Captions'}
                    {clip.captions === '' && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
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

    
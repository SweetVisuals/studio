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
import { Captions, Download, Play, Trash2, Loader2, Edit } from 'lucide-react';
import type { Clip } from '@/app/page';
import { generateCaptionsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { Input } from '../ui/input';

type ClipListProps = {
  clips: Clip[];
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  onPreview: (clip: { start: number; end: number }) => void;
};

export default function ClipList({ clips, setClips, onPreview }: ClipListProps) {
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [isCaptionDialogOpen, setIsCaptionDialogOpen] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [editableCaptions, setEditableCaptions] = useState('');
  const [exportingClipId, setExportingClipId] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const { toast } = useToast();

  const openCaptionEditor = async (clip: Clip) => {
    setSelectedClip(clip);
    setEditableCaptions(clip.captions);
    setIsCaptionDialogOpen(true);
    if (!clip.captions) {
      setIsGeneratingCaptions(true);
      try {
        const result = await generateCaptionsAction({ start: clip.start, end: clip.end });
        setEditableCaptions(result.captions);
        setClips((prev) =>
          prev.map((c) => (c.id === clip.id ? { ...c, captions: result.captions } : c))
        );
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Caption Generation Failed',
          description: 'Could not generate captions. Please try again.',
        });
      } finally {
        setIsGeneratingCaptions(false);
      }
    }
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

  const exportClip = (id: number) => {
    setExportingClipId(id);
    setExportProgress(0);

    const interval = setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setExportingClipId(null);
          toast({
            title: 'Clip exported successfully!',
            description: 'Your download would start now.',
          });
          return 100;
        }
        return prev + 10;
      });
    }, 200);
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
                    Captions
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => exportClip(clip.id)}
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
            {isGeneratingCaptions ? (
              <div className="flex flex-col items-center justify-center h-48 rounded-md bg-muted/50">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Generating smart captions...</p>
              </div>
            ) : (
              <Textarea
                value={editableCaptions}
                onChange={(e) => setEditableCaptions(e.target.value)}
                rows={10}
                className="w-full text-base"
                placeholder="Captions will appear here..."
              />
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={saveCaptions} disabled={isGeneratingCaptions}>
              Save Captions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

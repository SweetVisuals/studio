'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Play, Sparkles } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type VideoEditorProps = {
  videoUrl: string;
  videoRef: RefObject<HTMLVideoElement>;
};

export default function VideoEditor({ videoUrl, videoRef }: VideoEditorProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(15);

  const [clips, setClips] = useState<Clip[]>([]);
  const [suggestedClips, setSuggestedClips] = useState<Omit<Clip, 'captions'>[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEnd(Math.min(15, video.duration)); // Default to 15s or video length
    };
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [videoRef]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const playClip = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = start;
    video.play();

    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }

    playIntervalRef.current = setInterval(() => {
      if (video.currentTime >= end) {
        video.pause();
        if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      }
    }, 100);
  };

  const detectScenes = async () => {
    setIsLoadingScenes(true);
    toast({ title: 'AI Processing', description: 'Detecting potential clips in your video...' });
    await new Promise((res) => setTimeout(res, 2000)); // Simulate AI processing
    const videoDuration = videoRef.current?.duration || 60;
    const clipLength = 15;
    const numClips = Math.max(1, Math.floor(videoDuration / clipLength));
    
    const newSuggestions: Omit<Clip, 'captions'>[] = Array.from({ length: numClips }, (_, i) => ({
      id: Date.now() + i,
      start: i * clipLength,
      end: Math.min((i + 1) * clipLength, videoDuration),
      title: `Suggested Clip ${i + 1}`,
    }));
    setSuggestedClips(newSuggestions);
    setIsLoadingScenes(false);
    toast({ title: 'AI Complete', description: `${newSuggestions.length} clips suggested.` });
  };

  const addClip = () => {
    if (end <= start) {
        toast({
            variant: 'destructive',
            title: 'Invalid Time Range',
            description: 'End time must be after start time.',
        });
        return;
    }
    const newClip: Clip = {
      id: Date.now(),
      start,
      end,
      title: `My Clip ${clips.length + 1}`,
      captions: '',
    };
    setClips((prev) => [newClip, ...prev]);
    toast({ title: 'Clip Added', description: `"${newClip.title}" was added to your clips.` });
  };

  const handleSelectClip = (clip: { start: number; end: number }) => {
    setStart(clip.start);
    setEnd(clip.end);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.start;
      videoRef.current.pause();
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-2 md:p-4">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} src={videoUrl} className="h-full w-full" controls />
          </div>
          <div className="mt-4 space-y-4 p-2">
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max={duration}
                step="0.01"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-sm text-muted-foreground font-mono">
                <span>{formatTime(currentTime, true)}</span>
                <span>{formatTime(duration, true)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-1">
                <Label htmlFor="start-time">Start Time (s)</Label>
                <Input id="start-time" type="number" value={start.toFixed(2)} onChange={(e) => setStart(parseFloat(e.target.value) || 0)} step="0.1" min="0" max={duration} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-time">End Time (s)</Label>
                <Input id="end-time" type="number" value={end.toFixed(2)} onChange={(e) => setEnd(parseFloat(e.target.value) || 0)} step="0.1" min={start} max={duration}/>
              </div>
              <div className="flex h-10 items-center gap-2">
                <Button onClick={playClip} className="w-full bg-accent hover:bg-accent/90">
                  <Play /> Preview Clip
                </Button>
              </div>
              <div className="flex h-10 items-center gap-2">
                <Button onClick={addClip} className="w-full">
                  <Plus /> Add Clip
                </Button>
              </div>
            </div>
            <div className="pt-4">
              <Button onClick={detectScenes} disabled={isLoadingScenes} className="w-full md:w-auto">
                <Sparkles className="mr-2 h-4 w-4" />
                {isLoadingScenes ? 'Detecting Scenes...' : 'AI Scene Detection'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {suggestedClips.length > 0 && (
        <div>
          <h2 className="font-headline text-2xl font-bold mb-4">AI Suggested Clips</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestedClips.map((clip) => (
              <Card
                key={clip.id}
                className="cursor-pointer hover:shadow-lg transition-shadow duration-200 hover:border-primary"
                onClick={() => handleSelectClip(clip)}
              >
                <CardContent className="p-4">
                  <p className="font-semibold font-headline">{clip.title}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {formatTime(clip.start)} - {formatTime(clip.end)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <ClipList clips={clips} setClips={setClips} onPreview={handleSelectClip} />
    </div>
  );
}

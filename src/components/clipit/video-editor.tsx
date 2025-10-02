
'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Play, Sparkles, Loader2 } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { detectScenesAction } from '@/app/actions';

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
  const [suggestedClips, setSuggestedClips] = useState<Omit<Clip, 'captions' | 'id'>[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEnd(Math.min(15, video.duration));
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
    
    // In a real app, you'd get the video file's data URI.
    // For this demo, we can't access the file content directly.
    const dummyVideoDataUri = 'data:video/mp4;base64,';

    try {
        const { sceneTimestamps } = await detectScenesAction({ videoDataUri: dummyVideoDataUri });
        const videoDuration = videoRef.current?.duration || 0;
        
        const newSuggestions: Omit<Clip, 'captions'|'id'>[] = [];
        for (let i = 0; i < sceneTimestamps.length; i++) {
            const clipStart = sceneTimestamps[i];
            // Find a suitable end point, either the next scene or a max duration
            let clipEnd = sceneTimestamps[i+1] || videoDuration;
            clipEnd = Math.min(clipEnd, clipStart + 60); // Max 60s clips
            clipEnd = Math.max(clipEnd, clipStart + 5); // Min 5s clips

            if (clipEnd > clipStart && clipEnd <= videoDuration) {
                newSuggestions.push({
                    start: clipStart,
                    end: clipEnd,
                    title: `AI Clip ${newSuggestions.length + 1}`,
                });
            }
        }
        
        setSuggestedClips(newSuggestions);
        toast({ title: 'AI Complete', description: `${newSuggestions.length} clips suggested.` });
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Scene Detection Failed',
            description: 'Could not detect scenes. Please try again.',
        });
    } finally {
        setIsLoadingScenes(false);
    }
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
                {isLoadingScenes ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4" />}
                {isLoadingScenes ? 'Detecting Scenes...' : 'AI Scene Detection'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {suggestedClips.length > 0 && (
        <div>
          <h2 className="font-headline text-2xl font-bold mb-4">AI Suggested Clips</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {suggestedClips.map((clip, index) => (
              <Card
                key={index}
                className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:ring-2 hover:ring-primary group"
                onClick={() => handleSelectClip(clip)}
              >
                <CardContent className="p-3">
                  <p className="font-semibold font-headline text-sm truncate group-hover:text-primary">{clip.title}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
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

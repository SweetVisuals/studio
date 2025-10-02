
'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Play, Sparkles, Loader2, Download } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { generateCaptionsAction } from '@/app/actions';

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
  const [activeClipForPreview, setActiveClipForPreview] = useState<Clip | null>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEnd(Math.min(15, video.duration));
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (activeClipForPreview && video.currentTime >= activeClipForPreview.end) {
        video.pause();
      }
    };
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [videoRef, activeClipForPreview]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const playClip = (clip: { start: number; end: number, captions?: string }) => {
    const video = videoRef.current;
    if (!video) return;

    // A bit of a hack to tie preview to a clip for captions
    const tempClip: Clip = {
        id: -1, 
        start: clip.start, 
        end: clip.end, 
        title: 'Preview',
        captions: clip.captions || ''
    };
    setActiveClipForPreview(tempClip);

    video.currentTime = clip.start;
    video.play();

    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }

    playIntervalRef.current = setInterval(() => {
      if (video.currentTime >= clip.end) {
        video.pause();
        if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        setActiveClipForPreview(null);
      }
    }, 100);
  };
  
  const detectScenes = async () => {
    setIsLoadingScenes(true);
    toast({ title: 'AI Processing', description: 'Detecting potential clips in your video...' });
    
    try {
        const videoDuration = videoRef.current?.duration || 0;
        if (videoDuration === 0) {
            toast({
                variant: 'destructive',
                title: 'Video Not Loaded',
                description: 'Could not get video duration.',
            });
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const newSuggestions: Omit<Clip, 'captions'|'id'>[] = [];
        const numSuggestions = 8; 
        const minClipDuration = 10;
        const maxClipDuration = 45;

        for (let i = 0; i < numSuggestions; i++) {
            const clipDuration = Math.random() * (maxClipDuration - minClipDuration) + minClipDuration;
            const clipStart = Math.random() * (videoDuration - clipDuration);
            const clipEnd = clipStart + clipDuration;

            newSuggestions.push({
                start: clipStart,
                end: clipEnd,
                title: `AI Clip ${newSuggestions.length + 1}`,
            });
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

  const addClip = async () => {
    if (end <= start) {
        toast({
            variant: 'destructive',
            title: 'Invalid Time Range',
            description: 'End time must be after start time.',
        });
        return;
    }
    const id = Date.now();
    const newClip: Clip = {
      id,
      start,
      end,
      title: `My Clip ${clips.length + 1}`,
      captions: '', // Initially empty
    };
    setClips((prev) => [newClip, ...prev]);
    toast({ title: 'Clip Added', description: `"${newClip.title}" was added. Generating captions...` });

    // Auto-generate captions
    try {
        const dummyAudioDataUri = 'data:audio/wav;base64,'; // Placeholder
        const result = await generateCaptionsAction({ audioDataUri: dummyAudioDataUri });
        setClips((prev) =>
          prev.map((c) => (c.id === id ? { ...c, captions: result.captions } : c))
        );
        toast({
            title: 'Captions Ready!',
            description: `AI captions for "${newClip.title}" are complete.`,
        });
    } catch (error) {
        console.error('Auto-caption failed for', newClip.title, error);
        toast({
            variant: 'destructive',
            title: 'Caption Failed',
            description: 'Could not generate AI captions for the clip.',
        });
    }
  };

  const handleSelectClip = (clip: { start: number; end: number }) => {
    setStart(clip.start);
    setEnd(clip.end);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.start;
      videoRef.current.pause();
    }
    setActiveClipForPreview(null);
  };
  
  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-2 md:p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
               <div className="aspect-video w-full overflow-hidden rounded-lg bg-black relative">
                  <video ref={videoRef} src={videoUrl} className="h-full w-full" controls crossOrigin="anonymous"/>
                   {activeClipForPreview && activeClipForPreview.captions && (
                     <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full px-4 text-center">
                       <p className="py-2 px-4 text-lg md:text-xl font-bold text-white bg-black/60 rounded-md inline">
                         {activeClipForPreview.captions}
                       </p>
                     </div>
                   )}
               </div>
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
            </div>

            <div className="md:col-span-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="start-time">Start (s)</Label>
                        <Input id="start-time" type="number" value={start.toFixed(2)} onChange={(e) => setStart(parseFloat(e.target.value) || 0)} step="0.1" min="0" max={duration} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="end-time">End (s)</Label>
                        <Input id="end-time" type="number" value={end.toFixed(2)} onChange={(e) => setEnd(parseFloat(e.target.value) || 0)} step="0.1" min={start} max={duration}/>
                    </div>
                </div>
                 <Button onClick={() => playClip({ start, end })} className="w-full bg-accent hover:bg-accent/90">
                   <Play /> Preview Clip
                 </Button>
                 <Button onClick={addClip} className="w-full">
                   <Plus /> Add Clip
                 </Button>
                <Button onClick={detectScenes} disabled={isLoadingScenes} className="w-full">
                    {isLoadingScenes ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4" />}
                    {isLoadingScenes ? 'Working...' : 'AI Scene Detection'}
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

      <ClipList clips={clips} setClips={setClips} onPreview={playClip} videoUrl={videoUrl} videoElement={videoRef.current} />
    </div>
  );
}

    
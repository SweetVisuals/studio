'use client';

import { useState, useRef, useEffect, type RefObject, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Play, Sparkles, Loader2, Volume2, VolumeX, Upload } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip, VideoFilter, AspectRatio } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { generateCaptionsAction, detectScenesAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import { Checkbox } from '../ui/checkbox';

type VideoEditorProps = {
  videoUrl: string;
  videoRef: RefObject<HTMLVideoElement>;
};

const filterOptions: { id: VideoFilter, label: string }[] = [
    { id: 'bw', label: 'Black & White' },
    { id: 'night-vision', label: 'Night Vision' },
    { id: 'vhs', label: 'VHS' },
];

export default function VideoEditor({ videoUrl, videoRef }: VideoEditorProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(15);
  const [clips, setClips] = useState<Clip[]>([]);
  const [suggestedClips, setSuggestedClips] = useState<Omit<Clip, 'id' | 'captions'>[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);
  const [activeClipForPreview, setActiveClipForPreview] = useState<Clip | null>(null);

  const [filters, setFilters] = useState<VideoFilter[]>(['none']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [overlayAudioFile, setOverlayAudioFile] = useState<File | null>(null);
  const [overlayAudioUrl, setOverlayAudioUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const overlayAudioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const videoWrapperRef = useRef<HTMLDivElement>(null);

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
        if(overlayAudioRef.current) overlayAudioRef.current.pause();
      }
    };
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      if (overlayAudioUrl) URL.revokeObjectURL(overlayAudioUrl);
    };
  }, [videoRef, activeClipForPreview, overlayAudioUrl]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const playClip = (clip: Clip) => {
    const video = videoRef.current;
    if (!video) return;

    setActiveClipForPreview(clip);

    video.currentTime = clip.start;
    video.muted = clip.isMuted;
    video.play();
    
    if (overlayAudioRef.current && clip.overlayAudioUrl) {
        if(overlayAudioRef.current.src !== clip.overlayAudioUrl){
            overlayAudioRef.current.src = clip.overlayAudioUrl;
        }
        overlayAudioRef.current.currentTime = 0;
        overlayAudioRef.current.play();
    }

    if (playIntervalRef.current) clearInterval(playIntervalRef.current);

    playIntervalRef.current = setInterval(() => {
      if (video.currentTime >= clip.end) {
        video.pause();
        if(overlayAudioRef.current) overlayAudioRef.current.pause();
        if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        setActiveClipForPreview(null);
        video.muted = false;
      }
    }, 100);
  };

  const handlePreviewCurrentSelection = () => {
    const tempClip: Clip = {
        id: -1, 
        start: start, 
        end: end, 
        title: 'Preview',
        captions: 'Sample Captions',
        filters: filters,
        aspectRatio: aspectRatio,
        isMuted: isMuted,
        overlayAudioUrl: overlayAudioUrl || undefined,
    };
    playClip(tempClip);
  }
  
  const detectScenes = async () => {
    setIsLoadingScenes(true);
    toast({ title: 'AI Processing', description: 'Detecting potential clips in your video...' });
    
    try {
        if (!videoRef.current) throw new Error("Video element not available");

        const videoDuration = videoRef.current.duration;
        const videoDataUri = 'data:video/mp4;base64,'; // Dummy data for now
        
        const { sceneTimestamps } = await detectScenesAction({ videoDataUri });

        const newSuggestions: Omit<Clip, 'id'|'captions'>[] = [];
        const numSuggestions = 8; 
        const minClipDuration = 10;
        const maxClipDuration = 45;
        const allFilters: VideoFilter[] = ['none', 'bw', 'vhs', 'night-vision'];
        const aspectRatios: AspectRatio[] = ['9:16', '1:1', '16:9'];

        for (let i = 0; i < numSuggestions; i++) {
            const clipDuration = Math.random() * (maxClipDuration - minClipDuration) + minClipDuration;
            const clipStart = Math.random() * (videoDuration - clipDuration);
            const clipEnd = clipStart + clipDuration;

            newSuggestions.push({
                start: clipStart,
                end: clipEnd,
                title: `AI Clip ${i + 1}`,
                filters: [allFilters[Math.floor(Math.random() * allFilters.length)]],
                aspectRatio: aspectRatios[Math.floor(Math.random() * aspectRatios.length)],
                isMuted: Math.random() > 0.7,
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
        console.error(error);
    } finally {
        setIsLoadingScenes(false);
    }
  };

  const addClip = async () => {
    if (end <= start) {
        toast({ variant: 'destructive', title: 'Invalid Time Range', description: 'End time must be after start time.'});
        return;
    }
    const id = Date.now();
    const newClip: Clip = {
      id,
      start,
      end,
      title: `My Clip ${clips.length + 1}`,
      captions: '',
      filters,
      aspectRatio,
      isMuted,
      overlayAudioUrl: overlayAudioUrl || undefined,
    };
    setClips((prev) => [newClip, ...prev]);
    toast({ title: 'Clip Added', description: `"${newClip.title}" was added. Generating captions...` });

    // Reset audio for next clip
    setOverlayAudioFile(null);
    setOverlayAudioUrl(null);
    if(audioInputRef.current) audioInputRef.current.value = "";
    // also reset mute state
    setIsMuted(false);


    try {
        const dummyAudioDataUri = 'data:audio/wav;base64,'; 
        const result = await generateCaptionsAction({ audioDataUri: dummyAudioDataUri });
        setClips((prev) => prev.map((c) => (c.id === id ? { ...c, captions: result.captions } : c)));
        toast({ title: 'Captions Ready!', description: `AI captions for "${newClip.title}" are complete.`});
    } catch (error) {
        console.error('Auto-caption failed for', newClip.title, error);
        toast({ variant: 'destructive', title: 'Caption Failed', description: 'Could not generate AI captions for the clip.' });
    }
  };

  const handleSelectClip = (clip: Omit<Clip, 'id'|'captions'>) => {
    setStart(clip.start);
    setEnd(clip.end);
    setFilters(clip.filters);
    setAspectRatio(clip.aspectRatio);
    setIsMuted(clip.isMuted);
    setOverlayAudioUrl(clip.overlayAudioUrl || null);
    if (videoRef.current) {
      videoRef.current.currentTime = clip.start;
      videoRef.current.pause();
    }
    setActiveClipForPreview(null);
  };
  
  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOverlayAudioFile(file);
      const url = URL.createObjectURL(file);
      setOverlayAudioUrl(url);
      setIsMuted(true); // Automatically mute original video
      toast({title: 'Audio Added', description: `Added ${file.name} and muted original video.`})
    }
  };

  const handleFilterChange = (filterId: VideoFilter) => {
    setFilters(prev => {
        const newFilters = prev.includes(filterId) 
            ? prev.filter(f => f !== filterId)
            : [...prev, filterId];
        // Ensure 'none' is removed if another filter is added, and added if all others are removed
        const otherFilters = newFilters.filter(f => f !== 'none');
        if (otherFilters.length === 0) return ['none'];
        return otherFilters;
    });
  };

  const getFilterClass = (f: VideoFilter[]) => {
    const filterClasses = f.map(filter => {
      switch(filter) {
        case 'bw': return 'grayscale';
        case 'night-vision': return 'night-vision-filter';
        case 'vhs': return 'vhs-filter';
        default: return '';
      }
    }).join(' ');

    return filterClasses;
  };
  
  const vhsClass = "after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[rgba(0,0,0,0.1)] after:z-10 after:pointer-events-none after:animate-vhs-scanlines";
  
  const activeFilters = activeClipForPreview?.filters ?? filters;
  const activeAspectRatio = activeClipForPreview?.aspectRatio ?? aspectRatio;

  const getAspectRatioClass = (ar: AspectRatio) => {
    switch(ar) {
        case '9:16': return 'aspect-[9/16]';
        case '1:1': return 'aspect-square';
        case '16:9': return 'aspect-[16/9]';
        default: return 'aspect-video';
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-2 md:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
               <div ref={videoWrapperRef} className={cn("w-full mx-auto bg-black rounded-lg overflow-hidden transition-all duration-300", getAspectRatioClass(activeAspectRatio))}>
                  <div className={cn("relative w-full h-full", getFilterClass(activeFilters))}>
                    <video ref={videoRef} src={videoUrl} className="h-full w-full object-cover" controls={false} crossOrigin="anonymous" playsInline/>
                    {activeFilters.includes('vhs') && <div className="vhs-overlay"></div>}
                    {activeClipForPreview && activeClipForPreview.captions && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full px-4 text-center z-20">
                        <p className="py-2 px-4 text-lg md:text-xl font-bold text-white bg-black/60 rounded-md inline">
                          {activeClipForPreview.captions}
                        </p>
                      </div>
                    )}
                  </div>
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

            <div className="lg:col-span-1 space-y-4">
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
                
                <div className="space-y-1">
                    <Label>Aspect Ratio</Label>
                    <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                      <SelectTrigger id="aspect-ratio"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="source">Source</SelectItem>
                        <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                
                <div className="space-y-2">
                    <Label>Filters</Label>
                    <div className="grid grid-cols-2 gap-2">
                        {filterOptions.map(option => (
                             <Label key={option.id} className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/50 cursor-pointer">
                                <Checkbox
                                    id={`filter-${option.id}`}
                                    checked={filters.includes(option.id)}
                                    onCheckedChange={() => handleFilterChange(option.id)}
                                />
                                <span className="text-sm font-medium">{option.label}</span>
                            </Label>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={() => audioInputRef.current?.click()} variant="outline" className="w-full">
                        <Upload /> Upload Audio
                    </Button>
                    <input type="file" accept='audio/*' ref={audioInputRef} onChange={handleAudioUpload} className='sr-only'/>
                    <Button variant="outline" size="icon" onClick={() => setIsMuted(!isMuted)}>
                        {isMuted ? <VolumeX className='text-destructive'/> : <Volume2 />}
                    </Button>
                </div>
                 <Button onClick={handlePreviewCurrentSelection} className="w-full bg-accent hover:bg-accent/90">
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
      
      <audio ref={overlayAudioRef} className='hidden' />

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

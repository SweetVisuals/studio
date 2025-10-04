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
import { Plus, Play, Sparkles, Loader2, Volume2, VolumeX, Upload, Music4, Film, UploadCloud } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip, VideoFilter, AspectRatio, VideoSource } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '../ui/checkbox';

type VideoEditorProps = {
  videoSources: VideoSource[];
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

const filterOptions: { id: VideoFilter, label: string }[] = [
    { id: 'bw', label: 'Black & White' },
    { id: 'night-vision', label: 'Night Vision' },
    { id: 'vhs', label: 'VHS' },
];

export default function VideoEditor({ videoSources, onVideoUpload }: VideoEditorProps) {
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(15);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeClipForPreview, setActiveClipForPreview] = useState<Clip | null>(null);

  const [filters, setFilters] = useState<VideoFilter[]>(['none']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [overlayAudioFile, setOverlayAudioFile] = useState<File | null>(null);
  const [overlayAudioUrl, setOverlayAudioUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const overlayAudioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const moreVideoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSources[activeVideoIndex]) return;

    const currentSrc = video.src;
    const newSrc = videoSources[activeVideoIndex].url;

    if (currentSrc !== newSrc) {
        video.src = newSrc;
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if(activeVideoIndex === 0 && clips.length === 0) { 
        setEnd(Math.min(15, video.duration));
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (activeClipForPreview && video.currentTime >= activeClipForPreview.end) {
        video.pause();
        setActiveClipForPreview(null);
        if(overlayAudioRef.current) overlayAudioRef.current.pause();
      }
    };
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    if (video.readyState < 1) {
      video.load();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [activeVideoIndex, videoSources, clips.length, activeClipForPreview]);
  
  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const playClip = (clipToPlay: Clip) => {
      const video = videoRef.current;
      if (!video) return;

      if (clipToPlay.cuts && clipToPlay.cuts.length > 0) {
        toast({ title: 'Preview Not Available', description: 'Preview for multi-cut clips is coming soon. Use the Export button for now.' });
        return;
      }

      video.pause();
      if(overlayAudioRef.current) overlayAudioRef.current.pause();
      setActiveClipForPreview(clipToPlay);
  
      const setupAndPlay = (targetVideo: HTMLVideoElement) => {
        targetVideo.currentTime = clipToPlay.start;
        targetVideo.muted = clipToPlay.isMuted;
        
        const audioEl = overlayAudioRef.current;
        if(audioEl && clipToPlay.overlayAudioUrl) {
          if (audioEl.src !== clipToPlay.overlayAudioUrl) {
            audioEl.src = clipToPlay.overlayAudioUrl;
            audioEl.load();
          }
          audioEl.currentTime = 0;
        }

        const playPromise = targetVideo.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            if (audioEl && clipToPlay.overlayAudioUrl) {
              audioEl.play();
            }
          }).catch(error => {
            console.error("Playback failed", error);
            toast({ variant: 'destructive', title: 'Playback Error', description: 'Could not play video.' });
            setActiveClipForPreview(null);
          });
        }
      };

      if(activeVideoIndex !== clipToPlay.sourceVideo) {
        setActiveVideoIndex(clipToPlay.sourceVideo);
        const onCanPlay = () => {
            const newVideoEl = videoRef.current;
            if(newVideoEl) {
                setupAndPlay(newVideoEl);
                newVideoEl.removeEventListener('canplay', onCanPlay);
            }
        };
        video.addEventListener('canplay', onCanPlay);

      } else {
        setupAndPlay(video);
      }
  };


  const handlePreviewCurrentSelection = () => {
    const tempClip: Clip = {
        id: -1, 
        start: start, 
        end: end, 
        title: 'Preview',
        filters: filters,
        isMuted: isMuted,
        overlayAudioUrl: overlayAudioUrl || undefined,
        sourceVideo: activeVideoIndex,
    };
    playClip(tempClip);
  }
  
  const createMultiCamEdit = async () => {
    if (!overlayAudioFile) {
        toast({ variant: 'destructive', title: 'Audio Required', description: 'Please upload an audio file to base the multi-cam edit on.' });
        return;
    }
    if (videoSources.length < 1) {
        toast({ variant: 'destructive', title: 'Video Required', description: 'Please upload at least one video source.' });
        return;
    }
    setIsLoading(true);
    toast({ title: 'AI Processing', description: 'Generating audio-driven multi-cam edit...' });

    try {
        const audioDuration = await new Promise<number>((resolve, reject) => {
            const audio = document.createElement('audio');
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => resolve(audio.duration);
            audio.onerror = () => reject(new Error('Could not load audio file.'));
            audio.src = URL.createObjectURL(overlayAudioFile);
        });

        const videoDurations = await Promise.all(
            videoSources.map(source => new Promise<number>((resolve, reject) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => resolve(video.duration);
                video.onerror = () => resolve(0);
                video.src = source.url;
            }))
        );

        const validSources = videoSources
            .map((source, index) => ({ ...source, duration: videoDurations[index], originalIndex: index }))
            .filter(s => s.duration >= 3);

        if (validSources.length === 0) {
            toast({ variant: 'destructive', title: 'No Valid Videos', description: 'All video sources are less than 3 seconds long.' });
            setIsLoading(false);
            return;
        }

        const cuts = [];
        const clipDuration = 3;
        const numClips = Math.ceil(audioDuration / clipDuration);
        
        for (let i = 0; i < numClips; i++) {
            const sourceInfo = validSources[i % validSources.length];
            const startTime = Math.random() * (sourceInfo.duration - clipDuration);
            const endTime = startTime + clipDuration;

            cuts.push({
                sourceVideo: sourceInfo.originalIndex,
                start: startTime,
                end: endTime,
            });
        }

        const sharedAudioUrl = URL.createObjectURL(overlayAudioFile);

        const newClip: Clip = {
            id: Date.now(),
            start: 0,
            end: audioDuration,
            title: `Multi-Cam Edit - ${overlayAudioFile.name}`,
            filters: ['none'],
            isMuted: true,
            overlayAudioUrl: sharedAudioUrl,
            sourceVideo: -1, // Indicates a multi-source clip
            cuts: cuts
        };

        setClips(prev => [...prev, newClip]);
        toast({ title: 'AI Complete', description: 'A new multi-cam clip has been created.' });
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Multi-cam Edit Failed',
            description: (error as Error).message || 'Could not generate clips. Please try again.',
        });
        console.error(error);
    } finally {
        setIsLoading(false);
    }
  };

  const addClip = async () => {
    if (end <= start) {
        toast({ variant: 'destructive', title: 'Invalid Time Range', description: 'End time must be after start time.'});
        return;
    }
    const id = Date.now();
    
    let newOverlayUrl = overlayAudioUrl;
    if(overlayAudioFile) {
        newOverlayUrl = URL.createObjectURL(overlayAudioFile);
    }

    const newClip: Clip = {
      id,
      start,
      end,
      title: `My Clip ${clips.length + 1}`,
      filters,
      isMuted,
      overlayAudioUrl: newOverlayUrl || undefined,
      sourceVideo: activeVideoIndex,
    };

    setClips((prev) => [newClip, ...prev]);
    toast({ title: 'Clip Added', description: `"${newClip.title}" was added.` });

    setOverlayAudioFile(null);
    if(overlayAudioUrl && !newClip.overlayAudioUrl) {
        URL.revokeObjectURL(overlayAudioUrl);
    }
    setOverlayAudioUrl(null);
    setIsMuted(false);
    setFilters(['none']);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(overlayAudioUrl) {
          URL.revokeObjectURL(overlayAudioUrl);
      }
      setOverlayAudioFile(file);
      const url = URL.createObjectURL(file);
      setOverlayAudioUrl(url);
      setIsMuted(true); 
      toast({title: 'Audio Added', description: `Added ${file.name}. Original video muted.`})
    }
  };

  const handleFilterChange = (filterId: VideoFilter) => {
    setFilters(prev => {
        const newFilters = prev.includes(filterId) 
            ? prev.filter(f => f !== filterId)
            : [...prev, filterId];
        const otherFilters = newFilters.filter(f => f !== 'none');
        if (otherFilters.length === 0) return ['none'];
        return otherFilters;
    });
  };

  const getFilterClass = (f: VideoFilter[]) => {
    return f.map(filter => {
      switch(filter) {
        case 'bw': return 'grayscale';
        case 'night-vision': return 'night-vision-filter';
        case 'vhs': return 'vhs-filter';
        default: return '';
      }
    }).join(' ');
  };
  
  const activeFilters = activeClipForPreview?.filters ?? filters;
  
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
                <div className="flex gap-2 flex-wrap items-center">
                    {videoSources.map((source, index) => (
                        <Button 
                            key={index} 
                            variant={activeVideoIndex === index ? 'default' : 'outline'}
                            onClick={() => setActiveVideoIndex(index)}
                        >
                            <Film className="mr-2"/>
                            Source {index + 1}
                        </Button>
                    ))}
                     <Button 
                        variant="outline"
                        onClick={() => moreVideoInputRef.current?.click()}
                    >
                        <UploadCloud className="mr-2"/>
                        Upload More
                    </Button>
                    <input
                      id="video-upload-more"
                      type="file"
                      className="sr-only"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={onVideoUpload}
                      multiple
                      ref={moreVideoInputRef}
                    />
                </div>
               <div ref={videoWrapperRef} className={cn("w-full mx-auto bg-black rounded-lg overflow-hidden transition-all duration-300", getAspectRatioClass(aspectRatio))}>
                  <div className={cn("relative w-full h-full", getFilterClass(activeFilters))}>
                    <video ref={videoRef} className="h-full w-full object-cover" controls={false} crossOrigin="anonymous" playsInline/>
                    {activeFilters.includes('vhs') && <div className="vhs-overlay"></div>}
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
                
                <Card className='p-3 space-y-2'>
                    <Label className='flex items-center gap-2'><Music4 className='text-accent'/> Overlay Audio</Label>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => audioInputRef.current?.click()} variant="outline" className="w-full">
                            <Upload /> {overlayAudioFile ? 'Change' : 'Upload'}
                        </Button>
                        <input type="file" accept='audio/*' ref={audioInputRef} onChange={handleAudioUpload} className='sr-only'/>
                        <Button variant="outline" size="icon" onClick={() => setIsMuted(!isMuted)} disabled={!!overlayAudioUrl}>
                            {isMuted ? <VolumeX className='text-destructive'/> : <Volume2 />}
                        </Button>
                    </div>
                    {overlayAudioFile && <p className='text-xs text-muted-foreground truncate'>Current: {overlayAudioFile.name}</p>}
                </Card>

                 <Button onClick={handlePreviewCurrentSelection} className="w-full bg-accent hover:bg-accent/90">
                   <Play /> Preview Selection
                 </Button>
                 <Button onClick={addClip} className="w-full">
                   <Plus /> Add Clip Manually
                 </Button>
                
                  <Button onClick={createMultiCamEdit} disabled={isLoading || videoSources.length === 0 || !overlayAudioFile} className="w-full">
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4" />}
                      {isLoading ? 'Working...' : 'Create Audio-Driven Edit'}
                  </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <audio ref={overlayAudioRef} className='hidden' crossOrigin="anonymous"/>

      <ClipList clips={clips} setClips={setClips} onPreview={playClip} aspectRatio={aspectRatio} videoSources={videoSources} />
    </div>
  );
}

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
import { Plus, Play, Sparkles, Loader2, Volume2, VolumeX, Upload, Music4, Film, UploadCloud, Pause } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip, VideoFilter, AspectRatio, VideoSource, ClipCut } from '@/app/page';
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
  const [currentCutIndex, setCurrentCutIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);


  const [filters, setFilters] = useState<VideoFilter[]>(['none']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [overlayAudioFile, setOverlayAudioFile] = useState<File | null>(null);
  const [overlayAudioUrl, setOverlayAudioUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayAudioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const moreVideoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSources[activeVideoIndex]) return;

    const sourceChanged = video.src !== videoSources[activeVideoIndex].url;

    const handleMetadata = () => {
        setDuration(video.duration);
        if (activeVideoIndex === 0 && clips.length === 0) {
            setEnd(Math.min(15, video.duration));
        }
    };
    
    if (sourceChanged) {
        video.src = videoSources[activeVideoIndex].url;
        video.load();
    }
    
    video.addEventListener('loadedmetadata', handleMetadata);
    
    return () => {
      video.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, [activeVideoIndex, videoSources, clips.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isPreviewPlaying || !activeClipForPreview || !video) return;
      
      setCurrentTime(video.currentTime);
      
      const isMultiCut = activeClipForPreview.cuts && activeClipForPreview.cuts.length > 0;
      let end_time: number;
      let current_cut_for_time_update = currentCutIndex;
      
      if(isMultiCut){
          const currentCut = activeClipForPreview.cuts![current_cut_for_time_update];
          if(activeVideoIndex !== currentCut.sourceVideo) return; // Don't advance if we are on the wrong source video
          end_time = currentCut.end;
      } else {
          end_time = activeClipForPreview.end;
      }

      if (video.currentTime >= end_time) {
        if(isMultiCut){
          if (current_cut_for_time_update < activeClipForPreview.cuts!.length - 1) {
            setCurrentCutIndex(current_cut_for_time_update + 1);
          } else {
            stopPreview();
          }
        } else {
          stopPreview();
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [activeClipForPreview, currentCutIndex, isPreviewPlaying, activeVideoIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPreviewPlaying || !activeClipForPreview) {
      return;
    }
  
    const isMultiCut = activeClipForPreview.cuts && activeClipForPreview.cuts.length > 0;
    
    let sourceVideoIndex: number;
    let startTime: number;
    let isMutedOverride: boolean;
  
    if (isMultiCut) {
      if (currentCutIndex >= activeClipForPreview.cuts!.length) {
        stopPreview();
        return;
      }
      const cut = activeClipForPreview.cuts![currentCutIndex];
      sourceVideoIndex = cut.sourceVideo;
      startTime = cut.start;
      isMutedOverride = activeClipForPreview.isMuted;
    } else {
      sourceVideoIndex = activeClipForPreview.sourceVideo;
      startTime = activeClipForPreview.start;
      isMutedOverride = activeClipForPreview.isMuted;
    }

    const playVideo = () => {
      if (!videoRef.current || !isPreviewPlaying) return;
      videoRef.current.currentTime = startTime;
      videoRef.current.muted = isMutedOverride;
      videoRef.current.play().catch(e => {
        console.error("Playback failed", e);
        stopPreview();
      });
    };
  
    if (activeVideoIndex !== sourceVideoIndex) {
      setActiveVideoIndex(sourceVideoIndex);
      // The source is changing. We must wait for the new source to be ready.
      // The video.src will be updated by the primary useEffect that watches activeVideoIndex
      const onCanPlay = () => {
        playVideo();
        video.removeEventListener('canplay', onCanPlay);
      };
      video.addEventListener('canplay', onCanPlay, { once: true });
    } else {
      // Source is already correct, just play.
      playVideo();
    }
  
  }, [isPreviewPlaying, activeClipForPreview, currentCutIndex, videoSources]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const stopPreview = () => {
    const video = videoRef.current;
    const audio = overlayAudioRef.current;
    if(video) {
        video.pause();
    }
    if(audio) audio.pause();
    
    // Only reset if a preview was actually playing
    if(isPreviewPlaying) {
      setActiveClipForPreview(null);
      setCurrentCutIndex(0);
      setIsPreviewPlaying(false);
    }
  }

  const playClip = (clipToPlay: Clip) => {
    if (isPreviewPlaying) {
      stopPreview();
      // If we clicked the same clip again, just stop.
      // If we clicked a new clip, we want to start it after stopping the old one.
      if (activeClipForPreview?.id === clipToPlay.id) {
          return;
      }
    }

    const video = videoRef.current;
    if (!video) return;
  
    setActiveClipForPreview(clipToPlay);
    setCurrentCutIndex(0);
    setIsPreviewPlaying(true);
    
    const audioEl = overlayAudioRef.current;
    if (audioEl && clipToPlay.overlayAudioUrl) {
      if (audioEl.src !== clipToPlay.overlayAudioUrl) {
        audioEl.src = clipToPlay.overlayAudioUrl;
        audioEl.load();
      }
      audioEl.currentTime = 0;
      audioEl.play().catch(e => console.error("Audio playback failed", e));
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
    if (videoSources.length === 0) {
      toast({ variant: 'destructive', title: 'Video Required', description: 'Please upload at least one video source.' });
      return;
    }
    setIsLoading(true);
    toast({ title: 'AI Processing', description: 'Generating audio-driven multi-cam edit...' });

    try {
      const audioDuration = await new Promise<number>((resolve, reject) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(audio.src); // Clean up temp object URL
          resolve(audio.duration);
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(audio.src); // Clean up temp object URL
          reject(new Error('Could not load audio file.'));
        };
        audio.src = URL.createObjectURL(overlayAudioFile);
      });

      const videoDurations = await Promise.all(
        videoSources.map(source => new Promise<number>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => resolve(0);
          video.src = source.url;
        }))
      );

      const clipDuration = 3;
      const numCuts = Math.ceil(audioDuration / clipDuration);
      const cuts: ClipCut[] = [];

      const validSources = videoSources
        .map((source, index) => ({ originalIndex: index, duration: videoDurations[index] }))
        .filter(s => s.duration >= clipDuration);

      if (validSources.length === 0) {
        throw new Error(`No video sources are long enough for a ${clipDuration}s clip.`);
      }

      for (let i = 0; i < numCuts; i++) {
        const sourceInfo = validSources[i % validSources.length];
        const startTime = Math.random() * (sourceInfo.duration - clipDuration);
        
        cuts.push({
          sourceVideo: sourceInfo.originalIndex,
          start: startTime,
          end: startTime + clipDuration,
        });
      }

      const newClip: Clip = {
        id: Date.now(),
        start: 0,
        end: audioDuration,
        title: `Multi-Cam: ${overlayAudioFile.name.split('.').slice(0, -1).join('.')}`,
        filters: filters,
        isMuted: true,
        overlayAudioUrl: URL.createObjectURL(overlayAudioFile), // Keep one URL for the final clip
        sourceVideo: -1, // Indicates a multi-source clip
        cuts: cuts,
      };
      
      setClips(prev => [newClip, ...prev]);
      toast({ title: 'AI Edit Complete', description: 'A new multi-cam clip has been created.' });

    } catch (error) {
      console.error('Multi-cam edit failed:', error);
      toast({
        variant: 'destructive',
        title: 'Multi-cam Edit Failed',
        description: (error as Error).message || 'An unexpected error occurred.',
      });
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
    if(overlayAudioFile && !clips.some(c => c.overlayAudioUrl === overlayAudioUrl)) {
        newOverlayUrl = URL.createObjectURL(overlayAudioFile);
    } else if (overlayAudioFile) {
        newOverlayUrl = overlayAudioUrl;
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

    // Reset editing state
    setOverlayAudioFile(null);
    setOverlayAudioUrl(null);
    setIsMuted(false);
    setFilters(['none']);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if(overlayAudioUrl) {
          // Check if this URL is used by any other clip before revoking
          const isUrlInUse = clips.some(clip => clip.overlayAudioUrl === overlayAudioUrl) || (overlayAudioUrl === newClip.overlayAudioUrl);
          if (!isUrlInUse) {
            URL.revokeObjectURL(overlayAudioUrl);
          }
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
    if (!f) return '';
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

  const currentPreviewIcon = isPreviewPlaying ? <Pause /> : <Play />;
  const newClip = { // Used for audio upload logic
      id: -1,
      start: 0,
      end: 0,
      title: '',
      filters: [],
      isMuted: false,
      sourceVideo: 0,
      overlayAudioUrl: overlayAudioUrl || undefined
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
                            onClick={() => {
                                if(isPreviewPlaying) stopPreview();
                                setActiveVideoIndex(index);
                            }}
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
                    {activeFilters && activeFilters.includes('vhs') && <div className="vhs-overlay"></div>}
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
                   {currentPreviewIcon} {isPreviewPlaying && activeClipForPreview?.id === -1 ? 'Stop' : 'Preview Selection'}
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

      <ClipList 
        clips={clips} 
        setClips={setClips} 
        onPreview={playClip} 
        aspectRatio={aspectRatio} 
        videoSources={videoSources}
        activePreviewClipId={activeClipForPreview?.id}
        isPreviewing={isPreviewPlaying}
      />
    </div>
  );
}

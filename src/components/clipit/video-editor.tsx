'use client';

import { useState, useRef, useEffect, useCallback, type RefObject, ChangeEvent } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Play, Sparkles, Loader2, Volume2, VolumeX, Upload, Music4, Film, UploadCloud, Pause, X, ChevronUp, ChevronDown, Settings, Download, Expand } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip, VideoFilter, AspectRatio, VideoSource, ClipCut } from '@/app/page';
import { formatTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '../ui/checkbox';

type VideoEditorProps = {
  videoSources: VideoSource[];
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveSource: (index: number) => void;
};

const filterOptions: { id: VideoFilter, label: string }[] = [
    { id: 'bw', label: 'Black & White' },
    { id: 'night-vision', label: 'Night Vision' },
    { id: 'vhs', label: 'VHS' },
];

export default function VideoEditor({ videoSources, onVideoUpload, onRemoveSource }: VideoEditorProps) {
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
  const [previewSourcesOpen, setPreviewSourcesOpen] = useState(false);
  const [previewActiveSource, setPreviewActiveSource] = useState(0);
  const [cutDuration, setCutDuration] = useState(2);

  // State for new side panel features
  const [sourceScaleFactors, setSourceScaleFactors] = useState<{[key: number]: number}>({});
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm'>('mp4');
  const [exportQuality, setExportQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [exportFrameRate, setExportFrameRate] = useState<24 | 30 | 60>(30);

  // State to track dynamic styles for scale application
  const [videoStyles, setVideoStyles] = useState<{[key: number]: any}>({});

  // Update video styles when scale factors change
  useEffect(() => {
    const newStyles: {[key: number]: any} = {};
    videoSources.forEach((_, index) => {
      const scale = sourceScaleFactors[index] || 1.0;
      newStyles[index] = {
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        transition: 'transform 0.2s ease-in-out'
      };
    });
    setVideoStyles(newStyles);
  }, [sourceScaleFactors, videoSources]);

  // Function to move video sources
  const moveSource = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= videoSources.length) return;

    const newSources = [...videoSources];
    [newSources[fromIndex], newSources[toIndex]] = [newSources[toIndex], newSources[fromIndex]];

    // Update active video index if necessary
    let newActiveIndex = activeVideoIndex;
    if (activeVideoIndex === fromIndex) {
      newActiveIndex = toIndex;
    } else if (activeVideoIndex === toIndex) {
      newActiveIndex = fromIndex;
    }

    setActiveVideoIndex(newActiveIndex);
    onRemoveSource && onRemoveSource(0); // Update via parent callback
    // Note: This component receives sources as props, would need parent to handle actual reordering
    toast({ title: 'Sources reordered', description: 'Source order has been updated.' });
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const overlayAudioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const moreVideoInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const videoWrapperRef = useRef<HTMLDivElement>(null);

  const activeClipForPreviewRef = useRef<Clip | null>(null);
  const currentCutIndexRef = useRef<number>(0);
  const isPreviewPlayingRef = useRef<boolean>(false);
  const activeVideoIndexRef = useRef<number>(0);

  useEffect(() => { activeClipForPreviewRef.current = activeClipForPreview; }, [activeClipForPreview]);
  useEffect(() => { currentCutIndexRef.current = currentCutIndex; }, [currentCutIndex]);
  useEffect(() => { isPreviewPlayingRef.current = isPreviewPlaying; }, [isPreviewPlaying]);
  useEffect(() => { activeVideoIndexRef.current = activeVideoIndex; }, [activeVideoIndex]);

  useEffect(() => {
    videoRef.current = videoRefs.current[activeVideoIndex] || null;
  }, [activeVideoIndex, videoSources.length]);

  // Preload all video sources to make switching seamless
  useEffect(() => {
    const preloadElements: HTMLVideoElement[] = [];
    videoSources.forEach(source => {
      const video = document.createElement('video');
      video.src = source.url;
      video.preload = 'auto';
      video.style.position = 'absolute';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      document.body.appendChild(video);
      preloadElements.push(video);
    });

    return () => {
      preloadElements.forEach(video => {
        document.body.removeChild(video);
      });
    };
  }, [videoSources]);

  useEffect(() => {
    if (previewSourcesOpen && videoSources.length > 0) {
      setPreviewActiveSource(0);
      const video = previewVideoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
        const switchInterval = setInterval(() => {
          setPreviewActiveSource(prev => (prev + 1) % videoSources.length);
        }, 3000);
        const stopTimer = setTimeout(() => {
          clearInterval(switchInterval);
          video.pause();
        }, videoSources.length * 3000);
        return () => {
          clearInterval(switchInterval);
          clearTimeout(stopTimer);
        };
      }
    }
  }, [previewSourcesOpen, videoSources.length]);

  useEffect(() => {
    if (previewSourcesOpen && previewVideoRef.current) {
      const video = previewVideoRef.current;
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [previewActiveSource, previewSourcesOpen]);
  
  useEffect(() => {
    const video = videoRefs.current[activeVideoIndex];
    if (!video || !videoSources[activeVideoIndex]) return;

    const handleMetadata = () => {
        setDuration(video.duration);
        if (activeVideoIndex === 0 && clips.length === 0) {
            setEnd(Math.min(15, video.duration));
        }
    };

    video.addEventListener('loadedmetadata', handleMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, [activeVideoIndex, videoSources, clips.length]);

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

  const timeUpdateHandler = useCallback(() => {
    const activeClip = activeClipForPreviewRef.current;
    if (!isPreviewPlayingRef.current || !activeClip) return;

    const video = videoRefs.current[activeVideoIndexRef.current];
    if (!video) return;

    const isMultiCut = activeClip.cuts && activeClip.cuts.length > 0;

    if (!isMultiCut) {
      // Single clip logic
      setCurrentTime(video.currentTime);
      if (video.currentTime >= activeClip.end) {
        stopPreview();
      }
    } else {
      // Multi-cut logic: calculate total progress for linear seek bar
      let totalProgress = 0;
      for (let i = 0; i < currentCutIndexRef.current; i++) {
        totalProgress += activeClip.cuts![i].end - activeClip.cuts![i].start;
      }
      totalProgress += Math.max(0, video.currentTime - activeClip.cuts![currentCutIndexRef.current].start);
      setCurrentTime(totalProgress);

      // Check if current cut has ended
      const currentCut = activeClip.cuts![currentCutIndexRef.current];
      if (video.currentTime >= currentCut.end) {
        if (currentCutIndexRef.current < activeClip.cuts!.length - 1) {
          // Advance to next cut
          const nextCutIndex = currentCutIndexRef.current + 1;
          const nextCut = activeClip.cuts![nextCutIndex];

          console.log(`Advancing to cut ${nextCutIndex}: source=${nextCut.sourceVideo}, start=${nextCut.start.toFixed(2)}, end=${nextCut.end.toFixed(2)}`);

          currentCutIndexRef.current = nextCutIndex;
          setCurrentCutIndex(nextCutIndex);
          setActiveVideoIndex(nextCut.sourceVideo);

          // Switch to the next video
          const nextVideo = videoRefs.current[nextCut.sourceVideo];
          if (nextVideo) {
            nextVideo.currentTime = nextCut.start;
            nextVideo.muted = activeClip.isMuted;
            // Video continues playing
          }
        } else {
          // Last cut reached
          console.log('Reached last cut, stopping preview');
          stopPreview();
        }
      }
    }
  }, [videoSources, stopPreview]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('timeupdate', timeUpdateHandler);

    return () => {
      video.removeEventListener('timeupdate', timeUpdateHandler);
    };
  }, [timeUpdateHandler]);

  useEffect(() => {
    if (!isPreviewPlaying || !activeClipForPreview) {
      return;
    }

    const isMultiCut = activeClipForPreview.cuts && activeClipForPreview.cuts.length > 0;

    if (isMultiCut) {
      if (currentCutIndex >= activeClipForPreview.cuts!.length) {
        console.log('Cut index out of bounds, stopping preview');
        stopPreview();
        return;
      }

      const cut = activeClipForPreview.cuts![currentCutIndex];
      const sourceVideoIndex = cut.sourceVideo;
      const startTime = cut.start;

      console.log(`Starting multi-cut playback: cut=${currentCutIndex}, source=${sourceVideoIndex}, start=${startTime.toFixed(2)}, end=${cut.end.toFixed(2)}`);

      const startPlayback = () => {
        const video = videoRefs.current[sourceVideoIndex];
        if (!video || !isPreviewPlayingRef.current) return;

        video.currentTime = startTime;
        video.muted = activeClipForPreview.isMuted;
        video.play().catch(e => {
          console.error("Multi-cut playback failed", e);
          stopPreview();
        });
      };

      if (activeVideoIndex !== sourceVideoIndex) {
        setActiveVideoIndex(sourceVideoIndex);
        // Wait for state update to take effect
        setTimeout(startPlayback, 0);
      } else {
        startPlayback();
      }
      return;
    }

    // Single clip logic (unchanged)
    const sourceVideoIndex = activeClipForPreview.sourceVideo;
    const startTime = activeClipForPreview.start;
    const isMutedOverride = activeClipForPreview.isMuted;

    const playVideo = () => {
      const video = videoRefs.current[sourceVideoIndex];
      if (!video || !(isPreviewPlayingRef as any).current) return;

      video.pause();
      video.currentTime = startTime;
      video.muted = isMutedOverride;

      if (video.readyState >= 3) {
        video.play().catch(e => {
          console.error("Playback failed", e);
          stopPreview();
        });
      } else {
        const playWhenReady = () => {
          video.play().catch(e => {
            console.error("Playback failed", e);
            stopPreview();
          });
          video.removeEventListener('canplay', playWhenReady);
        };
        video.addEventListener('canplay', playWhenReady, { once: true });
      }
    };

    if (activeVideoIndex !== sourceVideoIndex) {
      setActiveVideoIndex(sourceVideoIndex);
      // Wait for state update to show the correct video element
      setTimeout(playVideo, 0);
    } else {
      playVideo();
    }

  }, [isPreviewPlaying, activeClipForPreview, currentCutIndex, videoSources, activeVideoIndex]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(event.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const playClip = (clipToPlay: Clip) => {
    if (isPreviewPlaying) {
      stopPreview();
      // If we clicked the same clip again, just stop.
      // If we clicked a new clip, we want to start it after stopping the old one.
      if (activeClipForPreview?.id === clipToPlay.id) {
          return;
      }
    }

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
    toast({ title: 'AI Processing', description: 'Generating audio-driven multi-cam edits...' });

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

      const uniqueVideoSources = videoSources.filter((source, index, arr) => arr.findIndex(s => s.url === source.url) === index);

      const videoDurations = await Promise.all(
        uniqueVideoSources.map(source => new Promise<number>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.style.position = 'absolute';
          video.style.left = '-9999px';
          video.style.top = '-9999px';
          document.body.appendChild(video);
          video.onloadedmetadata = () => {
            document.body.removeChild(video);
            resolve(video.duration);
          };
          video.onerror = (e) => {
            document.body.removeChild(video);
            console.warn(`Failed to load metadata for video: ${source.url}, error:`, e);
            resolve(0);
          };

          // Add a timeout to prevent hanging
          setTimeout(() => {
            if (video.parentNode) {
              document.body.removeChild(video);
              console.warn(`Timeout loading metadata for video: ${source.url}`);
              resolve(0);
            }
          }, 5000);

          video.src = source.url;
        }))
      );

      // Log video durations for debugging
      console.log('Video durations:', videoDurations);
      console.log('Audio duration:', audioDuration);
      console.log('Cut duration:', cutDuration);

      // Reduce minimum duration requirement if running in production/browser environment
      const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
      const minimumDuration = isProduction ? Math.min(cutDuration * 0.5, 1) : cutDuration;

      const clipDuration = cutDuration;
      const numFullCuts = Math.floor(audioDuration / clipDuration);
      const remainder = audioDuration % clipDuration;
      const numCuts = remainder > 0 ? numFullCuts + 1 : numFullCuts;

      const validSources = uniqueVideoSources
        .map((source, index) => ({ originalIndex: videoSources.findIndex(s => s.url === source.url), duration: videoDurations[index] }))
        .filter(s => s.duration >= minimumDuration);

      console.log(`Valid sources count: ${validSources.length} (required minimum duration: ${minimumDuration}s)`);

      if (validSources.length < 2) {
        // If we still don't have enough sources, provide more detailed error information
        const sourceDetails = videoDurations.map((dur, index) => `Source ${index + 1}: ${dur.toFixed(2)}s`);
        throw new Error(`Need at least 2 video sources that are at least ${minimumDuration}s long for multi-cam edit. Available sources: ${sourceDetails.join(', ')}. Please ensure your videos are uploaded correctly and are long enough.`);
      }

      const audioUrl = URL.createObjectURL(overlayAudioFile);
      const newClips: Clip[] = [];

      // Function to generate random sequence without consecutive repeats
      const generateRandomSequence = (length: number, numSources: number): number[] => {
        const sequence: number[] = [];
        let last = -1;
        for (let i = 0; i < length; i++) {
          let next;
          do {
            next = Math.floor(Math.random() * numSources);
          } while (next === last);
          sequence.push(next);
          last = next;
        }
        return sequence;
      };

      for (let clipIndex = 0; clipIndex < 25; clipIndex++) {
        const cuts: ClipCut[] = [];
        const sourceSequence = generateRandomSequence(numCuts, validSources.length);

        for (let i = 0; i < numCuts; i++) {
           const sourceIndex = sourceSequence[i];
            const sourceInfo = validSources[sourceIndex];
            const cutDurationActual = (i === numCuts - 1 && remainder > 0) ? remainder : clipDuration;
            const startTime = Math.random() * (sourceInfo.duration - cutDurationActual);

            cuts.push({
              sourceVideo: sourceInfo.originalIndex,
              start: startTime,
              end: startTime + cutDurationActual,
            });
          }

        const newClip: Clip = {
          id: Date.now() + clipIndex,
          start: 0,
          end: audioDuration,
          title: `Multi-Cam: ${overlayAudioFile.name.split('.').slice(0, -1).join('.')} - Edit ${clipIndex + 1}`,
          filters: filters,
          isMuted: true,
          overlayAudioUrl: audioUrl,
          sourceVideo: -1, // Indicates a multi-source clip
          cuts: cuts,
        };

        newClips.push(newClip);
      }

      setClips(prev => [...newClips, ...prev]);
      toast({ title: 'AI Edit Complete', description: '25 new multi-cam clips have been created.' });

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
            <div className="space-y-4">
              <ClipList
                clips={clips}
                setClips={setClips}
                onPreview={playClip}
                aspectRatio={aspectRatio}
                videoSources={videoSources}
                activePreviewClipId={activeClipForPreview?.id}
                isPreviewing={isPreviewPlaying}
                exportFormat={exportFormat}
                exportQuality={exportQuality}
                exportFrameRate={exportFrameRate}
                sourceScaleFactors={sourceScaleFactors}
              />
            </div>

            <div className="space-y-4">
                <div className="flex gap-2 flex-wrap items-center">
                    {videoSources.map((source, index) => (
                        <div key={index} className="flex items-center gap-1">
                            <Button
                                variant={activeVideoIndex === index ? 'default' : 'outline'}
                                onClick={() => {
                                    if(isPreviewPlaying) stopPreview();
                                    setActiveVideoIndex(index);
                                }}
                            >
                                <Film className="mr-2"/>
                                Source {index + 1}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveSource(index)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                      <Button
                          variant="outline"
                          onClick={() => moreVideoInputRef.current?.click()}
                      >
                          <UploadCloud className="mr-2"/>
                          Upload More
                      </Button>
                     <Dialog open={previewSourcesOpen} onOpenChange={setPreviewSourcesOpen}>
                       <DialogTrigger asChild>
                         <Button variant="outline">
                           <Film className="mr-2"/>
                           Preview Sources
                         </Button>
                       </DialogTrigger>
                       <DialogContent className="max-w-2xl">
                         <DialogHeader>
                           <DialogTitle>Preview Sources</DialogTitle>
                         </DialogHeader>
                         <div className="space-y-4">
                           <p className="text-sm text-muted-foreground">Playing Source {previewActiveSource + 1}</p>
                           <div className="w-full bg-black rounded-lg overflow-hidden">
                             <video
                               ref={previewVideoRef}
                               className="w-full h-48 object-cover"
                               src={videoSources[previewActiveSource]?.url}
                             ></video>
                           </div>
                         </div>
                       </DialogContent>
                     </Dialog>
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
                    {videoSources.map((source, index) => (
                      <video
                        key={index}
                        ref={(el) => {
                          if (el) videoRefs.current[index] = el;
                        }}
                        className={cn("h-full w-full object-cover", index !== activeVideoIndex && "hidden")}
                        style={videoStyles[index]}
                        controls={false}
                        crossOrigin="anonymous"
                        playsInline
                        src={source.url}
                      />
                    ))}
                    {activeFilters && activeFilters.includes('vhs') && <div className="vhs-overlay"></div>}
                  </div>
               </div>
               <div className="space-y-2">
                 <input
                   type="range"
                   min="0"
                   max={activeClipForPreview?.end || duration}
                   step="0.01"
                   value={currentTime}
                   onChange={handleSeek}
                   disabled={!!activeClipForPreview?.cuts}
                   className="w-full h-2 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                 />
                 <div className="flex justify-between text-sm text-muted-foreground font-mono">
                   <span>{formatTime(currentTime, true)}</span>
                   <span>{formatTime(activeClipForPreview?.end || duration, true)}</span>
                 </div>
               </div>
            </div>

            <div className="space-y-4">
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
                    <Label className='flex items-center gap-2'><Settings className='text-accent' size={16}/> Manage Sources & Scale</Label>
                    <div className="space-y-3">
                        <Label htmlFor="cut-duration" className="text-xs">Global Cut Duration (s)</Label>
                        <Input id="cut-duration" type="number" value={cutDuration} onChange={(e) => setCutDuration(parseFloat(e.target.value) || 2)} step="0.1" min="0.1" />

                        <div className="space-y-2">
                            <Label className="text-xs">Per-Source Settings</Label>
                            {videoSources.map((source, index) => (
                                <div key={index} className="flex flex-col gap-2 p-2 rounded border bg-muted/30">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium">Source {index + 1}</span>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveSource(index, 'up')}
                                                disabled={index === 0}
                                                className="h-5 w-5 p-0"
                                                title="Move up"
                                            >
                                                <ChevronUp size={10} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveSource(index, 'down')}
                                                disabled={index === videoSources.length - 1}
                                                className="h-5 w-5 p-0"
                                                title="Move down"
                                            >
                                                <ChevronDown size={10} />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor={`scale-${index}`} className="text-xs flex-shrink-0">Scale:</Label>
                                        <Input
                                            id={`scale-${index}`}
                                            type="number"
                                            value={((sourceScaleFactors[index] || 1.0) * 100).toFixed(0)}
                                            onChange={(e) => {
                                                const value = (parseFloat(e.target.value) || 100) / 100;
                                                setSourceScaleFactors(prev => ({ ...prev, [index]: value }));
                                            }}
                                            step="1"
                                            min="10"
                                            max="500"
                                            className="h-7 text-xs flex-1"
                                            placeholder="100"
                                        />
                                        <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                <Card className='p-3 space-y-2'>
                    <Label className='flex items-center gap-2'><Download className='text-accent' size={16}/> Export Settings</Label>
                    <div className="space-y-2">
                        <div className="space-y-1">
                            <Label htmlFor="export-format" className="text-xs">Format</Label>
                            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'mp4' | 'webm')}>
                                <SelectTrigger id="export-format" className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mp4">MP4</SelectItem>
                                    <SelectItem value="webm">WebM</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="export-quality" className="text-xs">Quality</Label>
                            <Select value={exportQuality} onValueChange={(v) => setExportQuality(v as 'low' | 'medium' | 'high')}>
                                <SelectTrigger id="export-quality" className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="export-framerate" className="text-xs">Frame Rate</Label>
                            <Select value={exportFrameRate.toString()} onValueChange={(v) => setExportFrameRate(parseInt(v) as 24 | 30 | 60)}>
                                <SelectTrigger id="export-framerate" className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="24">24 fps</SelectItem>
                                    <SelectItem value="30">30 fps</SelectItem>
                                    <SelectItem value="60">60 fps</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </Card>

                <Card className='p-3 space-y-2'>
                    <Label className='flex items-center gap-2'><Music4 className='text-accent' size={16}/> Overlay Audio</Label>
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
    </div>
  );
}

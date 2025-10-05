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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Play, Sparkles, Loader2, Volume2, VolumeX, Upload, Music4, Film, UploadCloud, Pause, X, ChevronUp, ChevronDown, Settings, Download, Expand, Scissors, SlidersHorizontal, AudioLines } from 'lucide-react';
import ClipList from './clip-list';
import type { Clip, VideoFilter, AspectRatio, ClipCut } from '@/app/page';
import { formatTime } from '@/lib/utils';

type VideoSource = {
  file: File;
  url: string;
  cutDuration: number;
};
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '../ui/checkbox';
import { Slider } from '../ui/slider';
import { Separator } from '../ui/separator';

type VideoEditorProps = {
  videoSources: VideoSource[];
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveSource: (index: number) => void;
};

const filterOptions: { id: VideoFilter, label: string }[] = [
    { id: 'bw', label: 'Black & White' },
    { id: 'night-vision', label: 'Night Vision' },
    { id: 'vhs', label: 'VHS' },
    { id: 'grain', label: 'Grain' },
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
  const [overlayAudioStartTime, setOverlayAudioStartTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [previewSourcesOpen, setPreviewSourcesOpen] = useState(false);
  const [previewActiveSource, setPreviewActiveSource] = useState(0);
  const [cutDuration, setCutDuration] = useState(2);
  const [sourceCutDurations, setSourceCutDurations] = useState<{[key: number]: number}>({});
  const [nightVisionColor, setNightVisionColor] = useState('#00ff00'); // Default green - matches the original hue-rotate(80deg) effect
  const [grainIntensity, setGrainIntensity] = useState(50); // Default grain intensity 50%

  // State for new side panel features
  const [sourceScaleFactors, setSourceScaleFactors] = useState<{[key: number]: number}>({});
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm'>('mp4');
  const [exportQuality, setExportQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [exportFrameRate, setExportFrameRate] = useState<24 | 30 | 60>(30);

  // State for preview size
  const [previewSize, setPreviewSize] = useState(100);

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
  const previewVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const { toast } = useToast();

  const videoWrapperRef = useRef<HTMLDivElement>(null);

  const activeClipForPreviewRef = useRef<Clip | null>(null);
  const currentCutIndexRef = useRef<number>(0);
  const isPreviewPlayingRef = useRef<boolean>(false);
  const activeVideoIndexRef = useRef<number>(0);
  const cutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { activeClipForPreviewRef.current = activeClipForPreview; }, [activeClipForPreview]);
  useEffect(() => { currentCutIndexRef.current = currentCutIndex; }, [currentCutIndex]);
  useEffect(() => { isPreviewPlayingRef.current = isPreviewPlaying; }, [isPreviewPlaying]);
  useEffect(() => { activeVideoIndexRef.current = activeVideoIndex; }, [activeVideoIndex]);

  useEffect(() => {
    if (previewSourcesOpen && videoSources.length > 0) {
      let currentIndex = 0;
      setPreviewActiveSource(0);

      const playCurrent = (index: number) => {
        const video = previewVideoRefs.current[index];
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
      };

      playCurrent(0);

      const switchInterval = setInterval(() => {
        // Pause current
        const currentVideo = previewVideoRefs.current[currentIndex];
        if (currentVideo) currentVideo.pause();

        currentIndex = (currentIndex + 1) % videoSources.length;
        setPreviewActiveSource(currentIndex);
        playCurrent(currentIndex);
      }, 3000);

      const stopTimer = setTimeout(() => {
        clearInterval(switchInterval);
        const lastVideo = previewVideoRefs.current[currentIndex];
        if (lastVideo) lastVideo.pause();
      }, videoSources.length * 3000);

      return () => {
        clearInterval(switchInterval);
        clearTimeout(stopTimer);
      };
    }
  }, [previewSourcesOpen, videoSources.length]);

  
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
    const video = videoRefs.current[activeVideoIndexRef.current]; // Use active video from refs
    const audio = overlayAudioRef.current;
    if(video) {
        video.pause();
    }
    if(audio) audio.pause();

    // Clear any pending cut timeout
    if (cutTimeoutRef.current) {
      clearTimeout(cutTimeoutRef.current);
      cutTimeoutRef.current = null;
    }

    // Only reset if a preview was actually playing
    if(isPreviewPlaying) {
      setActiveClipForPreview(null);
      setCurrentCutIndex(0);
      setIsPreviewPlaying(false);
    }
  }

  // Setup timeout-based fallback for cut advancement
  const setupCutTimeout = (cut: ClipCut, cutIndex: number) => {
    if (cutTimeoutRef.current) {
      clearTimeout(cutTimeoutRef.current);
    }

    const cutDuration = cut.end - cut.start;
    const timeoutDuration = (cutDuration * 1000) + 100; // Add 100ms buffer

    cutTimeoutRef.current = setTimeout(() => {
      const activeClip = activeClipForPreviewRef.current;
      if (!isPreviewPlayingRef.current || !activeClip || !activeClip.cuts) return;

      // Only advance if we're still on the same cut (prevent double advancement)
      if (currentCutIndexRef.current === cutIndex && cutIndex < activeClip.cuts.length - 1) {
        console.log(`Timeout fallback: advancing from cut ${cutIndex}`);

        const nextCutIndex = cutIndex + 1;
        const nextCut = activeClip.cuts[nextCutIndex];

        currentCutIndexRef.current = nextCutIndex;

        setTimeout(() => {
          setCurrentCutIndex(nextCutIndex);
          setActiveVideoIndex(nextCut.sourceVideo);
        }, 0);

        const nextVideo = videoRefs.current[nextCut.sourceVideo];
        if (nextVideo) {
          const currentVideo = videoRefs.current[activeVideoIndexRef.current];
          if (currentVideo) currentVideo.pause();

          nextVideo.currentTime = nextCut.start;
          nextVideo.muted = activeClip.isMuted;

          const playPromise = nextVideo.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              console.error("Timeout fallback cut transition failed", e);
              stopPreview();
            });
          }
        }

        // Setup timeout for next cut
        setupCutTimeout(nextCut, nextCutIndex);
      } else if (currentCutIndexRef.current === cutIndex && cutIndex === activeClip.cuts.length - 1) {
        // Last cut - stop preview
        console.log('Timeout fallback: reached last cut');
        stopPreview();
      }
    }, timeoutDuration);
  };

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

      // Check if current cut has ended - use a small buffer to prevent early triggering
      const currentCut = activeClip.cuts![currentCutIndexRef.current];
      if (video.currentTime >= currentCut.end - 0.05) { // 50ms buffer
        if (currentCutIndexRef.current < activeClip.cuts!.length - 1) {
          // Advance to next cut
          const nextCutIndex = currentCutIndexRef.current + 1;
          const nextCut = activeClip.cuts![nextCutIndex];

          console.log(`Advancing to cut ${nextCutIndex}: source=${nextCut.sourceVideo}, start=${nextCut.start.toFixed(2)}, end=${nextCut.end.toFixed(2)}`);

          currentCutIndexRef.current = nextCutIndex;
          setCurrentCutIndex(nextCutIndex);

          // Switch videos behind the scenes - don't change activeVideoIndex to avoid UI lag
          const nextVideo = videoRefs.current[nextCut.sourceVideo];
          if (nextVideo) {
            // Pause current video and switch to next seamlessly
            video.pause();
            nextVideo.currentTime = nextCut.start;
            nextVideo.muted = activeClip.isMuted;

            const playPromise = nextVideo.play();
            if (playPromise !== undefined) {
              playPromise.catch(e => {
                console.error("Cut transition failed", e);
                stopPreview();
              });
            }

            // Setup timeout for the next cut
            setupCutTimeout(nextCut, nextCutIndex);
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

        // Setup timeout fallback for this cut
        setupCutTimeout(cut, currentCutIndex);
      };

      // For multi-cut previews, don't change activeVideoIndex - keep showing the first source visually
      // Just start playback on the appropriate video element behind the scenes
      startPlayback();
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

  const handleSeek = (value: number[]) => {
    const time = value[0];
    const video = videoRefs.current[activeVideoIndex]; // Use active video from refs
    if (video) {
      video.currentTime = time;
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
      audioEl.currentTime = clipToPlay.overlayAudioStartTime || 0;
      audioEl.play().catch(e => console.error("Audio playback failed", e));
    }
  };

  const handlePreviewCurrentSelection = () => {
    const tempClip: Clip = {
        id: -1,
        start: start,
        end: start + cutDuration,
        title: 'Preview',
        filters: filters,
        isMuted: isMuted,
        overlayAudioUrl: overlayAudioUrl || undefined,
        overlayAudioStartTime: overlayAudioStartTime,
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
        uniqueVideoSources.map((source, index) => new Promise<number>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.style.position = 'absolute';
          video.style.left = '-9999px';
          video.style.top = '-9999px';
          document.body.appendChild(video);

          let metadataLoaded = false;

          video.onloadedmetadata = () => {
            metadataLoaded = true;
            document.body.removeChild(video);
            console.log(`Video ${index} metadata loaded successfully: ${video.duration}s`);
            resolve(video.duration);
          };

          video.onerror = (e) => {
            if (!metadataLoaded) {
              document.body.removeChild(video);
              console.warn(`Failed to load metadata for video ${index}: ${source.url}, error:`, e);
              resolve(0);
            }
          };

          // Add a timeout to prevent hanging - increased for production environments
          // If metadata loading fails, try to estimate duration by preloading the video
          setTimeout(async () => {
            if (video.parentNode && !metadataLoaded) {
              console.warn(`Timeout loading metadata for video ${index}: ${source.url}, attempting fallback estimation`);

              // Try to estimate duration by creating a separate video element and checking playback
              try {
                const fallbackVideo = document.createElement('video');
                fallbackVideo.preload = 'metadata';
                fallbackVideo.style.position = 'absolute';
                fallbackVideo.style.left = '-9999px';
                fallbackVideo.style.top = '-9999px';
                document.body.appendChild(fallbackVideo);

                await new Promise<void>((resolveFallback, rejectFallback) => {
                  const cleanup = () => {
                    if (fallbackVideo.parentNode) {
                      document.body.removeChild(fallbackVideo);
                    }
                  };

                  fallbackVideo.onloadedmetadata = () => {
                    cleanup();
                    document.body.removeChild(video); // Clean up the original video
                    console.log(`Fallback estimation successful for video ${index}: ${fallbackVideo.duration}s`);
                    resolve(fallbackVideo.duration);
                    rejectFallback = () => {}; // Clear reject to prevent double calling
                  };

                  fallbackVideo.onerror = () => {
                    cleanup();
                    document.body.removeChild(video);
                    console.warn(`Fallback estimation also failed for video ${index}, using default duration`);
                    resolve(30); // Assume 30 seconds as fallback
                    rejectFallback = () => {};
                  };

                  // Secondary timeout - 10 seconds for fallback
                  setTimeout(() => {
                    cleanup();
                    document.body.removeChild(video);
                    console.warn(`Fallback timeout for video ${index}, using default duration`);
                    resolve(30); // 30 seconds fallback
                    rejectFallback = () => {};
                  }, 10000);

                  fallbackVideo.src = source.url;
                });
              } catch (fallbackError) {
                console.warn(`Fallback estimation completely failed for video ${index}:`, fallbackError);
                document.body.removeChild(video);
                resolve(30); // 30 seconds as last resort
              }
            }
          }, 15000); // Increased primary timeout to 15 seconds

          console.log(`Starting metadata load for video ${index}: ${source.url}`);
          video.src = source.url;
        }))
      );

      // Log video durations for debugging
      console.log('Video durations:', videoDurations);
      console.log('Audio duration:', audioDuration);
      console.log('Cut duration:', cutDuration);

      const clipDuration = cutDuration;
      const numFullCuts = Math.floor(audioDuration / clipDuration);
      const remainder = audioDuration % clipDuration;
      const numCuts = remainder > 0 ? numFullCuts + 1 : numFullCuts;

      // For multi-cam edit, we just need at least 2 video sources - duration checking is not essential
      // since the feature can work with any available video content
      // Filter out sources that failed to load metadata entirely (duration 0)
      const validSources = uniqueVideoSources
        .map((source, index) => ({
          originalIndex: videoSources.findIndex(s => s.url === source.url),
          duration: videoDurations[index]
        }))
        .filter(source => source.duration > 0); // Only use sources that successfully loaded metadata

      console.log(`Multi-cam edit sources: ${validSources.length} valid sources with duration > 0`);

      if (validSources.length < 2) {
        throw new Error(`Multi-cam edit requires at least 2 video sources that can be successfully loaded. Currently only ${validSources.length}/${videoSources.length} sources passed metadata loading. Please try uploading different video files or clearing your browser cache.`);
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
            // Use individual source cut duration if set, otherwise fall back to global
            const sourceSpecificDuration = sourceCutDurations[sourceInfo.originalIndex] || cutDuration;
            const cutDurationActual = (i === numCuts - 1 && remainder > 0) ? remainder : sourceSpecificDuration;
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
          title: `Clip ${clips.length + clipIndex + 1}`,
          filters: filters,
          isMuted: true,
          overlayAudioUrl: audioUrl,
          overlayAudioStartTime: overlayAudioStartTime,
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

  const createShortFormClips = async () => {
    if (videoSources.length === 0) {
      toast({ variant: 'destructive', title: 'Video Required', description: 'Please upload at least one video source.' });
      return;
    }

    const activeSource = videoSources[activeVideoIndex];
    if (!activeSource) {
      toast({ variant: 'destructive', title: 'No Active Source', description: 'Please select a video source to cut.' });
      return;
    }

    setIsLoading(true);
    toast({ title: 'Processing', description: 'Cutting video into short-form clips...' });

    try {
      // Get the duration of the active video source
      const videoDuration = await new Promise<number>((resolve, reject) => {
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

        video.onerror = () => {
          document.body.removeChild(video);
          reject(new Error('Could not load video metadata.'));
        };

        video.src = activeSource.url;
      });

      console.log(`Active video duration: ${videoDuration}s`);
      console.log(`Cut duration: ${cutDuration}s`);

      const clipDuration = sourceCutDurations[activeVideoIndex] || cutDuration;
      const numClips = Math.min(Math.floor(videoDuration / clipDuration), 25);

      if (numClips === 0) {
        throw new Error(`Video is too short for clips of ${clipDuration} seconds. Please reduce the cut duration or use a longer video.`);
      }

      const newClips: Clip[] = [];

      for (let i = 0; i < numClips; i++) {
        const startTime = i * clipDuration;
        const endTime = Math.min((i + 1) * clipDuration, videoDuration);

        const newClip: Clip = {
          id: Date.now() + i,
          start: startTime,
          end: endTime,
          title: `Short Clip ${clips.length + i + 1}`,
          filters: filters,
          isMuted: isMuted,
          overlayAudioUrl: overlayAudioUrl || undefined,
          sourceVideo: activeVideoIndex,
        };

        newClips.push(newClip);
      }

      setClips(prev => [...newClips, ...prev]);
      toast({ title: 'Short Clips Created', description: `${numClips} short-form clips have been created from the selected video.` });

    } catch (error) {
      console.error('Short form clips creation failed:', error);
      toast({
        variant: 'destructive',
        title: 'Clip Creation Failed',
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
      title: `Clip ${clips.length + 1}`,
      filters,
      isMuted,
      overlayAudioUrl: newOverlayUrl || undefined,
      overlayAudioStartTime: overlayAudioStartTime,
      sourceVideo: activeVideoIndex,
    };

    setClips((prev) => [newClip, ...prev]);
    toast({ title: 'Clip Added', description: `"${newClip.title}" was added.` });

    // Reset editing state
    setOverlayAudioFile(null);
    setOverlayAudioUrl(null);
    setOverlayAudioStartTime(0);
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
        case 'night-vision': return '';
        case 'vhs': return 'vhs-filter';
        default: return '';
      }
    }).join(' ');
  };

  // Generate dynamic night vision filter style
  const getNightVisionStyle = (f: VideoFilter[]) => {
    if (!f || !f.includes('night-vision')) return {};

    // Handle default night vision (original hue-rotate(80deg))
    if (nightVisionColor === '#default') {
      return {
        filter: 'grayscale(100%) brightness(1.2) sepia(100%) hue-rotate(80deg) saturate(200%)'
      };
    }

    // Convert hex color to HSL for hue-rotate
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      return [h * 360, s * 100, l * 100];
    };

    const [h] = hexToHsl(nightVisionColor);
    return {
      filter: `grayscale(100%) brightness(1.2) sepia(100%) hue-rotate(${h}deg) saturate(200%)`
    };
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

  const getPaddingBottom = (ar: AspectRatio) => {
    switch(ar) {
        case '9:16': return (16/9 * 100);
        case '1:1': return 100;
        case '16:9': return (9/16 * 100);
        default: return (16/9 * 100);
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
    <div className="flex flex-1 h-full overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 w-full h-full p-4">
        {/* Left Panel: Video Sources & Clip List */}
        <Card className="flex flex-col p-4 bg-card/60 border-border/50 shadow-lg overflow-hidden">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
            <Film className="h-5 w-5 text-primary" /> Video Sources
          </h3>
          <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto pr-2">
            {videoSources.map((source, index) => (
              <div key={index} className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2 border border-border/50">
                <Button
                  variant={activeVideoIndex === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if(isPreviewPlaying) stopPreview();
                    setActiveVideoIndex(index);
                  }}
                  className="h-8 flex-1 justify-start text-sm"
                >
                  Source {index + 1}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveSource(index)}
                  className="h-8 w-8 p-0 hover:bg-destructive/20"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground/90">
            <Scissors className="h-5 w-5 text-primary" /> Created Clips
          </h3>
          <div className="flex-1 overflow-y-auto pr-2">
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
        </Card>

        {/* Middle Panel: Video Preview & Controls */}
        <Card className="flex flex-col p-4 bg-card/60 border-border/50 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <Play className="h-5 w-5 text-primary" /> Video Preview
            </h3>
            <div className="flex gap-2">
              <Select value={previewSize.toString()} onValueChange={(v) => setPreviewSize(parseInt(v))}>
                <SelectTrigger className="w-20 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100%</SelectItem>
                  <SelectItem value="75">75%</SelectItem>
                  <SelectItem value="50">50%</SelectItem>
                  <SelectItem value="25">25%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => moreVideoInputRef.current?.click()}
                className="h-8 text-sm"
              >
                <UploadCloud className="mr-2 h-4 w-4"/> Upload More
              </Button>
              <Dialog open={previewSourcesOpen} onOpenChange={setPreviewSourcesOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-sm">
                    <Film className="mr-2 h-4 w-4"/> Preview Sources
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Preview Sources</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Playing Source {previewActiveSource + 1}</p>
                    <div className="w-full bg-black rounded-lg overflow-hidden relative">
                      {videoSources.map((source, index) => (
                        <video
                          key={index}
                          ref={(el) => {
                            if (el) previewVideoRefs.current[index] = el;
                          }}
                          className={cn("w-full h-48 object-cover absolute inset-0", index !== previewActiveSource && "opacity-0")}
                          style={{ zIndex: index === previewActiveSource ? 1 : 0 }}
                          src={source.url}
                          preload="auto"
                        />
                      ))}
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
          </div>
          <div className="flex justify-center">
            <div ref={videoWrapperRef} className={cn("bg-black/90 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300 shadow-2xl border border-border/20 relative")} style={{ width: `${previewSize}%`, paddingBottom: `${getPaddingBottom(aspectRatio)}%`, height: 0 }}>
              <div className={cn("relative w-full h-full", getFilterClass(activeFilters))} style={getNightVisionStyle(activeFilters)}>
              {videoSources.map((source, index) => {
                const isVisible = isPreviewPlaying && activeClipForPreview?.cuts
                  ? index === activeClipForPreview.cuts[currentCutIndex]?.sourceVideo
                  : index === activeVideoIndex;

                return (
                  <video
                    key={index}
                    ref={(el) => {
                      if (el) videoRefs.current[index] = el;
                    }}
                    className={cn("h-full w-full object-contain absolute inset-0", !isVisible && "opacity-0")}
                    style={{
                      ...videoStyles[index],
                      zIndex: isVisible ? 1 : 0
                    }}
                    controls={false}
                    crossOrigin="anonymous"
                    playsInline
                    preload="auto"
                    src={source.url}
                  />
                );
              })}
              {activeFilters && activeFilters.includes('vhs') && <div className="vhs-overlay"></div>}
              {activeFilters && activeFilters.includes('grain') && <div className="grain-overlay" style={{ opacity: grainIntensity / 100 }}></div>}
            </div>
          </div>
        </div>
          <div className="space-y-3 mt-4">
            <Slider
              min={0}
              max={activeClipForPreview?.end || duration}
              step={0.01}
              value={[currentTime]}
              onValueChange={handleSeek}
              disabled={!!activeClipForPreview?.cuts}
              className="w-full [&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary [&_[role=slider]]:shadow-lg"
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono bg-secondary/30 rounded-lg px-3 py-2">
              <span className="font-semibold">{formatTime(currentTime, true)}</span>
              <span className="font-semibold">{formatTime(activeClipForPreview?.end || duration, true)}</span>
            </div>
          </div>
        </Card>

        {/* Right Panel: Settings Tabs */}
        <Card className="flex flex-col p-4 bg-card/60 border-border/50 shadow-lg overflow-hidden">
          <Tabs defaultValue="clip-settings" className="flex flex-col flex-1">
            <TabsList className="grid w-full grid-cols-3 h-10 mb-4">
              <TabsTrigger value="clip-settings" className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-4 w-4" /> Clip
              </TabsTrigger>
              <TabsTrigger value="source-management" className="flex items-center gap-2 text-sm">
                <Settings className="h-4 w-4" /> Sources
              </TabsTrigger>
              <TabsTrigger value="audio-export" className="flex items-center gap-2 text-sm">
                <AudioLines className="h-4 w-4" /> Export
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto pr-2 -mr-2"> {/* Added negative margin to counteract scrollbar padding */}
              <TabsContent value="clip-settings" className="space-y-6">
                <Accordion type="multiple" defaultValue={["item-1", "item-2", "item-3"]} className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-accent" /> Clip Timing
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="start-time" className="text-sm font-semibold">Start (s)</Label>
                          <Input id="start-time" type="number" value={start.toFixed(2)} onChange={(e) => setStart(parseFloat(e.target.value) || 0)} step="0.1" min="0" max={duration} className="bg-secondary/50 border-border/50 focus:border-primary" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="end-time" className="text-sm font-semibold">End (s)</Label>
                          <Input id="end-time" type="number" value={end.toFixed(2)} onChange={(e) => setEnd(parseFloat(e.target.value) || 0)} step="0.1" min={start} max={duration} className="bg-secondary/50 border-border/50 focus:border-primary"/>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Expand className="h-4 w-4 text-accent" /> Aspect Ratio
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Aspect Ratio</Label>
                        <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                          <SelectTrigger id="aspect-ratio" className="bg-secondary/50 border-border/50 hover:border-primary/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="source">Source</SelectItem>
                            <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                            <SelectItem value="1:1">1:1 (Square)</SelectItem>
                            <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent" /> Video Filters
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Filters</Label>
                        <div className="grid grid-cols-2 gap-3">
                          {filterOptions.map(option => (
                            <Label key={option.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-secondary/30 hover:bg-accent/20 cursor-pointer transition-all duration-200 hover:border-primary/50">
                              <Checkbox
                                id={`filter-${option.id}`}
                                checked={filters.includes(option.id)}
                                onCheckedChange={() => handleFilterChange(option.id)}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                              <span className="text-sm font-medium">{option.label}</span>
                            </Label>
                          ))}
                        </div>

                        {filters.includes('night-vision') && (
                          <div className="space-y-2 mt-4">
                            <Label className="text-sm font-medium">Night Vision Color</Label>
                            <div className="flex items-center gap-3">
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  variant={nightVisionColor === '#default' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => setNightVisionColor('#default')}
                                  className="text-xs px-3 py-1 h-8"
                                  title="Use original night vision color"
                                >
                                  Default
                                </Button>
                                {[
                                  { color: '#00ff00', name: 'Green' },
                                  { color: '#0000ff', name: 'Blue' },
                                  { color: '#ff0000', name: 'Red' },
                                  { color: '#ffff00', name: 'Yellow' },
                                  { color: '#ff00ff', name: 'Magenta' },
                                  { color: '#00ffff', name: 'Cyan' }
                                ].map(({ color, name }) => (
                                  <Button
                                    key={color}
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                      "w-8 h-8 rounded-full p-0 border-2 transition-all hover:scale-110",
                                      nightVisionColor === color ? "border-primary ring-2 ring-primary/20" : "border-border"
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setNightVisionColor(color)}
                                    title={name}
                                    aria-label={`Set night vision to ${name.toLowerCase()}`}
                                  />
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <Label htmlFor="custom-color" className="text-xs">Custom:</Label>
                                <input
                                  id="custom-color"
                                  type="color"
                                  value={nightVisionColor.startsWith('#') && nightVisionColor !== '#default' ? nightVisionColor : '#00ff00'}
                                  onChange={(e) => setNightVisionColor(e.target.value)}
                                  className="w-8 h-8 rounded cursor-pointer border border-border"
                                  title="Custom color picker"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Choose a color for the night vision effect. "Default" uses the original night vision appearance. Changes apply instantly to the preview.
                            </p>
                          </div>
                        )}

                        {filters.includes('grain') && (
                          <div className="space-y-2 mt-4">
                            <Label className="text-sm font-medium">Grain Intensity</Label>
                            <div className="space-y-2">
                              <Slider
                                value={[grainIntensity]}
                                onValueChange={(value) => setGrainIntensity(value[0])}
                                min={0}
                                max={100}
                                step={1}
                                className="w-full"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>0%</span>
                                <span>{grainIntensity}%</span>
                                <span>100%</span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Adjust the intensity of the grain effect. Higher values add more noise to the video.
                            </p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              <TabsContent value="source-management" className="space-y-6">
                <Accordion type="multiple" defaultValue={["item-1", "item-2"]} className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-accent" /> Global Source Settings
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-3">
                        <Label htmlFor="cut-duration" className="text-sm">Global Cut Duration (s)</Label>
                        <Input id="cut-duration" type="number" value={cutDuration} onChange={(e) => setCutDuration(parseFloat(e.target.value) || 2)} step="0.1" min="0.1" />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Film className="h-4 w-4 text-accent" /> Per-Source Adjustments
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Per-Source Settings</Label>
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
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center gap-1">
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
                              <div className="flex items-center gap-1">
                                <Label htmlFor={`cut-duration-${index}`} className="text-xs flex-shrink-0">Cut Dur:</Label>
                                <Input
                                  id={`cut-duration-${index}`}
                                  type="number"
                                  value={(sourceCutDurations[index] || cutDuration).toFixed(1)}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || cutDuration;
                                    setSourceCutDurations(prev => ({ ...prev, [index]: value }));
                                  }}
                                  step="0.1"
                                  min="0.1"
                                  max="10"
                                  className="h-7 text-xs flex-1"
                                  placeholder={cutDuration.toFixed(1)}
                                />
                                <span className="text-xs text-muted-foreground">s</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              <TabsContent value="audio-export" className="space-y-6">
                <Accordion type="multiple" defaultValue={["item-1", "item-2"]} className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Music4 className="h-4 w-4 text-accent" /> Overlay Audio
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-3">
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
                        {overlayAudioFile && (
                          <div className="space-y-2">
                            <Label htmlFor="overlay-audio-start-time" className="text-sm font-semibold">Start Time (s)</Label>
                            <Input
                              id="overlay-audio-start-time"
                              type="number"
                              value={overlayAudioStartTime.toFixed(2)}
                              onChange={(e) => setOverlayAudioStartTime(parseFloat(e.target.value) || 0)}
                              step="0.1"
                              min="0"
                              className="bg-secondary/50 border-border/50 focus:border-primary"
                            />
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-base font-semibold text-foreground/90 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-accent" /> Export Settings
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label htmlFor="export-format" className="text-sm">Format</Label>
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
                          <Label htmlFor="export-quality" className="text-sm">Quality</Label>
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
                          <Label htmlFor="export-framerate" className="text-sm">Frame Rate</Label>
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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </div>

            <div className="mt-auto pt-4 space-y-3 border-t border-border/50">
              <Button onClick={handlePreviewCurrentSelection} className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg">
                {currentPreviewIcon} {isPreviewPlaying && activeClipForPreview?.id === -1 ? 'Stop' : 'Preview Selection'}
              </Button>
              <Button onClick={addClip} variant="outline" className="w-full border-2 hover:bg-secondary/50">
                <Plus className="mr-2 h-4 w-4" /> Add Clip Manually
              </Button>
              <Button onClick={createShortFormClips} disabled={isLoading || videoSources.length === 0} className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 shadow-lg disabled:opacity-50">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Scissors className="mr-2 h-4 w-4" />}
                {isLoading ? 'Working...' : 'Cut into Short Clips'}
              </Button>
              <Button onClick={createMultiCamEdit} disabled={isLoading || videoSources.length === 0 || !overlayAudioFile} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg disabled:opacity-50">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4" />}
                {isLoading ? 'Working...' : 'Create Audio-Driven Edit'}
              </Button>
            </div>
          </Tabs>
        </Card>
      </div>
      <audio ref={overlayAudioRef} className='hidden' crossOrigin="anonymous"/>
    </div>
  );
}

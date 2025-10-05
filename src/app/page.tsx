'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import Header from '@/components/clipit/header';
import VideoUploader from '@/components/clipit/video-uploader';
import VideoEditor from '@/components/clipit/video-editor';
import { Globe } from '@/components/ui/globe';

export type VideoFilter = 'none' | 'bw' | 'night-vision' | 'vhs' | 'grain';
export type AspectRatio = '9:16' | '1:1' | '16:9' | 'source';

export type ClipCut = {
  sourceVideo: number;
  start: number;
  end: number;
};

export type Clip = {
  id: number;
  start: number;
  end: number;
  title: string;
  filters: VideoFilter[];
  overlayAudioUrl?: string;
  overlayAudioStartTime?: number;
  isMuted: boolean;
  sourceVideo: number; // Index of the video in the videoUrls array. -1 for multi-cut clips
  cuts?: ClipCut[]; // Optional array for multi-cut sequences
};

export type VideoSource = {
  file: File;
  url: string;
  cutDuration: number; // Duration in seconds for cuts from this source
};

export default function Home() {
  const [videoSources, setVideoSources] = useState<VideoSource[]>([]);

  const handleVideoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const newSources = Array.from(files).map(file => ({
        file,
        url: URL.createObjectURL(file),
        cutDuration: 3 // Default cut duration in seconds
      }));
      setVideoSources(prev => [...prev, ...newSources]);
    }
  };

  const handleRemoveSource = (index: number) => {
    setVideoSources(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    // Cleanup the object URLs when the component unmounts
    return () => {
      videoSources.forEach(source => URL.revokeObjectURL(source.url));
    };
  }, []); // Remove videoSources from dependency to avoid premature URL revocation

  return (
    <div className="flex min-h-screen w-full flex-col bg-background relative overflow-y-auto">
      {/* Subtle background pattern for an OS-like feel */}
      <div className="absolute inset-0 z-0 bg-dot-thick-neutral-800/50 dark:bg-dot-thick-neutral-200/50 pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-background via-background to-secondary/20 opacity-90 pointer-events-none" />

      {/* Magic UI Globe Background - only shown on initial load */}
      {videoSources.length === 0 && (
        <div className="fixed inset-0 -z-10 opacity-20">
          <Globe className="scale-75" />
        </div>
      )}

      <Header />
      <main className="relative z-10 flex flex-1 overflow-y-auto p-2 md:p-4">
        <div className="w-full h-full flex flex-col rounded-xl border border-border/50 bg-card/50 shadow-2xl backdrop-blur-xl">
          {videoSources.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <VideoUploader onVideoUpload={handleVideoUpload} multiple />
            </div>
          ) : (
            <VideoEditor videoSources={videoSources} onVideoUpload={handleVideoUpload} onRemoveSource={handleRemoveSource} />
          )}
        </div>
      </main>
    </div>
  );
}

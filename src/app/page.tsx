'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import Header from '@/components/clipit/header';
import VideoUploader from '@/components/clipit/video-uploader';
import VideoEditor from '@/components/clipit/video-editor';

export type VideoFilter = 'none' | 'bw' | 'night-vision' | 'vhs';
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
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Header />
      <main className="flex-1 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-7xl">
          {videoSources.length === 0 ? (
            <VideoUploader onVideoUpload={handleVideoUpload} multiple />
          ) : (
            <VideoEditor videoSources={videoSources} onVideoUpload={handleVideoUpload} onRemoveSource={handleRemoveSource} />
          )}
        </div>
      </main>
    </div>
  );
}

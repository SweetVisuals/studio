'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import Header from '@/components/clipit/header';
import VideoUploader from '@/components/clipit/video-uploader';
import VideoEditor from '@/components/clipit/video-editor';

export type Clip = {
  id: number;
  start: number;
  end: number;
  title: string;
  captions: string;
};

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    }
  };

  useEffect(() => {
    // Cleanup the object URL when the component unmounts
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Header />
      <main className="flex-1 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-6xl">
          {!videoUrl ? (
            <VideoUploader onVideoUpload={handleVideoUpload} />
          ) : (
            <VideoEditor videoUrl={videoUrl} videoRef={videoRef} />
          )}
        </div>
      </main>
    </div>
  );
}

import type { ChangeEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UploadCloud } from 'lucide-react';

type VideoUploaderProps = {
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  multiple?: boolean;
};

export default function VideoUploader({ onVideoUpload, multiple = false }: VideoUploaderProps) {
  return (
    <Card className="mx-auto max-w-3xl text-center">
      <CardHeader>
        <CardTitle className="font-headline text-3xl">Upload Your Videos</CardTitle>
        <CardDescription>
          Drag and drop or click to select one or more videos to start clipping.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center p-6">
          <label
            htmlFor="video-upload"
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border p-12 transition-colors hover:border-primary hover:bg-accent/10"
          >
            <UploadCloud className="h-12 w-12 text-muted-foreground" />
            <span className="font-semibold text-foreground">Click to upload</span>
            <span className="text-sm text-muted-foreground">
              MP4, MOV, or WEBM
            </span>
            <input
              id="video-upload"
              type="file"
              className="sr-only"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={onVideoUpload}
              multiple={multiple}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

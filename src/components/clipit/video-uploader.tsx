import type { ChangeEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UploadCloud, Sparkles, Film } from 'lucide-react';

type VideoUploaderProps = {
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  multiple?: boolean;
};

export default function VideoUploader({ onVideoUpload, multiple = false }: VideoUploaderProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <Card className="mx-auto max-w-4xl text-center border-0 bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-xl shadow-2xl">
        <CardHeader className="pb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full blur-xl"></div>
              <div className="relative bg-gradient-to-br from-primary to-accent p-4 rounded-full">
                <Film className="h-12 w-12 text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent animate-pulse" />
            </div>
          </div>
          <CardTitle className="font-headline text-4xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Upload Your Videos
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground/80">
            Transform long-form content into engaging short clips with AI-powered editing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <label
              htmlFor="video-upload"
              className="group relative flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-border/50 p-16 transition-all duration-300 hover:border-primary/60 hover:bg-gradient-to-br hover:from-primary/5 hover:to-accent/5 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="relative">
                <UploadCloud className="h-16 w-16 text-muted-foreground/70 group-hover:text-primary transition-colors duration-300" />
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </div>
              <div className="space-y-2">
                <span className="font-semibold text-xl text-foreground group-hover:text-primary transition-colors duration-300">
                  Click to upload
                </span>
                <p className="text-sm text-muted-foreground/70 group-hover:text-muted-foreground transition-colors duration-300">
                  MP4, MOV, or WEBM • Multiple files supported
                </p>
              </div>
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
    </div>
  );
}

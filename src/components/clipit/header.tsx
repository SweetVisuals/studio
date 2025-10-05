import { Clapperboard, Sparkles } from 'lucide-react';

export default function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center border-b border-border/40 bg-background/80 backdrop-blur-xl px-4"> {/* Adjusted padding to px-4 */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Clapperboard className="h-7 w-7 text-primary" />
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-accent animate-pulse" />
          </div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-foreground">
            ClipIt
          </h1>
          <span className="text-sm text-muted-foreground">
              AI Video Editor
            </span>
        </div>
      </div>
    </header>
  );
}

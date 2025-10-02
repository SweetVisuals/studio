import { Clapperboard } from 'lucide-react';

export default function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center border-b bg-card px-4 shadow-sm md:px-6">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-7 w-7 text-primary" />
        <h1 className="font-headline text-2xl font-bold tracking-tight text-foreground">
          ClipIt
        </h1>
      </div>
    </header>
  );
}

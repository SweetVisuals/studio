'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ClipCut, VideoSource } from '@/app/page';
import { RefreshCw } from 'lucide-react';

interface TimelineProps {
  cuts: ClipCut[];
  totalDuration: number;
  onCutsChange: (cuts: ClipCut[]) => void;
  videoDurations: number[];
  onRegenerateCut: (index: number) => void;
  videoSources: VideoSource[];
  globalCutDuration: number;
  className?: string;
}

const sourceColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-yellow-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
];

export default function Timeline({ cuts, totalDuration, onCutsChange, videoDurations, onRegenerateCut, videoSources, globalCutDuration, className }: TimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'move' | 'resize' | 'delete'>('resize');
  const [editingDurationIndex, setEditingDurationIndex] = useState<number | null>(null);
  const [editingDurationValue, setEditingDurationValue] = useState('');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Ensure drag state is reset even if dragend doesn't fire on the element
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDraggedIndex(null);
      setDragOverIndex(null);
    };

    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => window.removeEventListener('dragend', handleGlobalDragEnd);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newCuts = [...cuts];
    const [draggedCut] = newCuts.splice(draggedIndex, 1);
    newCuts.splice(dropIndex, 0, draggedCut);

    onCutsChange(newCuts);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [cuts, draggedIndex, onCutsChange]);

  const handleDelete = useCallback((index: number) => {
    const newCuts = [...cuts];
    const cut = newCuts[index];
    const duration = cut.end - cut.start;
    newCuts[index] = {
      sourceVideo: -1,
      start: 0,
      end: duration
    };
    onCutsChange(newCuts);
  }, [cuts, onCutsChange]);

  const handleSourceDrop = useCallback((e: React.DragEvent, gapIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (isNaN(sourceIndex) || sourceIndex < 0 || sourceIndex >= videoSources.length) return;

    const newCuts = [...cuts];
    const gapCut = newCuts[gapIndex];
    const duration = gapCut.end - gapCut.start;
    const sourceDuration = videoDurations[sourceIndex];

    if (!sourceDuration || sourceDuration <= 0) return;

    // Generate a random start time within the source video
    const maxStart = Math.max(0, sourceDuration - Math.min(duration, globalCutDuration));
    const startTime = Math.random() * maxStart;
    const endTime = startTime + Math.min(duration, globalCutDuration);

    newCuts[gapIndex] = {
      sourceVideo: sourceIndex,
      start: startTime,
      end: endTime
    };

    onCutsChange(newCuts);
  }, [cuts, videoSources, videoDurations, globalCutDuration, onCutsChange]);

  const handleResize = useCallback((index: number, deltaTime: number, side: 'left' | 'right') => {
    const newCuts = [...cuts];
    const cut = newCuts[index];

    if (side === 'left') {
      if (index > 0) {
        // Change start of current cut, end of previous cut
        const newStart = Math.max(0, cut.start + deltaTime);
        newCuts[index] = {
          ...cut,
          start: newStart
        };
        const prevIndex = index - 1;
        const prevCut = newCuts[prevIndex];
        const newPrevEnd = prevCut.end + deltaTime;
        newCuts[prevIndex] = {
          ...prevCut,
          end: newPrevEnd
        };
      } else {
        // First cut, only change start
        const newStart = Math.max(0, cut.start + deltaTime);
        newCuts[index] = {
          ...cut,
          start: newStart
        };
      }
    } else {
      if (index < cuts.length - 1) {
        // Change end of current cut, start of next cut
        const newEnd = Math.max(cut.start + 0.1, cut.end + deltaTime);
        newCuts[index] = {
          ...cut,
          end: newEnd
        };
        const nextIndex = index + 1;
        const nextCut = newCuts[nextIndex];
        const newNextStart = Math.max(0, nextCut.start + deltaTime);
        newCuts[nextIndex] = {
          ...nextCut,
          start: newNextStart
        };
      } else {
        // Last cut, only change end
        const newEnd = Math.max(cut.start + 0.1, cut.end + deltaTime);
        newCuts[index] = {
          ...cut,
          end: newEnd
        };
      }
    }

    onCutsChange(newCuts);
  }, [cuts, onCutsChange]);

  if (!cuts.length) return null;

  return (
    <div className={cn("w-full bg-secondary/30 rounded-lg p-4", className)}>
      <h4 className="text-sm font-medium mb-3 text-foreground/90">Timeline</h4>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('move')}
          className={cn(
            "px-3 py-1 rounded text-sm font-medium transition-colors flex items-center",
            mode === 'move'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          Move
        </button>
        <button
          onClick={() => setMode('resize')}
          className={cn(
            "px-3 py-1 rounded text-sm font-medium transition-colors flex items-center",
            mode === 'resize'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16M15 4v16" />
          </svg>
          Resize
        </button>
        <button
          onClick={() => setMode('delete')}
          className={cn(
            "px-3 py-1 rounded text-sm font-medium transition-colors flex items-center",
            mode === 'delete'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
      <div
        ref={timelineRef}
        className="relative w-full h-16 bg-secondary/50 rounded border border-border/50 overflow-hidden"
      >
        {cuts.map((cut, index) => {
          const cutDuration = cut.end - cut.start;
          const startPercentage = (cuts.slice(0, index).reduce((acc, c) => acc + (c.end - c.start), 0) / totalDuration) * 100;
          const widthPercentage = (cutDuration / totalDuration) * 100;
          const colorClass = cut.sourceVideo === -1 ? 'bg-black' : sourceColors[cut.sourceVideo % sourceColors.length];

          return (
            <div
              key={index}
              draggable={mode === 'move' && cut.sourceVideo !== -1}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => {
                handleDragOver(e, index);
                if (cut.sourceVideo === -1) {
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDragEnd={handleDragEnd}
              onDrop={(e) => {
                if (cut.sourceVideo === -1) {
                  handleSourceDrop(e, index);
                } else {
                  handleDrop(e, index);
                }
              }}
              onClick={() => { if (mode === 'delete' && cut.sourceVideo !== -1) handleDelete(index); }}
              className={cn(
                "absolute top-2 bottom-2 rounded transition-all duration-200 flex items-center justify-center text-white text-xs font-medium border border-white/20",
                mode === 'move' && cut.sourceVideo !== -1 ? 'cursor-move' : mode === 'delete' && cut.sourceVideo !== -1 ? 'cursor-pointer' : cut.sourceVideo === -1 ? 'cursor-copy' : 'cursor-default',
                colorClass,
                draggedIndex === index && "opacity-50 scale-105 z-10",
                dragOverIndex === index && draggedIndex !== index && cut.sourceVideo === -1 && "ring-2 ring-green-500 bg-green-500/20",
                dragOverIndex === index && draggedIndex !== index && cut.sourceVideo !== -1 && "ring-2 ring-primary"
              )}
              style={{
                left: `${startPercentage}%`,
                width: `${widthPercentage}%`,
                minWidth: '40px'
              }}
            >
              <div className="truncate px-1 flex items-center justify-between">
                {editingDurationIndex === index && cut.sourceVideo !== -1 ? (
                  <input
                    type="number"
                    value={editingDurationValue}
                    onChange={(e) => setEditingDurationValue(e.target.value)}
                    onBlur={() => {
                      const newDuration = parseFloat(editingDurationValue);
                      if (!isNaN(newDuration) && newDuration > 0) {
                        const originalDuration = cuts[index].end - cuts[index].start;
                        handleResize(index, newDuration - originalDuration, 'right');
                      }
                      setEditingDurationIndex(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="bg-transparent border-none outline-none text-white text-xs font-medium w-12"
                    autoFocus
                    step="0.1"
                    min="0.1"
                  />
                ) : (
                  <div
                    onDoubleClick={() => {
                      if (cut.sourceVideo !== -1) {
                        setEditingDurationIndex(index);
                        setEditingDurationValue((cut.end - cut.start).toFixed(2));
                      }
                    }}
                    className="flex-1"
                  >
                    {cut.sourceVideo === -1 ? 'GAP' : `S${cut.sourceVideo + 1}`}
                  </div>
                )}
                {cut.sourceVideo !== -1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateCut(index);
                    }}
                    className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                    title="Regenerate cut timestamps"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>
              {mode === 'resize' && cut.sourceVideo !== -1 && (
                <>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/40"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      const startX = e.clientX;
                      const originalDuration = cutDuration;

                      const handlePointerMove = (moveEvent: PointerEvent) => {
                        const deltaX = moveEvent.clientX - startX;
                        const timelineWidth = timelineRef.current?.clientWidth || 1;
                        const deltaTime = (deltaX / timelineWidth) * totalDuration;
                        handleResize(index, deltaTime, 'left');
                      };

                      const handlePointerUp = () => {
                        document.removeEventListener('pointermove', handlePointerMove);
                        document.removeEventListener('pointerup', handlePointerUp);
                        (e.target as Element).releasePointerCapture(e.pointerId);
                      };

                      document.addEventListener('pointermove', handlePointerMove);
                      document.addEventListener('pointerup', handlePointerUp);
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/40"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      const startX = e.clientX;
                      const originalDuration = cutDuration;

                      const handlePointerMove = (moveEvent: PointerEvent) => {
                        const deltaX = moveEvent.clientX - startX;
                        const timelineWidth = timelineRef.current?.clientWidth || 1;
                        const deltaTime = (deltaX / timelineWidth) * totalDuration;
                        handleResize(index, deltaTime, 'right');
                      };

                      const handlePointerUp = () => {
                        document.removeEventListener('pointermove', handlePointerMove);
                        document.removeEventListener('pointerup', handlePointerUp);
                        (e.target as Element).releasePointerCapture(e.pointerId);
                      };

                      document.addEventListener('pointermove', handlePointerMove);
                      document.addEventListener('pointerup', handlePointerUp);
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>0:00</span>
        <span>{Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(1).padStart(4, '0')}</span>
      </div>

      {/* Sources Section */}
      <div className="mt-4">
        <h5 className="text-sm font-medium mb-3 text-foreground/90">Available Sources</h5>
        <div className="flex flex-wrap gap-2">
          {videoSources.map((source, index) => (
            <div
              key={index}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', index.toString());
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-secondary/30 hover:bg-accent/20 cursor-grab active:cursor-grabbing transition-all duration-200",
                sourceColors[index % sourceColors.length]
              )}
            >
              <span className="text-white text-xs font-medium">S{index + 1}</span>
              <span className="text-white/80 text-xs truncate max-w-20" title={source.file.name}>
                {source.file.name}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Drag sources onto gap cuts to replace them with new cuts using the global cut duration ({globalCutDuration}s).
        </p>
      </div>
    </div>
  );
}
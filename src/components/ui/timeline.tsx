'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ClipCut } from '@/app/page';

interface TimelineProps {
  cuts: ClipCut[];
  totalDuration: number;
  onCutsChange: (cuts: ClipCut[]) => void;
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

export default function Timeline({ cuts, totalDuration, onCutsChange, className }: TimelineProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'move' | 'resize'>('resize');
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

  const handleResize = useCallback((index: number, newDuration: number) => {
    const newCuts = [...cuts];
    const cut = newCuts[index];
    const maxDuration = cuts.reduce((acc, c, i) => i !== index ? acc + (c.end - c.start) : acc, 0);
    const availableTime = totalDuration - maxDuration;

    // Clamp the new duration
    const clampedDuration = Math.max(0.1, Math.min(newDuration, availableTime + (cut.end - cut.start)));

    // Adjust the cut's end time
    newCuts[index] = {
      ...cut,
      end: cut.start + clampedDuration
    };

    onCutsChange(newCuts);
  }, [cuts, totalDuration, onCutsChange]);

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
      </div>
      <div
        ref={timelineRef}
        className="relative w-full h-16 bg-secondary/50 rounded border border-border/50 overflow-hidden"
      >
        {cuts.map((cut, index) => {
          const cutDuration = cut.end - cut.start;
          const startPercentage = (cuts.slice(0, index).reduce((acc, c) => acc + (c.end - c.start), 0) / totalDuration) * 100;
          const widthPercentage = (cutDuration / totalDuration) * 100;
          const colorClass = sourceColors[cut.sourceVideo % sourceColors.length];

          return (
            <div
              key={index}
              draggable={mode === 'move'}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, index)}
              className={cn(
                "absolute top-2 bottom-2 rounded transition-all duration-200 flex items-center justify-center text-white text-xs font-medium border border-white/20",
                mode === 'move' ? 'cursor-move' : 'cursor-default',
                colorClass,
                draggedIndex === index && "opacity-50 scale-105 z-10",
                dragOverIndex === index && draggedIndex !== index && "ring-2 ring-primary"
              )}
              style={{
                left: `${startPercentage}%`,
                width: `${widthPercentage}%`,
                minWidth: '40px'
              }}
            >
              <div className="truncate px-1">
                S{cut.sourceVideo + 1}
              </div>
              {mode === 'resize' && (
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
                        handleResize(index, originalDuration - deltaTime);
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
                        handleResize(index, originalDuration + deltaTime);
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
    </div>
  );
}
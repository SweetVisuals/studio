import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(
  timeInSeconds: number,
  includeMilliseconds = false
): string {
  if (isNaN(timeInSeconds) || timeInSeconds < 0) {
    return includeMilliseconds ? '00:00.000' : '00:00';
  }

  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.floor((timeInSeconds * 1000) % 1000);

  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(
    seconds
  ).padStart(2, '0')}`;

  return includeMilliseconds
    ? `${formattedTime}.${String(milliseconds).padStart(3, '0')}`
    : formattedTime;
}

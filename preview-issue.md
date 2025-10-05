# Clip Preview Issue Analysis

## Problem Description
The clip preview for multi-camera edited clips is not functioning correctly. When previewing a multi-cut clip (created via "Create Audio-Driven Edit"), the preview only plays the first cut segment and does not advance to subsequent cuts. The clip shows the correct total duration (e.g., 00:34) and number of cuts (e.g., 12), but playback stops after approximately 8 seconds instead of playing the full edited sequence.

## Expected Behavior
- Multi-cut clips should play sequentially through all cuts
- Each cut should switch to the appropriate video source at the correct start time
- Total playback duration should match the sum of all cut durations
- Video should change sources every 3 seconds (or cut duration) as defined by the cuts array

## Current Implementation
The preview logic in `video-editor.tsx` uses:
- `useEffect` to handle time updates and advance cuts
- Refs to track current state (activeClipForPreview, currentCutIndex, etc.)
- Logic to switch video sources and set currentTime for each cut

### Key Code Sections
1. **Time Update Handler**: Checks if `video.currentTime >= cut.end` to advance to next cut
2. **Play Logic**: Sets `video.currentTime = cut.start` and calls `play()` for each cut
3. **Source Switching**: Changes `activeVideoIndex` when cuts require different sources

## Identified Issues
1. **Handler Removal During Execution**: The timeupdate event handler may be removed by `useEffect` cleanup while it's still executing, interrupting the advancement logic.

2. **Async State Updates**: `setCurrentCutIndex` is asynchronous, and the handler may not have the updated values when checking conditions.

3. **Video Playback State**: Setting `currentTime` while video is playing may not reliably trigger proper advancement.

4. **Ref Update Timing**: Refs are updated via `useEffect`, but the timing relative to handler execution may cause stale values.

## Attempts to Fix
1. **Used Refs**: Replaced closure variables with refs to avoid stale closures
2. **Stable Handler**: Moved handler to a `useEffect` with empty dependencies to prevent re-creation
3. **Pause Before Seek**: Added `video.pause()` before setting `currentTime` to ensure clean state transitions

## Root Cause Hypothesis
The primary issue appears to be the interaction between:
- Asynchronous state updates (`setCurrentCutIndex`)
- Event handler execution timing
- Video element state management during source switches

The handler may execute with outdated `currentCutIndex` values, preventing proper advancement through cuts.

## Potential Solutions
1. **Synchronous Cut Advancement**: Use a ref-based approach with direct manipulation instead of state updates
2. **Event-Driven Advancement**: Use video 'ended' events for cuts that reach source end
3. **Timeout-Based Fallback**: Implement a timeout check for cut advancement
4. **Debug Logging**: Add console logs to track handler execution and state changes

## Impact
- Users cannot properly preview multi-camera edited clips
- The editing workflow is broken for clips with multiple cuts
- Export functionality may work (unverified), but preview is essential for editing

## Next Steps
- Implement debug logging to trace handler execution
- Consider rewriting the preview logic with a more robust state management approach
- Test with simpler cases (fewer cuts) to isolate the issue
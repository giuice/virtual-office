// src/hooks/useSpaceDetails.ts
// Story 3.11 - AC3, AC4, AC5: Data Fetching Hook for Space Details
'use client';

import { useEffect, useCallback } from 'react';
import { ActivityLogEntry } from '@/components/floor-plan/modern/ActivityLogPreview';
import { useReducerState } from '@/hooks/useReducerState';

/**
 * Story 3.11 - useSpaceDetails Hook
 * - Fetches agenda, activity log, and transcript for a space
 * - Uses lazy loading (only fetches when spaceId is provided)
 * - Returns loading and error states
 */
export interface SpaceAgenda {
  current: number;
  total: number;
  name: string;
  description?: string;
}

export interface SpaceTranscript {
  text: string;
  speaker: string;
  timestamp: Date;
}

export interface UseSpaceDetailsReturn {
  agenda: SpaceAgenda | null;
  activityLog: ActivityLogEntry[];
  transcript: SpaceTranscript | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch detailed space information
 * 
 * @param spaceId - The ID of the space to fetch details for (null = don't fetch)
 * @returns Space details including agenda, activity log, and transcript
 */
export function useSpaceDetails(spaceId: string | null): UseSpaceDetailsReturn {
  const [details, setDetails] = useReducerState<Pick<UseSpaceDetailsReturn, 'agenda' | 'activityLog' | 'transcript' | 'isLoading' | 'error'>>({
    agenda: null,
    activityLog: [],
    transcript: null,
    isLoading: false,
    error: null,
  });

  const fetchDetails = useCallback(async () => {
    if (!spaceId) {
      setDetails((prev) => ({
        ...prev,
        agenda: null,
        activityLog: [],
        transcript: null,
        error: null,
      }));
      return;
    }

    setDetails((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch space details from API
      // Note: This API endpoint may need to be created
      const response = await fetch(`/api/spaces/${spaceId}/details`);
      
      if (!response.ok) {
        // If endpoint doesn't exist yet, use mock/fallback data
        if (response.status === 404) {
          // Return empty data - graceful degradation
          setDetails({
            agenda: null,
            activityLog: [],
            transcript: null,
            isLoading: false,
            error: null,
          });
          return;
        }
        throw new Error(`Failed to fetch space details: ${response.statusText}`);
      }

      const data = await response.json();

      const nextAgenda = data.agenda
        ? {
          current: data.agenda.current ?? 1,
          total: data.agenda.total ?? 1,
          name: data.agenda.name ?? 'Current Phase',
          description: data.agenda.description,
        }
        : null;

      const nextActivityLog = data.activityLog && Array.isArray(data.activityLog)
        ? data.activityLog.map((entry: Record<string, unknown>) => ({
            id: entry.id as string,
            timestamp: new Date(entry.timestamp as string),
            author: entry.author as string,
            authorId: entry.authorId as string,
            summary: entry.summary as string,
            type: (entry.type as ActivityLogEntry['type']) ?? 'note',
          }))
        : [];

      const nextTranscript = data.transcript
        ? {
          text: data.transcript.text ?? '',
          speaker: data.transcript.speaker ?? 'Unknown',
          timestamp: new Date(data.transcript.timestamp as string),
        }
        : null;

      setDetails({
        agenda: nextAgenda,
        activityLog: nextActivityLog,
        transcript: nextTranscript,
        isLoading: false,
        error: null,
      });

    } catch (err) {
      // Handle errors gracefully - don't break the UI
      console.warn('Failed to fetch space details:', err);
      setDetails({
        agenda: null,
        activityLog: [],
        transcript: null,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Unknown error'),
      });
    } finally {
      setDetails((prev) => ({ ...prev, isLoading: false }));
    }
  }, [spaceId, setDetails]);

  // Fetch on mount and when spaceId changes
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  return {
    agenda: details.agenda,
    activityLog: details.activityLog,
    transcript: details.transcript,
    isLoading: details.isLoading,
    error: details.error,
    refetch: fetchDetails,
  };
}

export default useSpaceDetails;

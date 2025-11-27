// src/hooks/useSpaceDetails.ts
// Story 3.11 - AC3, AC4, AC5: Data Fetching Hook for Space Details
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ActivityLogEntry } from '@/components/floor-plan/modern/ActivityLogPreview';

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
  const [agenda, setAgenda] = useState<SpaceAgenda | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [transcript, setTranscript] = useState<SpaceTranscript | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!spaceId) {
      // Clear state when no space selected
      setAgenda(null);
      setActivityLog([]);
      setTranscript(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch space details from API
      // Note: This API endpoint may need to be created
      const response = await fetch(`/api/spaces/${spaceId}/details`);
      
      if (!response.ok) {
        // If endpoint doesn't exist yet, use mock/fallback data
        if (response.status === 404) {
          // Return empty data - graceful degradation
          setAgenda(null);
          setActivityLog([]);
          setTranscript(null);
          setIsLoading(false);
          return;
        }
        throw new Error(`Failed to fetch space details: ${response.statusText}`);
      }

      const data = await response.json();

      // Parse agenda data from space metadata
      if (data.agenda) {
        setAgenda({
          current: data.agenda.current ?? 1,
          total: data.agenda.total ?? 1,
          name: data.agenda.name ?? 'Current Phase',
          description: data.agenda.description,
        });
      } else {
        setAgenda(null);
      }

      // Parse activity log entries
      if (data.activityLog && Array.isArray(data.activityLog)) {
        setActivityLog(
          data.activityLog.map((entry: Record<string, unknown>) => ({
            id: entry.id as string,
            timestamp: new Date(entry.timestamp as string),
            author: entry.author as string,
            authorId: entry.authorId as string,
            summary: entry.summary as string,
            type: (entry.type as ActivityLogEntry['type']) ?? 'note',
          }))
        );
      } else {
        setActivityLog([]);
      }

      // Parse transcript snippet
      if (data.transcript) {
        setTranscript({
          text: data.transcript.text ?? '',
          speaker: data.transcript.speaker ?? 'Unknown',
          timestamp: new Date(data.transcript.timestamp as string),
        });
      } else {
        setTranscript(null);
      }

    } catch (err) {
      // Handle errors gracefully - don't break the UI
      console.warn('Failed to fetch space details:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      // Set empty data on error
      setAgenda(null);
      setActivityLog([]);
      setTranscript(null);
    } finally {
      setIsLoading(false);
    }
  }, [spaceId]);

  // Fetch on mount and when spaceId changes
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  return {
    agenda,
    activityLog,
    transcript,
    isLoading,
    error,
    refetch: fetchDetails,
  };
}

export default useSpaceDetails;

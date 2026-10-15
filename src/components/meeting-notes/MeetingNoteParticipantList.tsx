// src/components/meeting-notes/MeetingNoteParticipantList.tsx
// Participants in the note view (FR-005, FR-030): current members with their
// avatar; anyone who is no longer a member as "Former member" with the name
// snapshot the note keeps.
'use client';

import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { useCompany } from '@/contexts/CompanyContext';
import type { MeetingNoteParticipant } from '@/types/meeting-notes';

export interface MeetingNoteParticipantListProps {
  participants: MeetingNoteParticipant[];
}

export function MeetingNoteParticipantList({ participants }: MeetingNoteParticipantListProps) {
  const { companyUsers } = useCompany();
  const membersById = useMemo(() => new Map(companyUsers.map((user) => [user.id, user])), [companyUsers]);

  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">No participants.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2" data-testid="meeting-note-participants">
      {participants.map((participant) => {
        const member = participant.isCurrentMember ? membersById.get(participant.userId) : undefined;
        return (
          <li
            key={participant.userId}
            className="flex items-center gap-2 rounded-full border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] py-1 pl-1 pr-3 text-sm"
            data-testid="meeting-note-participant"
            data-former-member={participant.isCurrentMember ? undefined : 'true'}
          >
            <EnhancedAvatarV2 user={member ?? null} fallbackName={participant.displayName} size="sm" className="size-6" />
            <span className="max-w-[14rem] truncate">{participant.displayName}</span>
            {participant.isCurrentMember ? null : (
              <Badge variant="outline" className="text-[10px]" data-testid="meeting-note-former-member">
                Former member
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

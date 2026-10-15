// src/components/meeting-notes/MeetingNoteActionItemAssignee.tsx
// An action item's assignee (FR-011, FR-030): a current member with their
// avatar; someone who left as "Former member" with the name snapshot the item
// keeps; or "Unassigned".
'use client';

import { Badge } from '@/components/ui/badge';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import type { User } from '@/types/database';
import type { MeetingNoteActionItemView } from '@/types/meeting-notes';

export interface MeetingNoteActionItemAssigneeProps {
  item: Pick<MeetingNoteActionItemView, 'assigneeId' | 'assigneeName' | 'assigneeIsCurrentMember'>;
  membersById: ReadonlyMap<string, User>;
}

export function MeetingNoteActionItemAssignee({ item, membersById }: MeetingNoteActionItemAssigneeProps) {
  if (item.assigneeId === null) {
    return (
      <span className="text-muted-foreground" data-testid="meeting-note-item-assignee" data-unassigned="true">
        Unassigned
      </span>
    );
  }
  const current = item.assigneeIsCurrentMember === true;
  const member = current ? membersById.get(item.assigneeId) : undefined;
  const name = member?.displayName ?? item.assigneeName ?? 'Unknown member';
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      data-testid="meeting-note-item-assignee"
      data-former-member={current ? undefined : 'true'}
    >
      <EnhancedAvatarV2 user={member ?? null} fallbackName={name} size="sm" className="size-5" />
      <span className="max-w-[12rem] truncate">{name}</span>
      {current ? null : (
        <Badge variant="outline" className="text-[10px]">
          Former member
        </Badge>
      )}
    </span>
  );
}

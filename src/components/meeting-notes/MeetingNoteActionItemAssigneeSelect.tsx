// src/components/meeting-notes/MeetingNoteActionItemAssigneeSelect.tsx
// The assignee of an action item (FR-011, FR-030): "Unassigned" or one of the
// company's current members. A former member who is already the assignee stays
// selectable (shown as "Former member") so an edit keeps them unless changed;
// the database accepts only current members as a NEW assignee.
'use client';

import { useMemo } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User } from '@/types/database';

const UNASSIGNED = '__unassigned__';

export interface MeetingNoteActionItemAssigneeSelectProps {
  id: string;
  /** users.id, or null for unassigned. */
  value: string | null;
  members: readonly User[];
  /**
   * The item's stored assignee, kept as an option when it is not in `members`
   * (a former member, or a member list still loading).
   */
  storedAssignee: { id: string; name: string; isFormerMember: boolean } | null;
  disabled?: boolean;
  invalid?: boolean;
  describedById?: string;
  onChange: (assigneeId: string | null) => void;
}

export function MeetingNoteActionItemAssigneeSelect({
  id,
  value,
  members,
  storedAssignee,
  disabled = false,
  invalid = false,
  describedById,
  onChange,
}: MeetingNoteActionItemAssigneeSelectProps) {
  const sorted = useMemo(
    () => [...members].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members]
  );
  const extra = storedAssignee && !members.some((member) => member.id === storedAssignee.id) ? storedAssignee : null;

  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(next) => onChange(next === UNASSIGNED ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className="h-9"
        aria-invalid={invalid ? 'true' : 'false'}
        aria-describedby={describedById}
        data-testid="meeting-note-item-assignee-select"
      >
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent onKeyDown={(event) => event.stopPropagation()}>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {extra ? (
          <SelectItem value={extra.id}>{extra.isFormerMember ? `${extra.name} (Former member)` : extra.name}</SelectItem>
        ) : null}
        {sorted.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

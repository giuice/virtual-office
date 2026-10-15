// src/components/meeting-notes/MeetingNoteParticipantPicker.tsx
// Participants of a note (FR-001, FR-030): up to 50, new ones chosen from
// the company's current members only. A participant who is no longer a
// member stays listed as "Former member" with the name snapshot; it can be
// removed, or kept when the note is saved. The database re-checks both rules.
'use client';

import { Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MEETING_NOTE_LIMITS } from '@/lib/meeting-notes/validation';
import type { User } from '@/types/database';
import type { MeetingNoteParticipant } from '@/types/meeting-notes';

export interface MeetingNoteParticipantPickerProps {
  /** id of the field's visible label. */
  labelId: string;
  describedById?: string;
  value: MeetingNoteParticipant[];
  /** The company's current members. */
  members: readonly User[];
  disabled?: boolean;
  onChange: (next: MeetingNoteParticipant[]) => void;
}

const MAX_RESULTS = 50;

export function MeetingNoteParticipantPicker({
  labelId,
  describedById,
  value,
  members,
  disabled = false,
  onChange,
}: MeetingNoteParticipantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selectedIds = useMemo(() => new Set(value.map((participant) => participant.userId)), [value]);
  const full = value.length >= MEETING_NOTE_LIMITS.maxParticipants;

  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return members
      .filter((member) => !selectedIds.has(member.id))
      .filter(
        (member) =>
          needle === '' ||
          member.displayName.toLocaleLowerCase().includes(needle) ||
          member.email.toLocaleLowerCase().includes(needle)
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, MAX_RESULTS);
  }, [members, query, selectedIds]);

  const add = (member: User) => {
    if (full || selectedIds.has(member.id)) return;
    onChange([...value, { userId: member.id, displayName: member.displayName, isCurrentMember: true }]);
  };

  const remove = (userId: string) => {
    onChange(value.filter((participant) => participant.userId !== userId));
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId} aria-describedby={describedById}>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No participants yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="meeting-note-participant-picker-list">
          {value.map((participant) => {
            const member = participant.isCurrentMember ? membersById.get(participant.userId) : undefined;
            return (
              <li
                key={participant.userId}
                className="flex items-center gap-2 rounded-full border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] py-1 pl-1 pr-1.5 text-sm"
                data-testid="meeting-note-participant-chip"
                data-former-member={participant.isCurrentMember ? undefined : 'true'}
              >
                <EnhancedAvatarV2 user={member ?? null} fallbackName={participant.displayName} size="sm" className="size-6" />
                <span className="max-w-[12rem] truncate">{participant.displayName}</span>
                {participant.isCurrentMember ? null : (
                  <Badge variant="outline" className="text-[10px]">
                    Former member
                  </Badge>
                )}
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--vo-hover-bg)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  aria-label={`Remove ${participant.displayName}`}
                  disabled={disabled}
                  onClick={() => remove(participant.userId)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery('');
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={disabled || full}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add participants
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 p-2"
            aria-label="Add participants"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members"
                aria-label="Search members"
                className="h-9 pl-8"
                autoComplete="off"
              />
            </div>
            {candidates.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {members.length === 0 ? 'Members are still loading.' : 'No other members match.'}
              </p>
            ) : (
              <ul className="mt-2 max-h-64 overflow-y-auto" aria-label="Company members">
                {candidates.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--vo-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                      aria-label={`Add ${member.displayName}`}
                      disabled={full}
                      onClick={() => add(member)}
                      data-testid="meeting-note-participant-option"
                    >
                      <EnhancedAvatarV2 user={member} size="sm" className="size-6" />
                      <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {value.length}/{MEETING_NOTE_LIMITS.maxParticipants}
          {full ? ' — limit reached' : ''}
        </span>
      </div>
    </div>
  );
}

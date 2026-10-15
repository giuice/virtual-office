// src/components/meeting-notes/editor/MeetingNoteLinkControl.tsx
// Toolbar control that adds, changes, or removes a link (FR-002): only
// http, https, and mailto targets are accepted; "example.com" becomes
// https://example.com and "ana@example.com" becomes mailto:ana@example.com.
'use client';

import type { Editor } from '@tiptap/core';
import { Link2 } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { normalizeMeetingNoteLinkInput } from '@/lib/meeting-notes/link-url';
import { toolbarButtonClass } from './toolbar-styles';

export interface MeetingNoteLinkControlProps {
  editor: Editor | null;
  disabled: boolean;
  active: boolean;
  currentHref: string;
  tabIndex: number;
  onFocus: () => void;
}

export function MeetingNoteLinkControl({
  editor,
  disabled,
  active,
  currentHref,
  tabIndex,
  onFocus,
}: MeetingNoteLinkControlProps) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setValue(currentHref);
      setError(null);
    }
    setOpen(next);
  };

  const apply = () => {
    if (!editor) return;
    const href = normalizeMeetingNoteLinkInput(value);
    if (!href) {
      setError('Enter a web address (http or https) or an email address.');
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !active) {
      // No selected text: insert the address itself as the link text.
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    setOpen(false);
  };

  const remove = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpen(false);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-toolbar-control
          className={toolbarButtonClass}
          aria-label="Link"
          title="Link"
          aria-pressed={active}
          disabled={disabled}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Link2 className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80"
        onKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          // Return to the text, not to the toolbar button.
          event.preventDefault();
          editor?.commands.focus();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Link address</Label>
          <Input
            id={inputId}
            value={value}
            placeholder="https://example.com"
            autoComplete="off"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={onInputKeyDown}
          />
          {error ? (
            <p id={errorId} className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {active ? (
              <Button type="button" size="sm" variant="ghost" onClick={remove}>
                Remove link
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

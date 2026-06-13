// src/components/messaging/EmojiPicker.tsx
'use client';

import { useState, useMemo, useCallback, useRef, type ReactElement } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { debugLogger } from '@/utils/debug-logger';

const FREQUENTLY_USED_EMOJIS = [
  '👍', '❤️', '😂', '😊', '🎉', '🔥', '👏', '✅'
];

const ALL_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
  '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
  '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
  '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
  '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
  '🤢', '🤮', '🤧', '🥵', '🥶', '😵', '🤯', '🤠',
  '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️',
  '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨',
  '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
  '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️',
  '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇',
  '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪',
  '🦾', '🖕', '✍️', '🙏', '🦶', '🦵', '👂', '🦻',
  '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
  '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️',
  '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉',
  '⚽', '⚾', '🥎', '🏀', '🏐', '🏈', '🏉', '🎾',
  '🥏', '🎳', '🏏', '🏑', '🏒', '🥍', '🏓', '🏸',
  '🔥', '⭐', '✨', '💫', '💥', '💢', '💦', '💨',
  '✅', '❌', '⭕', '🔴', '🟠', '🟡', '🟢', '🔵'
];

const EMOJI_BUTTON_SELECTOR = '[data-emoji-button="true"]';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  trigger?: ReactElement | null;
  className?: string;
  disabled?: boolean;
}

export function EmojiPicker({
  onEmojiSelect,
  trigger,
  className,
  disabled = false,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const filteredEmojis = useMemo(() => {
    if (!search) return ALL_EMOJIS;
    return ALL_EMOJIS.filter(emoji => emoji.includes(search));
  }, [search]);

  const focusTrigger = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const node = triggerRef.current;
    if (!node) {
      return;
    }
    window.requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
    });
  }, []);

  const closePicker = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        return prev;
      }
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.info('emoji-picker', 'close', {
          reason: 'programmatic',
        });
      }
      setSearch('');
      focusTrigger();
      return false;
    });
  }, [focusTrigger]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.info('emoji-picker', 'select', { emoji });
    }
    onEmojiSelect(emoji);
    closePicker();
  }, [closePicker, onEmojiSelect]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setOpen(true);
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.info('emoji-picker', 'open', {});
      }
      return;
    }
    closePicker();
  }, [closePicker]);

  const handleContentPointerDown = useCallback((event: React.PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(EMOJI_BUTTON_SELECTOR)) {
      return;
    }
    event.stopPropagation();
  }, []);

  const handleContentClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(EMOJI_BUTTON_SELECTOR)) {
      return;
    }
    event.stopPropagation();
  }, []);

  const handleContentKeyDown = useCallback((event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(EMOJI_BUTTON_SELECTOR)) {
      return;
    }
    event.stopPropagation();
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ? (
          trigger
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-7", className)}
            data-testid="message-reaction-trigger"
            data-avatar-interactive
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            ref={triggerRef}
          >
            <Smile className="size-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2"
        data-avatar-interactive
        onPointerDown={handleContentPointerDown}
        onClick={handleContentClick}
        onKeyDown={handleContentKeyDown}
        onEscapeKeyDown={closePicker}
      >
        <div className="space-y-2">
          <div>
            <div className="text-xs font-semibold mb-2 text-muted-foreground">
              Frequently Used
            </div>
            <div className="grid grid-cols-8 gap-1">
              {FREQUENTLY_USED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-2xl hover:bg-accent rounded p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  data-emoji-button="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEmojiSelect(emoji);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-2">
            <Input
              placeholder="Search emojis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm mb-2"
              autoFocus
            />
            <div className="text-xs font-semibold mb-2 text-muted-foreground">
              All Emojis
            </div>
            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
              {filteredEmojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  className="text-2xl hover:bg-accent rounded p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  data-emoji-button="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEmojiSelect(emoji);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

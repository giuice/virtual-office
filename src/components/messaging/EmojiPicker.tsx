// src/components/messaging/EmojiPicker.tsx
'use client';

import { useState, useMemo } from 'react';
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

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
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

  const filteredEmojis = useMemo(() => {
    if (!search) return ALL_EMOJIS;
    return ALL_EMOJIS.filter(emoji => emoji.includes(search));
  }, [search]);

  const handleEmojiClick = (emoji: string) => {
    debugLogger.messaging.event('emoji-picker', 'emoji-selected', { emoji });
    onEmojiSelect(emoji);
    setOpen(false);
    setSearch('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      debugLogger.messaging.event('emoji-picker', 'opened', {});
    } else {
      debugLogger.messaging.event('emoji-picker', 'closed', {});
      setSearch('');
    }
  };

  const handleContentInteraction = (e: React.MouseEvent | React.KeyboardEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger || (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", className)}
            data-testid="message-reaction-trigger"
            data-avatar-interactive
            onClick={(e) => e.stopPropagation()}
          >
            <Smile className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-2"
        data-avatar-interactive
        onPointerDown={handleContentInteraction}
        onClick={handleContentInteraction}
        onKeyDown={handleContentInteraction}
        onEscapeKeyDown={() => setOpen(false)}
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
                  onClick={() => handleEmojiClick(emoji)}
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
                  onClick={() => handleEmojiClick(emoji)}
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

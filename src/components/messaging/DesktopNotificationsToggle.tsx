// src/components/messaging/DesktopNotificationsToggle.tsx
'use client';

import { useState } from 'react';
import { AlertCircle, Bell, BellOff, BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDesktopNotificationSetting } from '@/hooks/ui/use-message-notifications';
import type { DesktopNotificationStatus } from '@/lib/messaging/desktop-notifications';

const LABELS: Record<DesktopNotificationStatus, string> = {
  available: 'Ativar notificações',
  enabled: 'Notificações ativadas',
  blocked: 'Notificações bloqueadas no navegador',
  unsupported: 'Notificações indisponíveis neste navegador',
};

const TITLES: Record<DesktopNotificationStatus, string> = {
  available: 'Ativar notificações de novas mensagens diretas e de grupo',
  enabled: 'Notificações ativadas. Clique para desativar.',
  blocked: 'Notificações bloqueadas no navegador. Clique para ver como permitir.',
  unsupported: 'Este navegador não oferece notificações na área de trabalho.',
};

interface DesktopNotificationsToggleProps {
  /** users.id of the signed-in user (the opt-in is kept per user and browser). */
  currentUserId: string | undefined;
}

/**
 * Drawer header control for desktop notifications (Phase 4 FR-023). The
 * browser permission is requested only from this button, never on load.
 */
export function DesktopNotificationsToggle({ currentUserId }: DesktopNotificationsToggleProps) {
  const { status, enable, disable } = useDesktopNotificationSetting(currentUserId);
  const [helpRequested, setHelpRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const showBlockedHelp = helpRequested && status === 'blocked';

  const handleClick = async () => {
    if (status === 'enabled') {
      disable();
      return;
    }
    if (status === 'blocked') {
      setHelpRequested(true);
      return;
    }
    if (status !== 'available' || requesting) return;
    setRequesting(true);
    try {
      const next = await enable();
      setHelpRequested(next === 'blocked');
    } finally {
      setRequesting(false);
    }
  };

  const Icon = status === 'enabled' ? BellRing : status === 'available' ? Bell : BellOff;

  // The notice is positioned against the drawer (the nearest positioned
  // ancestor), spanning its width under the header.
  return (
    <div
      className="flex"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showBlockedHelp) {
          event.stopPropagation();
          setHelpRequested(false);
        }
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => void handleClick()}
        disabled={status === 'unsupported'}
        aria-busy={requesting || undefined}
        aria-label={LABELS[status]}
        aria-pressed={status === 'enabled' || status === 'available' ? status === 'enabled' : undefined}
        title={TITLES[status]}
        data-testid="messaging-notifications-toggle"
        data-notification-status={status}
      >
        <Icon className="size-3" aria-hidden="true" />
      </Button>
      {showBlockedHelp && (
        <div
          role="alert"
          className="absolute inset-x-3 top-12 z-20 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 shadow-md dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
          data-testid="messaging-notifications-blocked-help"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            As notificações estão bloqueadas no navegador. Para recebê-las, permita notificações para este
            site nas configurações do navegador (ícone ao lado do endereço) e ative-as aqui de novo.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            onClick={() => setHelpRequested(false)}
            aria-label="Fechar aviso"
          >
            <X className="size-3" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

import type { RefObject } from 'react';

interface EmbeddedAuthFormErrorProps {
  message: string | null;
  errorRef: RefObject<HTMLDivElement | null>;
}

export function EmbeddedAuthFormError({ message, errorRef }: EmbeddedAuthFormErrorProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={errorRef}
      aria-live="assertive"
      className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

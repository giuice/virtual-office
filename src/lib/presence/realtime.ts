export const PRESENCE_REALTIME_PAYLOAD_VERSION = 1 as const;

export function presenceRealtimeTopic(companyId: string): string {
  return `company:${companyId}:presence`;
}


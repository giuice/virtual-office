export const KNOCK_INVALIDATED_EVENT = 'knock-invalidated';

export function knockChannelTopic(companyId: string): string {
  return `company:${companyId}:knock`;
}

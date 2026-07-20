export const presenceQueryKeys = {
  all: ["presence"] as const,
  company: (companyId: string) =>
    [...presenceQueryKeys.all, companyId] as const,
  user: (companyId: string, userId: string) =>
    [...presenceQueryKeys.company(companyId), userId] as const,
  snapshot: (companyId: string, userId: string) =>
    [...presenceQueryKeys.user(companyId, userId), "snapshot"] as const,
};

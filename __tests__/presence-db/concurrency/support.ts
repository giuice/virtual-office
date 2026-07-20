export const isPresenceConcurrencyHarnessIteration =
  process.env.PRESENCE_CONCURRENCY_SINGLE_ITERATION === "1";

export function presenceConcurrencyTestName(
  tag: string,
  description: string,
): string {
  return `[presence-concurrency:${tag}] ${description}`;
}

export function standardOrHarnessIterations(
  standardIterations: number,
): number {
  return isPresenceConcurrencyHarnessIteration ? 1 : standardIterations;
}

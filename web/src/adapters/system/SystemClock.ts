import type { Clock } from "../../domain/ports/Clock";

export const systemClock: Clock = {
  now: () => new Date(),
};

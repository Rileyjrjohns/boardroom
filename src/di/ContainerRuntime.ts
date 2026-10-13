import type { Clock } from '@application/ports/Clock';
import type { Monitoring } from '@application/ports/Monitoring';
import type { Sleep } from '@infrastructure/clock/sleep';

/**
 * What the container reads from the outside world, each with a default: the clock of the device,
 * the console, a real timer. A test replaces them to control time and to run without waiting. It
 * is a parameter of the factory and not a global: nothing here is read from a module.
 */
export interface ContainerRuntime {
  readonly clock?: Clock;
  readonly monitoring?: Monitoring;
  /** How the simulated latency is waited for. */
  readonly sleep?: Sleep;
}

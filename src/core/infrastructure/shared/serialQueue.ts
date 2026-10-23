/** Runs a job once everything asked for before it has settled, and gives what the job gave. */
export type SerialQueue = <T>(job: () => Promise<T>) => Promise<T>;

/**
 * A queue that runs jobs one at a time, in the order they were asked for, whether the ones before
 * them succeeded or failed. A failure is for the caller of that job, and does not stop the queue.
 * It is what makes the order of the operations on a connection, on a store of secrets and on a
 * database that is being opened the order in which they were asked.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return (job) => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };
}

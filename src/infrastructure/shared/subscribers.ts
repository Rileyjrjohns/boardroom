/** A set of listeners to call with a value, each subscription being a handle of its own. */
export interface Subscribers<T> {
  /**
   * Adds a listener. The function returned removes this subscription and no other: the same
   * function subscribed twice is two subscriptions, called twice, and removing one leaves the
   * other. Removing a subscription again does nothing.
   */
  subscribe(listener: (value: T) => void): () => void;
  /**
   * Calls every listener with the value, in the order they subscribed. A listener that throws is
   * reported to `onError` and does not stop the others, nor does it escape. A listener that
   * subscribes or unsubscribes while this runs takes effect for the next value.
   */
  notify(value: T): void;
  readonly size: number;
}

/** The listeners of an adapter: see `Subscribers`. */
export function createSubscribers<T>(onError: (error: unknown) => void): Subscribers<T> {
  const subscriptions = new Set<{ readonly listener: (value: T) => void }>();
  return {
    subscribe(listener) {
      const subscription = { listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    notify(value) {
      for (const { listener } of [...subscriptions]) {
        try {
          listener(value);
        } catch (error) {
          onError(error);
        }
      }
    },
    get size() {
      return subscriptions.size;
    },
  };
}

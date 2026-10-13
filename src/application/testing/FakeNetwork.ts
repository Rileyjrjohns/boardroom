/**
 * The connectivity switch shared by the fake remote sources of a test: when it is off, every call
 * to the fake meeting, document and vote repositories fails with `networkUnavailable`.
 */
export class FakeNetwork {
  online = true;

  goOffline(): void {
    this.online = false;
  }

  goOnline(): void {
    this.online = true;
  }
}

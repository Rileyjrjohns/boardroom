import { immediateSleep, recordingSleep } from './sleep';

describe('the sleeps of the tests', () => {
  it('do not wait', async () => {
    await expect(immediateSleep(60_000)).resolves.toBeUndefined();
  });

  it('remember the delays they were asked for, in order', async () => {
    const { sleep, requested } = recordingSleep();

    await sleep(300);
    await sleep(0);

    expect(requested).toEqual([300, 0]);
  });
});

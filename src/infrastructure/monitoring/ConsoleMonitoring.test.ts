import { storageWriteFailed } from '@domain/errors/StorageError';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@application/ports/Monitoring';

import { ConsoleMonitoring } from './ConsoleMonitoring';
import type { ConsoleSink } from './ConsoleMonitoring';

function recordingSink() {
  const calls: { method: 'info' | 'warn' | 'error'; data: unknown[] }[] = [];
  const sink: ConsoleSink = {
    info: (...data) => calls.push({ method: 'info', data }),
    warn: (...data) => calls.push({ method: 'warn', data }),
    error: (...data) => calls.push({ method: 'error', data }),
  };
  return { sink, calls };
}

describe('ConsoleMonitoring', () => {
  it('writes an info event to the info channel, with its attributes', () => {
    const { sink, calls } = recordingSink();

    new ConsoleMonitoring(sink).log(LOG_LEVEL.Info, MONITORING_EVENT.VoteSubmitted, {
      [LOG_ATTRIBUTE.MeetingId]: 'meeting-1',
    });

    expect(calls).toEqual([
      {
        method: 'info',
        data: [expect.any(String), MONITORING_EVENT.VoteSubmitted, { meetingId: 'meeting-1' }],
      },
    ]);
  });

  it('writes a warning to the warn channel, and an event without attributes as an empty object', () => {
    const { sink, calls } = recordingSink();

    new ConsoleMonitoring(sink).log(LOG_LEVEL.Warn, MONITORING_EVENT.ServedFromCache);

    expect(calls).toEqual([
      {
        method: 'warn',
        data: [expect.any(String), MONITORING_EVENT.ServedFromCache, {}],
      },
    ]);
  });

  it('writes a captured error to the error channel, with its code and fields', () => {
    const { sink, calls } = recordingSink();
    const error = storageWriteFailed('disk full');

    new ConsoleMonitoring(sink).captureError(MONITORING_EVENT.CacheWriteFailed, error, {
      [LOG_ATTRIBUTE.Resource]: 'meeting',
    });
    new ConsoleMonitoring(sink).captureError(MONITORING_EVENT.CachePurgeFailed, error);

    expect(calls).toEqual([
      {
        method: 'error',
        data: [
          expect.any(String),
          MONITORING_EVENT.CacheWriteFailed,
          error,
          { resource: 'meeting' },
        ],
      },
      {
        method: 'error',
        data: [expect.any(String), MONITORING_EVENT.CachePurgeFailed, error, {}],
      },
    ]);
  });

  it('never throws, whatever the console does', () => {
    const failing: ConsoleSink = {
      info: () => {
        throw new Error('console is gone');
      },
      warn: () => {
        throw new Error('console is gone');
      },
      error: () => {
        throw new Error('console is gone');
      },
    };
    const monitoring = new ConsoleMonitoring(failing);

    expect(() => monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued)).not.toThrow();
    expect(() => monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.VoteRejected)).not.toThrow();
    expect(() =>
      monitoring.captureError(MONITORING_EVENT.VoteEnqueueFailed, storageWriteFailed()),
    ).not.toThrow();
  });

  it('writes to the global console by default', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    new ConsoleMonitoring().log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued);

    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});

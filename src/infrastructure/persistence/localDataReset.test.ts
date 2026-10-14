import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';

import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';
import { MemorySecureStorage } from '../testing/MemorySecureStorage';

import {
  RESET_REASON,
  clearLocalDataReset,
  hasLocalDataReset,
  markLocalDataReset,
  readLocalDataResetNotice,
} from './localDataReset';

const TIMEOUT = 50;

describe('the record that local data was reset', () => {
  it('is absent at first', async () => {
    expect(await hasLocalDataReset(new MemorySecureStorage(), new FakeMonitoring(), TIMEOUT)).toBe(
      false,
    );
  });

  it('is written with the reason and nothing else, then read, then cleared', async () => {
    const storage = new MemorySecureStorage();
    const monitoring = new FakeMonitoring();

    expect(await markLocalDataReset(storage, RESET_REASON.KeyLost, TIMEOUT)).toBe(true);
    expect(storage.snapshot()).toEqual({
      [SECURE_STORAGE_KEY.LocalDataReset]: RESET_REASON.KeyLost,
    });
    expect(await hasLocalDataReset(storage, monitoring, TIMEOUT)).toBe(true);

    expect(await clearLocalDataReset(storage, TIMEOUT)).toBe(true);
    expect(storage.snapshot()).toEqual({});
    expect(await hasLocalDataReset(storage, monitoring, TIMEOUT)).toBe(false);
  });

  it('says it was not written when the keychain refuses, and when it does not answer', async () => {
    const refusing = new MemorySecureStorage();
    refusing.failNext();
    const silent = new MemorySecureStorage();
    silent.hang();

    expect(await markLocalDataReset(refusing, RESET_REASON.KeyLost, TIMEOUT)).toBe(false);
    expect(await markLocalDataReset(silent, RESET_REASON.KeyLost, TIMEOUT)).toBe(false);
  });

  it('counts a keychain that cannot be read as no record, and captures it', async () => {
    const storage = new MemorySecureStorage();
    storage.seed(SECURE_STORAGE_KEY.LocalDataReset, RESET_REASON.KeyLost);
    storage.failNext();
    const monitoring = new FakeMonitoring();

    expect(await hasLocalDataReset(storage, monitoring, TIMEOUT)).toBe(false);

    expect(monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.ResetNoticeUnreadable,
        error: storageReadFailed('unknown failure'),
        attributes: undefined,
      },
    ]);
  });

  it('says when it could not be cleared', async () => {
    const storage = new MemorySecureStorage();
    storage.failNext();

    expect(await clearLocalDataReset(storage, TIMEOUT)).toBe(false);
  });
});

describe('the notice of a reset', () => {
  it('is not pending when nothing was reset, and has nothing to clear', async () => {
    const storage = new MemorySecureStorage();

    const notice = await readLocalDataResetNotice(storage, new FakeMonitoring(), TIMEOUT);
    await notice.acknowledge();

    expect(notice.pending).toBe(false);
    expect(storage.snapshot()).toEqual({});
  });

  it('is pending while the record is there, and acknowledging clears the record', async () => {
    const storage = new MemorySecureStorage();
    await markLocalDataReset(storage, RESET_REASON.KeyRejected, TIMEOUT);

    const notice = await readLocalDataResetNotice(storage, new FakeMonitoring(), TIMEOUT);
    expect(notice.pending).toBe(true);
    await notice.acknowledge();

    expect(storage.snapshot()).toEqual({});
    expect((await readLocalDataResetNotice(storage, new FakeMonitoring(), TIMEOUT)).pending).toBe(
      false,
    );
  });

  it('captures a record that cannot be cleared, and does not reject: the user will be told again', async () => {
    const storage = new MemorySecureStorage();
    await markLocalDataReset(storage, RESET_REASON.KeyLost, TIMEOUT);
    const monitoring = new FakeMonitoring();
    const notice = await readLocalDataResetNotice(storage, monitoring, TIMEOUT);
    storage.failNext();

    await expect(notice.acknowledge()).resolves.toBeUndefined();

    expect(monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.ResetNoticeNotCleared,
        error: storageWriteFailed(),
        attributes: undefined,
      },
    ]);
    expect((await readLocalDataResetNotice(storage, new FakeMonitoring(), TIMEOUT)).pending).toBe(
      true,
    );
  });
});

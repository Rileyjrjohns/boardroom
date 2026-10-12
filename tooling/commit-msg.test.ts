import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs the commit-msg Git hook against sample messages, like Git does: the message file is passed
// as the first argument and a non-zero exit status rejects the commit.

const HOOK = path.resolve(__dirname, '..', '.husky', 'commit-msg');

function isAccepted(message: string): boolean {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-msg-'));
  try {
    const file = path.join(directory, 'COMMIT_EDITMSG');
    fs.writeFileSync(file, `${message}\n`);
    return spawnSync('sh', [HOOK, file], { stdio: 'ignore' }).status === 0;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('commit-msg hook', () => {
  it.each([
    'feat: add the Meeting entity',
    'fix(domain): reject an empty agenda',
    'refactor(di)!: rename the composition root',
    'chore: bump dependencies',
  ])('accepts the Conventional Commits message "%s"', (message) => {
    expect(isAccepted(message)).toBe(true);
  });

  it.each([
    'fixup! feat: add the Meeting entity',
    'squash! fix(domain): reject an empty agenda',
    'amend! chore: bump dependencies',
    'Revert "feat: add the Meeting entity"',
    "Merge branch 'feature/meetings' into main",
    "Merge remote-tracking branch 'origin/main'",
    'Merge pull request #12 from boardroom/meetings',
  ])('accepts the message "%s" created by git', (message) => {
    expect(isAccepted(message)).toBe(true);
  });

  it.each([
    'update stuff',
    'Merge stuff',
    'Feat: capitalised type',
    'feat:missing space',
    'feat(): empty scope',
    'unknown: type is not allowed',
    'fixup!feat: missing space after the prefix',
    '',
  ])('rejects the message "%s"', (message) => {
    expect(isAccepted(message)).toBe(false);
  });
});

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import { ADAPTERS } from '../src/composition/container/adapters';
import { parseApiBaseUrl } from '../src/core/infrastructure/http/apiBaseUrl';

// The files that build, test and ship the app: eas.json, the workflows of GitHub Actions and the
// Fastlane setup. None of them runs here, so these checks keep them in step with the code they
// depend on, and keep a secret, an unpinned action or a missing safeguard from slipping in.

const ROOT = path.resolve(__dirname, '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

const WORKFLOWS = path.join('.github', 'workflows');
const workflowFiles = fs.readdirSync(path.join(ROOT, WORKFLOWS)).filter((f) => /\.ya?ml$/.test(f));
const workflow = (name: string): string => read(path.join(WORKFLOWS, name));

/** A workflow without its comment lines, so that a comment never satisfies a check, or breaks one. */
const withoutComments = (text: string): string => text.replace(/^[ \t]*#.*\n/gm, '');

/**
 * The jobs of a workflow, by id, each with its own text. A job is a key two spaces in, under
 * `jobs:`; Prettier keeps every workflow in that shape.
 */
const jobsOf = (name: string): Record<string, string> => {
  const body = withoutComments(workflow(name)).split(/^jobs:\n/m)[1] ?? '';
  const jobs: Record<string, string> = {};
  let current: string | undefined;
  for (const line of body.split('\n')) {
    const id = /^ {2}([\w-]+):\s*$/.exec(line)?.[1];
    if (id !== undefined) {
      current = id;
      jobs[id] = '';
    } else if (current !== undefined) {
      jobs[current] += `${line}\n`;
    }
  }
  return jobs;
};

/** The commands a job runs with `npm`, in order. */
const npmCommandsOf = (job: string | undefined): string[] =>
  [...(job ?? '').matchAll(/^\s+run: (npm .+)$/gm)].map(([, command]) => command ?? '');

// Prettier is a dev dependency and parses YAML, but it is an ES module that Jest cannot load: its
// command line is run in its own process, which exits with 2 on a syntax error. It reads the text on
// the standard input, and the file name only tells it which parser to use.
const PRETTIER = path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const parseYaml = (file: string, text: string) =>
  spawnSync(process.execPath, [PRETTIER, '--stdin-filepath', file], {
    cwd: ROOT,
    input: text,
    encoding: 'utf8',
  });

interface BuildProfile {
  developmentClient?: boolean;
  distribution?: string;
  channel?: string;
  autoIncrement?: boolean;
  env?: Record<string, string>;
}

const eas = JSON.parse(read('eas.json')) as { build: Record<string, BuildProfile> };
const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const config = jest.requireActual<{ default: ExpoConfig }>('../app.config.ts').default;

describe('eas.json', () => {
  it('has the three profiles', () => {
    expect(Object.keys(eas.build).sort()).toEqual(['development', 'preview', 'production']);
  });

  it('builds a development client for the team, which is not on a channel of updates', () => {
    expect(eas.build.development).toMatchObject({
      developmentClient: true,
      distribution: 'internal',
    });
    expect(eas.build.development).not.toHaveProperty('channel');
  });

  it('builds the preview for the team, on the preview channel', () => {
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', channel: 'preview' });
  });

  it('builds the production for the stores, on the production channel, with its own build numbers', () => {
    expect(eas.build.production).toMatchObject({
      distribution: 'store',
      channel: 'production',
      autoIncrement: true,
    });
  });

  it.each(Object.entries(eas.build))(
    'tells the %s build which adapters to use: a release build refuses to guess',
    (_name, profile) => {
      expect(Object.values(ADAPTERS)).toContain(profile.env?.EXPO_PUBLIC_BOARDROOM_ADAPTERS);
    },
  );

  it('runs the development and the preview builds on the simulated server', () => {
    expect(eas.build.development?.env?.EXPO_PUBLIC_BOARDROOM_ADAPTERS).toBe(ADAPTERS.Mock);
    expect(eas.build.preview?.env?.EXPO_PUBLIC_BOARDROOM_ADAPTERS).toBe(ADAPTERS.Mock);
  });

  it('runs the production build on the API, at an address the app accepts and that says it is a placeholder', () => {
    const env = eas.build.production?.env;

    expect(env?.EXPO_PUBLIC_BOARDROOM_ADAPTERS).toBe(ADAPTERS.Http);
    expect(
      parseApiBaseUrl(env?.EXPO_PUBLIC_BOARDROOM_API_BASE_URL, { development: false }).ok,
    ).toBe(true);
    expect(env?.EXPO_PUBLIC_BOARDROOM_API_BASE_URL).toMatch(/replace-me/);
  });

  it('puts no secret in a profile: only public settings of the app', () => {
    const variables = Object.values(eas.build).flatMap((profile) => Object.keys(profile.env ?? {}));

    expect(variables.filter((name) => !name.startsWith('EXPO_PUBLIC_'))).toEqual([]);
    expect(read('eas.json')).not.toMatch(/token|secret|password|key/i);
  });
});

describe('the workflows', () => {
  it.each(workflowFiles)('%s pins every action to a major version', (file) => {
    const uses = [...workflow(file).matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map(
      ([, name]) => name,
    );

    expect(uses.length).toBeGreaterThan(0);
    for (const name of uses) {
      expect(name).toMatch(/^(\.\/\.github\/workflows\/[\w.-]+\.yml|[\w.-]+\/[\w./-]+@v\d+)$/);
    }
  });

  it.each(workflowFiles)('%s declares its permissions, read-only', (file) => {
    const text = workflow(file);

    expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(text).not.toMatch(/: write\b/);
  });

  it.each(workflowFiles)('%s reads no secret but the token of Expo', (file) => {
    const secrets = [...workflow(file).matchAll(/\$\{\{\s*secrets\.(\w+)/g)].map(
      ([, name]) => name,
    );

    expect(secrets.filter((name) => name !== 'EXPO_TOKEN')).toEqual([]);
  });

  it.each(workflowFiles)('%s never runs the code of a pull request with secrets', (file) => {
    expect(workflow(file)).not.toMatch(/pull_request_target/);
  });

  it.each([
    ...workflowFiles.map((f) => path.join(WORKFLOWS, f)),
    path.join('.github', 'dependabot.yml'),
  ])('%s is valid YAML', (file) => {
    const result = parseYaml(file, read(file));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('notices a text that is not YAML, so that the check above can fail', () => {
    const result = parseYaml('broken.yml', 'jobs:\n  build: [unclosed\n');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/SyntaxError/);
  });

  it.each(workflowFiles)(
    '%s runs every job on ubuntu-24.04, not on ubuntu-latest, and says why',
    (file) => {
      // A job that calls a reusable workflow (a `uses` at the level of the job) has no runner: the
      // jobs of the called file have theirs.
      const withRunner = Object.values(jobsOf(file)).filter((job) => !/^ {4}uses:/m.test(job));

      expect(withRunner.length).toBeGreaterThan(0);
      for (const job of withRunner) {
        expect(/^ {4}runs-on: (.+)$/m.exec(job)?.[1]).toBe('ubuntu-24.04');
      }
      expect(withoutComments(workflow(file))).not.toContain('ubuntu-latest');
      expect(workflow(file)).toMatch(
        /^\s*# .*ubuntu-24\.04.*ubuntu-latest.*Ubuntu 26.*19 October 2026/m,
      );
    },
  );

  describe('ci.yml', () => {
    const ci = workflow('ci.yml');
    const code = withoutComments(ci);
    const jobs = jobsOf('ci.yml');

    it('runs on pull requests and on main, and can be called', () => {
      expect(ci).toMatch(/^ {2}pull_request:/m);
      expect(ci).toMatch(/^ {2}push:\n {4}branches: \[main\]/m);
      expect(ci).toMatch(/^ {2}workflow_call:/m);
    });

    it('cancels a run that a newer push makes useless', () => {
      expect(ci).toMatch(
        /^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true/m,
      );
    });

    it('has a job for the architecture boundaries, which runs beside the job of the other checks', () => {
      expect(Object.keys(jobs).sort()).toEqual(['architecture', 'validate']);
      expect(jobs.architecture).toMatch(/^ {4}name: Architecture boundaries$/m);
      expect(jobs.validate).toMatch(/^ {4}name: Lint, types, format, tests$/m);
      // Neither waits for the other: they run in parallel, and each can fail on its own.
      expect(code).not.toMatch(/^\s+needs:/m);
    });

    it('runs the rules of the boundaries alone in their job, with the command of the package', () => {
      expect(npmCommandsOf(jobs.architecture)).toEqual(['npm ci', 'npm run lint:architecture']);
      expect(scripts['lint:architecture']).toBe('eslint app src --max-warnings 0');
    });

    it.each(['architecture', 'validate'])(
      'sets up the %s job alike: the code, the Node.js of .nvmrc, the cache of npm, npm ci first',
      (id) => {
        const job = jobs[id] ?? '';

        expect(job).toMatch(/uses: actions\/checkout@v\d+/);
        expect(job).toMatch(/node-version-file: \.nvmrc/);
        expect(job).toMatch(/cache: npm/);
        expect(npmCommandsOf(job)[0]).toBe('npm ci');
        expect(job.indexOf('actions/checkout')).toBeLessThan(job.indexOf('actions/setup-node'));
        expect(job.indexOf('actions/setup-node')).toBeLessThan(job.indexOf('run: npm ci'));
      },
    );

    it('runs the rest of npm run validate in the other job, without the boundaries', () => {
      expect(npmCommandsOf(jobs.validate)).toEqual([
        'npm ci',
        'npm run lint',
        'npm run typecheck',
        'npm run format:check',
        'npm run test:coverage -- --ci',
      ]);
      for (const part of ['lint', 'typecheck', 'format:check', 'test:coverage']) {
        expect(scripts.validate).toContain(`npm run ${part}`);
      }
    });

    it('appends the coverage table to the run summary after the tests, even when they fail', () => {
      expect(ci).toMatch(
        /if: \$\{\{ !cancelled\(\) \}\}\n\s+run: node tooling\/printCoverageTable\.mjs >> "\$GITHUB_STEP_SUMMARY"/,
      );
      const positions = [
        'npm run test:coverage',
        'node tooling/printCoverageTable.mjs',
        'actions/upload-artifact',
      ].map((text) => ci.indexOf(text));
      expect(positions).not.toContain(-1);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('uploads the coverage report even when the tests fail', () => {
      expect(ci).toMatch(/if: \$\{\{ !cancelled\(\) \}\}\n\s+uses: actions\/upload-artifact@v\d+/);
      expect(ci).toMatch(/path: coverage\//);
    });
  });

  describe('eas-update.yml', () => {
    const update = workflow('eas-update.yml');

    it('publishes to the preview channel, and only after a successful CI of a push to main', () => {
      expect(update).toMatch(/workflows: \[CI\]/);
      expect(update).toMatch(/branches: \[main\]/);
      expect(update).toMatch(/workflow_run\.conclusion == 'success'/);
      expect(update).toMatch(/workflow_run\.event == 'push'/);
      expect(update).toMatch(/eas update --channel preview/);
    });

    it('builds the update from the commit the CI validated, with the environment of the preview profile', () => {
      expect(update).toMatch(/ref: \$\{\{ github\.event\.workflow_run\.head_sha/);
      expect(update).toMatch(/\.build\.preview\.env/);
    });
  });

  describe('eas-build.yml', () => {
    const text = workflow('eas-build.yml');
    const build = withoutComments(text);
    const jobs = jobsOf('eas-build.yml');
    // The inputs of a run started by hand: the only place where a profile can be chosen.
    const dispatch = /^ {2}workflow_dispatch:\n(?: {4,}.*\n)+/m.exec(build)?.[0] ?? '';
    const tagProfile = /PROFILE: \$\{\{ inputs\.profile \|\| '(\w+)' \}\}/.exec(build)?.[1] ?? '';

    it('builds on a tag v* and by hand', () => {
      expect(build).toMatch(/^on:\n {2}push:\n {4}tags: \['v\*'\]\n {2}workflow_dispatch:\n/m);
      expect(dispatch).not.toBe('');
    });

    it('builds a tag after the CI, and waits for every job of the CI', () => {
      const ciJobs = Object.keys(jobsOf('ci.yml')).sort();

      // The CI is called as a job, whose result is that of all the jobs of ci.yml: the build waits
      // for it, and runs without it only when it was not asked for (by hand).
      expect(ciJobs).toEqual(['architecture', 'validate']);
      expect(jobs.verify).toMatch(/^ {4}if: \$\{\{ github\.event_name == 'push' \}\}$/m);
      expect(jobs.verify).toMatch(/^ {4}uses: \.\/\.github\/workflows\/ci\.yml$/m);
      expect(jobs.build).toMatch(/^ {4}needs: \[verify\]$/m);
      expect(jobs.build).toMatch(/^ {4}if: \$\{\{ !failure\(\) && !cancelled\(\) \}\}$/m);
      // A job of the CI that is skipped counts as passed: none of them may have a condition.
      expect(withoutComments(workflow('ci.yml'))).not.toMatch(/^ {4}if:/m);
    });

    it('builds the preview profile for a tag: internal distribution, and no store submission', () => {
      expect(tagProfile).toBe('preview');
      expect(eas.build[tagProfile]).toMatchObject({ distribution: 'internal', channel: 'preview' });
      expect(build).not.toMatch(/\|\| 'production'/);
      expect(build).toMatch(/name: Build \$\{\{ inputs\.profile \|\| 'preview' \}\}/);
      // A push has no inputs, and the submission is read from them only for a run started by hand.
      expect(build).toMatch(
        /SUBMIT: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.submit \}\}/,
      );
    });

    it('builds the production profile only by hand, where its submission is an option', () => {
      expect(dispatch).toMatch(/options: \[preview, production\]/);
      expect(dispatch).toMatch(/profile:[\s\S]*?default: preview\n/);
      expect(dispatch).toMatch(/submit:[\s\S]*?type: boolean\n\s+default: false/);
      // Nothing else names the production profile but the guard of the submission: not the default
      // of the profile, not the name of the job, not the trigger of a tag.
      const mentions = [...build.replace(dispatch, '').matchAll(/^.*\bproduction\b.*$/gm)].map(
        ([line]) => line.trim(),
      );
      expect(mentions).toEqual([
        `if [ "\${SUBMIT}" = 'true' ] && [ "\${PROFILE}" = 'production' ]; then`,
      ]);
    });

    it('submits only a production build, and only once', () => {
      expect(build).toMatch(/"\$\{PROFILE\}" = 'production'/);
      expect(build.match(/--auto-submit/g)).toHaveLength(1);
      expect(build).toMatch(
        /if \[ "\$\{SUBMIT\}" = 'true' \] && \[ "\$\{PROFILE\}" = 'production' \]; then\n\s+args\+=\(--auto-submit\)/,
      );
    });

    it('does not let the CI of a tag share a group with the build that calls it', () => {
      expect(build).toMatch(/group: eas-build-\$\{\{ github\.ref \}\}/);
    });

    describe('the check of the tag against the version of the app', () => {
      const step =
        /- name: Check that the tag is the version of the app\n(?:\s+.*\n)+?\s+run: \|\n((?: {10}.*\n)+)/.exec(
          build,
        );
      const script = (step?.[1] ?? '').replaceAll(/^ {10}/gm, '');
      const VERSION = '1.2.0';

      // Runs the script of the step as it is in the workflow, with the version of the app given by a
      // stand-in for the two commands that read it (they need the installed dependencies).
      const check = (tag: string) =>
        spawnSync('bash', ['-c', `npx() { :; }; jq() { echo "$APP_VERSION"; }; ${script}`], {
          env: { ...process.env, GITHUB_REF_NAME: tag, APP_VERSION: VERSION },
          encoding: 'utf8',
        });

      it('is kept for the tags, which are builds of a version whose updates they receive', () => {
        expect(script).not.toBe('');
        expect(build).toMatch(
          /- name: Check that the tag is the version of the app\n\s+if: \$\{\{ github\.event_name == 'push' \}\}\n/,
        );
        expect(build).toMatch(/npx expo config --type public --json \| jq -r \.version/);
        // Before the build is started, so that a tag that lies costs nothing.
        expect(build.indexOf('Check that the tag is the version')).toBeLessThan(
          build.indexOf('Start the build'),
        );
      });

      it.each(['v1.2.0', 'v1.2.0-rc.1', 'v1.2.0-beta'])('accepts the tag %s', (tag) => {
        expect(check(tag).status).toBe(0);
      });

      it.each(['v1.2.1', 'v1.3.0', 'v1.2', 'v1.2.0.1', 'v1.2.0rc1', 'vnext', 'v'])(
        'refuses the tag %s, and names it',
        (tag) => {
          const result = check(tag);

          expect(result.status).toBe(1);
          expect(result.stdout).toContain(`::error::The tag ${tag} is not the version of the app`);
        },
      );
    });
  });

  describe('e2e-android.yml', () => {
    const e2e = workflow('e2e-android.yml');

    it('is manual, and runs the flows of .maestro on an emulator', () => {
      expect(e2e).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
      expect(e2e).not.toMatch(/^\s+(pull_request|push|schedule):/m);
      expect(e2e).toMatch(/reactivecircus\/android-emulator-runner@v\d+/);
      expect(e2e).toMatch(/maestro test .*\.maestro/);
    });
  });
});

describe('the Fastlane setup', () => {
  const fastfile = read(path.join('fastlane', 'Fastfile'));
  const appfile = read(path.join('fastlane', 'Appfile'));
  const matchfile = read(path.join('fastlane', 'Matchfile'));

  it('declares Fastlane in a Gemfile, and not as a global gem', () => {
    expect(read('Gemfile')).toMatch(/^gem 'fastlane'/m);
    expect(fs.existsSync(path.join(ROOT, 'Gemfile.lock'))).toBe(true);
  });

  it('has the lanes ios beta, android internal and prebuild', () => {
    expect(fastfile).toMatch(/platform :ios do[\s\S]*lane :beta do/);
    expect(fastfile).toMatch(/platform :android do[\s\S]*lane :internal do/);
    expect(fastfile).toMatch(/^lane :prebuild do/m);
    expect(fastfile).toMatch(/'expo', 'prebuild', .*'--clean'/);
  });

  it('signs with match read-only, and uploads to TestFlight and to the internal track', () => {
    expect(fastfile).toMatch(/match\(type: 'appstore', readonly: true/);
    expect(matchfile).toMatch(/readonly\(true\)/);
    expect(fastfile).toMatch(/upload_to_testflight/);
    expect(fastfile).toMatch(/task: 'bundle'/);
    expect(fastfile).toMatch(/upload_to_play_store\(\s*track: 'internal'/);
  });

  it('uses the same identifiers as app.config.ts', () => {
    expect(appfile).toContain(`app_identifier('${config.ios?.bundleIdentifier}')`);
    expect(appfile).toContain(`package_name('${config.android?.package}')`);
    expect(matchfile).toContain(`app_identifier(['${config.ios?.bundleIdentifier}'])`);
  });

  it('reads its credentials from the environment, and keeps none in the files', () => {
    const files = [fastfile, appfile, matchfile].join('\n');

    for (const name of [
      'APP_STORE_CONNECT_KEY_ID',
      'APP_STORE_CONNECT_ISSUER_ID',
      'APP_STORE_CONNECT_KEY_CONTENT',
      'MATCH_GIT_URL',
      'PLAY_JSON_KEY_PATH',
      'ANDROID_KEYSTORE_PATH',
      'ANDROID_KEYSTORE_PASSWORD',
    ]) {
      expect(files).toMatch(new RegExp(`ENV\\.fetch\\('${name}'`));
    }
    expect(files).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|password:\s*'|key_content:\s*'/);
  });

  it('builds the production environment of eas.json, so that the two tools agree', () => {
    expect(fastfile).toMatch(/fetch\('production'\)\.fetch\('env'\)/);
  });
});

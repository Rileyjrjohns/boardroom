import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import { ADAPTERS } from '../src/di/adapters';
import { parseApiBaseUrl } from '../src/infrastructure/http/apiBaseUrl';

// The files that build, test and ship the app: eas.json, the workflows of GitHub Actions and the
// Fastlane setup. None of them runs here, so these checks keep them in step with the code they
// depend on, and keep a secret, an unpinned action or a missing safeguard from slipping in.

const ROOT = path.resolve(__dirname, '..');
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

const WORKFLOWS = path.join('.github', 'workflows');
const workflowFiles = fs.readdirSync(path.join(ROOT, WORKFLOWS)).filter((f) => f.endsWith('.yml'));
const workflow = (name: string): string => read(path.join(WORKFLOWS, name));

interface BuildProfile {
  developmentClient?: boolean;
  distribution?: string;
  channel?: string;
  autoIncrement?: boolean;
  env?: Record<string, string>;
}

const eas = JSON.parse(read('eas.json')) as { build: Record<string, BuildProfile> };
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

  describe('ci.yml', () => {
    const ci = workflow('ci.yml');

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

    it('uses the Node.js of .nvmrc, and the cache of npm', () => {
      expect(ci).toMatch(/node-version-file: \.nvmrc/);
      expect(ci).toMatch(/cache: npm/);
    });

    it('runs everything npm run validate runs, with the boundaries as a step of their own', () => {
      const validate = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
      const steps = [...ci.matchAll(/^\s+run: (npm .+)$/gm)].map(([, command]) => command);

      expect(steps).toEqual([
        'npm ci',
        'npm run lint:architecture',
        'npm run lint',
        'npm run typecheck',
        'npm run format:check',
        'npm run test:coverage -- --ci',
      ]);
      expect(validate.scripts['lint:architecture']).toBe('eslint app src --max-warnings 0');
      for (const part of ['lint', 'typecheck', 'format:check', 'test:coverage']) {
        expect(validate.scripts.validate).toContain(`npm run ${part}`);
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
    const build = workflow('eas-build.yml');

    it('builds on a version tag and by hand, after the CI for a tag', () => {
      expect(build).toMatch(/tags: \['v\*\.\*\.\*'\]/);
      expect(build).toMatch(/workflow_dispatch:/);
      expect(build).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
    });

    it('offers the preview and the production profiles, and defaults a tag to the production one', () => {
      expect(build).toMatch(/options: \[preview, production\]/);
      expect(build).toMatch(/PROFILE: \$\{\{ inputs\.profile \|\| 'production' \}\}/);
    });

    it('submits only a production build', () => {
      expect(build).toMatch(/"\$\{PROFILE\}" = 'production'/);
    });

    it('does not let the CI of a tag share a group with the build that calls it', () => {
      expect(build).toMatch(/group: eas-build-\$\{\{ github\.ref \}\}/);
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

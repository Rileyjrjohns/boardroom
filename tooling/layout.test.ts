import fs from 'node:fs';
import path from 'node:path';

// The root layout is the one file that expo-router asks for the screen shown when a route fails
// while it renders: an export named `ErrorBoundary`. The component lives in the app shell
// (src/composition/shell) and the route file only re-exports it, so nothing else would notice the
// export going missing.

const LAYOUT = path.resolve(__dirname, '..', 'app', '_layout.tsx');

describe('the root layout', () => {
  const source = fs.readFileSync(LAYOUT, 'utf8');

  it('exports the error boundary of the presentation layer as ErrorBoundary', () => {
    expect(source).toMatch(
      /export \{ AppErrorBoundary as ErrorBoundary \} from '@composition\/shell\/navigation\/AppErrorBoundary';/,
    );
  });
});

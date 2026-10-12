// eslint-config-expo ships no type declarations. This one describes the flat config it exports,
// so that eslint.config.mjs is type-checked.
declare module 'eslint-config-expo/flat.js' {
  import type { Linter } from 'eslint';

  const config: Linter.Config[];
  export default config;
}

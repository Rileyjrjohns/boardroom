import type { DEFAULT_NAMESPACE } from './constants';
import type { en } from './resources/en';

// Types the translation keys of i18next and react-i18next. English is the source of truth.
//
// What the types enforce: a `t('unknown.key')` call, a group of keys (`t('navigation')`) and a
// key given with a default text (`t('unknown.key', 'text')`) all fail the typecheck.
//
// What they do not enforce: the parameters. `t('meeting.pageCount')` with no `count`, or with a
// `count` that is a string, compiles and renders the raw key at runtime. Plural keys are read
// through `translateCount` (see `translateCount.ts`), which types the count.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: Record<typeof DEFAULT_NAMESPACE, typeof en>;
    // Without it, a `defaultValue` (`t('unknown.key', 'Some text')`) switches the key check off,
    // which lets an untranslated text reach the screen.
    strictKeyChecks: true;
  }
}

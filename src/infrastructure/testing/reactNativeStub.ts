// Test support, not production code: what Jest gives the "infra" project when a file imports
// `react-native` (see `jest.config.js`). The real package is a Flow-typed module that needs the
// runtime of a phone. The infrastructure reads one thing from it, which platform it runs on, so
// that is all this has; a test sets `Platform.OS` to see what each platform does.
export const Platform: { OS: string } = { OS: 'ios' };

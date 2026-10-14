// Test support, not production code: what Jest gives the "infra" project when a file imports one of
// the Expo modules that wrap the device (see `jest.config.js`). They need a phone, so here they are
// empty modules: loading the platform factory, or the composition root that imports it, then loads
// nothing native. The tests of the thin wrappers do not rely on it: each replaces the module it
// wraps with a stand-in of its own, with a comment that says why.
export {};

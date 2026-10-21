// The local Expo module ScreenProtection. Only src/infrastructure/native imports it (a lint rule),
// with one exception: the secure view, which src/presentation/components/SecureContent.tsx alone
// imports (see "How it plugs into the port" in docs/native-module.md).
export { default } from './src/ScreenProtectionModule';
export type { ScreenProtectionModule } from './src/ScreenProtectionModule';
export { ScreenProtectionSecureView } from './src/ScreenProtectionSecureView';
export type { ScreenProtectionSecureViewProps } from './src/ScreenProtectionSecureView';
export type * from './src/ScreenProtection.types';

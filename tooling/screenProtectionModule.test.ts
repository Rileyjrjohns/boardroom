import fs from 'node:fs';
import path from 'node:path';

import { NATIVE_EVENT } from '../src/infrastructure/native/ScreenProtectionModuleApi';

// The native module ScreenProtection cannot run in Jest, and the adapter over it is tested against a
// stand-in written in JavaScript. What keeps the stand-in honest is checked here, on the text of the
// three sides of the module: the names the adapter (and the TypeScript entry) use for its
// functions and its events are the ones the Swift and the Kotlin definitions declare, the
// configuration points at classes that exist, and the Android manifest asks for the permissions that
// the detection needs.

const MODULE = path.resolve(__dirname, '..', 'modules', 'screen-protection');
const read = (...parts: string[]): string => fs.readFileSync(path.join(MODULE, ...parts), 'utf8');

const swift = read('ios', 'ScreenProtectionModule.swift');
const kotlin = read(
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'screenprotection',
  'ScreenProtectionModule.kt',
);
const manifest = read('android', 'src', 'main', 'AndroidManifest.xml');
const types = read('src', 'ScreenProtection.types.ts');
const entry = read('src', 'ScreenProtectionModule.ts');
const config = JSON.parse(read('expo-module.config.json')) as {
  platforms: string[];
  apple: { modules: string[] };
  android: { modules: string[] };
};

/** The string literals that are names of events (`onScreenshotTaken`). */
const eventNames = (source: string): string[] =>
  [...source.matchAll(/"(on[A-Z]\w*)"/g)].map((match) => match[1] ?? '').sort();

/** The names given to `AsyncFunction("...")`. */
const functionNames = (source: string): string[] =>
  [...source.matchAll(/AsyncFunction\("(\w+)"\)/g)].map((match) => match[1] ?? '').sort();

const EVENTS = Object.values(NATIVE_EVENT).sort();
const FUNCTIONS = ['isCaptured', 'setProtectionEnabled'];

describe('the native module ScreenProtection, its three sides', () => {
  it('is called ScreenProtection on both platforms', () => {
    expect(swift).toContain('Name("ScreenProtection")');
    expect(kotlin).toContain('Name("ScreenProtection")');
    expect(entry).toContain(
      "requireOptionalNativeModule<ScreenProtectionModule>('ScreenProtection')",
    );
  });

  it('declares the events the adapter listens to, on both platforms, and no other', () => {
    expect(eventNames(swift)).toEqual(EVENTS);
    expect(eventNames(kotlin)).toEqual(EVENTS);
    for (const name of EVENTS) expect(types).toContain(`${name}:`);
  });

  it('declares the functions the adapter calls, on both platforms, and no other', () => {
    expect(functionNames(swift)).toEqual(FUNCTIONS);
    expect(functionNames(kotlin)).toEqual(FUNCTIONS);
    for (const name of FUNCTIONS) expect(entry).toContain(`${name}(`);
  });

  it('sends the state of the capture under the key the adapter reads', () => {
    expect(swift).toContain('["captured": captured]');
    expect(kotlin).toContain('mapOf("captured" to');
    expect(types).toContain('readonly captured: boolean');
  });

  it('is configured for iOS and Android, with classes that exist', () => {
    expect(config.platforms).toEqual(['apple', 'android']);
    expect(config.apple.modules).toEqual(['ScreenProtectionModule']);
    expect(config.android.modules).toEqual([
      'expo.modules.screenprotection.ScreenProtectionModule',
    ]);
    expect(swift).toContain('public final class ScreenProtectionModule: Module');
    expect(kotlin).toContain('package expo.modules.screenprotection');
    expect(kotlin).toContain('class ScreenProtectionModule : Module()');
    expect(read('ios', 'ScreenProtection.podspec')).toContain(
      "s.name           = 'ScreenProtection'",
    );
  });
});

// The text selection of the PDF views of iOS is cleared by the module (see "Native module:
// ScreenProtection" in the README). The behaviour is checked on a simulator, with the Maestro flow
// `document-no-copy`; what is checked here is that the wiring is there: PDFKit is imported and
// linked, the observer listens to any PDFView, clears a selection that is not empty and dismisses
// the edit menu that follows, and goes away when protection is turned off and when the module is
// destroyed.
describe('the native module ScreenProtection, text selection on iOS', () => {
  const podspec = read('ios', 'ScreenProtection.podspec');

  /** The body of a Swift function, from its signature to the closing brace at the same indentation. */
  const swiftFunction = (name: string): string => {
    const match = new RegExp(
      `^( *)(?:private )?func ${name}\\([^\\n]*\\{\\n([\\s\\S]*?)\\n\\1\\}`,
      'm',
    ).exec(swift);
    return match?.[2] ?? '';
  };

  it('imports PDFKit and links the framework in the podspec', () => {
    expect(swift).toContain('import PDFKit');
    expect(podspec).toContain("s.frameworks = 'PDFKit'");
  });

  it('observes the selection of any PDFView, on the main queue, without keeping the module alive', () => {
    const start = swiftFunction('startObservingSelections');
    expect(start).toContain('.PDFViewSelectionChanged');
    expect(start).toContain('object: nil');
    expect(start).toContain('queue: .main');
    expect(start).toContain('[weak self]');
    expect(start).toContain('self.protectionEnabled');
    expect(start).toContain('notification.object as? PDFView');
    expect(start).toContain('pdfView.currentSelection != nil');
    expect(start).toContain('pdfView.clearSelection()');
  });

  it('dismisses the edit menus of the view after the selection, for a bounded time', () => {
    expect(swiftFunction('startObservingSelections')).toContain(
      'keepEditMenusDismissed(of: pdfView)',
    );
    const sweep = swiftFunction('keepEditMenusDismissed');
    expect(sweep).toContain('[weak self, weak pdfView]');
    expect(sweep).toContain('remaining > 0');
    expect(sweep).toContain('self.dismissEditMenus(in: pdfView)');
    expect(sweep).toContain('forMode: .common');
    expect(swiftFunction('dismissEditMenus')).toContain('UIEditMenuInteraction');
  });

  it('starts observing when protection is turned on, and stops when it is turned off', () => {
    const setProtection = swiftFunction('setProtection');
    const [whenOn = '', whenOff = ''] = setProtection.split('} else {');
    expect(whenOn).toContain('startObservingSelections()');
    expect(whenOff).toContain('stopObservingSelections()');
    const stop = swiftFunction('stopObservingSelections');
    expect(stop).toContain('NotificationCenter.default.removeObserver(observer)');
    expect(stop).toContain('editMenuSweep?.invalidate()');
  });

  it('stops observing when the module is destroyed', () => {
    expect(swiftFunction('tearDown')).toContain('stopObservingSelections()');
  });
});

describe('the native module ScreenProtection, Android permissions', () => {
  it.each(['DETECT_SCREEN_CAPTURE', 'DETECT_SCREEN_RECORDING'])(
    'asks for %s in the manifest of the module, which the build merges into the app',
    (permission) => {
      expect(manifest).toContain(
        `<uses-permission android:name="android.permission.${permission}" />`,
      );
    },
  );

  it('asks for nothing else', () => {
    expect([...manifest.matchAll(/<uses-permission /g)]).toHaveLength(2);
  });
});

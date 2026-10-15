# 0012. Security model

- Status: Accepted
- Related: [0005](0005-offline-first-with-a-sqlite-outbox.md), [0006](0006-expo-modules-api-for-screen-protection.md)

## Context

The app holds meeting papers that are confidential, and the choices of a secret ballot, on a phone that can be lost, borrowed, backed up, photographed or rooted. The decision is what is protected, with what, and what is said plainly not to be.

## Decision

- **Data at rest.** The SQLite database (the caches of meetings and documents, the vote outbox) is encrypted with SQLCipher, enabled by `['expo-sqlite', { useSQLCipher: true }]`. It is unlocked with `PRAGMA key`, and the opener asks for `PRAGMA cipher_version` and refuses to open when there is no answer (`encryptionUnavailable`): a build without SQLCipher fails to start instead of keeping data in clear. The key is 256 random bits from `expo-crypto`, made once per file, kept in the secure storage (the keychain with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS; preferences encrypted with a key of the Keystore on Android). If the key is lost, the file is set aside, never deleted, a new database is made, and the user is told that votes waiting on the device may be lost.
- **Session.** The token and the session live in one item of the secure storage (`SessionVault`), are deleted at sign-out, and never leave the adapter. A `401` ends the session on the device.
- **Lock.** A cold start is always locked. `AppLock` is state of the application layer that the session guard reads, so while it is closed no use case returns data or sends anything. The unlock is a biometric prompt, strong biometrics only on Android, and the device passcode is not a fallback (`ALLOW_DEVICE_PASSCODE_FALLBACK` is off). A device that cannot do biometrics fails closed.
- **Screen.** `FLAG_SECURE` on Android blocks screenshots and recordings of the activity window. iOS cannot block them: a cover hides the app switcher and the app listens for captures. A confidential document, and any document served from the cache, is protected. Every document viewed carries a watermark with the name, the email and the time of the reader. On iOS, while a document is protected, the screen protection module also clears the text selection of the PDF views as soon as it appears and dismisses the edit menu that the long-press brings (Copy, Select All, Look Up), so nothing can be copied from the viewer.
- **Transport and logs.** HTTPS outside development builds, no redirects, `Cache-Control: no-store`. The monitoring gets identifiers, codes and counts, never a name, a token, a path or the choice of a vote. No secret goes into `app.config.ts` or an `EXPO_PUBLIC_` variable (a test checks the first).

**Not covered**, and written in the README: certificate pinning, root and jailbreak detection, app attestation, server-side revocation (the demo API has none), encryption of the document files (they are plain PDFs in the sandbox, out of the backups and deleted at sign-out), a guarantee against copying the text of a document on iOS (the `enableTextSelection` prop of `react-native-pdf` 7.0.5 does not reach the iOS view, so the module clears the selection of PDFKit instead and dismisses the edit menu; this relies on `PDFViewSelectionChangedNotification` and on the edit menu interaction of the `PDFView`, so a future viewer that is not a `PDFView` needs its own handling, the menu is only dismissed for 10 seconds after each selection, and it applies only while the protection is on; Android has no text selection in this viewer), the encrypted database in the iOS backup, key rotation, data in memory while the app runs, and the Keychain of iOS outliving a reinstall.

## Consequences

- A copy of the database file, a locked lost phone or a backup restored elsewhere reveals nothing. Someone who runs code as the app on an unlocked, rooted or jailbroken device reads the key and the data: the key and the data are on the same device.
- The lock is enforced by the application layer and tested, not a flag a screen may forget.
- Fail-closed choices cost the user something (a locked-out biometric means waiting or signing in again), and the cost is accepted.
- The watermark and the screen protection deter and attribute; they prevent nothing on iOS, where a screenshot or a photo of the screen remains possible. Hosting the document in the secure layer of a `UITextField` with `isSecureTextEntry` (an undocumented workaround) was tried on a physical iPhone under iOS 27: captures still showed the document, so it was dropped. The text of a protected document cannot be copied from the viewer there, because the selection is cleared as soon as it appears and the menu that follows is dismissed (it was run on a simulator, not on a device); the text of a document that is not protected still can.

## Alternatives considered

- **Plain SQLite and rely on the sandbox.** Easy, and a backup or a rooted device then reads a secret ballot in clear.
- **A key derived from a user secret.** Stronger against a stolen unlocked device, and it would make the offline outbox unreadable until the user typed it.
- **Encrypt the document files in the app.** Needs a key and a viewer that decrypts to memory or to a temporary file; `react-native-pdf` reads a file. Not done, and listed.
- **Allow the device passcode as a fallback.** Friendlier, and a passcode may have been seen by a colleague; one setting reverses it.
- **Pinning and root detection now.** Described in the README as the next steps, with the risks they carry.

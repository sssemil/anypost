# anypost-android

Android wrapper for `anypost-web` using Capacitor.

## First-time setup

1. Install workspace dependencies:
   - `pnpm install`
2. Initialize native Android project once:
   - `pnpm --filter anypost-android run init:android`

This creates `apps/anypost-android/android/` (Gradle + Android Studio project).

## Common commands

- Sync latest web build into Android project:
  - `./run android-sync`
- Open Android Studio project:
  - `./run android-open`
- Build debug APK:
  - `./run android-build-apk`

## Android bridge contract

The web app can bind to an injected host bridge object:

- `window.anypostAndroid`
  - `onDeepLink(listener)`
  - `getPendingDeepLinks()`
  - `notifyMessage(payload)`
  - optional relay methods:
    - `getRelayState()`
    - `onRelayState(listener)`

The bridge shape intentionally mirrors `window.anypostDesktop` so Android and Electron can share one web integration path.

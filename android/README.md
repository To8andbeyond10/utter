# ClariFi · Android first development milestone

**Status:** Source implementation and JVM detector smoke tests complete. **Device APK build and on-device acceptance testing are not complete** (this environment has no Android SDK/Gradle or connected signing credentials).

This package is designed to be **copied into the root of** [`To8andbeyond10/utter`](https://github.com/To8andbeyond10/utter). It does not replace or modify `extension/`, `site/`, or `brand/`.

## Milestone 1 scope

- Native Kotlin/Jetpack Compose dashboard with ClariFi's purple glass visual language, ambient lighting and mascot reuse.
- User-enabled, draggable `TYPE_APPLICATION_OVERLAY` monocle button. Translucency control 30–100% opacity.
- A **new MediaProjection system permission prompt for each tap**; no Accessibility Service, no hidden screen scraping, no continuous capture.
- One captured frame processed with **on-device ML Kit OCR**, with a floating evidence breakdown card.
- Android `ACTION_SEND` (`text/plain`) Share to ClariFi and manual caption entry.
- Re-implemented text evidence ladder preserving the extension's semantics, plus safeguards against treating OCR text as authenticated platform labels.
- In-memory results and images; no backend endpoint, account, analytics SDK, screenshot upload, or screenshot retention.
- GitHub Actions compile/test workflow and JVM detection tests.

### The existing mascot

This project deliberately **does not redraw or replace** the original gentleman-with-monocle mascot. When this folder is inside the existing `utter` repository, the Android Gradle source set reads the actual image at `brand/clarifi-mascot.png`. The UI will use that image; a simple vector fallback is only displayed if the source files are built standalone without the brand folder.

## Import into the existing GitHub project

1. Unzip the package. Copy `android/` into the existing `utter` repository root (alongside `extension/`, `site/`, and `brand/`).
2. Copy `.github/workflows/clarifi-android.yml` into the repo's `.github/workflows/` folder.
3. Commit those additions on a new feature branch, for example `feat/android-milestone-1`. The connected GitHub integration returned HTTP **403** for creating the branch, so this packaging does not claim the changes are already pushed.
4. Open **`android/`** in Android Studio with Android SDK **36** and JDK **17** installed. Let Gradle sync. Run `:app:testDebugUnitTest` and `:app:assembleDebug`.
5. Install `android/app/build/outputs/apk/debug/app-debug.apk` on an Android phone or emulator. Android Studio's **Run** can also install directly.
6. When committed, the included GitHub Actions workflow creates a downloadable debug APK artifact; **this is not a signed Play Store `.aab`**.

From a terminal with Gradle 8.13 installed:

```sh
cd android
gradle --no-daemon testDebugUnitTest assembleDebug
```

### Acceptance walkthrough on an Android phone

1. Open ClariFi and grant *Display over other apps* after tapping **Enable floating button**. Grant notifications if prompted.
2. Confirm the purple mascot bubble appears above another app. Drag it, adjust transparency in ClariFi, then confirm the adjustment takes effect.
3. In TikTok, Instagram, or another app, tap the floating bubble. Accept the **system** screen-capture dialog (choose the intended screen/app). Wait for the evidence card.
4. Verify `#aiart` yields **Weak**, three distinct AI hashtags yield **Moderate**, and an explicit `made with Midjourney` disclosure yields **Strong** ("The text says it's AI-made").
5. Verify `NOT made with AI` does **not** trigger a Strong claim, and screenshot `AI info` is **not** considered Verified.
6. Share text from another app to **ClariFi** and verify its evidence breakdown appears without overlay permission.
7. Deny capture consent and verify capture cancels and bubble returns. Stop the bubble in ClariFi; verify the overlay disappears.
8. Test on Android 14, 15 and 16: different OS versions may render capture consent and protected content differently.

## Milestone 2, batch 1 (bubble motion and evidence panel)

- The bubble glides to the nearest screen edge after a drag (with fling momentum), stays clear of the status bar, nav bar and cutouts, and remembers its edge and height across restarts and rotation.
- Dragging shows a ✕ target at the bottom; dropping the bubble there hides it and turns the floating button off.
- Tap feedback (press scale, haptics); no always-on pulse animation, and animations are skipped when Android's animations are turned off.
- The result card opens next to the bubble, closes on an outside tap, and offers Check again / Details / Close.
- Wording describes what the text says, never whether the media is AI-made. Failed captures show "Couldn't check this screen" with the reason, and screens with no readable text say so instead of showing "No signal".
- Each finding names its kind (disclosure, hashtags, mention, label-like text) and quotes the matched text; the card states its source and how many words were read on device.

## Known limitations and next milestone

- This is a **text evidence** analyzer: it does **not** detect unlabeled synthetic images/videos, deepfakes, image provenance, or actual creator identities. The original browser extension's DOM-confirmed labels are **not** automatically available from a screenshot.
- Screens with secure windows or protected content may not be capturable. The OS may block overlays in security-sensitive screens.
- Foreground-service declarations (`specialUse`, `mediaProjection`), overlay permission, screenshot consent, data safety/privacy details, and Play Console requirements require a formal review and device test before publishing.
- Need accessibility/responsiveness QA (TalkBack, text scaling, dynamic color, touch sizes), battery lifecycle/resilience testing, Play integrity/signing, and instrumentation tests.
- Milestone 2: native test instrumentation, robust overlay lifecycle, user education/privacy screens, screenshots/art direction polish, and an evidence provenance/real media detector design—not unsupported confidence claims.

## Architecture

```text
android/app/src/main/java/com/clarifi/mobile/
  MainActivity.kt          Compose glass dashboard, share receiver, controls
  OverlayService.kt        draggable, opt-in transparent bubble + evidence card
  CaptureActivity.kt       one-time system MediaProjection consent
  CaptureService.kt        temporary foreground capture + on-device OCR
  EvidenceEngine.kt        explainable, conservative text-signal ranking
  BubbleSettings.kt        local preferences for bubble state/opacity
  NotificationSupport.kt   foreground service notifications
```

## Safety & user trust

The app requests no contacts, storage/media library, microphone, camera, or Accessibility permissions. Captured bitmaps are transient; text processing uses bundled on-device OCR and plain Kotlin rules. MediaProjection consent occurs for each capture. **Never describe this milestone as determining whether a particular picture or video was AI-generated.**
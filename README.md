# Sleep Studio — installable iPhone web app

A no-build Progressive Web App with real local night-sound recording and playback. Runs from HTTPS, including GitHub Pages. No Xcode or App Store is required.

## Install on iPhone

1. Open the published app link in Safari.
2. Tap Share, then Add to Home Screen.
3. Enable Open as Web App if shown, then Add.
4. Launch Sleep Studio from its new icon. Allow the first online load to finish so the app and sound library can be cached.

Microphone permission is requested only when you start a session with night-sound recording enabled. To test recording, keep the app visible, speak or clap, end the session, then play the saved event clips from Journal.

## Features

- Home Screen manifest, app icons, standalone layout and service-worker offline caching.
- Manual time-in-bed sessions and journal entries, notes, mood and routine factors.
- Real microphone event clips in local IndexedDB, RMS level meter, Safari MP4/AAC MIME selection, interruption logging and explicit resume.
- Journal playback, download, import and deletion of audio clips.
- Eight original, generated soundscapes; media-element playback with lock-screen controls where supported; volume and 10–90 minute fade timer or all-night playback.
- Configurable in-app alarm, chime preview, snooze and no-alarm mode.
- Real personal duration trends, goal counts and bedtime variation.
- Manual labels for recorded clips, plus habit comparisons after three tagged and three untagged nights. These are user observations, not automatic classifications or causal claims.
- Battery saver enabled by default: two sound checks per second, 1024-sample analysis buffers, requested 24kbps audio encoding and 16kHz microphone input where supported. Balanced mode checks five times per second. The browser may choose a different actual audio rate.
- Local JSON/CSV journal export, validated JSON restore and storage controls. Audio clips are downloaded separately.

Audio clips are capped at 10 seconds each, a selectable 50/100/200 clips per session (100 default), and 25 MB per session. All capture resources are released when stopped. Idle pages do not run a periodic timer. No AI model files or third-party JavaScript frameworks are downloaded. No physical-device energy benchmark has been performed; lower polling rates do not establish a measured battery-life advantage over Sleep Cycle.

## Important device limits

This is an installed web app, not a native IPA. iOS can suspend microphone capture, timers and alarms when the screen locks, when another app takes focus, or during calls. Screen Wake Lock is requested where supported, but is not a guarantee. Keep the app visible and the screen awake, plug in the phone, and set a backup wake-up alarm in Clock. No overnight physical-iPhone validation has been performed.

Sound events are **unclassified recordings**. A loud sound does not prove snoring, coughing, sleep talking, sleep stage or sleep apnea. No proprietary sleep-phase algorithm, clinical quality score, HealthKit sync, Luma cloud coach, partner-snore classifier or licensed Premium sound library is included. This is not full feature parity with Sleep Cycle.

Recordings and journal data never upload to GitHub or a server. They remain in the current browser/app's origin storage. Clearing browser data or storage eviction can remove them. Export text and download important recordings. GitHub Pages moving to a different hostname creates a new storage origin; old recordings do not automatically move.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. Enable Settings → Pages → Source → GitHub Actions. The workflow publishes only `dist/` and works under repository subpaths; no root-domain paths or external runtime dependencies are required.

Local development:

```sh
python -m http.server 4175 --bind 127.0.0.1 --directory dist
```

Open http://localhost:4175. Localhost is a secure context for browser recording; remote deployment needs HTTPS.

## Verification

Node tests cover overnight time calculations, alarm scheduling, midnight bedtime variation, HTML escaping, recorder MIME selection, permission denial, capture cancellation, event persistence, interruptions, microphone cleanup, storage limits and quota failures. Browser checks cover local journal and audio persistence, import/playback, installation instructions, sound library and mobile layout. See the final task report for completed browser checks.

## Original-app research

`research/sleepcycle-features.md` distinguishes official product documentation from package evidence. The user supplied `Sleep-Cycle-Sleep-Tracker_4.26.42-production_apkcube.apks` for static inspection. The commercial package is not included in this repository. No original licensed audio is redistributed. REA 6.0 is compatible with the available Node runtime; no system runtime upgrade was performed.

Independent Sleep Cycle-inspired recreation, not affiliated with Sleep Cycle AB.

References:
- https://support.apple.com/guide/iphone/iphea86e5236/ios
- https://support.sleepcycle.com/hc/en-us/articles/206704689-Do-you-store-any-sound
- https://support.sleepcycle.com/hc/en-us/articles/206705129-How-to-enable-and-use-Sleep-Aid
- https://webkit.org/blog/11353/mediarecorder-api/

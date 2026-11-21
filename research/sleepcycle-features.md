# Sleep Cycle reference investigation

Investigated November 21–22, 2026. This report separates official product descriptions, mirror metadata, actual local observations, and implementation inferences.

## Result and scope

The official iOS and Android listings and focused Sleep Cycle support articles were inspected. The user subsequently supplied an actual Android `.apks` bundle, which was hashed, inventoried with REA, and inspected statically with a local Python ZIP/AXML/DEX parser. The app was **not installed or executed**. Android method decompilation was unavailable because REA's JADX integration refuses this Windows host. No IPA was obtained. This report does not claim recovered proprietary algorithm behavior or full feature parity. Earlier mirror download restrictions were not bypassed.

## Verified app identities

- Android official listing: `com.northcube.sleepcycle`, developer Sleep Cycle AB. The Google Play listing was updated November 13, 2026. Source: https://play.google.com/store/apps/details?id=com.northcube.sleepcycle
- iOS official Apple lookup response: `Sleep Cycle - Tracker & Sounds`, bundle `com.lexwarelabs.goodmorning`, version `6.26.440`, minimum iOS `16.2`. These are metadata claims from Apple's API, not values parsed from an IPA. Response saved at `official-ios-metadata.json`. Source: https://itunes.apple.com/lookup?id=320606217&country=us
- Official App Store listing: https://apps.apple.com/us/app/sleep-cycle-tracker-sounds/id320606217

## Supplied Android bundle: actual static findings

### Artifact identity and provenance

The user supplied `C:/Users/User/Desktop/Sleep-Cycle-Sleep-Tracker_4.26.42-production_apkcube.apks`, copied into `sleepcycle-4.26.42/sleepcycle-4.26.42.apks` for analysis. Original desktop file was not changed.

- Outer size:104,872,122 bytes.
- Outer SHA256:`783c9d24f1481aec0b2b5deb9047dc84228b4812e857f7de2f8a28d76883f53b`.
- Ten outer ZIP members: `base.apk`, one arm64 ABI split, seven density splits, and `APKCube.txt`.
- Base APK size:107,217,481 bytes; SHA256:`a58f6dfc800a943b8a66787a633812686fbfe2a044072176eadc06cbced8179f`.
- Parsed base manifest identity: `com.northcube.sleepcycle`; version `4.26.42-production`; version code10207; compiled SDK36.
- Signing certificate parsed from both APK v2 and v3 signing blocks: SHA256:`f9e746cd9d4be57e23663e9826baff5a4775e80257980a3f986eb1eb4eec9970`. It matches the public Northcube certificate fingerprint reported by APKMirror. **Full APK signature integrity was not cryptographically verified**; the match does not establish that every supplied byte is authentic.

### REA Evidence

Compatible official `rea-agents@6.0.0` was used without a runtime upgrade. Full returned envelopes are preserved, including limitations:

- `sleepcycle-4.26.42/reports/rea-outer-artifact.json`: inspection Evidence `ev_67f657e7b41d3fae164df9abbedc3cd27963d901da772a25c56e7421f4c747eb`; nested inventory Evidence `ev_e23e3cea0172d82c99f093941bfb281ca13018b30eee8adc068a2048d15e11ed`.
- `sleepcycle-4.26.42/reports/rea-base-artifact.json`: inspection Evidence `ev_ab15e7834261708c579764a0d30c0d9a818884c7dbc9159366cb9d471423fa97`; nested inventory Evidence `ev_f1d76dfb7907b9bc7214af5ce65fc5cc1f350dea719c3c0d145bc0033438683a`.
- Both `inspect_artifact` results completed archive inventory and explicitly disclaim execution and format-specific semantic conclusions. These records support byte identity and archive membership, not runtime architecture by themselves.
- `rea-android-package.json` records `capability_unavailable`: Android JADX subprocess ownership is unsupported on `win32`; Linux or macOS is required. No engine was installed or host guard bypassed. Therefore, no REA Android method/call-graph evidence exists.

### Ordinary static manifest and DEX evidence

The separately labeled `python-static-inventory.json` contains decoded binary-manifest declarations, asset membership and filtered DEX strings. This is **ordinary Python static evidence, not a REA semantic analysis**. `python-static-summary.json`, `outer-inventory.json`, and `signer-fingerprint.json` provide smaller views.

Observed manifest declarations include `RECORD_AUDIO`, `WAKE_LOCK`, microphone/media-playback foreground service permissions, `USE_EXACT_ALARM`, and `USE_FULL_SCREEN_INTENT`. Services include:

- `com.northcube.sleepcycle.sleepanalysis.SleepAnalysisService`
- `com.northcube.sleepcycle.service.sleepaid.SleepAidService`
- `com.northcube.sleepcycle.logic.snore.SnoreProcessingService`
- `com.northcube.sleepcycle.sleepprograms.services.SleepProgramsAudioService`

These declarations are consistent with dedicated native recording, playback and wake-up components. They do not prove which components execute in a given session or what data is transmitted.

DEX strings refer to saved snore events, snore-alert embeddings, recording-retention settings, playback position, sound-file deletion, and the labels `SNORING`, `SNORING_ME`, `SNORING_NOT_ME`, `COUGHING`, and `SLEEP_TALKING`. Resource strings describe clips containing multiple event types and a recording playback-progress control. This corroborates recording review/playback and annotation-oriented product behavior, but no control flow or automatic classifier accuracy was recovered.

### Actual model and pipeline resources

The supplied archive contains these model/resource members (membership and sizes observed; encrypted contents were not decrypted):

| Member | Bytes |
| --- | ---: |
| `assets/audio_to_mel_spectrogram.ort.enc` |287,236|
| `assets/auroracle/streaming_auroracle.aurt` |1,909,232|
| `assets/auroracle.ort.enc` |7,255,940|
| `assets/breathing_rate.ort.enc` |13,068|
| `assets/fft_model.tflite` |1,628|
| `assets/gcc_phat_fft.ort.enc` |74,236|
| `assets/sleep_staging.ort.enc` |16,628,452|
| `assets/snoracle-tripletloss-epoch=285-val_loss=0.07.tflite` |3,448,660|
| `assets/snore_signature.ort.enc` |3,473,284|
| `assets/staging_frontend.ort.enc` |336,908|

The arm64 split contains TensorFlow Lite, ONNX Runtime, ONNX JNI, and `libauroracle.so`. This shows multiple inference-related binaries ship; it does not establish execution, licensing permission to reuse them, or the internals of encrypted models.

`assets/pipeline/settings.json` is a readable configuration with transforms ordered `CRNN_0`, then `SequenceToEvents_0`; model ID `auroracle_0.4.0`; a44.1kHz sample rate; and ten declared event labels: baby fussing/crying, coughing, electric noise, exhale, inhale, movement, other, sleep talking, snoring, and talking. Shapes, pooling, thresholds and median-window settings are preserved in the extracted analysis copy. This establishes a declared classifier/event pipeline. It does **not** show it is the only active pipeline, validate its weights, or make equivalent classification possible from a loudness threshold.

### Sleep Aid metadata and sound membership

`res/raw/sleep_aid_index.json` declares one bundled Ambience category with16 local looping packages. Its generic categories include ocean waves, several rain variants, brook, wind, leaves, countryside, cabin hum, clock, and brown/pink/white noise; it also has three branded tracks. `sleep-aid-metadata-summary.json` preserves the metadata view. The package also contains alarm audio and a fallback recording sample.

Catalog membership may be a bundled fallback; DEX repository/download strings and official support material indicate further downloadable content exists. No network catalog was fetched and no complete server-side or Premium catalog is claimed. **No packaged audio, images, fonts, models, or encrypted resources were copied into the recreated app.** Extracted settings/index JSON are analysis-only artifacts under `work/research`.

## Earlier public package acquisition attempts

1. APKMirror's original universal `4.25.44-production` (9329) page identifies a 114,008,199-byte APK, Android API28 minimum, API35 target, and four CPU architectures. Its normal Download APK link was followed once through the web reader and once as an ordinary HTTP request. The web reader could not fetch the page; the HTTP request returned **403 Forbidden**. No APK bytes were received.
   - Page: https://www.apkmirror.com/apk/sleep-cycle-ab/sleep-cycle-sleep-tracker/sleep-cycle-sleep-tracker-4-25-44-production-release/sleep-cycle-sleep-tracker-4-25-44-production-android-apk-download/
   - Mirror-reported APK SHA256: `cb0bac75fcb66ae9f1ec5f21a5e63ba0f63b84f116b5b38f93931e821e39aceb`
   - Mirror-reported signing certificate SHA256: `f9e746cd9d4be57e23663e9826baff5a4775e80257980a3f986eb1eb4eec9970`
   - Neither hash was locally verified. A certificate fingerprint alone would not authenticate a file even if it had been downloaded.
2. Uptodown's current page identifies `4.26.37-production`, an 84.35MB XAPK. The download page was fetched and saved as `uptodown-download.html`. The default button is an Uptodown store installer rather than a direct Sleep Cycle package; the page also contains a Cloudflare Turnstile download challenge. No installer was downloaded, no challenge was solved, and no XAPK was obtained.
   - Page: https://northcube-sleepcycle.en.uptodown.com/android/download
   - Mirror-reported XAPK SHA256: `58bbfec2b0bad298c770cae79e44343f665e601ca0114049bb748751ce244cc9` (not locally verified).
3. A normal request was made to APKPure's original-package download page. The web reader reported it could not open the URL, and a direct ordinary request returned **403 Forbidden**. No alternate request headers, cookies, proxy, or challenge bypass were attempted.
   - Page: https://apkpure.com/sleep-cycle-sleep-tracker/com.northcube.sleepcycle/download

No modified, cracked, or premium-unlocked package was requested. These earlier download blockers were resolved for static investigation when the user supplied the bundle above. No IPA was obtained through Apple account/device extraction, and no claim about a decrypted IPA is made.

## REA runtime

Observed via official npm metadata:

- `rea-agents@6.9.0`: engines `^22.23.4 || ^24.22.1 || >=26.12.1`; does not match existing Node24.14.1.
- `rea-agents@6.0.0`: engines `^22.19.0 || ^24.11.0 || >=26.0.0`; matches existing Node24.14.1.
- `npx.cmd -y rea-agents@6.0.0 --help` ran successfully. `inspect-artifact --help` and `inspect-android-package --help` also ran successfully.
- The compatible release advertises `inspect-artifact <path>` and `inspect-android-package <path>` for static local analysis. No Node upgrade, MCP registration, native analysis engine, or unrelated prerequisite was installed.
- REA archive Evidence now exists for the supplied Android bundle and base APK, as listed above. Android semantic analysis remains unavailable on this Windows host; successful CLI startup alone would not establish semantic-provider readiness.

## Official feature evidence

### Nighttime recording and playback

The Sleep Tracking support article describes microphone or accelerometer tracking, quality scores, sleep phases, duration, and recordings of snoring, coughing and other nighttime noises. These are vendor-described features, not independently validated accuracy claims. Source: https://support.sleepcycle.com/hc/en-us/articles/7858653607580-About-Sleep-Tracking

The sounds page describes hearing nighttime recordings and identifying environmental disturbances or sleep talking. Source: https://sleepcycle.com/the-app/sounds

The storage support article says recorded sounds are local to the device, disappear when the app is deleted, and are not transferred between devices. Optional sharing is off by default. Source: https://support.sleepcycle.com/hc/en-us/articles/206704689-Do-you-store-any-sound

The Who's Snoring support article describes a Premium feature that learns which person's snores are present after user labeling and multiple nights. It also describes 20-night, 100-night, or indefinite retention settings. This is evidence that a learning/classification component exists in the product, not a recipe for reproducing it. Source: https://support.sleepcycle.com/hc/en-us/articles/9189599693074-How-does-Who-s-Snoring-work

### Wake-up behavior

The Smart Alarm support article describes three modes: a wake-up window plus tracking, a fixed-time alarm, and tracking without an alarm. It describes a typical 30-minute window, adjustable from10–30 minutes, and tap/pick-up snoozing. Source: https://support.sleepcycle.com/hc/en-us/articles/7858323091356-What-is-the-Smart-Alarm-Clock

The newer Google Play listing advertises wake windows up to90 minutes, so platform/version descriptions differ. Do not claim one universal limit from these mixed sources. Source: https://play.google.com/store/apps/details?id=com.northcube.sleepcycle

The snooze support article distinguishes unlimited regular-alarm snoozing from Smart Alarm snoozing constrained to the wake-up window. Source: https://support.sleepcycle.com/hc/en-us/articles/16980725481756-Snoozing-with-the-Regular-Alarm-vs-the-Smart-Alarm

### Sleep Aid playback

Sleep Aid includes a browsable sound/music library, a last-played quick-play button, and a10–90-minute fade-out timer. The support article also describes accelerometer-based automatic fade-out and all-night playback. Some content is free and some Premium. Source: https://support.sleepcycle.com/hc/en-us/articles/206705129-How-to-enable-and-use-Sleep-Aid

Original or suitably licensed sounds should be used in the recreation; inspecting a package would not grant rights to redistribute a commercial library. Product page: https://sleepcycle.com/the-app/sleep-aid

### Additional native-product scope

The official App Store listing describes Luma AI coaching, sleep notes, long-term trends, global comparisons, soundscapes/stories/meditations, Apple Health sync and Philips HUE features. These need independent implementations or service/device integrations; none follows merely from adding microphone access to a PWA. Source: https://apps.apple.com/us/app/sleep-cycle-tracker-sounds/id320606217

## Browser implementation implications

These are engineering recommendations/inferences, not recovered original implementation details:

- Implement microphone consent, live level/waveform, user-controlled recording, persistent audio clips in IndexedDB, playback/download/delete, and entry-to-clip links. Basic sound-level thresholding can segment **unclassified sound events**. Do not label events as detected snoring/talking/coughing without an actual tested classifier; allow users to label their own recordings.
- Feature-detect MediaRecorder and supported MIME types rather than forcing `audio/webm`. WebKit documents an MP4/AAC recording path and local blob playback. Source: https://webkit.org/blog/11353/mediarecorder-api/
- Handle `mute`, `unmute`, `ended`, recorder errors, visibility changes and interrupted audio sessions. A WebKit engineering discussion explicitly describes phone-call interruption muting capture and potentially suspending the page. This is evidence of interruption risk, not proof that every modern iPhone always stops recording in the background. Source: https://bugs.webkit.org/show_bug.cgi?format=multiple&id=204681
- Recent WebKit issue327237 reports that Home Screen app microphone permission can be requested again after every cold launch. Treat this as a reported issue, not guaranteed behavior on every OS. Source: https://bugs.webkit.org/show_bug.cgi?id=327237
- Persist recordings with quota/error handling and optional export. WebKit documents storage pressure/eviction and `navigator.storage.persist()` heuristics; Home Screen install does not make local recordings immune to data loss. Source: https://webkit.org/blog/14403/updates-to-storage-policy/
- Use a real media element for looped sound files and lock-screen controls where supported. Web Audio, timers, foreground-only tests and a manifest do not establish overnight playback/recording reliability. Do not promise a dependable lock-screen alarm without device testing/native delivery.
- A wake-up window can be a user-facing schedule preference, but microphone loudness alone does not establish light sleep or deep sleep. Show time-in-bed, real sound-event timestamps and manually entered mood/quality separately; do not manufacture measured stage charts or clinical scores.
- A GitHub Pages build can host a manifest, icons, service worker and relative-scope assets for Home Screen installation. Apple documents Safari Share → Add to Home Screen → Open as Web App → Add. This is an installable web app, not an IPA/native binary. Source: https://support.apple.com/en-lb/guide/iphone/iphea86e5236/27/ios/27

## Outstanding verification

- The supplied Android package has been statically inventoried. Method decompilation, call-graph tracing, signature-integrity validation, and runtime behavior remain unverified. No IPA has been inspected.
- No iPhone hardware was available to verify microphone continuity, background audio, screen-lock behavior, installation, or overnight alarms.
- Proprietary sleep-stage/quality classification and partner-snore identity remain unknown and must not be claimed as reconstructed.

# Third-party notices

## mGBA Libretro core

- Project: mGBA
- Source: https://github.com/libretro/mgba (mirror of https://github.com/mgba-emu/mgba)
- Binary source: https://buildbot.libretro.com/nightly/android/latest/
- Binary snapshot: 2026-10-09 Android nightly, `arm64-v8a` and `armeabi-v7a`
- License: Mozilla Public License 2.0
- License text: `vendor/emulatorjs/LICENSE-mGBA-MPL-2.0.txt`
- ARM64 SHA-256: `b5a6ed40ede735ea7f1d56916f4ceed8c2aabe4d481fe3383ae2b5e5485b6545`
- ARMv7 SHA-256: `a976a807a7bd79a7dabbc42cfc02620fca17ec7011e887730e9d768689a4d651`

The unmodified `mgba_libretro_android.so` binaries are stored as
`libmgba_libretro.so` so Android packages them as native libraries. The
corresponding source remains available from the repositories above.

## Java Native Access

- Project: JNA 5.19.1
- Source: https://github.com/java-native-access/jna
- License: LGPL-2.1-or-later or Apache-2.0

JNA is resolved from Maven Central as an Android AAR during native packaging.

# EmulatorJS local runtime

Together Notes bundles the unmodified EmulatorJS 4.2.3 browser frontend and
the official stable mGBA core package so Android users can run a legally owned
local GBA file without contacting the EmulatorJS demo or CDN.

- Frontend: `@emulatorjs/emulatorjs@4.2.3`
- Frontend source: https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3
- Frontend license: GNU GPL v3 (`LICENSE-EmulatorJS-GPL-3.0.txt`)
- Core package: `@emulatorjs/core-mgba@4.2.3`
- Core source: https://github.com/EmulatorJS/mgba
- Core license: Mozilla Public License 2.0 (`LICENSE-mGBA-MPL-2.0.txt`)
- Reproducible core build scripts: https://github.com/EmulatorJS/build
- Frontend package integrity: `sha512-7z3qaA4LwyurhuGvdMUDF9xJpEbxC3SNy9+E9tSaOsRo8FCS2QXam/0k/lc9kqHWRFIlLKWahNjPAStyL0rFnw==`
- Core package integrity: `sha512-daiHzZQKEr+P9fra7j5YoEAXiyYUEtBhFQ8EAV/SeCtrkvqtayU7GQ9LYgoSgzkKSwsbNSskApqGuA9EGARYPA==`

`data/emulator.min.js` is a distribution bundle produced by concatenating the
upstream source files in the same order as the upstream loader. Their preferred
source form is included in `upstream-source/`. No ROM, BIOS, game artwork, or
copyrighted game data is included in this directory or in the App package.

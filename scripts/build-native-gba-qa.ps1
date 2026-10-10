$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-native-gba.ps1')
$tools = Join-Path $sdk 'build-tools/36.1.0'
$work = Join-Path $output 'apk'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$aarZip = Join-Path $output 'jna-android.zip'
if (-not (Test-Path $aarZip)) { Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/net/java/dev/jna/jna/5.19.1/jna-5.19.1.aar' -OutFile $aarZip }
$aar = Join-Path $output 'jna-android'
Expand-Archive -LiteralPath $aarZip -DestinationPath $aar -Force
$qaSource = Join-Path $repoRoot 'test/native-gba/GbaQaActivity.kt'
$classes = Join-Path $output 'qa-classes.jar'
& $java -cp $compiler org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath "$stdlib;$jna;$android" -d $classes @allSources $qaSource
if ($LASTEXITCODE -ne 0) { throw 'QA Kotlin compile failed' }
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $java)
& (Join-Path $tools 'd8.bat') --min-api 26 --lib $android --output $work $classes $stdlib (Join-Path $aar 'classes.jar')
if ($LASTEXITCODE -ne 0) { throw 'D8 failed' }
node (Join-Path $PSScriptRoot 'generate-gba-qa-rom.mjs')
$lib = Join-Path $work 'lib/x86_64'
New-Item -ItemType Directory -Path $lib -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $aar 'jni/x86_64/libjnidispatch.so') -Destination $lib -Force
$coreZip = Join-Path $output 'mgba-x86_64.zip'
if (-not (Test-Path $coreZip)) { Invoke-WebRequest -Uri 'https://buildbot.libretro.com/nightly/android/latest/x86_64/mgba_libretro_android.so.zip' -OutFile $coreZip }
Expand-Archive -LiteralPath $coreZip -DestinationPath (Join-Path $output 'core') -Force
Copy-Item -LiteralPath (Join-Path $output 'core/mgba_libretro_android.so') -Destination (Join-Path $lib 'libmgba_libretro.so') -Force
$apk = Join-Path $output 'gba-qa.apk'
& (Join-Path $tools 'aapt2.exe') link -o $apk -I $android --manifest (Join-Path $repoRoot 'test/native-gba/AndroidManifest.xml')
if ($LASTEXITCODE -ne 0) { throw 'AAPT failed' }
$jar = Join-Path (Split-Path -Parent $java) 'jar.exe'
& $jar uf $apk -C $work classes.dex -C $work lib -C $work assets
$key = Join-Path $output 'qa.keystore'
if (-not (Test-Path $key)) {
    & (Join-Path (Split-Path -Parent $java) 'keytool.exe') -genkeypair -keystore $key -storepass android -keypass android -alias qa -dname 'CN=Local QA' -keyalg RSA -validity 10000
}
& (Join-Path $tools 'apksigner.bat') sign --ks $key --ks-pass pass:android --key-pass pass:android $apk
if ($LASTEXITCODE -ne 0) { throw 'QA signing failed' }
Write-Output "QA APK: $apk"

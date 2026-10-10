$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path $repoRoot 'artifacts/native-gba-checks'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$cache = Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1'
function Find-Jar([string]$directory, [string]$filename) {
    $found = Get-ChildItem -LiteralPath (Join-Path $cache $directory) -Recurse -File -Filter $filename | Select-Object -First 1
    if (-not $found) { throw "缺少 Kotlin 编译依赖：$directory/$filename" }
    return $found.FullName
}
$stdlib = Find-Jar 'org.jetbrains.kotlin/kotlin-stdlib/2.0.0' 'kotlin-stdlib-2.0.0.jar'
$compiler = @(
    (Find-Jar 'org.jetbrains.kotlin/kotlin-compiler-embeddable/2.0.0' 'kotlin-compiler-embeddable-2.0.0.jar'),
    $stdlib,
    (Find-Jar 'org.jetbrains.kotlin/kotlin-script-runtime/2.0.0' 'kotlin-script-runtime-2.0.0.jar'),
    (Find-Jar 'org.jetbrains.kotlin/kotlin-reflect/1.6.10' 'kotlin-reflect-1.6.10.jar'),
    (Find-Jar 'org.jetbrains.intellij.deps/trove4j/1.0.20200330' 'trove4j-1.0.20200330.jar'),
    (Find-Jar 'org.jetbrains/annotations/13.0' 'annotations-13.0.jar')
) -join ';'
$java = if ($env:JAVA_64_HOME) { Join-Path $env:JAVA_64_HOME 'bin/java.exe' } else { 'F:/AndroidStudio/jbr/bin/java.exe' }
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'F:/AndroidSDK' }
$android = Join-Path $sdk 'platforms/android-36/android.jar'
$jna = Join-Path $output 'jna-5.19.1.jar'
if (-not (Test-Path -LiteralPath $jna)) {
    Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/net/java/dev/jna/jna/5.19.1/jna-5.19.1.jar' -OutFile $jna
}
$native = Join-Path $repoRoot 'src/uni_modules/together-native-gba/utssdk/app-android'
$allSources = @(Get-ChildItem -LiteralPath $native -File -Filter '*.kt' | ForEach-Object FullName)
& $java -cp $compiler org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath "$stdlib;$jna;$android" -d (Join-Path $output 'android-classes.jar') @allSources
if ($LASTEXITCODE -ne 0) { throw 'Android Kotlin 编译失败' }
$tests = Join-Path $output 'rules-test.jar'
& $java -cp $compiler org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath $stdlib -d $tests (Join-Path $native 'GbaInput.kt') (Join-Path $native 'GbaSaveStore.kt') (Join-Path $repoRoot 'test/native-gba/NativeGbaRulesTest.kt')
if ($LASTEXITCODE -ne 0) { throw '原生行为测试编译失败' }
& $java -cp "$stdlib;$tests" uts.sdk.modules.togetherNativeGba.NativeGbaRulesTestKt
if ($LASTEXITCODE -ne 0) { throw '原生行为测试失败' }

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function vueFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  }))
  return nested.flat()
}

test('SubpageHeader exclusively owns subpage top safe-area spacing', async () => {
  const files = await vueFiles('src/pages')
  const subpages: string[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (!source.includes('<SubpageHeader')) continue
    subpages.push(file)
    assert.match(source, /\.shell\{[^}]*\bpadding:0(?:\s|;)/, `${file} must not add top padding above SubpageHeader`)
    assert.doesNotMatch(source, /\.shell\{padding-top:[^}]+\}/, `${file} must leave safe-area spacing to SubpageHeader`)
  }

  assert.equal(subpages.length, 12)
})

test('horizontal scrollers hide their platform scrollbar', async () => {
  const files = await vueFiles('src')
  let scrollerCount = 0
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const tag of source.match(/<scroll-view\b[^>]*\bscroll-x\b[^>]*>/g) || []) {
      scrollerCount += 1
      assert.match(tag, /show-scrollbar="false"/, `${file} must disable the native scrollbar`)
      assert.match(tag, /class="[^"]*scrollbar-hidden/, `${file} must use the shared scrollbar-hiding class`)
    }
  }
  assert.ok(scrollerCount >= 3)
})

test('home feeds own the lower scroll region instead of scrolling the full page', async () => {
  const source = await readFile('src/pages/index/index.vue', 'utf8')
  assert.match(source, /class="feed-scroll scrollbar-hidden"\s+scroll-y/)
  assert.match(source, /\.feed-shell\{[^}]*height:100vh[^}]*overflow:hidden/)
})

test('reminder time uses the consistent two-column picker', async () => {
  const editor = await readFile('src/pages/editor/editor.vue', 'utf8')
  const picker = await readFile('src/components/TimePickerField.vue', 'utf8')
  assert.match(editor, /<TimePickerField\s+v-model="time"/)
  assert.doesNotMatch(editor, /picker\s+mode="time"/)
  assert.match(picker, /mode="multiSelector"/)
})

test('editor textareas keep long content inside their rounded frame', async () => {
  const editor = await readFile('src/pages/editor/editor.vue', 'utf8')
  assert.match(editor, /<textarea\s+class="content-input"/)
  assert.match(editor, /\.form \.content-input\{[^}]*height:148px[^}]*max-height:148px/)
  assert.match(editor, /\.form \.links-input\{[^}]*height:82px[^}]*max-height:82px/)
  assert.match(editor, /\.form textarea\{[^}]*overflow-y:auto/)
})

test('privacy policy describes salted password digests without the missing particle', async () => {
  const source = await readFile('src/pages/legal/legal.vue', 'utf8')
  assert.match(source, /加盐后的密码摘要/)
  assert.doesNotMatch(source, /加盐密码摘要/)
})

test('Android home widget guidance points Huawei users to the correct launcher entry', async () => {
  const profile = await readFile('src/pages/us/us.vue', 'utf8')
  const strings = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/values/strings.xml', 'utf8')
  assert.match(profile, /进入“窗口小工具”/)
  assert.match(profile, /0\.2\.7[^']+会被华为分到 L/)
  assert.match(profile, /不会出现在 HarmonyOS 的“服务卡片”列表中/)
  assert.match(strings, /小记桌面卡片/)
})

test('Android app checks for native-base-compatible resource updates without interrupting other platforms', async () => {
  const app = await readFile('src/App.vue', 'utf8')
  const updater = await readFile('src/services/app-update.ts', 'utf8')
  assert.match(app, /checkForAppResourceUpdate/)
  assert.match(updater, /#ifdef APP-PLUS/)
  assert.match(updater, /plus\.runtime\.install/)
  assert.match(updater, /canInstallResourceUpdate/)
  assert.doesNotMatch(updater, /showToast\([^)]*更新失败/)
})

test('cloud novels open from a lightweight catalog and fetch one chapter at a time', async () => {
  const library = await readFile('src/pages/library/library.vue', 'utf8')
  const reader = await readFile('src/pages/reader/reader.vue', 'utf8')
  const api = await readFile('src/services/api.ts', 'utf8')
  assert.match(library, /getCloudNovelCatalog/)
  assert.match(library, /开始阅读/)
  assert.doesNotMatch(library, /下载中|重新下载/)
  assert.match(reader, /getCloudNovelChapter/)
  assert.match(reader, /重新加载/)
  assert.match(api, /\/chapters\/'/)
})

test('nickname editing uses the shared raster icon asset', async () => {
  const source = await readFile('src/pages/us/us.vue', 'utf8')
  assert.match(source, /nav-icons\/edit-active\.png/)
  assert.doesNotMatch(source, /class="pencil-icon"/)
})

test('background native sync failures do not break the main data refresh', async () => {
  const reminders = await readFile('src/services/local-reminders.ts', 'utf8')
  const widget = await readFile('src/services/home-widget.ts', 'utf8')
  const index = await readFile('src/pages/index/index.vue', 'utf8')
  assert.match(reminders, /runNativeSafely/)
  assert.match(widget, /runNativeSafely/)
  assert.doesNotMatch(index, /'操作失败'/)
  assert.match(index, /showActionError/)
})

test('reader controls stay immersive and chapter read state is visible in the directory sheet', async () => {
  const reader = await readFile('src/pages/reader/reader.vue', 'utf8')
  const progress = await readFile('src/services/reader.ts', 'utf8')
  assert.match(reader, /class="reading-surface" @click="toggleControls"/)
  assert.match(reader, /v-if="controlsVisible" class="reader-chrome"/)
  assert.match(reader, /class="sheet directory-sheet"/)
  assert.match(reader, /readChapterIndexes\.has\(entry\.index\)/)
  assert.match(reader, /DIRECTORY_PAGE_SIZE = 10/)
  assert.match(reader, /<StatusIcon/)
  assert.match(reader, /@touchstart="onReadingTouchStart" @touchend="onReadingTouchEnd"/)
  assert.match(reader, /playPageTurnSound/)
  assert.match(progress, /readChapterIndexes/)
})

test('Android home widget isolates text cards from its image carousel and keeps image payloads small', async () => {
  const native = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherHomeWidgetNative.kt', 'utf8')
  const provider = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/xml-v31/together_note_widget_info.xml', 'utf8')
  assert.match(native, /R\.layout\.together_note_widget_text/)
  assert.match(native, /if \(hasImages\) manager\.notifyAppWidgetViewDataChanged/)
  assert.match(native, /MAX_WIDGET_IMAGE_EDGE = 720/)
  assert.match(provider, /autoAdvanceViewId="@id\/together_widget_images"/)
})

test('notes can select desktop content from the App and attachments use the shared image gallery', async () => {
  const detail = await readFile('src/pages/detail/detail.vue', 'utf8')
  const header = await readFile('src/components/SubpageHeader.vue', 'utf8')
  const gallery = await readFile('src/components/ImageAttachmentGallery.vue', 'utf8')
  const widget = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherHomeWidgetNative.kt', 'utf8')
  const provider = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/xml-v31/together_note_widget_info.xml', 'utf8')
  assert.match(detail, /展示到桌面/)
  assert.match(detail, /selectHomeWidgetNote/)
  assert.match(detail, /<ImageAttachmentGallery/)
  assert.match(header, /actionLabel/)
  assert.match(gallery, /grid-template-columns:repeat\(3/)
  assert.match(gallery, /height:66\.667vh/)
  assert.match(gallery, /mode="aspectFit"/)
  assert.match(widget, /together_widget_configure/)
  assert.match(widget, /selectAll/)
  assert.match(provider, /widgetFeatures="reconfigurable"/)
})

test('the profile shows the build version and release scripts separate native from hot updates', async () => {
  const profile = await readFile('src/pages/us/us.vue', 'utf8')
  const vite = await readFile('vite.config.ts', 'utf8')
  const bump = await readFile('scripts/bump-app-version.mjs', 'utf8')
  assert.match(profile, /v\{\{ appVersion \}\}/)
  assert.match(vite, /VITE_APP_VERSION/)
  assert.match(bump, /mode === 'native'/)
  assert.match(bump, /update\.nativeMinVersion = version/)
})

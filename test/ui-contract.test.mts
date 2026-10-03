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

  assert.ok(subpages.length >= 12)
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

test('games are App-only, componentized, and never bundle a Pokemon ROM', async () => {
  const home = await readFile('src/pages/index/index.vue', 'utf8')
  const pages = await readFile('src/pages.json', 'utf8')
  const catalog = await readFile('src/features/games/game-catalog.ts', 'utf8')
  const hub = await readFile('src/features/games/components/GameHub.vue', 'utf8')
  const player = await readFile('src/features/games/components/WebGamePlayer.vue', 'utf8')
  const playerPage = await readFile('src/pages/game-player/game-player.vue', 'utf8')

  assert.match(home, /#ifdef APP-PLUS[^]*class="game-trigger"/)
  assert.match(home, /openGames\(\).*pages\/games\/games/)
  assert.match(pages, /#ifdef APP-PLUS[^]*pages\/games\/games[^]*pages\/game-player\/game-player[^]*#endif/)
  assert.match(catalog, /口袋妖怪漆黑的魅影 4\.5/)
  assert.match(catalog, /https:\/\/demo\.emulatorjs\.org\//)
  assert.match(catalog, /requiresOwnedRom: true/)
  assert.match(catalog, /https:\/\/puzzles\.twistymaze\.com\/solo/)
  assert.match(catalog, /license: 'MIT'/)
  assert.equal((catalog.match(/\bid: '/g) || []).length, 2)
  assert.match(hub, /defineEmits<\{ select:/)
  assert.match(player, /plus\.webview\.create\(this\.url/)
  assert.match(player, /plusrequire: 'none'/)
  assert.match(player, /class="retry-button"/)
  assert.match(player, /appendWhenOwnerReady\(child, 0\)/)
  assert.match(player, /attempt >= OWNER_RETRY_LIMIT/)
  assert.match(player, /if \(this\.childWebview !== child\) return/)
  assert.match(player, /this\.failWebGame\(child\)/)
  assert.match(playerPage, /findGame\(String\(options\?\.id \|\| ''\)\)/)
  assert.doesNotMatch(playerPage, /options\.(?:url|src)/)
  assert.doesNotMatch(catalog, /https?:\/\/[^\s'"`]+\.gba(?:[?'"`]|$)/i)
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
  assert.doesNotMatch(reader, /<StatusIcon/)
  assert.match(reader, /class="current-label">正在读/)
  assert.match(reader, /\.chapter-row\.read\{color:#625744\}/)
  assert.match(reader, /\.directory-scroll\{height:auto;min-height:0;flex:1[^}]*\}/)
  assert.match(reader, /@touchstart="onReadingTouchStart" @touchend="onReadingTouchEnd"/)
  assert.match(reader, /playPageTurnSound/)
  assert.match(progress, /readChapterIndexes/)
})

test('Android home widget isolates text cards from its image carousel and keeps image payloads small', async () => {
  const native = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherHomeWidgetNative.kt', 'utf8')
  const imageLayout = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/layout/together_note_widget.xml', 'utf8')
  const image = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/layout/together_widget_image.xml', 'utf8')
  const provider = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/xml-v31/together_note_widget_info.xml', 'utf8')
  assert.match(native, /R\.layout\.together_note_widget_text/)
  assert.match(native, /if \(hasImages\) manager\.notifyAppWidgetViewDataChanged/)
  assert.match(native, /setPendingIntentTemplate\(R\.id\.together_widget_images/)
  assert.match(native, /setOnClickFillInIntent\(R\.id\.together_widget_image/)
  assert.match(native, /MAX_WIDGET_IMAGE_EDGE = 720/)
  assert.doesNotMatch(imageLayout, /together_widget_title|together_widget_body|together_widget_date/)
  assert.match(imageLayout, /layout_height="match_parent"/)
  assert.match(image, /scaleType="fitCenter"/)
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
  assert.match(gallery, /height:100%;min-height:0/)
  assert.match(gallery, /statusBarHeight \+ 8/)
  assert.match(gallery, /mode="aspectFit"/)
  assert.match(widget, /together_widget_configure/)
  assert.match(widget, /selectAll/)
  assert.match(provider, /widgetFeatures="reconfigurable"/)
})

test('reminder messages open their detail and become read from the detail page', async () => {
  const inbox = await readFile('src/pages/inbox/inbox.vue', 'utf8')
  const detail = await readFile('src/pages/detail/detail.vue', 'utf8')
  const app = await readFile('src/App.vue', 'utf8')
  const native = await readFile('src/uni_modules/together-local-reminder/utssdk/app-android/LocalReminderNative.kt', 'utf8')
  assert.doesNotMatch(inbox, /request\('\/notifications\/read'/)
  assert.match(inbox, /pages\/detail\/detail\?id=/)
  assert.match(inbox, /const cachedMessages = readHomeSnapshot/)
  assert.match(inbox, /loading\.value = !loaded/)
  assert.match(detail, /void request\('\/notifications\/read', 'POST', \{ itemId: item\.value\.id \}\)/)
  assert.match(app, /consumeLocalReminderRoute\(\) \|\| consumeHomeWidgetRoute\(\)/)
  assert.match(native, /fun consumeRoute\(activity: Activity\): String/)
})

test('the home feed restores its account-scoped snapshot before refreshing in the background', async () => {
  const home = await readFile('src/pages/index/index.vue', 'utf8')
  const api = await readFile('src/services/api.ts', 'utf8')
  assert.match(home, /restoreHomeSnapshot\(\);try/)
  assert.match(home, /if\(!refreshing\)refreshing=performRefresh\(\)/)
  assert.match(api, /cached\.session!==session/)
  assert.match(api, /saveHomeSnapshot/)
})

test('the reminder editor requests WeChat authorization from save without a separate switch', async () => {
  const editor = await readFile('src/pages/editor/editor.vue', 'utf8')
  assert.match(editor, /if \(wechatAuthorizationRequested\) wechatSubscribe = await requestWechatReminderAuthorization\(\)/)
  assert.doesNotMatch(editor, /@change="wechatChange"/)
  assert.match(editor, /不需要另开开关/)
  assert.match(editor, /“我们俩”会分别使用双方尚未消费的授权/)
  assert.match(editor, /无需另开设置按钮/)
  assert.match(editor, /wechatStatusRequest = request<\{ configured: boolean; templateId: string \| null \}>\('\/wechat\/subscription\/status'\)/)
})

test('paper notes expose the five requested tools and persist structured content', async () => {
  const editor = await readFile('src/pages/editor/editor.vue', 'utf8')
  const structured = await readFile('src/components/StructuredNoteEditor.vue', 'utf8')
  const detail = await readFile('src/pages/detail/detail.vue', 'utf8')
  const server = await readFile('server/index.mjs', 'utf8')
  assert.match(editor, /action-label="headerActionLabel"/)
  assert.match(editor, /灵感纸/)
  for (const label of ['手写', '待办', '段落', '图片', '链接']) assert.match(structured, new RegExp(`label: '${label}'`))
  assert.match(structured, /<HandwritingPad/)
  assert.match(structured, /onMounted\(\(\) => \{\s*if \(!props\.blocks\.length\) update\(\[paragraphBlock\(\)\]\)/)
  assert.match(structured, /<LedgerSummary v-if="ledgerSummary"/)
  assert.match(detail, /<StructuredNoteContent/)
  assert.match(server, /sanitizeNoteBlocks/)
})

test('paper note handwriting and todo rows remain directly interactive on mobile', async () => {
  const handwriting = await readFile('src/components/HandwritingPad.vue', 'utf8')
  const statusIcon = await readFile('src/components/StatusIcon.vue', 'utf8')
  const editor = await readFile('src/components/StructuredNoteEditor.vue', 'utf8')
  const content = await readFile('src/components/StructuredNoteContent.vue', 'utf8')
  const detail = await readFile('src/pages/detail/detail.vue', 'utf8')
  assert.match(handwriting, /canvas-id="note-handwriting-pad"/)
  assert.match(handwriting, /strokes\.push/)
  assert.match(handwriting, /@touchstart\.stop\.prevent="start"/)
  assert.match(handwriting, /lang="renderjs"/)
  assert.doesNotMatch(handwriting, /<script setup/)
  assert.match(handwriting, /<canvas[\s\S]*id="note-handwriting-app-pad"/)
  assert.match(handwriting, /resolveCanvas\(\)/)
  assert.match(handwriting, /root\.matches\('\.app-pad-canvas'\)/)
  assert.match(handwriting, /querySelector\('canvas'\)/)
  assert.match(handwriting, /addEventListener\('touchstart'/)
  assert.match(handwriting, /appInputMode: 'pending'/)
  assert.match(handwriting, /activateAppFallback\(\)/)
  assert.match(handwriting, /command\.action === 'fallback'/)
  assert.match(handwriting, /onTouchStart\(event\)\s*\{\s*if \(this\.disabled\) return\s*event\.preventDefault\(\)/)
  assert.match(handwriting, /onTouchMove\(event\)\s*\{\s*if \(this\.disabled\) return\s*event\.preventDefault\(\)/)
  assert.match(handwriting, /onTouchEnd\(event\)\s*\{\s*if \(this\.disabled\) return\s*event\.preventDefault\(\)/)
  assert.match(handwriting, /markAppFallbackReady\(\)/)
  assert.match(handwriting, /appInputMode === 'fallback' && !appFallbackReady/)
  assert.match(handwriting, /command\.action === 'fallback'[\s\S]*this\.disabled = true[\s\S]*callMethod\('markAppFallbackReady'\)/)
  assert.match(handwriting, /beforeUnmount\(\)[\s\S]*clearTimeout\(this\.appRendererTimer\)[\s\S]*clearTimeout\(this\.appFallbackTimer\)/)
  assert.match(handwriting, /scheduleMount\(attempt\)\s*\{\s*if \(this\.disabled\) return/)
  assert.match(handwriting, /retryResize\(attempt\)\s*\{\s*if \(this\.disabled\) return/)
  assert.match(handwriting, /resizeCanvas\(\)\s*\{\s*if \(this\.disabled\) return/)
  assert.match(handwriting, /command\.action === 'fallback'[\s\S]*resizeObserver\.disconnect\(\)[\s\S]*removeEventListener\('resize'/)
  assert.match(handwriting, /Math\.min\(1800,/)
  assert.match(handwriting, /height: 1800px/)
  assert.match(handwriting, /:hidpi="false"/)
  assert.doesNotMatch(handwriting, /<script setup/)
  assert.match(handwriting, /mounted\(\) \{\s*this\.\$nextTick\(\(\) => this\.scheduleMount\(0\)\)/)
  assert.match(handwriting, /addEventListener\('touchstart'/)
  assert.match(handwriting, /class="pad-canvas app-pad-canvas"/)
  assert.match(handwriting, /this\.canvas\.getContext\('2d'\)/)
  assert.match(handwriting, /callMethod\('receiveAppDrawing', payload\)/)
  assert.match(handwriting, /canvas-id="note-handwriting-app-export"/)
  assert.doesNotMatch(handwriting, /class="pad-layer" @touchmove\.stop\.prevent/)
  assert.match(statusIcon, /\.status-icon\.large\{width:26px;height:26px;flex-basis:26px/)
  assert.match(statusIcon, /\.status-icon\.large\.checked\{border-color:#b8953d;background:#f7e7ad\}/)
  assert.match(editor, /<StatusIcon :checked="Boolean\(block\.checked\)" size="large"/)
  assert.match(editor, /class="todo-row"[^>]*@click="toggleTodo\(block\.id\)"/)
  assert.doesNotMatch(editor, /<StatusIcon :done=/)
  assert.match(content, /emit\('toggle-todo',block\.id\)/)
  assert.match(detail, /async function toggleNoteTodo/)
  assert.match(detail, /@toggle-todo="toggleNoteTodo"/)
})

test('reader sheets lock the page and pagination labels are optically centered', async () => {
  const reader = await readFile('src/pages/reader/reader.vue', 'utf8')
  assert.match(reader, /<page-meta :page-style="panelPageStyle"/)
  assert.match(reader, /@touchmove\.stop\.prevent/)
  assert.match(reader, /\.directory-pagination button\{[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center[^}]*padding:0/)
})

test('Android periodically syncs reminders targeted to either partner', async () => {
  const home = await readFile('src/pages/index/index.vue', 'utf8')
  const native = await readFile('src/uni_modules/together-local-reminder/utssdk/app-android/LocalReminderNative.kt', 'utf8')
  const server = await readFile('server/index.mjs', 'utf8')
  assert.match(home, /configureBackgroundReminderSync\(\)/)
  assert.match(native, /SYNC_INTERVAL_MS = 15L \* 60L \* 1000L/)
  assert.match(native, /class ReminderSyncReceiver/)
  assert.match(server, /path==='\/reminders\/sync'/)
  assert.match(server, /reminderUsers\(item,data\)\.some/)
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

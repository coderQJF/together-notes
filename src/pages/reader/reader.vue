<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import JellyTabs from '../../components/JellyTabs.vue'
import ReaderPager from '../../components/ReaderPager.vue'
import ReaderToolIcon from '../../components/ReaderToolIcon.vue'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { getCloudNovelCatalog, getCloudNovelChapter } from '../../services/api'
import { ensureReaderVipAccess } from '../../services/reader-access'
import { destroyPageTurnSound, playPageTurnSound, preparePageTurnSound } from '../../services/page-turn-sound'
import {
  getReaderBook, loadReaderSettings, saveReaderProgress, saveReaderSettings,
  prepareCloudReaderBook, saveReaderBook,
  type ReaderBook, type ReaderSettings, type ReaderTheme,
} from '../../services/reader'

const book = ref<ReaderBook | null>(null)
const error = ref('')
const accessChecking = ref(true)
const chapterIndex = ref(0)
const chapterContent = ref('')
const chapterLoading = ref(false)
const chapterError = ref('')
const characterOffset = ref(0)
const legacyScrollTop = ref(0)
const pageInfo = ref({ index: 0, count: 1, offset: 0, end: 0 })
const pager = ref<InstanceType<typeof ReaderPager> | null>(null)
const controlsVisible = ref(false)
const directoryOpen = ref(false)
const directoryPage = ref(0)
const settingsOpen = ref(false)
const panelOpen = computed(() => directoryOpen.value || settingsOpen.value)
const panelPageStyle = 'overflow: hidden; height: 100%; overscroll-behavior: none;'
const settings = ref<ReaderSettings>(loadReaderSettings())
const nativeInsets = ref<Record<string, string>>({})
const themeTabs = [{ key: 'paper', label: '米白' }, { key: 'butter', label: '奶油' }, { key: 'white', label: '纯白' }, { key: 'night', label: '夜间' }]
const lineHeightTabs = [{ key: '1.8', label: '紧凑' }, { key: '2.15', label: '舒适' }, { key: '2.3', label: '宽松' }]
const DIRECTORY_PAGE_SIZE = 10
let saveTimer: ReturnType<typeof setTimeout> | undefined
let chapterRequest = 0
let changingChapter = false
let previousStatusBarStyle = 'dark'
let previousStatusBarBackground = '#faf8f2'
const chapterCache = new Map<number, string>()

const chapter = computed(() => book.value?.chapters[chapterIndex.value] || null)
const progress = computed(() => book.value ? Math.min(100, Math.round(((chapterIndex.value + (pageInfo.value.index + 1) / pageInfo.value.count) / book.value.chapters.length) * 100)) : 0)
const readChapterIndexes = computed(() => new Set(book.value?.progress.readChapterIndexes || []))
const firstPage = computed(() => chapterIndex.value === 0 && pageInfo.value.index === 0)
const lastPage = computed(() => Boolean(book.value && chapterIndex.value === book.value.chapters.length - 1 && pageInfo.value.index === pageInfo.value.count - 1))
const directoryPageCount = computed(() => Math.max(1, Math.ceil((book.value?.chapters.length || 0) / DIRECTORY_PAGE_SIZE)))
const directoryChapters = computed(() => {
  const start = directoryPage.value * DIRECTORY_PAGE_SIZE
  return (book.value?.chapters || []).slice(start, start + DIRECTORY_PAGE_SIZE).map((item, offset) => ({ item, index: start + offset }))
})
const directoryRange = computed(() => {
  const total = book.value?.chapters.length || 0
  const start = directoryPage.value * DIRECTORY_PAGE_SIZE + 1
  return total ? `第 ${start}–${Math.min(total, start + DIRECTORY_PAGE_SIZE - 1)} 章` : ''
})

function persistProgress() {
  if (!book.value || changingChapter || chapterLoading.value) return
  const saved = saveReaderProgress(book.value.id, chapterIndex.value, legacyScrollTop.value, legacyScrollTop.value ? undefined : characterOffset.value)
  if (saved) book.value.progress = saved
}

function onPosition(offset: number) {
  characterOffset.value = offset
  legacyScrollTop.value = 0
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistProgress, 200)
}

function onPageInfo(value: typeof pageInfo.value) {
  pageInfo.value = value
  if (legacyScrollTop.value && chapterContent.value) onPosition(value.offset)
}

async function loadChapterContent(index: number) {
  const currentBook = book.value
  const currentChapter = currentBook?.chapters[index]
  if (!currentBook || !currentChapter) return
  const request = ++chapterRequest
  chapterError.value = ''
  if (currentChapter.content || chapterCache.has(index)) {
    chapterContent.value = currentChapter.content || chapterCache.get(index) || ''
    chapterLoading.value = false
    return
  }
  if (currentBook.source !== 'cloud' || !currentBook.cloudId) {
    chapterContent.value = ''
    chapterLoading.value = false
    chapterError.value = '这一章没有可阅读的正文'
    return
  }
  chapterContent.value = ''
  chapterLoading.value = true
  try {
    const result = await getCloudNovelChapter(currentBook.cloudId, currentChapter.remoteIndex ?? index)
    if (request !== chapterRequest) return
    chapterCache.set(index, result.content)
    chapterContent.value = result.content
  } catch (reason) {
    if (request !== chapterRequest) return
    chapterError.value = reason instanceof Error ? reason.message : '本章加载失败'
  } finally {
    if (request === chapterRequest) chapterLoading.value = false
  }
}

async function openChapter(index: number, restore = false, atEnd = false, keepControls = false) {
  if (!book.value || changingChapter) return
  clearTimeout(saveTimer)
  if (!restore) persistProgress()
  changingChapter = true
  const saved = book.value.progress
  chapterIndex.value = Math.max(0, Math.min(book.value.chapters.length - 1, index))
  characterOffset.value = restore ? Math.max(0, saved.characterOffset || 0) : 0
  legacyScrollTop.value = restore && saved.characterOffset === undefined ? Math.max(0, saved.scrollTop || 0) : 0
  pageInfo.value = { index: 0, count: 1, offset: 0, end: 0 }
  directoryOpen.value = false
  settingsOpen.value = false
  controlsVisible.value = keepControls
  await loadChapterContent(chapterIndex.value)
  if (atEnd) characterOffset.value = Math.max(0, chapterContent.value.length - 1)
  changingChapter = false
  persistProgress()
}

function pageTurnSound() { void playPageTurnSound(settings.value.pageSound) }

async function turnChapter(direction: -1 | 1) {
  if (!book.value || chapterLoading.value || changingChapter) return
  const target = chapterIndex.value + direction
  if (target < 0 || target >= book.value.chapters.length) return
  pageTurnSound()
  await openChapter(target, false, direction < 0, controlsVisible.value)
}

function turnPage(direction: -1 | 1) { pager.value?.turn(direction) }
function toggleControls() { if (!panelOpen.value) controlsVisible.value = !controlsVisible.value }
function toggleDirectory() {
  directoryOpen.value = !directoryOpen.value
  if (directoryOpen.value) directoryPage.value = Math.floor(chapterIndex.value / DIRECTORY_PAGE_SIZE)
  settingsOpen.value = false
  controlsVisible.value = false
}
function changeDirectoryPage(step: number) { directoryPage.value = Math.max(0, Math.min(directoryPageCount.value - 1, directoryPage.value + step)) }
function toggleSettings() { settingsOpen.value = !settingsOpen.value; directoryOpen.value = false; controlsVisible.value = false }
function closePanel() { directoryOpen.value = false; settingsOpen.value = false; controlsVisible.value = true }

function syncStatusBar() {
  // #ifdef APP-PLUS
  const navigator = (globalThis as any).plus?.navigator
  navigator?.setStatusBarStyle(settings.value.theme === 'night' ? 'light' : 'dark')
  const colors = { paper: '#faf8f2', butter: '#f8edc4', white: '#ffffff', night: '#222321' }
  navigator?.setStatusBarBackground(colors[settings.value.theme])
  // #endif
}

function updateSettings(next: Partial<ReaderSettings>) {
  settings.value = { ...settings.value, ...next }
  saveReaderSettings(settings.value)
  syncStatusBar()
}
function selectTheme(value: string) {
  const theme = value as ReaderTheme
  updateSettings({ theme, dayTheme: theme === 'night' ? (settings.value.theme === 'night' ? settings.value.dayTheme || 'butter' : settings.value.theme) : theme })
}
function toggleDayNight() {
  if (settings.value.theme === 'night') selectTheme(settings.value.dayTheme || 'butter')
  else updateSettings({ dayTheme: settings.value.theme, theme: 'night' })
}
function selectLineHeight(value: string) { updateSettings({ lineHeight: Number(value) }) }
function changeFontSize(step: number) { updateSettings({ fontSize: Math.max(15, Math.min(26, settings.value.fontSize + step)) }) }
function changePageSound(event: any) { updateSettings({ pageSound: Boolean(event.detail.value) }) }
function backToLibrary() { uni.redirectTo({ url: '/pages/library/library' }) }

onLoad(async options => {
  // #ifdef APP-PLUS
  const info = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
  nativeInsets.value = { '--reader-safe-top': `${info.statusBarHeight || 0}px`, '--reader-safe-bottom': `${info.safeAreaInsets?.bottom || 0}px` }
  const navigator = (globalThis as any).plus?.navigator
  previousStatusBarStyle = navigator?.getStatusBarStyle?.() || 'dark'
  previousStatusBarBackground = navigator?.getStatusBarBackground?.() || '#faf8f2'
  // #endif
  syncStatusBar()
  const bookId = typeof options?.id === 'string' ? decodeURIComponent(options.id) : ''
  if (!await ensureReaderVipAccess()) { accessChecking.value = false; return }
  book.value = bookId ? getReaderBook(bookId) : null
  if (book.value?.source === 'cloud' && book.value.cloudId) {
    try { book.value = saveReaderBook(prepareCloudReaderBook(await getCloudNovelCatalog(book.value.cloudId))) }
    catch (reason) { error.value = reason instanceof Error ? reason.message : '目录更新失败，请返回书架重试'; accessChecking.value = false; return }
  }
  accessChecking.value = false
  if (!book.value) { error.value = '这本书不在当前设备的书架中'; return }
  void preparePageTurnSound()
  await openChapter(book.value.progress.chapterIndex || 0, true)
})

function cleanup() {
  clearTimeout(saveTimer)
  persistProgress()
  destroyPageTurnSound()
  // #ifdef APP-PLUS
  const navigator = (globalThis as any).plus?.navigator
  navigator?.setStatusBarStyle(previousStatusBarStyle)
  navigator?.setStatusBarBackground(previousStatusBarBackground)
  // #endif
}
onUnload(cleanup)
onBeforeUnmount(() => clearTimeout(saveTimer))
</script>

<template>
  <page-meta :page-style="panelPageStyle" />
  <view class="reader-shell" :class="`theme-${settings.theme}`" :style="nativeInsets" @touchmove.stop.prevent>
    <template v-if="accessChecking || error">
      <SubpageHeader label="阅读" fallback="/pages/library/library" />
      <view v-if="accessChecking" class="reader-loading"><text>正在打开…</text></view>
      <view v-else class="state-card"><text class="state-title">无法打开</text><text>{{ error }}</text><button @click="backToLibrary">返回书架</button></view>
    </template>
    <template v-else-if="book && chapter">
      <view class="reading-surface">
        <ReaderPager ref="pager" :content="chapterContent" :position="characterOffset" :legacy-scroll-top="legacyScrollTop" :font-size="settings.fontSize" :line-height="settings.lineHeight" :blocked="panelOpen || chapterLoading" @update:position="onPosition" @page="onPageInfo" @boundary="turnChapter" @turn="pageTurnSound" @tap="toggleControls">
          <template #header>
            <view class="reader-meta"><text>{{ book.author }}</text><text>第 {{ chapterIndex + 1 }} / {{ book.chapters.length }} 章 · {{ progress }}%</text></view>
            <view class="chapter-heading"><text class="book-name">{{ book.title }}</text><text class="chapter-title">{{ chapter.title }}</text></view>
          </template>
          <view v-if="chapterLoading" class="reader-loading"><text>正在加载本章…</text></view>
          <view v-else-if="chapterError" class="state-card chapter-state" @click.stop><text class="state-title">本章暂时没打开</text><text>{{ chapterError }}</text><button @click="loadChapterContent(chapterIndex)">重新加载</button></view>
        </ReaderPager>
      </view>
      <view v-if="controlsVisible" class="reader-chrome" @click.stop>
        <view class="top-chrome"><SubpageHeader :label="chapter.title" fallback="/pages/library/library" /></view>
        <view class="bottom-chrome">
          <view class="chapter-control-row">
            <button :disabled="chapterLoading || firstPage" aria-label="上一页" @click="turnPage(-1)">上一页</button>
            <view class="progress-control"><view class="progress-track"><view :style="{ width: `${progress}%` }" /></view><text>{{ progress }}%</text></view>
            <button :disabled="chapterLoading || lastPage" aria-label="下一页" @click="turnPage(1)">下一页</button>
          </view>
          <view class="tool-control-row">
            <button aria-label="打开目录" @click="toggleDirectory"><image class="directory-icon" src="/static/nav-icons/book-active.png" mode="aspectFit" /><text>目录</text></button>
            <button :aria-label="settings.theme === 'night' ? '切换白天模式' : '切换夜间模式'" @click="toggleDayNight"><ReaderToolIcon :kind="settings.theme === 'night' ? 'day' : 'night'" /><text>{{ settings.theme === 'night' ? '白天' : '夜间' }}</text></button>
            <button aria-label="打开阅读设置" @click="toggleSettings"><ReaderToolIcon kind="settings" /><text>设置</text></button>
          </view>
        </view>
      </view>
      <view v-if="directoryOpen" class="sheet-layer" @click="closePanel" @touchmove.stop.prevent>
        <view class="sheet directory-sheet" @click.stop>
          <view class="sheet-handle" />
          <view class="sheet-heading"><view><text class="sheet-title">{{ book.title }}</text><text class="sheet-subtitle">{{ book.author }} · {{ book.chapters.length }} 章</text></view><button aria-label="关闭目录" @click="closePanel"><view class="close-icon" /></button></view>
          <view class="directory-summary"><view><text>目录</text><text>{{ directoryRange }}</text></view><text>已读 {{ readChapterIndexes.size }} 章</text></view>
          <scroll-view class="directory-scroll scrollbar-hidden" scroll-y show-scrollbar="false" @touchmove.stop>
            <button v-for="entry in directoryChapters" :key="`${entry.index}-${entry.item.title}`" class="chapter-row" :class="{ read: readChapterIndexes.has(entry.index), current: entry.index === chapterIndex }" :aria-current="entry.index === chapterIndex ? 'page' : undefined" @click="openChapter(entry.index)"><text>{{ entry.item.title }}</text><text v-if="entry.index === chapterIndex" class="current-label">正在读</text></button>
          </scroll-view>
          <view v-if="directoryPageCount > 1" class="directory-pagination"><button :disabled="directoryPage === 0" @click="changeDirectoryPage(-1)">上一页</button><text>{{ directoryPage + 1 }} / {{ directoryPageCount }}</text><button :disabled="directoryPage >= directoryPageCount - 1" @click="changeDirectoryPage(1)">下一页</button></view>
        </view>
      </view>
      <view v-if="settingsOpen" class="sheet-layer" @click="closePanel" @touchmove.stop.prevent>
        <view class="sheet settings-sheet" @click.stop>
          <view class="sheet-handle" />
          <view class="sheet-heading"><text class="sheet-title">阅读设置</text><button aria-label="关闭阅读设置" @click="closePanel"><view class="close-icon" /></button></view>
          <text class="setting-label">阅读背景</text>
          <JellyTabs compact :model-value="settings.theme" :options="themeTabs" aria-label="选择阅读背景" @change="selectTheme" />
          <view class="font-setting"><view><text class="setting-label">正文字号</text><text>{{ settings.fontSize }} px</text></view><view class="stepper"><button aria-label="缩小正文字号" :disabled="settings.fontSize <= 15" @click="changeFontSize(-1)"><view class="minus-icon" /></button><button aria-label="放大正文字号" :disabled="settings.fontSize >= 26" @click="changeFontSize(1)"><view class="plus-icon" /></button></view></view>
          <text class="setting-label line-label">行间距</text>
          <JellyTabs compact :model-value="String(settings.lineHeight)" :options="lineHeightTabs" aria-label="选择正文行距" @change="selectLineHeight" />
          <view class="sound-setting"><view><text class="setting-label">翻书音效</text><text>翻页时播放轻柔纸张声</text></view><switch color="#b28b35" :checked="settings.pageSound" @change="changePageSound" /></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped>
.reader-shell{--reader-background:#faf8f2;--reader-text:#3e382d;--reader-muted:#887b65;--reader-border:rgba(111,96,65,.16);--reader-control:rgba(255,255,255,.55);--reader-accent:#9a6b06;--panel-background:#fff;--subpage-background:var(--reader-background);--subpage-text:var(--reader-text);--subpage-muted:var(--reader-muted);position:fixed;inset:0;width:100%;max-width:640px;margin:0 auto;overflow:hidden;overscroll-behavior:none;touch-action:auto;background:var(--reader-background);color:var(--reader-text);box-sizing:border-box}.theme-paper{--reader-background:#faf8f2}.theme-butter{--reader-background:#f8edc4;--panel-background:#fff9e9;--reader-texture:radial-gradient(circle at 13% 17%,rgba(171,126,28,.04) 0 1px,transparent 1.5px),radial-gradient(circle at 79% 41%,rgba(131,96,25,.03) 0 1px,transparent 1.4px)}.theme-white{--reader-background:#fff;--panel-background:#faf8f2}.theme-night{--reader-background:#222321;--reader-text:#c9c7bf;--reader-muted:#a19e93;--reader-border:rgba(211,202,178,.17);--reader-control:#343530;--reader-accent:#dec780;--panel-background:#2b2c28;--subpage-badge-background:#424234;--subpage-badge-text:#e5d29a;--tabs-background:#343530;--tabs-border:#545449;--tabs-text:#bebbb0;--tabs-indicator:#d8c17e;--tabs-active-text:#25251e}.reading-surface{height:100%;padding:calc(14px + max(env(safe-area-inset-top),var(--reader-safe-top,0px))) calc(24px + env(safe-area-inset-right)) calc(12px + max(env(safe-area-inset-bottom),var(--reader-safe-bottom,0px))) calc(24px + env(safe-area-inset-left));overflow:hidden;box-sizing:border-box}.reader-loading{display:flex;align-items:center;justify-content:center;min-height:160px;color:var(--reader-muted)}.reader-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--reader-muted);font-size:10px;line-height:16px}.reader-meta text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reader-meta text:last-child{flex:0 0 auto}.chapter-heading{padding-top:10px;min-width:0}.book-name{display:block;overflow:hidden;color:var(--reader-muted);font-size:11px;line-height:17px;text-overflow:ellipsis;white-space:nowrap}.chapter-title{display:block;overflow:hidden;margin-top:3px;color:var(--reader-text);font-size:18px;font-weight:650;line-height:26px;text-overflow:ellipsis;white-space:nowrap}.state-card{display:flex;flex-direction:column;align-items:flex-start;margin:20px;padding:22px;border:1px solid var(--reader-border);border-radius:20px;background:var(--panel-background);color:var(--reader-muted);line-height:1.7}.state-title{margin-bottom:5px;color:var(--reader-text);font-size:18px;font-weight:600}.state-card button{height:44px;min-height:44px;margin:17px 0 0;padding:0 15px;border:0;border-radius:13px;background:var(--reader-control);color:var(--reader-text)}.state-card button::after{border:0}
.reader-chrome{position:fixed;z-index:40;inset:0;pointer-events:none}.top-chrome,.bottom-chrome{position:fixed;left:50%;width:min(100%,640px);box-sizing:border-box;transform:translateX(-50%);pointer-events:auto}.top-chrome{top:0;padding:0 24px;background:var(--reader-background);box-shadow:0 6px 18px rgba(30,24,18,.08)}.top-chrome :deep(.subpage-header){margin-bottom:0}.bottom-chrome{bottom:0;padding:10px 24px calc(12px + max(env(safe-area-inset-bottom),var(--reader-safe-bottom,0px)));background:var(--reader-background);box-shadow:0 -6px 18px rgba(30,24,18,.08)}.chapter-control-row{display:grid;grid-template-columns:66px minmax(0,1fr) 66px;align-items:center;gap:10px}.chapter-control-row button{height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent;color:var(--reader-text);font-size:13px;white-space:nowrap}.chapter-control-row button::after,.tool-control-row button::after{border:0}.chapter-control-row button[disabled]{opacity:.35}.progress-control{display:flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:10px}.progress-track{height:6px;flex:1;overflow:hidden;border-radius:9px;background:var(--reader-border)}.progress-track view{height:100%;border-radius:inherit;background:var(--reader-accent)}.tool-control-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:7px}.tool-control-row button{display:flex;height:48px;min-height:48px;align-items:center;justify-content:center;gap:7px;min-width:0;margin:0;padding:0 4px;border:0;border-radius:14px;background:var(--reader-control);color:var(--reader-text);font-size:12px;white-space:nowrap}.tool-control-row image{display:block;width:20px;height:20px}.theme-night .directory-icon{filter:brightness(0) invert(.8)}
.sheet-layer{position:fixed;z-index:60;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:calc(44px + max(env(safe-area-inset-top),var(--reader-safe-top,0px)));overscroll-behavior:none;touch-action:auto;background:rgba(20,19,17,.38);box-sizing:border-box}.sheet{width:min(100%,640px);max-height:88vh;padding:0 24px calc(18px + max(env(safe-area-inset-bottom),var(--reader-safe-bottom,0px)));overflow:hidden;overscroll-behavior:contain;touch-action:auto;border-radius:24px 24px 0 0;background:var(--panel-background);box-shadow:0 -12px 36px rgba(20,19,17,.18);box-sizing:border-box}.directory-sheet{display:flex;height:min(88vh,760px);flex-direction:column}.sheet-handle{width:44px;height:4px;flex:0 0 auto;margin:10px auto 9px;border-radius:5px;background:var(--reader-border)}.sheet-heading{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:12px}.sheet-heading>view{min-width:0}.sheet-title{display:block;overflow:hidden;color:var(--reader-text);font-size:20px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.sheet-subtitle{display:block;margin-top:4px;color:var(--reader-muted);font-size:11px}.sheet-heading>button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;flex:0 0 44px;margin:0 -8px 0 0;border:0;background:transparent;color:var(--reader-muted)}.sheet-heading>button::after{border:0}.close-icon{position:relative;width:16px;height:16px}.close-icon::before,.close-icon::after{content:'';position:absolute;left:1px;top:7px;width:14px;height:1.5px;background:currentColor;transform:rotate(45deg)}.close-icon::after{transform:rotate(-45deg)}.directory-summary{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;padding:8px 0 12px;border-bottom:1px solid var(--reader-border)}.directory-summary>view{min-width:0}.directory-summary>view>text:first-child{display:block;font-size:17px;font-weight:600}.directory-summary>view>text:last-child{display:block;margin-top:3px;color:var(--reader-muted);font-size:10px}.directory-summary>text{color:var(--reader-muted);font-size:11px}.directory-scroll{height:auto;min-height:0;flex:1;overscroll-behavior:contain;touch-action:pan-y}.chapter-row{display:flex;width:100%;height:50px;min-height:50px;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:0;border:0;border-bottom:1px solid var(--reader-border);border-radius:0;background:transparent;color:var(--reader-muted);text-align:left}.chapter-row::after{border:0}.chapter-row>text:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chapter-row.read{color:var(--reader-text)}.chapter-row.current{color:var(--reader-accent);font-weight:650}.current-label{flex:0 0 auto;color:inherit;font-size:10px;font-weight:650}.directory-pagination{display:grid;grid-template-columns:88px minmax(0,1fr) 88px;flex:0 0 auto;align-items:center;gap:8px;padding-top:12px;border-top:1px solid var(--reader-border);background:var(--panel-background)}.directory-pagination button{display:flex;width:88px;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:1px solid var(--reader-border);border-radius:14px;background:transparent;color:var(--reader-text);font-size:12px;font-weight:600;line-height:1;box-sizing:border-box}.directory-pagination button::after{border:0}.directory-pagination button[disabled]{border-color:transparent;background:var(--reader-control);color:var(--reader-muted);opacity:.5}.directory-pagination text{display:flex;height:44px;align-items:center;justify-content:center;color:var(--reader-muted);font-size:11px;line-height:1;text-align:center}
.settings-sheet{padding-bottom:calc(24px + max(env(safe-area-inset-bottom),var(--reader-safe-bottom,0px)))}.setting-label{display:block;margin:15px 0 9px;color:var(--reader-muted);font-size:11px}.font-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:17px;margin-top:17px;border-top:1px solid var(--reader-border)}.font-setting .setting-label{margin:0}.font-setting>view:first-child>text:last-child{display:block;margin-top:4px;font-size:15px;font-weight:600}.stepper{display:flex;gap:8px}.stepper button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:1px solid var(--reader-border);border-radius:13px;background:transparent;color:var(--reader-text)}.stepper button::after{border:0}.minus-icon,.plus-icon{position:relative;width:15px;height:15px}.minus-icon::before,.plus-icon::before,.plus-icon::after{content:'';position:absolute;left:1px;top:7px;width:13px;height:1.5px;border-radius:2px;background:currentColor}.plus-icon::after{transform:rotate(90deg)}.line-label{padding-top:12px;border-top:1px solid var(--reader-border)}.sound-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:14px;margin-top:17px;border-top:1px solid var(--reader-border)}.sound-setting>view{min-width:0}.sound-setting .setting-label{margin:0;color:var(--reader-text);font-size:13px}.sound-setting>view>text:last-child{display:block;margin-top:4px;color:var(--reader-muted);font-size:10px}.sound-setting switch{flex:0 0 auto;transform:scale(.86)}
@media(max-width:360px){.reading-surface{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}.top-chrome,.bottom-chrome,.sheet{padding-left:20px;padding-right:20px}.tool-control-row{gap:6px}.tool-control-row button{gap:5px}.chapter-control-row{grid-template-columns:62px minmax(0,1fr) 62px}}
</style>

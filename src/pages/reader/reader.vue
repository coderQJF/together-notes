<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onPageScroll, onUnload } from '@dcloudio/uni-app'
import JellyTabs from '../../components/JellyTabs.vue'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { getCloudNovelChapter } from '../../services/api'
import { ensureReaderVipAccess } from '../../services/reader-access'
import {
  getReaderBook,
  loadReaderSettings,
  saveReaderProgress,
  saveReaderSettings,
  type ReaderBook,
  type ReaderSettings,
  type ReaderTheme,
} from '../../services/reader'

const book = ref<ReaderBook | null>(null)
const error = ref('')
const accessChecking = ref(true)
const chapterIndex = ref(0)
const chapterContent = ref('')
const chapterLoading = ref(false)
const chapterError = ref('')
const scrollTop = ref(0)
const directoryOpen = ref(false)
const directoryPage = ref(0)
const settingsOpen = ref(false)
const settings = ref<ReaderSettings>(loadReaderSettings())
const themeTabs = [
  { key: 'paper', label: '米白' },
  { key: 'butter', label: '奶油' },
  { key: 'white', label: '纯白' },
]
const lineHeightTabs = [
  { key: '1.8', label: '紧凑' },
  { key: '2.15', label: '舒适' },
  { key: '2.3', label: '宽松' },
]
const DIRECTORY_PAGE_SIZE = 100
let bookId = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined
let chapterRequest = 0
const chapterCache = new Map<number, string>()

const chapter = computed(() => book.value?.chapters[chapterIndex.value] || null)
const chapterParagraphs = computed(() => chapterContent.value.split(/\n+/).map(item => item.trim()).filter(Boolean))
const progress = computed(() => book.value ? Math.round(((chapterIndex.value + 1) / book.value.chapters.length) * 100) : 0)
const directoryPageCount = computed(() => Math.max(1, Math.ceil((book.value?.chapters.length || 0) / DIRECTORY_PAGE_SIZE)))
const directoryChapters = computed(() => {
  const start = directoryPage.value * DIRECTORY_PAGE_SIZE
  return (book.value?.chapters || []).slice(start, start + DIRECTORY_PAGE_SIZE).map((item, offset) => ({ item, index: start + offset }))
})
const readingStyle = computed(() => ({ fontSize: `${settings.value.fontSize}px`, lineHeight: String(settings.value.lineHeight) }))

function persistProgress() {
  if (!book.value) return
  saveReaderProgress(book.value.id, chapterIndex.value, scrollTop.value)
}

function queueProgressSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistProgress, 250)
}

function restoreScroll(top: number) {
  nextTick(() => setTimeout(() => uni.pageScrollTo({ scrollTop: top, duration: 0 }), 80))
}

async function loadChapterContent(index: number) {
  const currentBook = book.value
  const currentChapter = currentBook?.chapters[index]
  if (!currentBook || !currentChapter) return
  const request = ++chapterRequest
  chapterError.value = ''
  if (currentChapter.content) {
    chapterContent.value = currentChapter.content
    chapterLoading.value = false
    return
  }
  const cached = chapterCache.get(index)
  if (cached) {
    chapterContent.value = cached
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

async function openChapter(index: number, restore = false) {
  if (!book.value) return
  persistProgress()
  chapterIndex.value = Math.max(0, Math.min(book.value.chapters.length - 1, index))
  scrollTop.value = restore ? Math.max(0, book.value.progress.scrollTop || 0) : 0
  directoryOpen.value = false
  saveReaderProgress(book.value.id, chapterIndex.value, scrollTop.value)
  await loadChapterContent(chapterIndex.value)
  restoreScroll(scrollTop.value)
}

function previousChapter() {
  if (chapterIndex.value <= 0) return
  void openChapter(chapterIndex.value - 1)
}

function nextChapter() {
  if (!book.value || chapterIndex.value >= book.value.chapters.length - 1) return
  void openChapter(chapterIndex.value + 1)
}

function toggleDirectory() {
  directoryOpen.value = !directoryOpen.value
  if (directoryOpen.value) directoryPage.value = Math.floor(chapterIndex.value / DIRECTORY_PAGE_SIZE)
  if (directoryOpen.value) settingsOpen.value = false
}

function changeDirectoryPage(step: number) {
  directoryPage.value = Math.max(0, Math.min(directoryPageCount.value - 1, directoryPage.value + step))
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) directoryOpen.value = false
}

function updateSettings(next: Partial<ReaderSettings>) {
  settings.value = { ...settings.value, ...next }
  saveReaderSettings(settings.value)
}

function selectTheme(value: string) {
  updateSettings({ theme: value as ReaderTheme })
}

function selectLineHeight(value: string) {
  updateSettings({ lineHeight: Number(value) })
}

function changeFontSize(step: number) {
  updateSettings({ fontSize: Math.max(15, Math.min(26, settings.value.fontSize + step)) })
}

function backToLibrary() {
  uni.redirectTo({ url: '/pages/library/library' })
}

onLoad(async options => {
  bookId = typeof options?.id === 'string' ? decodeURIComponent(options.id) : ''
  if (!await ensureReaderVipAccess()) { accessChecking.value = false; return }
  book.value = bookId ? getReaderBook(bookId) : null
  accessChecking.value = false
  if (!book.value) { error.value = '这本书不在当前设备的书架中'; return }
  await openChapter(book.value.progress.chapterIndex || 0, true)
})

onPageScroll(event => {
  scrollTop.value = event.scrollTop
  queueProgressSave()
})

onUnload(() => {
  clearTimeout(saveTimer)
  persistProgress()
})
</script>

<template>
  <view class="shell" :class="`theme-${settings.theme}`">
    <SubpageHeader :label="book?.title || '阅读'" fallback="/pages/library/library" />

    <view v-if="accessChecking" class="reader-loading"><text>正在打开…</text></view>
    <view v-else-if="error" class="state-card"><text class="state-title">无法打开</text><text>{{ error }}</text><button @click="backToLibrary">返回书架</button></view>

    <template v-else-if="book && chapter">
      <view class="reader-meta"><text>{{ book.author }}</text><text>第 {{ chapterIndex + 1 }} / {{ book.chapters.length }} 章 · {{ progress }}%</text></view>
      <view class="reader-tools">
        <button :aria-expanded="directoryOpen" @click="toggleDirectory">目录</button>
        <button :aria-expanded="settingsOpen" @click="toggleSettings">阅读设置</button>
      </view>

      <view v-if="directoryOpen" class="tool-panel directory-panel">
        <view class="panel-heading"><text>目录</text><text>{{ book.chapters.length }} 章<text v-if="directoryPageCount > 1"> · 第 {{ directoryPage + 1 }} / {{ directoryPageCount }} 页</text></text></view>
        <button v-for="entry in directoryChapters" :key="`${entry.index}-${entry.item.title}`" :class="{ active: entry.index === chapterIndex }" :aria-current="entry.index === chapterIndex ? 'page' : undefined" @click="openChapter(entry.index)"><text>{{ entry.item.title }}</text><view class="chapter-arrow" /></button>
        <view v-if="directoryPageCount > 1" class="directory-pagination"><button :disabled="directoryPage === 0" @click="changeDirectoryPage(-1)">上一页</button><button :disabled="directoryPage >= directoryPageCount - 1" @click="changeDirectoryPage(1)">下一页</button></view>
      </view>

      <view v-if="settingsOpen" class="tool-panel settings-panel">
        <text class="setting-label">阅读背景</text>
        <JellyTabs compact :model-value="settings.theme" :options="themeTabs" aria-label="选择阅读背景" @change="selectTheme" />
        <view class="font-setting"><view><text class="setting-label">正文字号</text><text>{{ settings.fontSize }} px</text></view><view class="stepper"><button aria-label="缩小正文字号" :disabled="settings.fontSize <= 15" @click="changeFontSize(-1)"><view class="minus-icon" /></button><button aria-label="放大正文字号" :disabled="settings.fontSize >= 26" @click="changeFontSize(1)"><view class="plus-icon" /></button></view></view>
        <text class="setting-label line-label">行间距</text>
        <JellyTabs compact :model-value="String(settings.lineHeight)" :options="lineHeightTabs" aria-label="选择正文行距" @change="selectLineHeight" />
      </view>

      <view class="chapter-heading"><text class="book-name">{{ book.title }}</text><text class="chapter-title">{{ chapter.title }}</text><view class="title-rule" /></view>
      <view v-if="chapterLoading" class="reader-loading"><text>正在加载本章…</text></view>
      <view v-else-if="chapterError" class="state-card chapter-state"><text class="state-title">本章暂时没打开</text><text>{{ chapterError }}</text><button @click="loadChapterContent(chapterIndex)">重新加载</button></view>
      <view v-else class="reader-copy" :style="readingStyle"><text v-for="(paragraph,index) in chapterParagraphs" :key="index" class="reader-paragraph">{{ paragraph }}</text></view>

      <view class="chapter-navigation">
        <button :disabled="chapterLoading || chapterIndex === 0" @click="previousChapter"><view class="previous-arrow" /><text>上一章</text></button>
        <button :disabled="chapterLoading || chapterIndex === book.chapters.length - 1" @click="nextChapter"><text>下一章</text><view class="next-arrow" /></button>
      </view>
      <text class="local-note">{{ book.source === 'cloud' ? '云端正文按章加载，阅读进度保存在当前设备。' : '阅读内容与进度仅保存在当前设备。' }}</text>
    </template>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(52px + env(safe-area-inset-bottom));background-color:var(--reader-background);background-image:var(--reader-texture,none);background-attachment:fixed;color:#3e382d;transition:background-color .2s}.theme-paper{--reader-background:#faf8f2;--subpage-background:#faf8f2;--panel-background:#fff}.theme-butter{--reader-background:#f8edc4;--subpage-background:#f8edc4;--panel-background:#fff9e9;--reader-texture:radial-gradient(circle at 13% 17%,rgba(171,126,28,.055) 0 1px,transparent 1.5px),radial-gradient(circle at 79% 41%,rgba(131,96,25,.04) 0 1px,transparent 1.4px)}.theme-white{--reader-background:#fff;--subpage-background:#fff;--panel-background:#faf8f2}.reader-loading{display:flex;align-items:center;justify-content:center;min-height:160px;color:#806f54}.reader-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#806f54;font-size:11px}.reader-meta text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reader-tools{display:flex;align-items:center;gap:9px;margin:13px 0 4px}.reader-tools button{display:flex;align-items:center;justify-content:center;width:auto;height:44px;min-height:44px;margin:0;padding:0 15px;border:1px solid rgba(111,96,65,.18);border-radius:13px;background:var(--panel-background);color:#625744;font-size:12px}.reader-tools button::after{border:0}.reader-tools button[aria-expanded="true"]{border-color:#a9842b;background:#494032;color:#fff9e9}.tool-panel{padding:17px;margin:13px 0 22px;border:1px solid rgba(111,96,65,.18);border-radius:20px;background:var(--panel-background);box-shadow:0 9px 24px rgba(73,64,50,.06)}.panel-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.panel-heading text:first-child{font-size:17px;font-weight:600}.panel-heading text:last-child{color:#8b806e;font-size:10px}.directory-panel>button{display:grid;grid-template-columns:minmax(0,1fr) 9px;align-items:center;gap:10px;width:100%;height:52px;min-height:52px;margin:0;padding:0 5px;border:0;border-bottom:1px solid rgba(111,96,65,.12);border-radius:0;background:transparent;color:#625744;text-align:left}.directory-panel>button:last-child{border-bottom:0}.directory-panel>button::after{border:0}.directory-panel>button.active{color:#8a6817;font-weight:600}.directory-panel>button text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chapter-arrow,.next-arrow,.previous-arrow{width:8px;height:8px;flex:0 0 8px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg)}.settings-panel{display:flex;flex-direction:column;gap:10px}.setting-label{display:block;color:#786d5b;font-size:11px}.font-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:10px;margin-top:4px;border-top:1px solid rgba(111,96,65,.12)}.font-setting>view:first-child>text:last-child{display:block;margin-top:4px;font-size:15px;font-weight:600}.stepper{display:flex;gap:8px}.stepper button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:1px solid rgba(111,96,65,.18);border-radius:13px;background:transparent;color:#494032}.stepper button::after{border:0}.minus-icon,.plus-icon{position:relative;width:15px;height:15px}.minus-icon::before,.plus-icon::before,.plus-icon::after{content:'';position:absolute;left:1px;top:7px;width:13px;height:1.5px;border-radius:2px;background:currentColor}.plus-icon::after{transform:rotate(90deg)}.line-label{padding-top:9px;border-top:1px solid rgba(111,96,65,.12)}
.chapter-heading{padding-top:35px;text-align:left}.book-name{display:block;color:#8a7b61;font-size:12px;letter-spacing:.5px}.chapter-title{display:block;max-width:560px;margin-top:13px;font-size:31px;font-weight:700;line-height:1.38;letter-spacing:-.6px}.title-rule{width:42px;height:3px;margin:20px 0 0;border-radius:3px;background:#b68c2c}.reader-copy{padding:34px 3px 20px;color:#2f2a22;letter-spacing:.7px;word-break:break-word}.reader-paragraph{display:block;margin:0 0 1.25em;text-indent:2em;font:inherit}.reader-paragraph:last-child{margin-bottom:0}.chapter-navigation{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:23px;margin-top:25px;border-top:1px solid rgba(111,96,65,.16)}.chapter-navigation button{display:flex;height:48px;min-height:48px;align-items:center;justify-content:center;gap:9px;margin:0;border:1px solid rgba(111,96,65,.18);border-radius:14px;background:var(--panel-background);color:#494032;font-size:13px}.chapter-navigation button::after{border:0}.chapter-navigation button[disabled]{opacity:.42}.previous-arrow{transform:rotate(-135deg)}.local-note{display:block;margin-top:18px;color:#8b806e;font-size:10px;text-align:center}.state-card{display:flex;flex-direction:column;align-items:flex-start;padding:22px;border:1px solid #e7dfcf;border-radius:20px;background:#fff;color:#786d5b;line-height:1.7}.state-title{margin-bottom:5px;color:#494032;font-size:18px;font-weight:600}.state-card button{height:44px;min-height:44px;margin:17px 0 0;padding:0 15px;border:0;border-radius:13px;background:#494032;color:#fff9e9}.state-card button::after{border:0}
.directory-pagination{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:13px}.directory-pagination button{display:flex;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;border:1px solid rgba(111,96,65,.18);border-radius:13px;background:transparent;color:#625744}.directory-pagination button::after{border:0}.directory-pagination button[disabled]{opacity:.4}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.chapter-title{font-size:24px}.reader-meta{align-items:flex-start;flex-direction:column;gap:4px}.tool-panel{padding:15px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>

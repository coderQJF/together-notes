<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onPageScroll, onUnload } from '@dcloudio/uni-app'
import JellyTabs from '../../components/JellyTabs.vue'
import StatusIcon from '../../components/StatusIcon.vue'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { getCloudNovelChapter } from '../../services/api'
import { ensureReaderVipAccess } from '../../services/reader-access'
import { chapterStepFromSwipe, type ReaderTouchPoint } from '../../services/reader-gesture'
import { destroyPageTurnSound, playPageTurnSound, preparePageTurnSound } from '../../services/page-turn-sound'
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
const controlsVisible = ref(false)
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
const DIRECTORY_PAGE_SIZE = 10
let bookId = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined
let chapterRequest = 0
const chapterCache = new Map<number, string>()
const chapterTurnClass = ref('')
let chapterTurning = false
let touchStart: ReaderTouchPoint | null = null
let suppressTapUntil = 0

const chapter = computed(() => book.value?.chapters[chapterIndex.value] || null)
const chapterParagraphs = computed(() => chapterContent.value.split(/\n+/).map(item => item.trim()).filter(Boolean))
const progress = computed(() => book.value ? Math.round(((chapterIndex.value + 1) / book.value.chapters.length) * 100) : 0)
const readChapterIndexes = computed(() => new Set(book.value?.progress.readChapterIndexes || []))
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
const readingStyle = computed(() => ({ fontSize: `${settings.value.fontSize}px`, lineHeight: String(settings.value.lineHeight) }))

function persistProgress() {
  if (!book.value) return
  const saved = saveReaderProgress(book.value.id, chapterIndex.value, scrollTop.value)
  if (saved) book.value.progress = saved
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
  if (!restore) persistProgress()
  const restoredTop = restore ? Math.max(0, book.value.progress.scrollTop || 0) : 0
  chapterIndex.value = Math.max(0, Math.min(book.value.chapters.length - 1, index))
  scrollTop.value = restoredTop
  directoryOpen.value = false
  settingsOpen.value = false
  controlsVisible.value = false
  const saved = saveReaderProgress(book.value.id, chapterIndex.value, scrollTop.value)
  if (saved) book.value.progress = saved
  await loadChapterContent(chapterIndex.value)
  restoreScroll(scrollTop.value)
}

function delay(duration: number) {
  return new Promise(resolve => setTimeout(resolve, duration))
}

async function turnChapter(step: -1 | 1) {
  if (!book.value || chapterLoading.value || chapterTurning) return
  const target = chapterIndex.value + step
  if (target < 0 || target >= book.value.chapters.length) return
  chapterTurning = true
  chapterTurnClass.value = step > 0 ? 'turn-next-out' : 'turn-previous-out'
  void playPageTurnSound(settings.value.pageSound)
  await delay(135)
  await openChapter(target)
  chapterTurnClass.value = step > 0 ? 'turn-next-in' : 'turn-previous-in'
  await delay(270)
  chapterTurnClass.value = ''
  chapterTurning = false
}

function previousChapter() {
  void turnChapter(-1)
}

function nextChapter() {
  void turnChapter(1)
}

function onReadingTouchStart(event: any) {
  const point = event.changedTouches?.[0] || event.touches?.[0]
  touchStart = point ? { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() } : null
}

function onReadingTouchEnd(event: any) {
  const point = event.changedTouches?.[0]
  if (!touchStart || !point || directoryOpen.value || settingsOpen.value || controlsVisible.value) { touchStart = null; return }
  const step = chapterStepFromSwipe(touchStart, { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() })
  touchStart = null
  if (!step) return
  suppressTapUntil = Date.now() + 500
  void turnChapter(step as -1 | 1)
}

function toggleControls() {
  if (Date.now() < suppressTapUntil) return
  if (directoryOpen.value || settingsOpen.value) return
  controlsVisible.value = !controlsVisible.value
}

function toggleDirectory() {
  directoryOpen.value = !directoryOpen.value
  if (directoryOpen.value) directoryPage.value = Math.floor(chapterIndex.value / DIRECTORY_PAGE_SIZE)
  settingsOpen.value = false
  controlsVisible.value = false
}

function changeDirectoryPage(step: number) {
  directoryPage.value = Math.max(0, Math.min(directoryPageCount.value - 1, directoryPage.value + step))
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  directoryOpen.value = false
  controlsVisible.value = false
}

function closePanel() {
  directoryOpen.value = false
  settingsOpen.value = false
  controlsVisible.value = true
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

function changePageSound(event: any) {
  updateSettings({ pageSound: Boolean(event.detail.value) })
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
  void preparePageTurnSound()
  await openChapter(book.value.progress.chapterIndex || 0, true)
})

onPageScroll(event => {
  scrollTop.value = event.scrollTop
  queueProgressSave()
})

onUnload(() => {
  clearTimeout(saveTimer)
  persistProgress()
  destroyPageTurnSound()
})
</script>

<template>
  <view class="shell" :class="`theme-${settings.theme}`">
    <template v-if="accessChecking || error">
      <SubpageHeader label="阅读" fallback="/pages/library/library" />
      <view v-if="accessChecking" class="reader-loading"><text>正在打开…</text></view>
      <view v-else class="state-card"><text class="state-title">无法打开</text><text>{{ error }}</text><button @click="backToLibrary">返回书架</button></view>
    </template>

    <template v-else-if="book && chapter">
      <view class="reading-surface" @click="toggleControls" @touchstart="onReadingTouchStart" @touchend="onReadingTouchEnd">
        <view class="chapter-page" :class="chapterTurnClass">
        <view class="reader-meta"><text>{{ book.author }}</text><text>第 {{ chapterIndex + 1 }} / {{ book.chapters.length }} 章 · {{ progress }}%</text></view>
        <view class="chapter-heading"><text class="book-name">{{ book.title }}</text><text class="chapter-title">{{ chapter.title }}</text><view class="title-rule" /></view>
        <view v-if="chapterLoading" class="reader-loading"><text>正在加载本章…</text></view>
        <view v-else-if="chapterError" class="state-card chapter-state" @click.stop><text class="state-title">本章暂时没打开</text><text>{{ chapterError }}</text><button @click="loadChapterContent(chapterIndex)">重新加载</button></view>
        <view v-else class="reader-copy" :style="readingStyle"><text v-for="(paragraph,index) in chapterParagraphs" :key="index" class="reader-paragraph">{{ paragraph }}</text></view>
        <text class="tap-hint">轻触正文显示阅读操作</text>
        </view>
      </view>

      <view v-if="controlsVisible" class="reader-chrome" @click.stop>
        <view class="top-chrome"><SubpageHeader :label="chapter.title" fallback="/pages/library/library" /></view>
        <view class="bottom-chrome">
          <view class="chapter-control-row">
            <button :disabled="chapterLoading || chapterIndex === 0" @click="previousChapter">上一章</button>
            <view class="progress-control"><view class="progress-track"><view :style="{ width: `${progress}%` }" /></view><text>{{ progress }}%</text></view>
            <button :disabled="chapterLoading || chapterIndex === book.chapters.length - 1" @click="nextChapter">下一章</button>
          </view>
          <view class="tool-control-row">
            <button aria-label="打开目录" @click="toggleDirectory"><image src="/static/nav-icons/book-active.png" mode="aspectFit" /><text>目录</text></button>
            <button aria-label="打开阅读设置" @click="toggleSettings"><view class="settings-icon"><view /></view><text>阅读设置</text></button>
          </view>
        </view>
      </view>

      <view v-if="directoryOpen" class="sheet-layer" @click="closePanel">
        <view class="sheet directory-sheet" @click.stop>
          <view class="sheet-handle" />
          <view class="sheet-heading"><view><text class="sheet-title">{{ book.title }}</text><text class="sheet-subtitle">{{ book.author }} · {{ book.chapters.length }} 章</text></view><button aria-label="关闭目录" @click="closePanel"><view class="close-icon" /></button></view>
          <view class="directory-summary"><view><text>目录</text><text>{{ directoryRange }}</text></view><text>已读 {{ readChapterIndexes.size }} 章</text></view>
          <scroll-view class="directory-scroll scrollbar-hidden" scroll-y show-scrollbar="false">
            <button v-for="entry in directoryChapters" :key="`${entry.index}-${entry.item.title}`" class="chapter-row" :class="{ read: readChapterIndexes.has(entry.index), current: entry.index === chapterIndex }" :aria-current="entry.index === chapterIndex ? 'page' : undefined" @click="openChapter(entry.index)">
              <text>{{ entry.item.title }}</text><view class="chapter-read-state"><StatusIcon :checked="readChapterIndexes.has(entry.index)" :label="readChapterIndexes.has(entry.index) ? '已读' : '未读'" /><text>{{ readChapterIndexes.has(entry.index) ? (entry.index === chapterIndex ? '正在读' : '已读') : '未读' }}</text></view>
            </button>
          </scroll-view>
          <view v-if="directoryPageCount > 1" class="directory-pagination"><button :disabled="directoryPage === 0" @click="changeDirectoryPage(-1)">上一页</button><text>{{ directoryPage + 1 }} / {{ directoryPageCount }}</text><button :disabled="directoryPage >= directoryPageCount - 1" @click="changeDirectoryPage(1)">下一页</button></view>
        </view>
      </view>

      <view v-if="settingsOpen" class="sheet-layer" @click="closePanel">
        <view class="sheet settings-sheet" @click.stop>
          <view class="sheet-handle" />
          <view class="sheet-heading"><text class="sheet-title">阅读设置</text><button aria-label="关闭阅读设置" @click="closePanel"><view class="close-icon" /></button></view>
          <text class="setting-label">阅读背景</text>
          <JellyTabs compact :model-value="settings.theme" :options="themeTabs" aria-label="选择阅读背景" @change="selectTheme" />
          <view class="font-setting"><view><text class="setting-label">正文字号</text><text>{{ settings.fontSize }} px</text></view><view class="stepper"><button aria-label="缩小正文字号" :disabled="settings.fontSize <= 15" @click="changeFontSize(-1)"><view class="minus-icon" /></button><button aria-label="放大正文字号" :disabled="settings.fontSize >= 26" @click="changeFontSize(1)"><view class="plus-icon" /></button></view></view>
          <text class="setting-label line-label">行间距</text>
          <JellyTabs compact :model-value="String(settings.lineHeight)" :options="lineHeightTabs" aria-label="选择正文行距" @change="selectLineHeight" />
          <view class="sound-setting"><view><text class="setting-label">翻书音效</text><text>切换章节时播放轻柔纸张声</text></view><switch color="#b28b35" :checked="settings.pageSound" @change="changePageSound" /></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(52px + env(safe-area-inset-bottom));box-sizing:border-box;background-color:var(--reader-background);background-image:var(--reader-texture,none);background-attachment:fixed;color:#3e382d;transition:background-color .2s}.theme-paper{--reader-background:#faf8f2;--subpage-background:#faf8f2;--panel-background:#fff}.theme-butter{--reader-background:#f8edc4;--subpage-background:#f8edc4;--panel-background:#fff9e9;--reader-texture:radial-gradient(circle at 13% 17%,rgba(171,126,28,.055) 0 1px,transparent 1.5px),radial-gradient(circle at 79% 41%,rgba(131,96,25,.04) 0 1px,transparent 1.4px)}.theme-white{--reader-background:#fff;--subpage-background:#fff;--panel-background:#faf8f2}.reading-surface{min-height:100vh;padding-top:calc(24px + env(safe-area-inset-top));overflow-x:clip;box-sizing:border-box;perspective:1000px}.chapter-page{min-height:calc(100vh - 24px - env(safe-area-inset-top));transform-style:preserve-3d;will-change:transform,opacity}.turn-next-out{animation:turnNextOut .15s cubic-bezier(.55,.05,.8,.45) forwards;transform-origin:left center}.turn-next-in{animation:turnNextIn .28s cubic-bezier(.18,.75,.2,1) forwards;transform-origin:right center}.turn-previous-out{animation:turnPreviousOut .15s cubic-bezier(.55,.05,.8,.45) forwards;transform-origin:right center}.turn-previous-in{animation:turnPreviousIn .28s cubic-bezier(.18,.75,.2,1) forwards;transform-origin:left center}@keyframes turnNextOut{to{opacity:.12;transform:translateX(-10%) rotateY(-13deg)}}@keyframes turnNextIn{from{opacity:.12;transform:translateX(10%) rotateY(13deg)}to{opacity:1;transform:none}}@keyframes turnPreviousOut{to{opacity:.12;transform:translateX(10%) rotateY(13deg)}}@keyframes turnPreviousIn{from{opacity:.12;transform:translateX(-10%) rotateY(-13deg)}to{opacity:1;transform:none}}.reader-loading{display:flex;align-items:center;justify-content:center;min-height:160px;color:#806f54}.reader-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#806f54;font-size:11px}.reader-meta text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chapter-heading{padding-top:35px;text-align:left}.book-name{display:block;color:#8a7b61;font-size:12px;letter-spacing:.5px}.chapter-title{display:block;max-width:560px;margin-top:13px;font-size:31px;font-weight:700;line-height:1.38;letter-spacing:-.6px}.title-rule{width:42px;height:3px;margin:20px 0 0;border-radius:3px;background:#b68c2c}.reader-copy{padding:34px 3px 20px;color:#2f2a22;letter-spacing:.7px;word-break:break-word}.reader-paragraph{display:block;margin:0 0 1.25em;text-indent:2em;font:inherit}.reader-paragraph:last-child{margin-bottom:0}.tap-hint{display:block;padding:24px 0;color:#988b75;font-size:10px;text-align:center}.state-card{display:flex;flex-direction:column;align-items:flex-start;padding:22px;border:1px solid #e7dfcf;border-radius:20px;background:#fff;color:#786d5b;line-height:1.7}.state-title{margin-bottom:5px;color:#494032;font-size:18px;font-weight:600}.state-card button{height:44px;min-height:44px;margin:17px 0 0;padding:0 15px;border:0;border-radius:13px;background:#494032;color:#fff9e9}.state-card button::after{border:0}
.reader-chrome{position:fixed;z-index:40;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(41,35,27,.22),transparent 24%,transparent 66%,rgba(41,35,27,.22))}.top-chrome,.bottom-chrome{position:fixed;left:50%;width:min(100%,640px);box-sizing:border-box;transform:translateX(-50%);pointer-events:auto}.top-chrome{top:0;padding:0 24px;background:var(--reader-background);box-shadow:0 8px 24px rgba(73,64,50,.08)}.top-chrome :deep(.subpage-header){margin-bottom:0}.bottom-chrome{bottom:0;padding:12px 24px calc(12px + env(safe-area-inset-bottom));background:var(--reader-background);box-shadow:0 -10px 28px rgba(73,64,50,.1)}.chapter-control-row{display:grid;grid-template-columns:72px minmax(0,1fr) 72px;align-items:center;gap:10px}.chapter-control-row button{height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent;color:#494032;font-size:13px}.chapter-control-row button::after,.tool-control-row button::after{border:0}.chapter-control-row button[disabled]{opacity:.35}.progress-control{display:flex;align-items:center;gap:8px;color:#786d5b;font-size:10px}.progress-track{height:7px;flex:1;overflow:hidden;border-radius:9px;background:rgba(73,64,50,.12)}.progress-track view{height:100%;border-radius:inherit;background:#b68c2c}.tool-control-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.tool-control-row button{display:flex;height:48px;min-height:48px;align-items:center;justify-content:center;gap:8px;margin:0;border:0;border-radius:14px;background:rgba(255,255,255,.46);color:#494032;font-size:12px}.tool-control-row image{display:block;width:20px;height:20px}.settings-icon{position:relative;width:20px;height:20px;border:2px solid currentColor;border-radius:50%;box-sizing:border-box}.settings-icon>view{position:absolute;inset:5px;border:1.5px solid currentColor;border-radius:50%}
.sheet-layer{position:fixed;z-index:60;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:calc(44px + env(safe-area-inset-top));background:rgba(49,42,33,.28);box-sizing:border-box}.sheet{width:min(100%,640px);max-height:88vh;padding:0 24px calc(18px + env(safe-area-inset-bottom));overflow:hidden;border-radius:24px 24px 0 0;background:var(--panel-background);box-shadow:0 -12px 36px rgba(48,41,31,.18);box-sizing:border-box}.sheet-handle{width:44px;height:4px;margin:10px auto 9px;border-radius:5px;background:rgba(73,64,50,.18)}.sheet-heading{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:12px}.sheet-heading>view{min-width:0}.sheet-title{display:block;overflow:hidden;color:#3e382d;font-size:20px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.sheet-subtitle{display:block;margin-top:4px;color:#8b806e;font-size:11px}.sheet-heading>button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;flex:0 0 44px;margin:0 -8px 0 0;border:0;background:transparent}.sheet-heading>button::after{border:0}.close-icon{position:relative;width:16px;height:16px}.close-icon::before,.close-icon::after{content:'';position:absolute;left:1px;top:7px;width:14px;height:1.5px;background:#786d5b;transform:rotate(45deg)}.close-icon::after{transform:rotate(-45deg)}.directory-summary{display:flex;align-items:center;justify-content:space-between;padding:8px 0 12px;border-bottom:1px solid rgba(111,96,65,.14)}.directory-summary>view{min-width:0}.directory-summary>view>text:first-child{display:block;font-size:17px;font-weight:600}.directory-summary>view>text:last-child{display:block;margin-top:3px;color:#9a8b72;font-size:10px}.directory-summary>text{color:#8b806e;font-size:11px}.directory-scroll{height:min(56vh,480px)}.chapter-row{display:flex;width:100%;height:48px;min-height:48px;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:0;border:0;border-bottom:1px solid rgba(111,96,65,.1);border-radius:0;background:transparent;color:rgba(98,87,68,.42);text-align:left}.chapter-row::after{border:0}.chapter-row>text:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chapter-read-state{display:flex;align-items:center;gap:6px;flex:0 0 auto}.chapter-read-state :deep(.status-icon){width:16px;height:16px;flex-basis:16px;border-color:currentColor}.chapter-read-state>text{font-size:10px}.chapter-row.read{color:#766137}.chapter-row.current{color:#a36d00;font-weight:650}.directory-pagination{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;gap:8px;padding-top:10px}.directory-pagination button{height:44px;min-height:44px;margin:0;border:0;border-radius:13px;background:rgba(73,64,50,.08);color:#625744;font-size:12px}.directory-pagination button::after{border:0}.directory-pagination button[disabled]{opacity:.35}.directory-pagination text{color:#8b806e;font-size:11px;text-align:center}
.settings-sheet{padding-bottom:calc(28px + env(safe-area-inset-bottom))}.setting-label{display:block;margin:15px 0 9px;color:#786d5b;font-size:11px}.font-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:17px;margin-top:17px;border-top:1px solid rgba(111,96,65,.12)}.font-setting .setting-label{margin:0}.font-setting>view:first-child>text:last-child{display:block;margin-top:4px;font-size:15px;font-weight:600}.stepper{display:flex;gap:8px}.stepper button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:1px solid rgba(111,96,65,.18);border-radius:13px;background:transparent;color:#494032}.stepper button::after{border:0}.minus-icon,.plus-icon{position:relative;width:15px;height:15px}.minus-icon::before,.plus-icon::before,.plus-icon::after{content:'';position:absolute;left:1px;top:7px;width:13px;height:1.5px;border-radius:2px;background:currentColor}.plus-icon::after{transform:rotate(90deg)}.line-label{padding-top:12px;border-top:1px solid rgba(111,96,65,.12)}.sound-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:14px;margin-top:17px;border-top:1px solid rgba(111,96,65,.12)}.sound-setting>view{min-width:0}.sound-setting .setting-label{margin:0;color:#494032;font-size:13px}.sound-setting>view>text:last-child{display:block;margin-top:4px;color:#8b806e;font-size:10px}.sound-setting switch{flex:0 0 auto;transform:scale(.86)}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.chapter-title{font-size:26px}.reader-meta{align-items:flex-start;flex-direction:column;gap:4px}.top-chrome,.bottom-chrome,.sheet{padding-left:20px;padding-right:20px}.chapter-control-row{grid-template-columns:62px minmax(0,1fr) 62px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
@media(prefers-reduced-motion:reduce){.turn-next-out,.turn-next-in,.turn-previous-out,.turn-previous-in{animation:none}}
</style>

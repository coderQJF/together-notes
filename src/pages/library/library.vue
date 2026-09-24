<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { getCloudNovelCatalog, listCloudNovels, type CloudNovelSummary } from '../../services/api'
import { ensureReaderVipAccess } from '../../services/reader-access'
import { chooseReaderTextFile, readerTitleFromFileName, type ReaderImportProgress } from '../../services/reader-import'
import {
  loadReaderLibrary,
  prepareCloudReaderBook,
  prepareReaderBook,
  removeReaderBook,
  saveReaderBook,
  type ReaderBook,
} from '../../services/reader'

type LibraryImportPhase = ReaderImportProgress['phase'] | 'organizing' | 'saving'
type LibraryImportState = Omit<ReaderImportProgress, 'phase'> & { phase: LibraryImportPhase }

const books = ref<ReaderBook[]>([])
const accessChecking = ref(false)
const accessGranted = ref(false)
const importing = ref(false)
const importState = ref<LibraryImportState | null>(null)
const error = ref('')
const cloudNovels = ref<CloudNovelSummary[]>([])
const cloudError = ref('')
const openingId = ref('')

const orderedBooks = computed(() => [...books.value].sort((left, right) => (right.progress.updatedAt || right.updatedAt).localeCompare(left.progress.updatedAt || left.updatedAt)))
const importStep = computed(() => ({ choosing: 1, reading: 2, decoding: 3, organizing: 4, saving: 5 }[importState.value?.phase || 'choosing']))
const importPercent = computed(() => {
  const current = importState.value
  if (!current) return 0
  if (current.phase === 'choosing') return 8
  if (current.phase === 'reading') {
    const ratio = current.totalBytes && current.bytesRead != null ? current.bytesRead / current.totalBytes : 0.45
    return Math.min(60, 12 + Math.round(Math.max(0, ratio) * 48))
  }
  return { decoding: 68, organizing: 84, saving: 96 }[current.phase]
})
const importTitle = computed(() => ({
  choosing: '等待选择 TXT 文件',
  reading: '正在读取文件',
  decoding: '正在解析文字编码',
  organizing: '正在识别章节',
  saving: '正在保存到本机',
}[importState.value?.phase || 'choosing']))
const importDetail = computed(() => {
  const current = importState.value
  if (!current || current.phase === 'choosing') return '请在系统文件选择器中选中一个 TXT 文件。'
  const file = current.name ? `“${readerTitleFromFileName(current.name)}”` : '所选文件'
  if (current.phase === 'reading') {
    const read = formatFileSize(current.bytesRead || 0)
    const total = current.totalBytes ? ` / ${formatFileSize(current.totalBytes)}` : ''
    return `${file} · 已读取 ${read}${total}`
  }
  if (current.phase === 'decoding') return `${file} · 正在识别 UTF-8、GB18030 等常见编码。`
  if (current.phase === 'organizing') return `${file} · 正在按章节标题整理正文。`
  return `${file} · 正文和进度只写入当前设备，不会上传服务器。`
})

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.max(0.1, value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

async function paintImportState(state: LibraryImportState) {
  importState.value = state
  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, 24))
}

function refresh() {
  books.value = loadReaderLibrary()
}

function chapterLabel(book: ReaderBook) {
  const index = Math.max(0, Math.min(book.chapters.length - 1, book.progress.chapterIndex || 0))
  return `读到 ${book.chapters[index]?.title || '正文'} · 共 ${book.chapters.length} 章`
}

function progress(book: ReaderBook) {
  return Math.max(4, Math.round(((book.progress.chapterIndex + 1) / book.chapters.length) * 100))
}

function openBook(book: ReaderBook) {
  uni.navigateTo({ url: `/pages/reader/reader?id=${encodeURIComponent(book.id)}` })
}

async function importBook() {
  if (importing.value) return
  importing.value = true
  error.value = ''
  try {
    await paintImportState({ phase: 'choosing' })
    const file = await chooseReaderTextFile(progress => { importState.value = progress })
    if (!file) return
    await paintImportState({ phase: 'organizing', name: file.name, bytesRead: file.size, totalBytes: file.size })
    const book = prepareReaderBook({ title: readerTitleFromFileName(file.name), text: file.text })
    await paintImportState({ phase: 'saving', name: file.name, bytesRead: file.size, totalBytes: file.size })
    saveReaderBook(book)
    refresh()
    uni.showToast({ title: `已整理为 ${book.chapters.length} 章`, icon: 'none' })
    setTimeout(() => openBook(book), 250)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '导入失败，请换一个 TXT 文件重试'
  } finally {
    importing.value = false
    importState.value = null
  }
}

function removeBook(book: ReaderBook) {
  uni.showModal({
    title: '移出书架？',
    content: `“${book.title}”及本机阅读进度会被删除，此操作不可恢复。`,
    confirmText: '删除',
    confirmColor: '#ae4b3b',
    success: result => {
      if (!result.confirm) return
      removeReaderBook(book.id)
      refresh()
      uni.showToast({ title: '已移出书架', icon: 'none' })
    },
  })
}

function cloudBookId(id: string) {
  return `cloud-${id}`
}

function cloudBookAdded(id: string) {
  return books.value.some(book => book.id === cloudBookId(id))
}

async function openCloudBook(summary: CloudNovelSummary) {
  if (openingId.value) return
  openingId.value = summary.id
  cloudError.value = ''
  try {
    const catalog = await getCloudNovelCatalog(summary.id)
    const book = prepareCloudReaderBook(catalog)
    const saved = saveReaderBook(book)
    refresh()
    setTimeout(() => openBook(saved), 250)
  } catch (reason) {
    cloudError.value = reason instanceof Error ? reason.message : '打开失败，请稍后重试'
  } finally {
    openingId.value = ''
  }
}

async function refreshCloudNovels() {
  cloudError.value = ''
  try { cloudNovels.value = await listCloudNovels() }
  catch (reason) { cloudError.value = reason instanceof Error ? reason.message : '云端书库加载失败' }
}

async function checkAccess() {
  if (accessChecking.value) return
  accessChecking.value = true
  try {
    accessGranted.value = await ensureReaderVipAccess()
    if (accessGranted.value) {
      refresh()
      await refreshCloudNovels()
    }
  } finally {
    accessChecking.value = false
  }
}

onShow(checkAccess)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="阅读" />

    <view v-if="accessChecking" class="access-state"><text>正在打开书架…</text></view>

    <template v-else-if="accessGranted">
      <view class="library-heading">
        <view><text class="page-title">我的书架</text><text class="book-count">{{ books.length }} 本</text></view>
        <button class="add-book" :disabled="importing" hover-class="button-pressed" @click="importBook"><view v-if="importing" class="mini-spinner" /><view v-else class="mini-plus" /><text>{{ importing ? '处理中' : '导入 TXT' }}</text></button>
      </view>
      <text class="subtitle">云端书籍按章加载，不用先下载整本；也可以导入手机里的 TXT。阅读进度会保存在当前设备。</text>

      <view v-if="cloudNovels.length || cloudError" class="cloud-library">
        <view class="cloud-heading"><view><text class="section-title">云端书库</text><text>{{ cloudNovels.length }} 本</text></view><button :disabled="Boolean(openingId)" @click="refreshCloudNovels">刷新</button></view>
        <text v-if="cloudError" class="cloud-error" role="alert">{{ cloudError }}</text>
        <view v-for="novel in cloudNovels" :key="novel.id" class="cloud-row">
          <view><text class="cloud-title">{{ novel.title }}</text><text class="cloud-meta">{{ novel.author }} · {{ novel.characterCount.toLocaleString() }} 字</text></view>
          <button :disabled="Boolean(openingId)" @click="openCloudBook(novel)">{{ openingId === novel.id ? '正在打开' : cloudBookAdded(novel.id) ? '继续阅读' : '开始阅读' }}</button>
        </view>
      </view>

      <view v-if="importing && importState" class="import-card" role="status" aria-live="polite">
        <view class="import-card-heading"><text>导入进度</text><text>第 {{ importStep }} / 5 步</text></view>
        <text class="import-title">{{ importTitle }}</text>
        <text class="import-detail">{{ importDetail }}</text>
        <view class="import-track"><view :style="{ width: `${importPercent}%` }" /></view>
        <text class="import-hint">读取较大的文件时可以继续停留在此页，超过时限会自动给出错误提示。</text>
      </view>

      <view v-else-if="error" class="error-card" role="alert">
        <view><text class="error-title">没有导入成功</text><text class="error">{{ error }}</text></view>
        <button @click="importBook">重新选择</button>
      </view>

      <view v-if="!importing && !orderedBooks.length" class="empty-card">
        <view class="empty-book"><view /><view /><view /></view>
        <text class="section-title">书架还是空的</text>
        <text>从云端书库选一本直接阅读，或导入自己创作、已获授权或公版的 TXT 文件。</text>
      </view>

      <view v-for="book in orderedBooks" :key="book.id" class="book-card" hover-class="card-pressed" role="button" :aria-label="`${book.title}，${chapterLabel(book)}`" @click="openBook(book)">
        <view class="book-cover"><view class="cover-line short" /><view class="cover-line" /><view class="cover-line" /></view>
        <view class="book-main">
          <view class="book-top"><view><text class="book-title">{{ book.title }}</text><text class="book-author">{{ book.author }}</text></view><button class="book-menu" aria-label="删除这本书" @click.stop="removeBook(book)"><view /><view /><view /></button></view>
          <text class="chapter-label">{{ chapterLabel(book) }}</text>
          <view class="progress-track"><view :style="{ width: `${progress(book)}%` }" /></view>
        </view>
      </view>

      <view class="source-note"><text>内容说明</text><text>云端书库由运营后台发布，打开时只请求当前章节；本机导入仍不会上传服务器。</text></view>
    </template>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0 calc(24px + env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));background:#faf8f2;color:#3e382d}.access-state{display:flex;align-items:center;justify-content:center;min-height:160px;color:#8b806e}.library-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.library-heading>view{display:flex;min-width:0;align-items:baseline;gap:9px}.page-title{font-size:28px;font-weight:650;line-height:1.3;letter-spacing:-.5px}.book-count{flex:0 0 auto;color:#8d816d;font-size:11px}.subtitle{display:block;max-width:500px;margin-top:8px;color:#786d5b;font-size:13px;line-height:1.75}.section-title{display:block;font-size:19px;font-weight:600}.add-book{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;height:44px;min-height:44px;flex:0 0 auto;margin:0;padding:0 13px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:12px;line-height:1}.add-book::after{border:0}.add-book[disabled]{background:#494032;color:#fff9e9;opacity:1}.button-pressed{transform:scale(.97)}.mini-plus,.mini-spinner{position:relative;width:13px;height:13px;flex:0 0 13px}.mini-plus::before,.mini-plus::after{content:'';position:absolute;left:1px;top:6px;width:11px;height:1.5px;border-radius:2px;background:currentColor}.mini-plus::after{transform:rotate(90deg)}.mini-spinner{border:1.5px solid rgba(255,249,233,.45);border-right-color:#fff9e9;border-radius:50%;animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.cloud-library{padding:18px;margin-top:20px;border:1px solid #ead385;border-radius:20px;background:#fff9e9}.cloud-heading,.cloud-heading>view,.cloud-row{display:flex;align-items:center}.cloud-heading{justify-content:space-between;gap:12px}.cloud-heading>view{gap:8px}.cloud-heading>view>text:last-child{color:#8d816d;font-size:11px}.cloud-heading button,.cloud-row button{display:flex;align-items:center;justify-content:center;width:auto;height:44px;min-height:44px;margin:0;padding:0 13px;border:1px solid #dfcb88;border-radius:13px;background:#fffdf6;color:#6e5b2a;font-size:12px}.cloud-heading button::after,.cloud-row button::after{border:0}.cloud-heading button[disabled],.cloud-row button[disabled]{opacity:.55}.cloud-row{min-width:0;justify-content:space-between;gap:12px;padding-top:13px;margin-top:13px;border-top:1px solid #ecdfb8}.cloud-row>view{min-width:0}.cloud-title,.cloud-meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cloud-title{font-size:14px;font-weight:600}.cloud-meta{margin-top:4px;color:#85775d;font-size:11px}.cloud-error{display:block;padding:10px 0 0;color:#9a4e42;font-size:11px;line-height:1.6}
.import-card{padding:19px;margin-top:20px;border:1px solid #efd98d;border-radius:20px;background:#fff9e9}.import-card-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#8a7546;font-size:10px}.import-title{display:block;margin-top:11px;color:#494032;font-size:18px;font-weight:600}.import-detail{display:block;margin-top:7px;color:#6f6555;font-size:12px;line-height:1.7;word-break:break-word}.import-track{height:6px;margin-top:16px;overflow:hidden;border-radius:6px;background:#eadfbf}.import-track view{height:100%;border-radius:6px;background:#9a7626;transition:width .2s ease}.import-hint{display:block;margin-top:9px;color:#94866d;font-size:10px;line-height:1.6}.error-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 15px 15px 17px;margin-top:18px;border:1px solid #ead5cd;border-radius:17px;background:#fff}.error-card>view{min-width:0}.error-title,.error{display:block}.error-title{color:#8c493e;font-size:13px;font-weight:600}.error{margin-top:4px;color:#9a4e42;font-size:11px;line-height:1.6}.error-card button{display:flex;align-items:center;justify-content:center;width:auto;min-width:82px;height:44px;min-height:44px;flex:0 0 auto;margin:0;padding:0 13px;border:1px solid #ead5cd;border-radius:13px;background:#fff;color:#8c493e;font-size:12px}.error-card button::after{border:0}
.empty-card{display:flex;flex-direction:column;align-items:center;padding:31px 22px;margin-top:22px;border:1px solid #e7dfcf;border-radius:22px;background:#fff;color:#786d5b;text-align:center}.empty-card>text:last-child{display:block;max-width:330px;margin-top:8px;font-size:12px;line-height:1.75}.empty-book{display:flex;width:62px;height:82px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;margin-bottom:18px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.empty-book view{height:2px;border-radius:2px;background:rgba(73,64,50,.3)}.empty-book view:first-child{width:55%}
.book-card{display:flex;gap:16px;padding:17px;margin:19px 0 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.book-card+.book-card{margin-top:11px}.card-pressed{opacity:.86}.book-cover{display:flex;width:68px;height:92px;flex:0 0 68px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.cover-line{height:2px;border-radius:2px;background:rgba(73,64,50,.35)}.cover-line.short{width:60%}.book-main{display:flex;min-width:0;flex:1;flex-direction:column}.book-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.book-top>view{min-width:0}.book-title,.book-author,.chapter-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.book-title{font-size:18px;font-weight:600;line-height:1.4}.book-author{margin-top:3px;color:#8b806e;font-size:11px}.book-menu{display:flex;width:44px;min-width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;margin:-9px -10px 0 0;padding:0;border:0;background:transparent}.book-menu::after{border:0}.book-menu view{width:3px;height:3px;border-radius:50%;background:#887c68}.chapter-label{margin-top:auto;color:#786d5b;font-size:11px}.progress-track{height:5px;margin-top:9px;overflow:hidden;border-radius:4px;background:#eee9dd}.progress-track view{height:100%;border-radius:4px;background:#9a7626}.source-note{padding:16px;margin-top:24px;border-radius:17px;background:#f1ede3;color:#786d5b;font-size:11px;line-height:1.75}.source-note text{display:block}.source-note text:first-child{margin-bottom:4px;color:#494032;font-size:12px;font-weight:600}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}.page-title{font-size:25px}.add-book{padding:0 11px}.book-card{gap:13px;padding:15px}.book-cover{width:61px;height:84px;flex-basis:61px}.book-title{font-size:16px}}
</style>

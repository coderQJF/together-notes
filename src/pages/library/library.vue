<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { ensureReaderVipAccess } from '../../services/reader-access'
import { chooseReaderTextFile, readerTitleFromFileName } from '../../services/reader-import'
import {
  createReaderBook,
  loadReaderLibrary,
  removeReaderBook,
  type ReaderBook,
} from '../../services/reader'

const books = ref<ReaderBook[]>([])
const accessChecking = ref(false)
const accessGranted = ref(false)
const importing = ref(false)
const error = ref('')

const orderedBooks = computed(() => [...books.value].sort((left, right) => (right.progress.updatedAt || right.updatedAt).localeCompare(left.progress.updatedAt || left.updatedAt)))

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
    const file = await chooseReaderTextFile()
    if (!file) return
    const book = createReaderBook({ title: readerTitleFromFileName(file.name), text: file.text })
    refresh()
    uni.showToast({ title: `已整理为 ${book.chapters.length} 章`, icon: 'none' })
    setTimeout(() => openBook(book), 250)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '导入失败，请换一个 TXT 文件重试'
  } finally {
    importing.value = false
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

async function checkAccess() {
  if (accessChecking.value) return
  accessChecking.value = true
  try {
    accessGranted.value = await ensureReaderVipAccess()
    if (accessGranted.value) refresh()
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
        <button class="add-book" :disabled="importing" hover-class="button-pressed" @click="importBook"><view v-if="!importing" class="mini-plus" /><text>{{ importing ? '正在整理…' : '导入 TXT' }}</text></button>
      </view>
      <text class="subtitle">选择手机里的 TXT 文件后，会自动用文件名作为书名、识别章节并打开阅读。正文和进度只保存在当前设备。</text>

      <text v-if="error" class="error">{{ error }}</text>

      <view v-if="!orderedBooks.length" class="empty-card">
        <view class="empty-book"><view /><view /><view /></view>
        <text class="section-title">书架还是空的</text>
        <text>点击上方“导入 TXT”，选择自己创作、已获授权或公版的小说文件。</text>
      </view>

      <view v-for="book in orderedBooks" :key="book.id" class="book-card" hover-class="card-pressed" role="button" :aria-label="`${book.title}，${chapterLabel(book)}`" @click="openBook(book)">
        <view class="book-cover"><view class="cover-line short" /><view class="cover-line" /><view class="cover-line" /></view>
        <view class="book-main">
          <view class="book-top"><view><text class="book-title">{{ book.title }}</text><text class="book-author">{{ book.author }}</text></view><button class="book-menu" aria-label="删除这本书" @click.stop="removeBook(book)"><view /><view /><view /></button></view>
          <text class="chapter-label">{{ chapterLabel(book) }}</text>
          <view class="progress-track"><view :style="{ width: `${progress(book)}%` }" /></view>
        </view>
      </view>

      <view class="source-note"><text>内容说明</text><text>暂不接入来源和授权不明的网络书源；导入前请确认你拥有阅读和保存该文本的权利。</text></view>
    </template>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0 calc(24px + env(safe-area-inset-right)) calc(48px + env(safe-area-inset-bottom)) calc(24px + env(safe-area-inset-left));background:#faf8f2;color:#3e382d}.access-state{display:flex;align-items:center;justify-content:center;min-height:160px;color:#8b806e}.library-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.library-heading>view{display:flex;min-width:0;align-items:baseline;gap:9px}.page-title{font-size:28px;font-weight:650;line-height:1.3;letter-spacing:-.5px}.book-count{flex:0 0 auto;color:#8d816d;font-size:11px}.subtitle{display:block;max-width:500px;margin-top:8px;color:#786d5b;font-size:13px;line-height:1.75}.section-title{display:block;font-size:19px;font-weight:600}.add-book{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;height:44px;min-height:44px;flex:0 0 auto;margin:0;padding:0 13px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:12px;line-height:1}.add-book::after{border:0}.button-pressed{transform:scale(.97)}.mini-plus{position:relative;width:13px;height:13px}.mini-plus::before,.mini-plus::after{content:'';position:absolute;left:1px;top:6px;width:11px;height:1.5px;border-radius:2px;background:currentColor}.mini-plus::after{transform:rotate(90deg)}.error{display:block;padding:12px 13px;margin-top:16px;border-radius:12px;background:#fff0e9;color:#9a4e42;font-size:11px;line-height:1.6}
.empty-card{display:flex;flex-direction:column;align-items:center;padding:31px 22px;margin-top:22px;border:1px solid #e7dfcf;border-radius:22px;background:#fff;color:#786d5b;text-align:center}.empty-card>text:last-child{display:block;max-width:330px;margin-top:8px;font-size:12px;line-height:1.75}.empty-book{display:flex;width:62px;height:82px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;margin-bottom:18px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.empty-book view{height:2px;border-radius:2px;background:rgba(73,64,50,.3)}.empty-book view:first-child{width:55%}
.book-card{display:flex;gap:16px;padding:17px;margin:19px 0 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.book-card+.book-card{margin-top:11px}.card-pressed{opacity:.86}.book-cover{display:flex;width:68px;height:92px;flex:0 0 68px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.cover-line{height:2px;border-radius:2px;background:rgba(73,64,50,.35)}.cover-line.short{width:60%}.book-main{display:flex;min-width:0;flex:1;flex-direction:column}.book-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.book-top>view{min-width:0}.book-title,.book-author,.chapter-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.book-title{font-size:18px;font-weight:600;line-height:1.4}.book-author{margin-top:3px;color:#8b806e;font-size:11px}.book-menu{display:flex;width:44px;min-width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;margin:-9px -10px 0 0;padding:0;border:0;background:transparent}.book-menu::after{border:0}.book-menu view{width:3px;height:3px;border-radius:50%;background:#887c68}.chapter-label{margin-top:auto;color:#786d5b;font-size:11px}.progress-track{height:5px;margin-top:9px;overflow:hidden;border-radius:4px;background:#eee9dd}.progress-track view{height:100%;border-radius:4px;background:#9a7626}.source-note{padding:16px;margin-top:24px;border-radius:17px;background:#f1ede3;color:#786d5b;font-size:11px;line-height:1.75}.source-note text{display:block}.source-note text:first-child{margin-bottom:4px;color:#494032;font-size:12px;font-weight:600}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}.page-title{font-size:25px}.add-book{padding:0 11px}.book-card{gap:13px;padding:15px}.book-cover{width:61px;height:84px;flex-basis:61px}.book-title{font-size:16px}}
</style>

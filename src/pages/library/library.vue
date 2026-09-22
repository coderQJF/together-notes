<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import {
  MAX_READER_TEXT_LENGTH,
  createReaderBook,
  loadReaderLibrary,
  removeReaderBook,
  type ReaderBook,
} from '../../services/reader'

const books = ref<ReaderBook[]>([])
const importing = ref(false)
const saving = ref(false)
const error = ref('')
const title = ref('')
const author = ref('')
const content = ref('')

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

function beginImport() {
  error.value = ''
  importing.value = true
}

function cancelImport() {
  title.value = ''
  author.value = ''
  content.value = ''
  error.value = ''
  importing.value = false
}

function pasteFromClipboard() {
  uni.getClipboardData({
    success: result => {
      const value = String(result.data || '')
      if (!value.trim()) { error.value = '剪贴板里没有文字'; return }
      content.value = value.slice(0, MAX_READER_TEXT_LENGTH)
      error.value = value.length > MAX_READER_TEXT_LENGTH ? '内容较长，已保留前 150 万字' : ''
    },
    fail: () => { error.value = '暂时无法读取剪贴板，请长按输入框粘贴' },
  })
}

function saveBook() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const book = createReaderBook({ title: title.value, author: author.value, text: content.value })
    cancelImport()
    refresh()
    uni.showToast({ title: `已识别 ${book.chapters.length} 章`, icon: 'none' })
    setTimeout(() => openBook(book), 250)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请缩短内容后重试'
  } finally {
    saving.value = false
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

onShow(refresh)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="阅读" />

    <view class="headline"><text>把喜欢的故事，</text><text>安静地读完。</text></view>
    <text class="subtitle">书架只保存在这台设备，不上传，也不接入版权不明的网络书源。</text>

    <view class="library-heading">
      <view><text class="section-title">我的书架</text><text class="book-count">{{ books.length }} 本</text></view>
      <button v-if="!importing" class="add-book" hover-class="button-pressed" @click="beginImport"><view class="mini-plus" /><text>添加一本</text></button>
    </view>

    <view v-if="importing" class="import-card">
      <view class="form-heading"><view><text class="section-title">粘贴文本</text><text>可自动识别“第一章”“第2回”等标题</text></view><button class="paste" @click="pasteFromClipboard">从剪贴板粘贴</button></view>
      <text class="label">书名</text>
      <input v-model="title" maxlength="80" placeholder="给这本书起个名字" />
      <text class="label">作者（选填）</text>
      <input v-model="author" maxlength="60" placeholder="作者或来源说明" />
      <view class="content-label"><text class="label">正文</text><text>{{ content.length }} / 1,500,000</text></view>
      <textarea v-model="content" :maxlength="MAX_READER_TEXT_LENGTH" placeholder="粘贴自己创作、已获授权或公版的小说内容" />
      <text v-if="error" class="error">{{ error }}</text>
      <view class="form-actions"><button class="cancel" :disabled="saving" @click="cancelImport">取消</button><button class="save" :disabled="saving || !title.trim() || !content.trim()" @click="saveBook">{{ saving ? '保存中…' : '保存并阅读' }}</button></view>
    </view>

    <view v-if="!orderedBooks.length && !importing" class="empty-card"><text class="section-title">书架还是空的</text><text>添加自己有权阅读的文本，就可以自动分章并保存阅读进度。</text><button @click="beginImport">添加第一本</button></view>

    <view v-for="book in orderedBooks" :key="book.id" class="book-card" hover-class="card-pressed" role="button" :aria-label="`${book.title}，${chapterLabel(book)}`" @click="openBook(book)">
      <view class="book-cover"><view class="cover-line short" /><view class="cover-line" /><view class="cover-line" /></view>
      <view class="book-main">
        <view class="book-top"><view><text class="book-title">{{ book.title }}</text><text class="book-author">{{ book.author }}</text></view><button class="book-menu" aria-label="删除这本书" @click.stop="removeBook(book)"><view /><view /><view /></button></view>
        <text class="chapter-label">{{ chapterLabel(book) }}</text>
        <view class="progress-track"><view :style="{ width: `${progress(book)}%` }" /></view>
      </view>
    </view>

    <view class="source-note"><text>内容说明</text><text>“开源阅读器”只代表程序代码可按许可证使用，不代表其中的小说正文获得授权。本功能不会抓取或内置第三方盗版书源。</text></view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.headline{margin:1px 0 10px;font-size:32px;font-weight:650;line-height:1.32;letter-spacing:-.8px}.headline text{display:block}.subtitle{display:block;color:#786d5b;font-size:14px;line-height:1.75}.library-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:29px 0 13px}.library-heading>view{display:flex;align-items:baseline;gap:9px}.section-title{display:block;font-size:19px;font-weight:600}.book-count{color:#8d816d;font-size:11px}.add-book,.paste,.empty-card button{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;height:44px;min-height:44px;margin:0;padding:0 13px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:12px;line-height:1}.add-book::after,.paste::after,.empty-card button::after{border:0}.button-pressed{transform:scale(.97)}.mini-plus{position:relative;width:13px;height:13px}.mini-plus::before,.mini-plus::after{content:'';position:absolute;left:1px;top:6px;width:11px;height:1.5px;border-radius:2px;background:currentColor}.mini-plus::after{transform:rotate(90deg)}
.import-card{padding:20px;margin:14px 0 18px;border:1px solid #e7dfcf;border-radius:22px;background:#fff}.form-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.form-heading>view{min-width:0}.form-heading>view>text:last-child{display:block;margin-top:5px;color:#8b806e;font-size:11px;line-height:1.5}.paste{flex:0 0 auto;border:1px solid #e4d49f;background:#fff9e9;color:#755d24}.label{display:block;margin:17px 0 8px;color:#786d5b;font-size:12px}.content-label{display:flex;align-items:center;justify-content:space-between;color:#9a8e7a;font-size:10px}.content-label .label{margin-bottom:8px}.import-card input,.import-card textarea{width:100%;padding:0 14px;border:1px solid #e7dfcf;border-radius:14px;background:#faf8f2;color:#3e382d;font-size:15px}.import-card input{height:50px}.import-card textarea{display:block;height:210px;padding-top:13px;padding-bottom:13px;line-height:1.7}.error{display:block;padding:11px 12px;margin-top:12px;border-radius:11px;background:#fff0e9;color:#9a4e42;font-size:11px;line-height:1.6}.form-actions{display:grid;grid-template-columns:1fr 1.55fr;gap:10px;margin-top:15px}.form-actions button{height:48px;min-height:48px;margin:0;border-radius:14px;font-size:13px}.cancel{border:1px solid #ded5c4;background:#fff;color:#494032}.save{border:0;background:#494032;color:#fff9e9}.form-actions button::after{border:0}
.empty-card{display:flex;flex-direction:column;align-items:center;padding:30px 20px;border:1px dashed #ddd4c3;border-radius:20px;background:#fff;color:#786d5b;text-align:center}.empty-card>text:nth-child(2){display:block;margin:8px 0 17px;font-size:12px;line-height:1.7}.book-card{display:flex;gap:16px;padding:17px;margin:11px 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.card-pressed{opacity:.86}.book-cover{display:flex;width:68px;height:92px;flex:0 0 68px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.cover-line{height:2px;border-radius:2px;background:rgba(73,64,50,.35)}.cover-line.short{width:60%}.book-main{display:flex;min-width:0;flex:1;flex-direction:column}.book-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.book-top>view{min-width:0}.book-title,.book-author,.chapter-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.book-title{font-size:18px;font-weight:600;line-height:1.4}.book-author{margin-top:3px;color:#8b806e;font-size:11px}.book-menu{display:flex;width:44px;min-width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;margin:-9px -10px 0 0;padding:0;border:0;background:transparent}.book-menu::after{border:0}.book-menu view{width:3px;height:3px;border-radius:50%;background:#887c68}.chapter-label{margin-top:auto;color:#786d5b;font-size:11px}.progress-track{height:5px;margin-top:9px;overflow:hidden;border-radius:4px;background:#eee9dd}.progress-track view{height:100%;border-radius:4px;background:#9a7626}.source-note{padding:17px;margin-top:25px;border-radius:17px;background:#f1ede3;color:#786d5b;font-size:11px;line-height:1.75}.source-note text{display:block}.source-note text:first-child{margin-bottom:4px;color:#494032;font-size:12px;font-weight:600}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:29px}.form-heading{flex-direction:column}.paste{width:100%}.book-card{gap:13px;padding:15px}.book-cover{width:61px;height:84px;flex-basis:61px}.book-title{font-size:16px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>

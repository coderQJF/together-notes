<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { chooseReaderTextFile, readerTitleFromFileName } from '../../services/reader-import'
import {
  createReaderBook,
  loadReaderLibrary,
  removeReaderBook,
  type ReaderBook,
} from '../../services/reader'

const books = ref<ReaderBook[]>([])
const importing = ref(false)
const choosing = ref(false)
const saving = ref(false)
const error = ref('')
const title = ref('')
const author = ref('')
const content = ref('')
const fileName = ref('')
const fileSize = ref(0)

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
  fileName.value = ''
  fileSize.value = 0
  error.value = ''
  importing.value = false
}

function fileSizeLabel(value: number) {
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function textLengthLabel(value: number) {
  if (value < 10_000) return `${value.toLocaleString()} 字`
  return `${(value / 10_000).toFixed(value >= 100_000 ? 1 : 2)} 万字`
}

async function chooseTextFile() {
  if (choosing.value || saving.value) return
  choosing.value = true
  error.value = ''
  try {
    const file = await chooseReaderTextFile()
    if (!file) return
    fileName.value = file.name
    fileSize.value = file.size
    content.value = file.text
    if (!title.value.trim()) title.value = readerTitleFromFileName(file.name)
    uni.showToast({ title: `已读取 ${textLengthLabel(file.text.length)}`, icon: 'none' })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取这个 TXT 文件'
  } finally {
    choosing.value = false
  }
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
    error.value = reason instanceof Error ? reason.message : '保存失败，请换一个文件重试'
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

    <view class="library-heading">
      <view><text class="page-title">我的书架</text><text class="book-count">{{ books.length }} 本</text></view>
      <button v-if="!importing" class="add-book" hover-class="button-pressed" @click="beginImport"><view class="mini-plus" /><text>导入 TXT</text></button>
    </view>
    <text class="subtitle">从手机选择 TXT 文件，自动识别章节。书籍和进度只保存在当前设备。</text>

    <view v-if="importing" class="import-card">
      <view class="form-heading"><text class="section-title">导入本机文件</text><text>支持 UTF-8、GBK 编码，单本最大 6 MB</text></view>

      <button class="file-picker" :class="{ selected: fileName }" :disabled="choosing || saving" @click="chooseTextFile">
        <view class="file-copy">
          <text class="file-title">{{ choosing ? '正在读取…' : fileName || '选择手机里的 TXT 文件' }}</text>
          <text class="file-meta">{{ fileName ? `${fileSizeLabel(fileSize)} · ${textLengthLabel(content.length)} · 点击可重选` : '不会上传到服务器' }}</text>
        </view>
        <view class="picker-arrow" />
      </button>

      <text class="label">书名</text>
      <input v-model="title" maxlength="80" placeholder="选择文件后自动填写" />
      <text class="label">作者（选填）</text>
      <input v-model="author" maxlength="60" placeholder="作者或来源说明" />
      <text class="local-note">正文将从所选文件读取，不需要再粘贴。</text>
      <text v-if="error" class="error">{{ error }}</text>
      <view class="form-actions"><button class="cancel" :disabled="saving" @click="cancelImport">取消</button><button class="save" :disabled="saving || !title.trim() || !content.trim()" @click="saveBook">{{ saving ? '保存中…' : '保存并阅读' }}</button></view>
    </view>

    <view v-if="!orderedBooks.length && !importing" class="empty-card"><text class="section-title">书架还是空的</text><text>导入自己有权阅读的 TXT 文件，就可以自动分章并保存进度。</text><button @click="beginImport">导入第一本</button></view>

    <view v-for="book in orderedBooks" :key="book.id" class="book-card" hover-class="card-pressed" role="button" :aria-label="`${book.title}，${chapterLabel(book)}`" @click="openBook(book)">
      <view class="book-cover"><view class="cover-line short" /><view class="cover-line" /><view class="cover-line" /></view>
      <view class="book-main">
        <view class="book-top"><view><text class="book-title">{{ book.title }}</text><text class="book-author">{{ book.author }}</text></view><button class="book-menu" aria-label="删除这本书" @click.stop="removeBook(book)"><view /><view /><view /></button></view>
        <text class="chapter-label">{{ chapterLabel(book) }}</text>
        <view class="progress-track"><view :style="{ width: `${progress(book)}%` }" /></view>
      </view>
    </view>

    <view class="source-note"><text>关于网络书源</text><text>暂不接入来源和授权不明的书源合集。后续如增加在线书库，只会采用有明确授权的公版目录。</text></view>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.library-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.library-heading>view{display:flex;min-width:0;align-items:baseline;gap:9px}.page-title{font-size:28px;font-weight:650;line-height:1.3;letter-spacing:-.5px}.book-count{flex:0 0 auto;color:#8d816d;font-size:11px}.subtitle{display:block;max-width:480px;margin-top:8px;color:#786d5b;font-size:13px;line-height:1.7}.section-title{display:block;font-size:19px;font-weight:600}.add-book,.empty-card button{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;height:44px;min-height:44px;margin:0;padding:0 13px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:12px;line-height:1}.add-book::after,.empty-card button::after{border:0}.button-pressed{transform:scale(.97)}.mini-plus{position:relative;width:13px;height:13px}.mini-plus::before,.mini-plus::after{content:'';position:absolute;left:1px;top:6px;width:11px;height:1.5px;border-radius:2px;background:currentColor}.mini-plus::after{transform:rotate(90deg)}
.import-card{padding:19px;margin:19px 0 18px;border:1px solid #e7dfcf;border-radius:22px;background:#fff}.form-heading>text:last-child{display:block;margin-top:5px;color:#8b806e;font-size:11px;line-height:1.5}.file-picker{display:flex;width:100%;min-height:68px;align-items:center;justify-content:space-between;gap:14px;margin:16px 0 0;padding:11px 14px;border:1px dashed #d8c995;border-radius:15px;background:#fff9e9;color:#62533a;text-align:left}.file-picker::after{border:0}.file-picker.selected{border-style:solid;border-color:#e1d7c1;background:#faf8f2}.file-copy{display:flex;min-width:0;flex:1;flex-direction:column}.file-title,.file-meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-title{font-size:14px;font-weight:600}.file-meta{margin-top:5px;color:#8b806e;font-size:10px;font-weight:400}.picker-arrow{width:9px;height:9px;flex:0 0 9px;margin-right:3px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg)}.label{display:block;margin:15px 0 7px;color:#786d5b;font-size:12px}.import-card input{width:100%;height:48px;padding:0 14px;border:1px solid #e7dfcf;border-radius:14px;background:#faf8f2;color:#3e382d;font-size:14px}.local-note{display:block;margin-top:11px;color:#918571;font-size:10px;line-height:1.6}.error{display:block;padding:11px 12px;margin-top:11px;border-radius:11px;background:#fff0e9;color:#9a4e42;font-size:11px;line-height:1.6}.form-actions{display:grid;grid-template-columns:1fr 1.55fr;gap:10px;margin-top:14px}.form-actions button{height:46px;min-height:46px;margin:0;border-radius:14px;font-size:13px}.cancel{border:1px solid #ded5c4;background:#fff;color:#494032}.save{border:0;background:#494032;color:#fff9e9}.form-actions button::after{border:0}
.empty-card{display:flex;flex-direction:column;align-items:center;padding:30px 20px;margin-top:19px;border:1px dashed #ddd4c3;border-radius:20px;background:#fff;color:#786d5b;text-align:center}.empty-card>text:nth-child(2){display:block;margin:8px 0 17px;font-size:12px;line-height:1.7}.book-card{display:flex;gap:16px;padding:17px;margin:19px 0 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.book-card+.book-card{margin-top:11px}.card-pressed{opacity:.86}.book-cover{display:flex;width:68px;height:92px;flex:0 0 68px;flex-direction:column;justify-content:flex-end;gap:6px;padding:12px;border:1px solid #ead385;border-radius:12px 15px 15px 12px;background:#f7e7ad;box-shadow:inset 5px 0 rgba(255,255,255,.32)}.cover-line{height:2px;border-radius:2px;background:rgba(73,64,50,.35)}.cover-line.short{width:60%}.book-main{display:flex;min-width:0;flex:1;flex-direction:column}.book-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.book-top>view{min-width:0}.book-title,.book-author,.chapter-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.book-title{font-size:18px;font-weight:600;line-height:1.4}.book-author{margin-top:3px;color:#8b806e;font-size:11px}.book-menu{display:flex;width:44px;min-width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;margin:-9px -10px 0 0;padding:0;border:0;background:transparent}.book-menu::after{border:0}.book-menu view{width:3px;height:3px;border-radius:50%;background:#887c68}.chapter-label{margin-top:auto;color:#786d5b;font-size:11px}.progress-track{height:5px;margin-top:9px;overflow:hidden;border-radius:4px;background:#eee9dd}.progress-track view{height:100%;border-radius:4px;background:#9a7626}.source-note{padding:16px;margin-top:24px;border-radius:17px;background:#f1ede3;color:#786d5b;font-size:11px;line-height:1.75}.source-note text{display:block}.source-note text:first-child{margin-bottom:4px;color:#494032;font-size:12px;font-weight:600}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.page-title{font-size:25px}.add-book{padding:0 11px}.import-card{padding:16px}.book-card{gap:13px;padding:15px}.book-cover{width:61px;height:84px;flex-basis:61px}.book-title{font-size:16px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { attachImages, uploadImagePath, type Attachment, type NoteBlock } from '../services/api'
import { summarizeLedgerBlocks } from '../services/note-ledger'
import { keyboardDockOffset, paperScrollTarget } from '../services/paper-layout'
import HandwritingPad from './HandwritingPad.vue'
import ImageAttachmentGallery from './ImageAttachmentGallery.vue'
import LedgerSummary from './LedgerSummary.vue'
import NoteToolIcon from './NoteToolIcon.vue'
import StatusIcon from './StatusIcon.vue'

const props = withDefaults(defineProps<{ blocks: NoteBlock[]; attachments: Attachment[]; fullPage?: boolean; saving?: boolean }>(), { fullPage: false, saving: false })
const emit = defineEmits<{ 'update:blocks': [value: NoteBlock[]]; 'update:attachments': [value: Attachment[]]; save: [] }>()
const handwritingOpen = ref(false)
const formatOpen = ref(false)
const activeParagraph = ref('')
const busy = ref(false)
const keyboardHeight = ref(0)
const keyboardOpen = ref(false)
const activeId = ref('')
const focusedId = ref('')
const caretAtEnd = ref(false)
const instance = getCurrentInstance()
let baselineHeight = 0
let reportedKeyboard = 0
let layoutTimer: ReturnType<typeof setTimeout> | undefined
function windowHeight() {
  // #ifdef H5
  return window.innerHeight
  // #endif
  // #ifndef H5
  return (typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()).windowHeight
  // #endif
}
function keepFieldVisible() {
  if (!props.fullPage || !activeId.value || !keyboardOpen.value || handwritingOpen.value || formatOpen.value) return
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select(`#paper-${activeId.value}`).boundingClientRect()
  query.select('.paper-toolbar').boundingClientRect()
  query.selectViewport().scrollOffset(() => {})
  query.exec(results => {
    const [field, toolbar, viewport] = results
    if (!field || !toolbar || !viewport) return
    const safeTop = Math.max(80, Number(uni.getSystemInfoSync().statusBarHeight || 0) + 60)
    if (!caretAtEnd.value && field.bottom - field.top > toolbar.top - safeTop - 12) return
    // Tall paragraphs keep their current line visible without moving their start offscreen on focus.
    const bottom = caretAtEnd.value ? field.bottom : Math.min(field.bottom, field.top + 64)
    const target = paperScrollTarget(viewport.scrollTop || 0, field.top, bottom, safeTop, toolbar.top - 12)
    if (target !== null) uni.pageScrollTo({ scrollTop: target, duration: 0 })
  })
}
function syncKeyboardLayout() {
  const height = windowHeight()
  baselineHeight = Math.max(baselineHeight, height)
  keyboardOpen.value = reportedKeyboard > 0
  keyboardHeight.value = keyboardDockOffset(reportedKeyboard, baselineHeight, height)
  void nextTick(keepFieldVisible)
}
function keyboardChanged(event: { height: number }) {
  reportedKeyboard = Math.max(0, Number(event.height) || 0)
  scheduleLayout()
}
function scheduleLayout() {
  clearTimeout(layoutTimer)
  layoutTimer = setTimeout(syncKeyboardLayout, 100)
}
function viewportChanged() {
  // #ifdef H5
  const viewport = window.visualViewport
  if (viewport) {
    keyboardHeight.value = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    keyboardOpen.value = keyboardHeight.value > 80
    void nextTick(keepFieldVisible)
  }
  // #endif
}
const tools = [
  { key: 'handwriting', label: '手写' }, { key: 'todo', label: '待办' }, { key: 'paragraph', label: '段落' },
  { key: 'image', label: '图片' }, { key: 'link', label: '链接' },
] as const
const activeBlock = computed(() => props.blocks.find(block => block.id === activeParagraph.value && block.type === 'paragraph'))
const ledgerSummary = computed(() => summarizeLedgerBlocks(props.blocks))

function blockId() { return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function paragraphBlock(text = ''): NoteBlock { return { id: blockId(), type: 'paragraph', text, style: { align: 'left', list: 'none', color: '#3e382d' } } }
function eventValue(event: Event) { return String((event as any).detail?.value || '') }
function update(next: NoteBlock[]) { emit('update:blocks', next) }
function patchBlock(id: string, patch: Partial<NoteBlock>) { update(props.blocks.map(block => block.id === id ? { ...block, ...patch } : block)) }
function toggleTodo(id: string) { const block = props.blocks.find(item => item.id === id); if (block?.type === 'todo') patchBlock(id, { checked: !block.checked }) }
function removeBlock(id: string) {
  const next = props.blocks.filter(block => block.id !== id)
  update(next)
  if (activeId.value === id) { activeId.value = next[next.length - 1]?.id || ''; activeParagraph.value = '' }
}
function attachment(id?: string) { return props.attachments.find(item => item.id === id) }
function paragraphCss(block: NoteBlock) { return { fontWeight: block.style?.bold ? '700' : '400', fontStyle: block.style?.italic ? 'italic' : 'normal', textDecoration: block.style?.underline ? 'underline' : 'none', textAlign: block.style?.align || 'left', color: block.style?.color || '#3e382d' } }

function focusBlock(id: string, paragraph = false) {
  activeId.value = id
  activeParagraph.value = paragraph ? id : ''
  focusedId.value = ''
  void nextTick(() => { focusedId.value = id; keepFieldVisible() })
}
function fieldFocused(id: string, paragraph = false) {
  activeId.value = id; activeParagraph.value = paragraph ? id : ''; focusedId.value = id
  caretAtEnd.value = false
  void nextTick(keepFieldVisible)
}
function paragraphInput(id: string, event: Event) {
  const text = eventValue(event)
  caretAtEnd.value = (event as any).detail?.cursor === text.length
  patchBlock(id, { text })
  void nextTick(keepFieldVisible)
}
function insertBlocks(added: NoteBlock[], anchor = activeId.value) {
  const next = [...props.blocks]
  const index = next.findIndex(block => block.id === anchor)
  next.splice(index < 0 ? next.length : index + 1, 0, ...added)
  update(next)
}
function addParagraph() {
  const block = paragraphBlock()
  insertBlocks([block]); formatOpen.value = false; focusBlock(block.id, true)
}
function addTodo(anchor = activeId.value) {
  const block: NoteBlock = { id: blockId(), type: 'todo', text: '', checked: false }
  insertBlocks([block], anchor); focusBlock(block.id)
}
function continueTodo(id: string, event: Event) {
  const value = eventValue(event)
  const block = props.blocks.find(item => item.id === id)
  if (!block) return
  if (!value.trim()) {
    update(props.blocks.map(item => item.id === id ? { ...paragraphBlock(), id } : item))
    focusBlock(id, true)
    return
  }
  const next: NoteBlock = { id: blockId(), type: 'todo', text: '', checked: false }
  const blocks = props.blocks.map(item => item.id === id ? { ...item, text: value } : item)
  blocks.splice(blocks.findIndex(item => item.id === id) + 1, 0, next)
  update(blocks); focusBlock(next.id)
}
function addLink() { const block: NoteBlock = { id: blockId(), type: 'link', text: '', url: '' }; insertBlocks([block]); focusBlock(block.id) }

async function addImage() {
  if (busy.value || props.attachments.length >= 10) return
  busy.value = true
  const anchor = activeId.value
  try {
    const added = await attachImages(10 - props.attachments.length)
    emit('update:attachments', [...props.attachments, ...added].slice(0, 10))
    const imageBlocks = added.map(item => ({ id: blockId(), type: 'image' as const, attachmentId: item.id }))
    insertBlocks(imageBlocks, anchor)
    activeId.value = imageBlocks[imageBlocks.length - 1]?.id || anchor; activeParagraph.value = ''
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '添加图片失败'
    if (message !== '未选择图片') uni.showToast({ title: message, icon: 'none' })
  } finally { busy.value = false }
}

async function saveDrawing(path: string) {
  handwritingOpen.value = false
  if (busy.value || props.attachments.length >= 10) return
  busy.value = true
  try {
    const added = await uploadImagePath(path)
    emit('update:attachments', [...props.attachments, added].slice(0, 10))
    const drawing: NoteBlock = { id: blockId(), type: 'drawing', attachmentId: added.id }
    insertBlocks([drawing]); activeId.value = drawing.id; activeParagraph.value = ''
  } catch (reason) { uni.showToast({ title: reason instanceof Error ? reason.message : '手写内容保存失败', icon: 'none' }) }
  finally { busy.value = false }
}

function useTool(key: typeof tools[number]['key']) {
  if (key === 'handwriting') { uni.hideKeyboard(); handwritingOpen.value = true }
  if (key === 'todo') addTodo()
  if (key === 'paragraph') { if (props.fullPage && activeBlock.value) formatOpen.value = true; else addParagraph() }
  if (key === 'image') void addImage()
  if (key === 'link') addLink()
}

function patchStyle(patch: Record<string, unknown>) {
  const block = activeBlock.value
  if (!block) return
  patchBlock(block.id, { style: { align: 'left', list: 'none', color: '#3e382d', ...(block.style || {}), ...patch } })
}

onMounted(() => {
  baselineHeight = windowHeight()
  if (!props.blocks.length) {
    const block = paragraphBlock()
    update([block])
    activeParagraph.value = block.id
  } else activeParagraph.value = props.blocks.find(block => block.type === 'paragraph')?.id || ''
  // #ifndef H5
  uni.onKeyboardHeightChange(keyboardChanged)
  uni.onWindowResize(scheduleLayout)
  // #endif
  // #ifdef H5
  window.visualViewport?.addEventListener('resize', viewportChanged)
  // #endif
})
onUnmounted(() => {
  clearTimeout(layoutTimer)
  // #ifndef H5
  uni.offKeyboardHeightChange(keyboardChanged)
  uni.offWindowResize(scheduleLayout)
  // #endif
  // #ifdef H5
  window.visualViewport?.removeEventListener('resize', viewportChanged)
  // #endif
})
</script>

<template>
  <view class="paper-editor" :class="{ 'full-page': fullPage, 'keyboard-open': keyboardOpen }" :style="{ '--paper-keyboard': `${keyboardHeight}px` }">
    <view v-for="(block, index) in blocks" :id="`paper-${block.id}`" :key="block.id" class="block" :class="[`block-${block.type}`, { 'sole-paragraph': blocks.length === 1 && block.type === 'paragraph' }]">
      <view v-if="block.type !== 'todo' && (!fullPage || block.type !== 'paragraph' || blocks.length > 1)" class="block-top"><text>{{ block.type === 'paragraph' ? '段落' : block.type === 'link' ? '链接' : block.type === 'drawing' ? '手写' : '图片' }}</text><button aria-label="移除这段内容" @click="removeBlock(block.id)">移除</button></view>
      <textarea v-if="block.type === 'paragraph'" class="block-input paragraph-input" :style="paragraphCss(block)" :value="block.text" :focus="focusedId === block.id" maxlength="10000" placeholder="输入正文…" placeholder-style="font-size:16px;line-height:24px" auto-height :adjust-position="!fullPage" :cursor-spacing="88" :show-confirm-bar="false" disable-default-padding @focus="fieldFocused(block.id,true)" @input="paragraphInput(block.id,$event)" @linechange="keepFieldVisible" />
      <view v-else-if="block.type === 'todo'" class="todo-row" :class="{checked:block.checked}" @click="toggleTodo(block.id)"><button aria-label="切换待办状态" @click.stop="toggleTodo(block.id)" @tap.stop><StatusIcon :checked="Boolean(block.checked)" size="large" /></button><input :value="block.text" :focus="focusedId === block.id" :adjust-position="!fullPage" :cursor-spacing="88" confirm-type="next" :confirm-hold="true" maxlength="500" placeholder="待办事项" @focus="fieldFocused(block.id)" @confirm="continueTodo(block.id,$event)" @click.stop @tap.stop @input="patchBlock(block.id,{text:eventValue($event)})" /><button class="todo-remove" aria-label="移除这条待办" @click.stop="removeBlock(block.id)" @tap.stop><view class="remove-icon" /></button></view>
      <view v-else-if="block.type === 'link'" class="link-fields"><input :value="block.text" :focus="focusedId === block.id" :adjust-position="!fullPage" :cursor-spacing="88" maxlength="500" placeholder="链接名称（选填）" @focus="fieldFocused(block.id)" @input="patchBlock(block.id,{text:eventValue($event)})" /><input :value="block.url" :adjust-position="!fullPage" :cursor-spacing="88" maxlength="2000" placeholder="https://…" @focus="fieldFocused(block.id)" @input="patchBlock(block.id,{url:eventValue($event)})" /></view>
      <ImageAttachmentGallery v-else-if="attachment(block.attachmentId)" inline :attachments="[attachment(block.attachmentId)!]" />
      <text v-else class="missing-file">图片已移除</text>
      <text class="block-order">{{ index + 1 }}</text>
    </view>

    <button v-if="blocks[blocks.length-1]?.type === 'todo'" class="continue-paragraph" @click="activeId=blocks[blocks.length-1].id;addParagraph()">继续写正文</button>

    <LedgerSummary v-if="ledgerSummary" :summary="ledgerSummary" />

    <view class="paper-toolbar">
      <button v-for="tool in tools" :key="tool.key" :disabled="busy || saving" :aria-label="tool.label" @click="useTool(tool.key)"><NoteToolIcon :kind="tool.key" /><text>{{ tool.label }}</text></button>
      <button v-if="fullPage" class="paper-save" :disabled="busy || saving" aria-label="保存灵感纸" @click="emit('save')"><StatusIcon checked size="large" /><text>{{ saving ? '保存中' : '保存' }}</text></button>
    </view>

    <view v-if="formatOpen" class="format-layer" @click="formatOpen=false">
      <view class="format-sheet" @click.stop>
        <view class="format-heading"><text>段落样式</text><button @click="formatOpen=false"><view class="close-icon" /></button></view>
        <button v-if="fullPage" class="new-paragraph" @click="addParagraph">新增段落</button>
        <view class="format-actions">
          <button :class="{active:activeBlock?.style?.bold}" @click="patchStyle({bold:!activeBlock?.style?.bold})"><text class="bold">B</text><text>粗体</text></button>
          <button :class="{active:activeBlock?.style?.italic}" @click="patchStyle({italic:!activeBlock?.style?.italic})"><text class="italic">I</text><text>斜体</text></button>
          <button :class="{active:activeBlock?.style?.underline}" @click="patchStyle({underline:!activeBlock?.style?.underline})"><text class="underline">U</text><text>下划线</text></button>
          <button :class="{active:activeBlock?.style?.align==='left'}" @click="patchStyle({align:'left'})"><text>左</text><text>左对齐</text></button>
          <button :class="{active:activeBlock?.style?.align==='center'}" @click="patchStyle({align:'center'})"><text>中</text><text>居中</text></button>
          <button :class="{active:activeBlock?.style?.align==='right'}" @click="patchStyle({align:'right'})"><text>右</text><text>右对齐</text></button>
          <button :class="{active:activeBlock?.style?.list==='ordered'}" @click="patchStyle({list:'ordered'})"><text>1.</text><text>编号</text></button>
          <button :class="{active:activeBlock?.style?.list==='bullet'}" @click="patchStyle({list:'bullet'})"><text>•</text><text>项目符号</text></button>
          <button :class="{active:activeBlock?.style?.list==='none'}" @click="patchStyle({list:'none'})"><text>—</text><text>普通段落</text></button>
        </view>
        <view class="colors"><button v-for="color in ['#3e382d','#b04432','#b88713','#34764c','#356e95','#6c55a2']" :key="color" :style="{backgroundColor:color}" :aria-label="`选择文字颜色 ${color}`" :class="{active:activeBlock?.style?.color===color}" @click="patchStyle({color})" /></view>
      </view>
    </view>
    <HandwritingPad v-if="handwritingOpen" @close="handwritingOpen=false" @save="saveDrawing" />
  </view>
</template>

<style scoped>
.paper-editor{padding-bottom:76px}.block{position:relative;padding:13px 14px;margin:12px 0;border:1px solid #ece5d6;border-radius:18px;background:#fff}.block-todo{padding:0;margin:2px 0;border:0;border-radius:0;background:transparent}.block-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;color:#9a8b72;font-size:10px}.block-top button{display:flex;width:52px;height:44px;min-height:44px;align-items:center;justify-content:flex-end;margin:-12px -4px -10px 0;padding:0;border:0;background:transparent;color:#ae4b3b;font-size:11px}.block-top button::after{border:0}.block-input,.link-fields input,.todo-row input{width:100%;border:0;background:transparent;color:#3e382d}.paragraph-input{min-height:64px;font-size:16px;line-height:1.8;text-decoration:var(--paragraph-decoration,none)}.todo-row{display:flex;min-height:56px;align-items:center;gap:7px;color:#3e382d}.todo-row>button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;flex:0 0 44px;margin:0;padding:0;border:0;background:transparent}.todo-row>button::after{border:0}.todo-row input{height:48px;min-width:0;flex:1;font-size:16px}.todo-row.checked input{color:#9c9487;text-decoration:line-through}.todo-row>.todo-remove{width:44px;flex-basis:44px}.remove-icon{position:relative;width:14px;height:14px}.remove-icon::before,.remove-icon::after{content:'';position:absolute;left:1px;top:6px;width:12px;border-top:1.5px solid #b3aa9d;transform:rotate(45deg)}.remove-icon::after{transform:rotate(-45deg)}.link-fields{display:flex;flex-direction:column;gap:4px}.link-fields input{height:42px;border-bottom:1px solid #eee7da}.link-fields input:last-child{border-bottom:0;color:#83692e}.missing-file{display:block;padding:24px;color:#9a8b72;text-align:center}.block-order{position:absolute;right:12px;bottom:8px;color:#c1b7a7;font-size:9px}.block-todo .block-order{display:none}.paper-toolbar{position:sticky;z-index:25;bottom:8px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:6px;margin-top:18px;border:1px solid #e6dfd1;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(64,54,40,.14);backdrop-filter:blur(10px)}.paper-toolbar button{display:flex;height:54px;min-height:54px;align-items:center;justify-content:center;flex-direction:column;gap:2px;margin:0;padding:0;border:0;background:transparent;color:#494032;font-size:9px}.paper-toolbar button::after{border:0}.paper-toolbar button[disabled]{opacity:.4}.format-layer{position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(49,42,33,.25)}.format-sheet{width:min(100%,640px);padding:16px 20px calc(22px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#f6f6f4;box-sizing:border-box}.format-heading{display:flex;height:44px;align-items:center;justify-content:space-between;color:#62594a;font-size:16px;font-weight:600}.format-heading button{display:flex;width:44px;height:44px;align-items:center;justify-content:center;margin:0 -10px 0 0;padding:0;border:0;background:transparent}.format-heading button::after{border:0}.close-icon{position:relative;width:16px;height:16px}.close-icon::before,.close-icon::after{content:'';position:absolute;left:1px;top:7px;width:14px;border-top:1.5px solid #786d5b;transform:rotate(45deg)}.close-icon::after{transform:rotate(-45deg)}.format-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.format-actions button{display:flex;height:56px;align-items:center;justify-content:center;flex-direction:column;gap:3px;margin:0;padding:0;border:1px solid #e2ddd3;border-radius:12px;background:#fff;color:#62594a;font-size:9px}.format-actions button::after{border:0}.format-actions button>text:first-child{font-size:16px}.format-actions button.active{border-color:#d0ad55;background:#fff8e5;color:#6c5624}.bold{font-weight:800}.italic{font-style:italic}.underline{text-decoration:underline}.colors{display:flex;justify-content:space-between;margin-top:16px}.colors button{width:38px;height:38px;min-height:38px;margin:0;padding:0;border:4px solid #f6f6f4;border-radius:50%;box-shadow:0 0 0 1px #d7d0c4}.colors button::after{border:0}.colors button.active{box-shadow:0 0 0 2px #b28b35}@media(max-width:360px){.paper-toolbar{padding:4px}.paper-toolbar button{height:50px;min-height:50px}.format-sheet{padding-left:16px;padding-right:16px}}
</style>

<style scoped>
.full-page{min-height:calc(100vh - 210px);padding-bottom:calc(100px + env(safe-area-inset-bottom));color:#494032}
.full-page .block{margin:0;padding:8px 0;border:0;border-radius:0;background:transparent}
.paragraph-input{display:block;margin:0;padding:0;line-height:24px;box-sizing:border-box}
.full-page .paragraph-input{min-height:48px;line-height:24px}
.continue-paragraph{display:flex;align-items:center;min-height:44px;margin:8px 0;padding:0 10px;border:0;border-radius:12px;background:#f1ede4;color:#786d5b;font-size:13px;text-align:left}
.continue-paragraph::after{border:0}
.keyboard-open.full-page{padding-bottom:calc(100px + var(--paper-keyboard,0px))}
.keyboard-open .paper-toolbar{padding-bottom:8px}
.full-page .block-order{display:none}
.full-page .paper-toolbar{position:fixed;left:50%;bottom:var(--paper-keyboard,0px);transform:translateX(-50%);width:100%;max-width:640px;grid-template-columns:repeat(6,minmax(0,1fr));margin:0;padding:8px 20px calc(8px + env(safe-area-inset-bottom));border-width:1px 0 0;border-radius:0;background:#faf8f2;box-shadow:0 -4px 20px rgba(64,54,40,.04);box-sizing:border-box}
.full-page .paper-toolbar button{min-width:44px;min-height:54px}
.full-page .paper-save{color:#83692e}
.new-paragraph{display:flex;align-items:center;justify-content:center;min-height:44px;margin:8px 0;border-radius:12px;background:#f7e7ad;color:#494032}
.colors button{width:44px;height:44px;min-height:44px}
@media(max-width:360px){.full-page .paper-toolbar{padding-left:16px;padding-right:16px}}
</style>

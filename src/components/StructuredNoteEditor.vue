<script setup lang="ts">
import { computed, ref } from 'vue'
import { attachImages, uploadImagePath, type Attachment, type NoteBlock } from '../services/api'
import HandwritingPad from './HandwritingPad.vue'
import ImageAttachmentGallery from './ImageAttachmentGallery.vue'
import NoteToolIcon from './NoteToolIcon.vue'
import StatusIcon from './StatusIcon.vue'

const props = defineProps<{ blocks: NoteBlock[]; attachments: Attachment[] }>()
const emit = defineEmits<{ 'update:blocks': [value: NoteBlock[]]; 'update:attachments': [value: Attachment[]] }>()
const handwritingOpen = ref(false)
const formatOpen = ref(false)
const activeParagraph = ref('')
const busy = ref(false)
const tools = [
  { key: 'handwriting', label: '手写' }, { key: 'todo', label: '待办' }, { key: 'paragraph', label: '段落' },
  { key: 'image', label: '图片' }, { key: 'link', label: '链接' },
] as const
const activeBlock = computed(() => props.blocks.find(block => block.id === activeParagraph.value && block.type === 'paragraph'))

function blockId() { return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function eventValue(event: Event) { return String((event as any).detail?.value || '') }
function update(next: NoteBlock[]) { emit('update:blocks', next) }
function patchBlock(id: string, patch: Partial<NoteBlock>) { update(props.blocks.map(block => block.id === id ? { ...block, ...patch } : block)) }
function removeBlock(id: string) { update(props.blocks.filter(block => block.id !== id)) }
function attachment(id?: string) { return props.attachments.find(item => item.id === id) }
function paragraphCss(block: NoteBlock) { return { fontWeight: block.style?.bold ? '700' : '400', fontStyle: block.style?.italic ? 'italic' : 'normal', textDecoration: block.style?.underline ? 'underline' : 'none', textAlign: block.style?.align || 'left', color: block.style?.color || '#3e382d' } }

function addParagraph() {
  const block: NoteBlock = { id: blockId(), type: 'paragraph', text: '', style: { align: 'left', list: 'none', color: '#3e382d' } }
  update([...props.blocks, block]); activeParagraph.value = block.id; formatOpen.value = true
}
function addTodo() { update([...props.blocks, { id: blockId(), type: 'todo', text: '', checked: false }]) }
function addLink() { update([...props.blocks, { id: blockId(), type: 'link', text: '', url: '' }]) }

async function addImage() {
  if (busy.value || props.attachments.length >= 10) return
  busy.value = true
  try {
    const added = await attachImages(10 - props.attachments.length)
    emit('update:attachments', [...props.attachments, ...added].slice(0, 10))
    update([...props.blocks, ...added.map(item => ({ id: blockId(), type: 'image' as const, attachmentId: item.id }))])
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
    update([...props.blocks, { id: blockId(), type: 'drawing', attachmentId: added.id }])
  } catch (reason) { uni.showToast({ title: reason instanceof Error ? reason.message : '手写内容上传失败', icon: 'none' }) }
  finally { busy.value = false }
}

function useTool(key: typeof tools[number]['key']) {
  if (key === 'handwriting') handwritingOpen.value = true
  if (key === 'todo') addTodo()
  if (key === 'paragraph') addParagraph()
  if (key === 'image') void addImage()
  if (key === 'link') addLink()
}

function patchStyle(patch: Record<string, unknown>) {
  const block = activeBlock.value
  if (!block) return
  patchBlock(block.id, { style: { align: 'left', list: 'none', color: '#3e382d', ...(block.style || {}), ...patch } })
}
</script>

<template>
  <view class="paper-editor">
    <view v-if="!blocks.length" class="paper-empty"><text>从下方选择一种内容开始记录</text><text>支持手写、待办、段落、图片和链接</text></view>
    <view v-for="(block, index) in blocks" :key="block.id" class="block" :class="`block-${block.type}`">
      <view class="block-top"><text>{{ block.type === 'paragraph' ? '段落' : block.type === 'todo' ? '待办' : block.type === 'link' ? '链接' : block.type === 'drawing' ? '手写' : '图片' }}</text><button aria-label="移除这段内容" @click="removeBlock(block.id)">移除</button></view>
      <textarea v-if="block.type === 'paragraph'" class="block-input paragraph-input" :style="paragraphCss(block)" :value="block.text" maxlength="10000" placeholder="输入正文…" auto-height disable-default-padding @focus="activeParagraph=block.id" @input="patchBlock(block.id,{text:eventValue($event)})" />
      <view v-else-if="block.type === 'todo'" class="todo-row"><button aria-label="切换待办状态" @click="patchBlock(block.id,{checked:!block.checked})"><StatusIcon :done="Boolean(block.checked)" /></button><input :value="block.text" maxlength="500" placeholder="待办事项" @input="patchBlock(block.id,{text:eventValue($event)})" /></view>
      <view v-else-if="block.type === 'link'" class="link-fields"><input :value="block.text" maxlength="500" placeholder="链接名称（选填）" @input="patchBlock(block.id,{text:eventValue($event)})" /><input :value="block.url" maxlength="2000" placeholder="https://…" @input="patchBlock(block.id,{url:eventValue($event)})" /></view>
      <ImageAttachmentGallery v-else-if="attachment(block.attachmentId)" inline :attachments="[attachment(block.attachmentId)!]" />
      <text v-else class="missing-file">图片已移除</text>
      <text class="block-order">{{ index + 1 }}</text>
    </view>

    <view class="paper-toolbar">
      <button v-for="tool in tools" :key="tool.key" :disabled="busy" :aria-label="tool.label" @click="useTool(tool.key)"><NoteToolIcon :kind="tool.key" /><text>{{ tool.label }}</text></button>
    </view>

    <view v-if="formatOpen" class="format-layer" @click="formatOpen=false">
      <view class="format-sheet" @click.stop>
        <view class="format-heading"><text>段落样式</text><button @click="formatOpen=false"><view class="close-icon" /></button></view>
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
.paper-editor{padding-bottom:76px}.paper-empty{display:flex;min-height:210px;align-items:center;justify-content:center;flex-direction:column;gap:8px;border:1px dashed #ddd3c3;border-radius:18px;color:#8b806e;text-align:center}.paper-empty text:first-child{color:#62594a;font-size:14px}.paper-empty text:last-child{font-size:11px}.block{position:relative;padding:13px 14px;margin:12px 0;border:1px solid #ece5d6;border-radius:18px;background:#fff}.block-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;color:#9a8b72;font-size:10px}.block-top button{display:flex;width:52px;height:44px;min-height:44px;align-items:center;justify-content:flex-end;margin:-12px -4px -10px 0;padding:0;border:0;background:transparent;color:#ae4b3b;font-size:11px}.block-top button::after{border:0}.block-input,.link-fields input,.todo-row input{width:100%;border:0;background:transparent;color:#3e382d}.paragraph-input{min-height:64px;font-size:16px;line-height:1.8;text-decoration:var(--paragraph-decoration,none)}.todo-row{display:flex;align-items:center;gap:10px}.todo-row>button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;flex:0 0 44px;margin:0 0 0 -10px;padding:0;border:0;background:transparent}.todo-row>button::after{border:0}.todo-row input{height:44px;flex:1}.link-fields{display:flex;flex-direction:column;gap:4px}.link-fields input{height:42px;border-bottom:1px solid #eee7da}.link-fields input:last-child{border-bottom:0;color:#83692e}.missing-file{display:block;padding:24px;color:#9a8b72;text-align:center}.block-order{position:absolute;right:12px;bottom:8px;color:#c1b7a7;font-size:9px}.paper-toolbar{position:sticky;z-index:25;bottom:8px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:6px;margin-top:18px;border:1px solid #e6dfd1;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(64,54,40,.14);backdrop-filter:blur(10px)}.paper-toolbar button{display:flex;height:54px;min-height:54px;align-items:center;justify-content:center;flex-direction:column;gap:2px;margin:0;padding:0;border:0;background:transparent;color:#494032;font-size:9px}.paper-toolbar button::after{border:0}.paper-toolbar button[disabled]{opacity:.4}.format-layer{position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(49,42,33,.25)}.format-sheet{width:min(100%,640px);padding:16px 20px calc(22px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#f6f6f4;box-sizing:border-box}.format-heading{display:flex;height:44px;align-items:center;justify-content:space-between;color:#62594a;font-size:16px;font-weight:600}.format-heading button{display:flex;width:44px;height:44px;align-items:center;justify-content:center;margin:0 -10px 0 0;border:0;background:transparent}.format-heading button::after{border:0}.close-icon{position:relative;width:16px;height:16px}.close-icon::before,.close-icon::after{content:'';position:absolute;left:1px;top:7px;width:14px;border-top:1.5px solid #786d5b;transform:rotate(45deg)}.close-icon::after{transform:rotate(-45deg)}.format-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.format-actions button{display:flex;height:56px;align-items:center;justify-content:center;flex-direction:column;gap:3px;margin:0;padding:0;border:1px solid #e2ddd3;border-radius:12px;background:#fff;color:#62594a;font-size:9px}.format-actions button::after{border:0}.format-actions button>text:first-child{font-size:16px}.format-actions button.active{border-color:#d0ad55;background:#fff8e5;color:#6c5624}.bold{font-weight:800}.italic{font-style:italic}.underline{text-decoration:underline}.colors{display:flex;justify-content:space-between;margin-top:16px}.colors button{width:38px;height:38px;min-height:38px;margin:0;padding:0;border:4px solid #f6f6f4;border-radius:50%;box-shadow:0 0 0 1px #d7d0c4}.colors button::after{border:0}.colors button.active{box-shadow:0 0 0 2px #b28b35}@media(max-width:360px){.paper-toolbar{padding:4px}.paper-toolbar button{height:50px;min-height:50px}.format-sheet{padding-left:16px;padding-right:16px}}
</style>

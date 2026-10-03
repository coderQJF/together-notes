<script setup lang="ts">
import { computed } from 'vue'
import type { Item, NoteBlock } from '../services/api'
import { summarizeLedgerBlocks } from '../services/note-ledger'
import { openExternalUrl } from '../utils/platform'
import ImageAttachmentGallery from './ImageAttachmentGallery.vue'
import LedgerSummary from './LedgerSummary.vue'
import StatusIcon from './StatusIcon.vue'

const props = withDefaults(defineProps<{ item: Omit<Item, 'scope'> & { scope?: Item['scope'] | 'link' }; interactive?: boolean }>(), { interactive: false })
const emit = defineEmits<{ 'toggle-todo': [id: string] }>()
const blocks = computed(() => props.item.blocks || [])
const ledgerSummary = computed(() => summarizeLedgerBlocks(blocks.value))
function attachment(block: NoteBlock) { return (props.item.attachments || []).find(item => item.id === block.attachmentId) }
function paragraphStyle(block: NoteBlock) { return { fontWeight: block.style?.bold ? '700' : '400', fontStyle: block.style?.italic ? 'italic' : 'normal', textDecoration: block.style?.underline ? 'underline' : 'none', textAlign: block.style?.align || 'left', color: block.style?.color || '#3e382d' } }
function paragraphPrefix(block: NoteBlock, index: number) { return block.style?.list === 'ordered' ? `${index + 1}. ` : block.style?.list === 'bullet' ? '• ' : '' }
</script>

<template>
  <view class="structured-note">
    <LedgerSummary v-if="ledgerSummary" :summary="ledgerSummary" />
    <template v-if="blocks.length">
      <view v-for="(block, index) in blocks" :key="block.id" class="content-block" :class="`content-${block.type}`">
        <text v-if="block.type === 'paragraph'" class="paragraph" :style="paragraphStyle(block)">{{ paragraphPrefix(block,index) }}{{ block.text }}</text>
        <button v-else-if="block.type === 'todo'" class="todo" :disabled="!interactive" @click="emit('toggle-todo',block.id)"><StatusIcon :checked="Boolean(block.checked)" size="large" /><text :class="{done:block.checked}">{{ block.text || '未命名待办' }}</text></button>
        <button v-else-if="block.type === 'link' && block.url" class="link" @click="openExternalUrl(block.url)"><image src="/static/nav-icons/link-active.png" mode="aspectFit" /><view><text>{{ block.text || block.url }}</text><text>{{ block.url }}</text></view><view class="chevron" /></button>
        <ImageAttachmentGallery v-else-if="attachment(block)" inline :attachments="[attachment(block)!]" />
      </view>
    </template>
    <text v-else class="fallback">{{ item.content || '暂无正文' }}</text>
  </view>
</template>

<style scoped>
.structured-note{margin:5px 0 28px}.content-block{margin:13px 0}.content-todo{margin:2px 0}.paragraph{display:block;font-size:16px;line-height:1.9;white-space:pre-wrap;word-break:break-word}.todo{display:flex;width:100%;min-height:56px;align-items:center;gap:7px;margin:0;padding:6px 0;border:0;border-radius:0;background:transparent;color:#494032;text-align:left;box-sizing:border-box}.todo::after{border:0}.todo[disabled]{color:#494032;opacity:1}.todo :deep(.status-icon){margin:0 8px;flex:0 0 auto}.todo>text{min-width:0;flex:1;font-size:16px;line-height:1.6}.todo>text.done{color:#9c9487;text-decoration:line-through}.link{display:flex;width:100%;min-height:64px;align-items:center;gap:11px;margin:0;padding:10px 13px;border:1px solid #ece5d6;border-radius:15px;background:#fff;color:#494032;text-align:left}.link::after{border:0}.link image{width:22px;height:22px;flex:0 0 22px}.link>view:nth-child(2){min-width:0;flex:1}.link text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.link text:first-child{font-size:13px}.link text:last-child{margin-top:4px;color:#8b806e;font-size:10px}.chevron{width:8px;height:8px;flex:0 0 8px;border-top:1.5px solid #a79b87;border-right:1.5px solid #a79b87;transform:rotate(45deg)}.fallback{display:block;color:#4b4438;font-size:16px;line-height:1.9;white-space:pre-wrap}
</style>

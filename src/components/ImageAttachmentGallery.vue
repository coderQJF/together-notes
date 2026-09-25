<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { attachmentPreviewUrl, releaseAttachmentPreviewUrl, type Attachment } from '../services/api'

const props = defineProps<{ attachments: Attachment[] }>()
const images = computed(() => props.attachments.filter(item => /\.(?:png|jpe?g|webp|gif)$/i.test(item.name)))
const sources = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const previewOpen = ref(false)
const activeIndex = ref(0)
let loadGeneration = 0

function releaseSources() {
  Object.values(sources.value).forEach(releaseAttachmentPreviewUrl)
  sources.value = {}
}

async function loadSources() {
  const generation = ++loadGeneration
  releaseSources()
  failed.value = {}
  for (const attachment of images.value) {
    try {
      const url = await attachmentPreviewUrl(attachment)
      if (generation !== loadGeneration) { releaseAttachmentPreviewUrl(url); return }
      sources.value = { ...sources.value, [attachment.id]: url }
    } catch {
      if (generation === loadGeneration) failed.value = { ...failed.value, [attachment.id]: true }
    }
  }
}

function openPreview(index: number) {
  const attachment = images.value[index]
  if (!attachment || !sources.value[attachment.id]) return
  activeIndex.value = index
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
}

function previewChange(event: any) {
  activeIndex.value = Math.max(0, Number(event.detail?.current) || 0)
}

watch(() => images.value.map(item => `${item.id}:${item.name}`).join('|'), loadSources, { immediate: true })
onUnmounted(() => {
  loadGeneration += 1
  releaseSources()
})
</script>

<template>
  <view v-if="images.length" class="image-gallery">
    <button v-for="(attachment, index) in images" :key="attachment.id" class="thumbnail" :disabled="!sources[attachment.id]" :aria-label="`预览图片 ${index + 1}：${attachment.name}`" @click="openPreview(index)">
      <image v-if="sources[attachment.id]" :src="sources[attachment.id]" mode="aspectFill" />
      <view v-else class="thumbnail-placeholder">
        <view v-if="!failed[attachment.id]" class="loading-ring" />
        <text v-else>加载失败</text>
      </view>
      <text class="thumbnail-name">{{ attachment.name }}</text>
    </button>
  </view>

  <view v-if="previewOpen" class="preview-layer" @click="closePreview">
    <view class="preview-panel" @click.stop>
      <view class="preview-header">
        <view class="preview-copy"><text>{{ images[activeIndex]?.name }}</text><text>{{ activeIndex + 1 }} / {{ images.length }}</text></view>
        <button aria-label="关闭图片预览" @click="closePreview"><view class="close-icon" /></button>
      </view>
      <swiper class="preview-swiper" :current="activeIndex" :duration="260" circular @change="previewChange">
        <swiper-item v-for="attachment in images" :key="attachment.id" class="preview-slide">
          <image v-if="sources[attachment.id]" class="preview-image" :src="sources[attachment.id]" mode="aspectFit" />
        </swiper-item>
      </swiper>
    </view>
  </view>
</template>

<style scoped>
.image-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.thumbnail{position:relative;width:100%;height:auto;aspect-ratio:1;margin:0;padding:0;overflow:hidden;border:1px solid #ece5d6;border-radius:14px;background:#f3eee4;color:#494032}.thumbnail::after{border:0}.thumbnail[disabled]{opacity:1}.thumbnail image{display:block;width:100%;height:100%}.thumbnail-placeholder{display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#8b806e;font-size:10px}.loading-ring{width:18px;height:18px;border:2px solid #decf9c;border-right-color:#786d5b;border-radius:50%;animation:spin .8s linear infinite}.thumbnail-name{position:absolute;right:0;bottom:0;left:0;padding:15px 8px 7px;overflow:hidden;background:linear-gradient(transparent,rgba(40,34,26,.68));color:#fff;font-size:10px;line-height:1.25;text-align:left;text-overflow:ellipsis;white-space:nowrap}.preview-layer{position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(31,27,21,.56)}.preview-panel{width:min(100%,640px);height:66.667vh;min-height:360px;max-height:calc(100vh - env(safe-area-inset-top));padding:0 18px calc(14px + env(safe-area-inset-bottom));overflow:hidden;border-radius:24px 24px 0 0;background:#171512;box-sizing:border-box}.preview-header{display:flex;height:58px;align-items:center;justify-content:space-between;gap:12px}.preview-copy{min-width:0}.preview-copy>text:first-child{display:block;overflow:hidden;color:#fff8e9;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.preview-copy>text:last-child{display:block;margin-top:3px;color:#b9ad99;font-size:10px}.preview-header button{display:flex;width:44px;height:44px;min-height:44px;align-items:center;justify-content:center;flex:0 0 44px;margin:0 -8px 0 0;border:0;background:transparent}.preview-header button::after{border:0}.close-icon{position:relative;width:18px;height:18px}.close-icon::before,.close-icon::after{content:'';position:absolute;left:1px;top:8px;width:16px;height:1.5px;border-radius:2px;background:#fff8e9;transform:rotate(45deg)}.close-icon::after{transform:rotate(-45deg)}.preview-swiper{width:100%;height:calc(100% - 58px)}.preview-slide{display:flex;align-items:center;justify-content:center}.preview-image{width:100%;height:100%}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:360px){.image-gallery{gap:6px}.thumbnail{border-radius:12px}.preview-panel{padding-left:14px;padding-right:14px}}
</style>

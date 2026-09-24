<script lang="ts">
import { consumeHomeWidgetRoute } from './services/home-widget'
import { checkForAppResourceUpdate } from './services/app-update'

let widgetRouteTimer: ReturnType<typeof setTimeout> | undefined

export default {
  onLaunch() {
    setTimeout(() => { void checkForAppResourceUpdate() }, 1800)
  },
  onShow() {
    if (!uni.getStorageSync('session')) return
    const route = consumeHomeWidgetRoute()
    if (!/^\/pages\/detail\/detail\?id=[^\s]+$/.test(route)) return
    clearTimeout(widgetRouteTimer)
    widgetRouteTimer = setTimeout(() => uni.navigateTo({ url: route }), 180)
  },
  onHide() {
    clearTimeout(widgetRouteTimer)
  },
}
</script>

<style>
page{background:#faf8f2;color:#3e382d;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px}button{font-size:14px;line-height:1.6}button::after{border:0}button[disabled]{opacity:.45}input,textarea{font-size:16px}view,text,button,input,textarea,image{box-sizing:border-box}
.scrollbar-hidden,.scrollbar-hidden .uni-scroll-view{scrollbar-width:none;-ms-overflow-style:none}.scrollbar-hidden::-webkit-scrollbar,.scrollbar-hidden .uni-scroll-view::-webkit-scrollbar{display:none;width:0;height:0;background:transparent}
</style>

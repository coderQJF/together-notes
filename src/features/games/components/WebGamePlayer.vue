<template>
  <view class="web-game-player">
    <view v-if="loading" class="player-state" aria-live="polite">
      <view class="spinner" aria-hidden="true" />
      <text class="state-title">正在打开游戏</text>
      <text class="state-copy">首次加载开源游戏资源可能需要一点时间</text>
    </view>

    <view v-else-if="failed" class="player-state" aria-live="assertive">
      <text class="state-title">游戏加载失败</text>
      <text class="state-copy">请检查网络后重试</text>
      <button class="retry-button" @tap="retry">重新加载</button>
    </view>
  </view>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

const GAME_WEBVIEW_ID = 'together-notes-web-game-player'
const OWNER_RETRY_LIMIT = 20
const OWNER_RETRY_DELAY_MS = 50
const LOAD_TIMEOUT_MS = 15000
type NativeGameWebview = ReturnType<typeof plus.webview.create>
type IsolatedWebviewStyles = PlusWebviewWebviewStyles & { 'uni-app': 'none' }

export default defineComponent({
  name: 'WebGamePlayer',
  props: {
    url: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      loading: true,
      failed: false,
      childWebview: null as NativeGameWebview | null,
      loadTimer: null as ReturnType<typeof setTimeout> | null,
      ownerRetryTimer: null as ReturnType<typeof setTimeout> | null,
    }
  },
  mounted() {
    this.openWebGame()
  },
  beforeUnmount() {
    this.closeWebGame()
  },
  methods: {
    clearTimers() {
      if (this.loadTimer !== null) clearTimeout(this.loadTimer)
      if (this.ownerRetryTimer !== null) clearTimeout(this.ownerRetryTimer)
      this.loadTimer = null
      this.ownerRetryTimer = null
    },
    resolveOwnerWebview(): NativeGameWebview | null {
      return (this as unknown as {
        $scope?: { $getAppWebview?: () => NativeGameWebview }
      }).$scope?.$getAppWebview?.() || null
    },
    failWebGame(child: NativeGameWebview) {
      if (this.childWebview !== child) return
      this.clearTimers()
      this.childWebview = null
      if (plus.webview.getWebviewById(GAME_WEBVIEW_ID) === child) child.close('none')
      this.loading = false
      this.failed = true
    },
    appendWhenOwnerReady(child: NativeGameWebview, attempt: number) {
      if (this.childWebview !== child || !this.loading) return
      const owner = this.resolveOwnerWebview()
      if (owner) {
        try {
          owner.append(child)
          this.clearTimers()
          this.loading = false
          return
        } catch {}
      }
      if (attempt >= OWNER_RETRY_LIMIT) {
        this.failWebGame(child)
        return
      }
      this.ownerRetryTimer = setTimeout(() => {
        this.ownerRetryTimer = null
        this.appendWhenOwnerReady(child, attempt + 1)
      }, OWNER_RETRY_DELAY_MS)
    },
    closeWebGame() {
      this.clearTimers()
      this.childWebview = null
      const registered = plus.webview.getWebviewById(GAME_WEBVIEW_ID)
      if (registered) registered.close('none')
    },
    retry() {
      this.openWebGame()
    },
    openWebGame() {
      this.closeWebGame()
      this.loading = true
      this.failed = false
      const styles: IsolatedWebviewStyles = {
        top: `${plus.navigator.getStatusbarHeight() + 44}px`,
        bottom: '0px',
        plusrequire: 'none',
        'uni-app': 'none',
        errorPage: 'none',
      }
      const child = plus.webview.create(this.url, GAME_WEBVIEW_ID, styles)
      this.childWebview = child
      child.addEventListener('loaded', () => this.appendWhenOwnerReady(child, 0))
      child.addEventListener('error', () => this.failWebGame(child))
      this.loadTimer = setTimeout(() => this.failWebGame(child), LOAD_TIMEOUT_MS)
    },
  },
})
</script>

<style scoped>
.web-game-player {
  min-height: 100vh;
  background: #111;
}

.player-state {
  display: flex;
  min-height: calc(100vh - 44px);
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 24px;
  color: #fff;
  text-align: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.28);
  border-top-color: #f7e7ad;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.state-title {
  font-size: 18px;
  font-weight: 700;
}

.state-copy {
  max-width: 280px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  line-height: 1.6;
}

.retry-button {
  min-width: 132px;
  min-height: 48px;
  margin-top: 8px;
  border: 0;
  border-radius: 16px;
  background: #f7e7ad;
  color: #494032;
  font-size: 16px;
  font-weight: 700;
  line-height: 48px;
}

.retry-button::after {
  border: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

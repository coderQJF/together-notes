<template>
  <view class="web-game-player">
    <!-- #ifdef APP-PLUS -->
    <canvas
      canvas-id="game-runtime-bridge-anchor"
      class="runtime-bridge-anchor"
      :bridge-token="runtimeBridgeToken"
      :change:bridge-token="gameRuntimeBridge.onBridgeTokenChanged"
    />
    <!-- #endif -->
    <view v-if="loading" class="player-state" aria-live="polite">
      <view class="spinner" aria-hidden="true" />
      <text class="state-title">正在打开游戏</text>
      <text class="state-copy">{{ localRuntime ? '正在从 App 内置资源启动，无需连接代理或外部站点' : '首次加载开源游戏资源可能需要一点时间' }}</text>
    </view>

    <view v-else-if="failed" class="player-state" aria-live="assertive">
      <text class="state-title">游戏加载失败</text>
      <text class="state-copy">{{ failureCopy || (localRuntime ? '本机模拟器或游戏文件无法读取' : '请检查网络后重试') }}</text>
      <button class="retry-button" @tap="retry">重新加载</button>
      <button v-if="localRuntime" class="secondary-button" @tap="$emit('reimport')">重新导入 GBA</button>
    </view>
  </view>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

declare module 'vue' {
  interface ComponentCustomProperties {
    gameRuntimeBridge: { onBridgeTokenChanged: (...args: unknown[]) => void }
  }
}

const GAME_WEBVIEW_ID = 'together-notes-game-player'
const OWNER_RETRY_LIMIT = 20
const OWNER_RETRY_DELAY_MS = 50
const REMOTE_LOAD_TIMEOUT_MS = 15000
const LOCAL_RUNTIME_START_TIMEOUT_MS = 60000
type NativeGameWebview = ReturnType<typeof plus.webview.create>
type IsolatedWebviewStyles = PlusWebviewWebviewStyles & { 'uni-app': 'none' }
type RuntimeBridgePayload = {
  token?: unknown
  type?: unknown
  message?: unknown
}

function createRuntimeBridgeToken() {
  return `gba-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default defineComponent({
  name: 'WebGamePlayer',
  props: {
    url: {
      type: String,
      default: '',
    },
    localRuntime: {
      type: Boolean,
      default: false,
    },
    romLocalUrl: {
      type: String,
      default: '',
    },
    romName: {
      type: String,
      default: '',
    },
    romIdentity: {
      type: String,
      default: '',
    },
  },
  emits: ['reimport'],
  data() {
    return {
      loading: true,
      failed: false,
      failureCopy: '',
      childWebview: null as NativeGameWebview | null,
      loadTimer: null as ReturnType<typeof setTimeout> | null,
      ownerRetryTimer: null as ReturnType<typeof setTimeout> | null,
      runtimeBridgeToken: '',
    }
  },
  mounted() {
    this.openWebGame()
  },
  beforeUnmount() {
    this.closeWebGame()
  },
  methods: {
    handleRuntimeBridge(payload: RuntimeBridgePayload) {
      if (!this.localRuntime || payload?.token !== this.runtimeBridgeToken) return
      const child = this.childWebview
      if (!child) return

      if (payload.type === 'game-start') {
        this.appendWhenOwnerReady(child, 0)
        return
      }
      if (payload.type === 'boot-error') {
        const message = typeof payload.message === 'string' ? payload.message.trim() : ''
        this.failWebGame(child, message || '本机模拟器启动失败，请重新加载或导入 GBA 文件')
      }
    },
    clearLoadTimer() {
      if (this.loadTimer !== null) {
        clearTimeout(this.loadTimer)
        this.loadTimer = null
      }
    },
    clearOwnerRetryTimer() {
      if (this.ownerRetryTimer !== null) {
        clearTimeout(this.ownerRetryTimer)
        this.ownerRetryTimer = null
      }
    },
    resolveOwnerWebview(): NativeGameWebview | null {
      return (this as unknown as {
        $scope?: { $getAppWebview?: () => NativeGameWebview }
      }).$scope?.$getAppWebview?.() || null
    },
    failWebGame(child: NativeGameWebview, message = '') {
      if (this.childWebview !== child) return
      this.clearLoadTimer()
      this.clearOwnerRetryTimer()
      this.childWebview = null
      if (plus.webview.getWebviewById(GAME_WEBVIEW_ID) === child) child.close('none')
      this.loading = false
      this.failed = true
      this.failureCopy = message
    },
    appendWhenOwnerReady(child: NativeGameWebview, attempt: number) {
      if (this.childWebview !== child) return
      const owner = this.resolveOwnerWebview()
      if (owner) {
        try {
          owner.append(child)
          this.clearLoadTimer()
          this.clearOwnerRetryTimer()
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
      this.clearLoadTimer()
      this.clearOwnerRetryTimer()

      this.childWebview = null
      const registered = plus.webview.getWebviewById(GAME_WEBVIEW_ID)
      if (registered) {
        registered.close('none')
      }
    },
    retry() {
      this.openWebGame()
    },
    openWebGame() {
      this.closeWebGame()
      this.loading = true
      this.failed = false
      this.failureCopy = ''
      this.runtimeBridgeToken = createRuntimeBridgeToken()

      const statusBarHeight = plus.navigator.getStatusbarHeight()
      if (this.localRuntime && !this.romLocalUrl) {
        this.loading = false
        this.failed = true
        return
      }
      const styles: IsolatedWebviewStyles = {
        top: `${statusBarHeight + 44}px`,
        bottom: '0px',
        plusrequire: this.localRuntime ? 'normal' : 'none',
        'uni-app': 'none',
        errorPage: 'none',
      }
      const source = this.localRuntime ? '_www/static/games/emulatorjs/index.html' : this.url
      const owner = this.resolveOwnerWebview()
      const extras = this.localRuntime
        ? {
            romLocalUrl: this.romLocalUrl,
            romName: this.romName,
            romGameIdentity: `together-notes-${this.romIdentity}`,
            runtimeBridgeToken: this.runtimeBridgeToken,
            runtimeBridgeOwnerId: owner?.id || '',
          }
        : undefined
      const child = plus.webview.create(source, GAME_WEBVIEW_ID, styles, extras)
      this.childWebview = child

      if (this.localRuntime) {
        child.overrideUrlLoading({ mode: 'reject', match: '^https?://.*' }, () => {})
      }

      child.addEventListener('loaded', () => {
        if (this.childWebview !== child) return
        if (this.localRuntime) {
          const bridgeOwner = this.resolveOwnerWebview()
          if (bridgeOwner?.id) {
            child.evalJS(`window.__setTogetherNotesGameBridgeOwner && window.__setTogetherNotesGameBridgeOwner(${JSON.stringify(bridgeOwner.id)})`)
          }
          return
        }
        this.appendWhenOwnerReady(child, 0)
      })
      child.addEventListener('error', () => {
        this.failWebGame(child)
      })

      this.loadTimer = setTimeout(() => {
        if (this.childWebview !== child) return
        this.failWebGame(
          child,
          this.localRuntime ? '本机模拟器启动超时，请重新加载或重新导入 GBA 文件' : '',
        )
      }, this.localRuntime ? LOCAL_RUNTIME_START_TIMEOUT_MS : REMOTE_LOAD_TIMEOUT_MS)
    },
  },
})
</script>

<script module="gameRuntimeBridge" lang="renderjs">
const GAME_WEBVIEW_ID = 'together-notes-game-player'
const RUNTIME_BRIDGE_NAME = '__togetherNotesGameRuntimeBridge'
const RUNTIME_BRIDGE_ACK_NAME = '__ackTogetherNotesGameRuntimeBridge'

export default {
  mounted() {
    this.ownerInstance = this.$ownerInstance
  },
  beforeUnmount() {
    this.removeBridge()
  },
  beforeDestroy() {
    this.removeBridge()
  },
  methods: {
    onBridgeTokenChanged(token, _oldToken, ownerInstance) {
      if (ownerInstance) this.ownerInstance = ownerInstance
      this.installBridge(token, ownerInstance)
    },
    installBridge(token, ownerInstance) {
      this.removeBridge()
      const activeToken = String(token || '')
      if (!activeToken) return

      this.activeToken = activeToken
      if (ownerInstance) this.ownerInstance = ownerInstance
      const handler = (payload) => {
        if (!payload || payload.token !== this.activeToken) return
        const owner = this.ownerInstance || this.$ownerInstance
        if (!owner || !owner.callMethod) return

        owner.callMethod('handleRuntimeBridge', payload)
        this.acknowledgeChild(payload.token)
      }
      this.bridgeHandler = handler
      window[RUNTIME_BRIDGE_NAME] = handler
    },
    acknowledgeChild(token) {
      try {
        const child = plus.webview.getWebviewById(GAME_WEBVIEW_ID)
        if (!child) return
        child.evalJS(`window.${RUNTIME_BRIDGE_ACK_NAME} && window.${RUNTIME_BRIDGE_ACK_NAME}(${JSON.stringify(String(token || ''))})`)
      } catch (error) {}
    },
    removeBridge() {
      if (this.bridgeHandler && window[RUNTIME_BRIDGE_NAME] === this.bridgeHandler) {
        delete window[RUNTIME_BRIDGE_NAME]
      }
      this.bridgeHandler = null
      this.activeToken = ''
    },
  },
}
</script>

<style scoped>
.web-game-player {
  min-height: 100vh;
  background: #111;
}

.runtime-bridge-anchor {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.player-state {
  box-sizing: border-box;
  min-height: calc(100vh - 44px);
  display: flex;
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

.secondary-button {
  min-width: 132px;
  min-height: 44px;
  margin: 0;
  border: 1px solid rgba(247, 231, 173, 0.55);
  border-radius: 15px;
  background: transparent;
  color: #f7e7ad;
  font-size: 14px;
  line-height: 44px;
}

.secondary-button::after {
  border: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

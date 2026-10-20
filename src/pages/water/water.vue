<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import ActionListRow from '../../components/ActionListRow.vue'
import { cachedHome } from '../../services/api'
import { waterDay, waterStore, type WaterEntry } from '../../services/water'

const today = ref(waterDay()), day = ref(today.value), amount = ref(''), records = ref<WaterEntry[]>([]), error = ref('')
let store: ReturnType<typeof waterStore> | undefined
const selected = computed(() => records.value.filter(entry => entry.day === day.value))
const total = computed(() => selected.value.reduce((sum, entry) => sum + entry.amount, 0))
const days = computed(() => [...new Set(records.value.map(entry => entry.day))].sort().reverse())
function fail(e: unknown) { error.value = e instanceof Error ? e.message : '保存失败，请重试' }
function load() {
  const previousToday = today.value
  today.value = waterDay()
  if (day.value === previousToday) day.value = today.value
  try {
    store = waterStore(cachedHome()?.user.id || 'local-guest', { read: key => uni.getStorageSync(key), write: (key, value) => uni.setStorageSync(key, value) })
    records.value = store.entries(); error.value = ''
  } catch (e) { fail(e) }
}
function add(value: number) {
  try {
    const currentDay = waterDay()
    if (day.value === today.value) day.value = currentDay
    today.value = currentDay
    if (!store) throw new Error('请重新打开饮水记录')
    store.add(day.value, value)
    records.value = store.entries(); amount.value = ''; error.value = ''
    uni.showToast({ title: `已记录 ${value} ml`, icon: 'none' })
  } catch (e) { fail(e) }
}
function remove(entry: WaterEntry) {
  uni.showModal({ title: `删除这笔 ${entry.amount} ml 记录？`, confirmText: '删除', confirmColor: '#ae4b3b', success: result => {
    if (!result.confirm) return
    try { store?.remove(entry.id); records.value = store?.entries() || []; error.value = '' } catch (e) { fail(e) }
  } })
}
function selectDay(event: { detail: { value: string } }) { day.value = event.detail.value; error.value = '' }
function time(entry: WaterEntry) { return new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
onShow(load)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="饮水记录" />
    <text class="eyebrow">每天一点，慢慢记下</text>
    <text class="headline">今天喝了多少水？</text>
    <text class="subtitle">按实际喝下的量记录，单位为毫升。</text>
    <view class="summary card">
      <view class="date-row">
        <picker mode="date" :value="day" :end="today" @change="selectDay"><view class="date-control">{{ day === today ? '今天' : day }} · 选择日期</view></picker>
        <button v-if="day !== today" class="text-button" @click="day = today">回到今天</button>
      </view>
      <view class="total" aria-live="polite"><text class="number">{{ total }}</text><text class="unit">ml</text></view>
      <text class="muted">{{ day === today ? '今日' : '当日' }}累计 · {{ selected.length }} 笔记录</text>
    </view>
    <view class="card">
      <text class="section-title">{{ day === today ? '喝水了，记一笔' : '补记这一天' }}</text>
      <view class="presets"><button v-for="value in [150, 250, 500]" :key="value" @click="add(value)">{{ value }} ml</button></view>
      <view class="custom"><input v-model="amount" type="number" maxlength="4" aria-label="自定义饮水量，毫升" placeholder="自定义毫升数" @confirm="add(Number(amount))" /><button :disabled="!amount" @click="add(Number(amount))">记录</button></view>
      <text v-if="error" class="error" role="alert">{{ error }}</text>
    </view>
    <view class="section-row"><text class="section-title">{{ day === today ? '今天' : day }}的记录</text><picker v-if="days.length" :range="days" @change="day = days[Number($event.detail.value)]"><view class="text-button history">历史日期</view></picker></view>
    <view v-if="!selected.length" class="empty">这一天还没有记录，喝水后再来记一笔吧。</view>
    <view v-for="entry in selected" :key="entry.id" class="entry card">
      <ActionListRow :title="`${entry.amount} ml`" :metadata="entry.day === waterDay(new Date(entry.createdAt)) ? time(entry) : '补记'" action-label="删除" @action="remove(entry)" />
    </view>
    <text class="storage-note">仅保存在本机，按当前账号分别记录；游客记录单独保留。暂不跨设备同步，清除应用数据会丢失记录。</text>
  </view>
</template>

<style scoped>
.entry :deep(.action-list-row){width:100%;margin:0;padding:0;border:0}
.shell{max-width:640px;min-height:100vh;box-sizing:border-box;margin:auto;padding:0 24px calc(40px + env(safe-area-inset-bottom));background:#faf8f2;color:#494032}.eyebrow,.subtitle,.muted,.storage-note{display:block;color:#786d5b;font-size:12px;line-height:1.7}.headline{display:block;margin:8px 0;font-size:28px;font-weight:600;letter-spacing:-.7px}.subtitle{font-size:14px;margin-bottom:24px}.card{padding:18px;margin-bottom:14px;border:1px solid #ece5d6;border-radius:20px;background:#fff}.summary{background:#fffdf6}.date-row,.section-row,.entry{display:flex;justify-content:space-between;align-items:center;gap:8px}.date-row picker{min-width:0}.date-control{display:flex;align-items:center;min-height:44px;font-size:13px}.total{display:flex;align-items:baseline;gap:8px;margin:8px 0}.number{font-size:56px;line-height:1.15;letter-spacing:-2px;font-weight:600;overflow-wrap:anywhere}.unit{font-size:17px}.section-title{font-size:16px;font-weight:600}.presets{display:flex;gap:8px;margin-top:16px}button{display:flex;align-items:center;justify-content:center;min-height:44px;box-sizing:border-box;margin:0;padding:0 12px;border:0;border-radius:13px;background:#f7e7ad;color:#494032;font-size:14px;line-height:1.4}button::after{border:0}.presets button{flex:1;min-width:0;white-space:nowrap}.custom{display:flex;gap:8px;margin-top:12px}.custom input{flex:1;min-width:0;height:44px;box-sizing:border-box;padding:0 12px;background:#faf8f2;border-radius:13px;font-size:14px}.custom button{min-width:64px}.custom button[disabled]{opacity:.45}.text-button{min-width:44px;min-height:44px;background:transparent;color:#786d5b;font-size:12px;white-space:nowrap}.history{display:flex;align-items:center;justify-content:center;padding:0 8px}.section-row{margin-top:12px;margin-bottom:8px}.entry{padding:10px 16px}.entry-amount{display:block;font-size:19px;font-weight:600;margin-bottom:2px}.empty{padding:24px 8px;color:#786d5b;font-size:13px;line-height:1.8}.storage-note{margin-top:24px;font-size:11px}.error{display:block;color:#ae4b3b;font-size:12px;margin-top:12px;line-height:1.6}@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.card{padding:16px}.headline{font-size:26px}}
</style>

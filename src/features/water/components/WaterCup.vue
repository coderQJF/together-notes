<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { waterIdle, waterLabels, waterMood, waterPraise } from '../../../services/water-mood'
import { drawCup } from '../draw-cup'

const props = withDefaults(defineProps<{ cups: number; feedback?: 'add' | 'undo' | ''; revision?: number; active?: boolean; interactive?: boolean; greeting?: string }>(), { feedback: '', revision: 0, active: true, interactive: true, greeting: '' })
const emit = defineEmits<{ drink: [] }>()
const instance = getCurrentInstance()!, canvasId = `water-cup-${instance.uid}`
const sulking = ref(false), speech = ref(props.greeting || waterIdle[waterMood(props.cups)]), floating = ref(''), animation = ref('')
const mood = computed(() => sulking.value ? 'sulk' : waterMood(props.cups))
const label = computed(() => waterLabels[mood.value])
let ctx: any, width = 320, native = false, mounted = false, busy = false, timer: ReturnType<typeof setTimeout> | undefined, recover: ReturnType<typeof setTimeout> | undefined, burstTimer: ReturnType<typeof setTimeout> | undefined
let waterY = 237 - Math.min(props.cups/4,1)*191, kick = 0, t = 0, last = Date.now(), reduceMotion = false
type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number }
let drops: Drop[] = []
function burst() {
  if (reduceMotion) return
  for (let i=0;i<22;i++) { const a=-Math.PI*.92+Math.random()*Math.PI*.84,s=100+Math.random()*150; drops.push({x:160,y:105,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:2+Math.random()*3,life:1}) }
}
watch(() => props.revision, () => {
  clearTimeout(recover); clearTimeout(burstTimer); sulking.value = props.feedback === 'undo'
  speech.value = sulking.value ? waterIdle.sulk : waterPraise(props.cups,props.revision)
  floating.value = sulking.value ? '−1 杯' : '+1 杯'; animation.value = ''; kick = 1
  void nextTick(() => { animation.value = props.feedback === 'undo' ? 'sulk' : 'pour' })
  if (!sulking.value) burst()
  recover = setTimeout(() => { sulking.value=false; speech.value=props.greeting || waterIdle[waterMood(props.cups)] },1800)
  burstTimer = setTimeout(() => { floating.value=''; animation.value='' },1100)
})
watch(() => props.cups, () => { if (!floating.value && !sulking.value) speech.value=props.greeting || waterIdle[waterMood(props.cups)] })
function stop() { clearTimeout(timer); timer=undefined }
function paint() {
  if (!ctx || !props.active || !mounted) return
  const now=Date.now(),dt=Math.min((now-last)/1000,.05); last=now; t+=dt
  const target=237-Math.min(props.cups/4,1)*191
  waterY+=reduceMotion?target-waterY:(target-waterY)*Math.min(1,dt*4); kick*=Math.pow(.03,dt)
  ctx.clearRect(0,0,width,320); ctx.save()
  const scale=Math.min(width/320,1)
  ctx.translate((width-320*scale)/2,(320-320*scale)/2); ctx.scale(scale,scale)
  ctx.save(); ctx.translate(46,33); ctx.scale(.95,.95)
  drawCup(ctx,props.cups,mood.value,waterY,reduceMotion?0:t,reduceMotion?0:kick); ctx.restore()
  if (props.cups>=4&&!reduceMotion&&Math.random()<.6) for (const side of [-1,1]) drops.push({x:160+side*73,y:95,vx:side*(8+Math.random()*20),vy:20,r:2+Math.random()*2,life:1})
  drops=drops.filter(p=>p.life>0)
  for(const p of drops) { p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=460*dt;p.life-=dt;ctx.setGlobalAlpha(Math.max(0,p.life));ctx.setFillStyle('#79bdc9');ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill() }
  ctx.setGlobalAlpha(1);ctx.restore()
  const schedule=()=>{busy=false;if(props.active&&mounted)timer=setTimeout(paint,reduceMotion?200:40)}
  if(native)schedule();else {busy=true;ctx.draw(false,schedule)}
}
async function initialize() {
  await nextTick()
  uni.createSelectorQuery().in(instance.proxy).select('.water-canvas').fields({node:true,size:true},(result:any)=>{
    if(!mounted || !result)return
    width=result.width||320
    // #ifdef MP-WEIXIN
    const canvas=result.node
    if(!canvas)return
    const dpr=uni.getSystemInfoSync().pixelRatio||1
    canvas.width=width*dpr;canvas.height=320*dpr;ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);native=true
    for(const [method,key] of [['setFillStyle','fillStyle'],['setStrokeStyle','strokeStyle'],['setLineWidth','lineWidth'],['setLineCap','lineCap'],['setLineJoin','lineJoin'],['setGlobalAlpha','globalAlpha']])ctx[method]=(value:unknown)=>{ctx[key]=value}
    // #endif
    // #ifndef MP-WEIXIN
    ctx=uni.createCanvasContext(canvasId,instance.proxy)
    // #endif
    last=Date.now();paint()
  }).exec()
}
watch(()=>props.active,active=>{stop();if(active&&mounted){last=Date.now();if(ctx&&!busy)paint();else if(!ctx)void initialize()}})
onMounted(()=>{mounted=true;
  // #ifdef H5
  reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // #endif
  void initialize()
})
onUnmounted(()=>{mounted=false;stop();clearTimeout(recover);clearTimeout(burstTimer)})
</script>

<template>
  <view class="water-toy" :class="[`mood-${mood}`,animation]" :data-mood="mood">
    <view class="water-stage">
      <view class="halo" />
      <button class="cup-hit" :disabled="!interactive" :aria-label="interactive?'喝完一杯，点击记录':'一杯水的问候'" @click="emit('drink')">
        <!-- #ifdef MP-WEIXIN -->
        <canvas :id="canvasId" type="2d" class="water-canvas" />
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <canvas :id="canvasId" :canvas-id="canvasId" class="water-canvas" />
        <!-- #endif -->
      </button>
      <view class="speech" aria-live="polite">{{ speech }}</view>
      <text v-if="floating" :key="revision" class="plus" :class="{minus:feedback==='undo'}">{{ floating }}</text>
    </view>
    <view v-if="interactive" class="tap-label"><view />点一下水杯，记一次<view /></view>
    <view v-if="interactive" class="status-pill">{{ label }}</view>
  </view>
</template>

<style scoped>
.water-toy{position:relative;text-align:center}.water-stage{position:relative;height:320px;isolation:isolate}.halo{position:absolute;left:50%;top:50%;width:260px;height:260px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#f1eedf 0%,#f4f1e7 58%,#faf8f2 72%);z-index:-1}.cup-hit{display:block;width:100%;height:320px;margin:0;padding:0;border:0;border-radius:28px;background:transparent;line-height:1}.cup-hit::after{border:0}.cup-hit[disabled]{background:transparent;color:inherit;opacity:1}.water-canvas{display:block;width:100%;height:320px;pointer-events:none}.speech{position:absolute;top:3px;left:50%;transform:translateX(-50%);width:max-content;max-width:98%;box-sizing:border-box;padding:10px 14px;border:1px solid #e9e0ca;border-radius:17px;background:#fffdf7;color:#786c55;font-size:12px;line-height:1.5;pointer-events:none;z-index:2}.speech::after{content:'';position:absolute;bottom:-6px;left:calc(50% - 5px);width:10px;height:10px;background:inherit;border-right:1px solid #e9e0ca;border-bottom:1px solid #e9e0ca;transform:rotate(45deg)}.mood-dry .speech{background:#fff7e8;color:#9b8059}.mood-stuffed .speech{background:#fff2e4}.mood-sulk .speech{background:#f7f0f5}.plus{position:absolute;left:50%;top:104px;color:#348e9e;font-size:20px;font-weight:600;pointer-events:none;z-index:3;animation:floatup 1.05s ease forwards;white-space:nowrap}.plus.minus{color:#a28c9a}.tap-label{display:flex;align-items:center;justify-content:center;gap:8px;color:#8b806e;font-size:12px}.tap-label view{width:4px;height:4px;border-radius:50%;background:#c6ad60}.status-pill{display:inline-block;margin-top:18px;padding:5px 11px;border-radius:20px;background:#e8efdf;color:#76865d;font-size:11px}.mood-dry .status-pill{background:#f1e5d0;color:#a48b60}.mood-stuffed .status-pill{background:#f6e6d6;color:#a17752}.mood-sulk .status-pill{background:#eee7ed;color:#968090}@keyframes floatup{0%{opacity:0;transform:translate(-50%,28px) scale(.7)}24%{opacity:1;transform:translate(-50%,0) scale(1.06)}64%{opacity:1}100%{opacity:0;transform:translate(-50%,-42px) scale(.95)}}@media(prefers-reduced-motion:reduce){.plus{animation:none;transform:translateX(-50%)}}
</style>

import assert from 'node:assert/strict'
import test from 'node:test'
import { waterDay, waterStore } from '../src/services/water.ts'
import { waterMood, waterPraise, WATER_CUP_ML } from '../src/services/water-mood.ts'
import { readFile } from 'node:fs/promises'

test('water records persist, stay isolated by owner, and sum per local calendar day', () => {
  const data = new Map<string, unknown>()
  const storage = { read: (key: string) => data.get(key), write: (key: string, value: unknown) => { data.set(key, value) } }
  const now = new Date(2026, 9, 20, 0, 1)
  const store = waterStore('a', storage)
  store.add('2026-10-19', 330, now)
  const entry = store.add(waterDay(now), 250, now)
  store.add(waterDay(now), 500, now)
  const reloaded = waterStore('a', storage)
  assert.equal(reloaded.entries().filter(entry => entry.day === waterDay(now)).reduce((sum, entry) => sum + entry.amount, 0), 750)
  assert.equal(waterStore('b', storage).entries().length, 0)
  assert.equal(waterStore('', storage).entries().length, 0)
  reloaded.remove(entry.id)
  assert.equal(store.entries().length, 2)
  for (const amount of [0, -1, 1.5, NaN, Infinity, 5001]) assert.throws(() => store.add(waterDay(now), amount, now))
  for (const day of ['2026-02-30', '2026-10-21', 'invalid']) assert.throws(() => store.add(day, 250, now))
  assert.equal(store.entries().length, 2)
})

test('storage failures are surfaced rather than reported as successful saves', () => {
  const store = waterStore('a', { read: () => [], write: () => { throw new Error('storage full') } })
  assert.throws(() => store.add(waterDay(), 250), /storage full/)
  const broken = waterStore('a', { read: () => 'broken', write: () => assert.fail('must not overwrite unreadable data') })
  assert.throws(() => broken.add(waterDay(), 250), /读取失败/)
})

test('calendar-ready daily totals preserve past days and exclude undo tombstones', () => {
  const data=new Map<string,unknown>(),storage={read:(key:string)=>data.get(key),write:(key:string,value:unknown)=>{data.set(key,value)}}
  const yesterday=new Date(2026,9,19,23,59),today=new Date(2026,9,20,0,1),store=waterStore('a',storage)
  store.add(waterDay(yesterday),500,yesterday)
  const entry=store.add(waterDay(today),500,today)
  store.add(waterDay(today),500,today)
  store.remove(entry.id)
  assert.deepEqual(waterStore('a',storage).dailyTotals(),[{day:'2026-10-20',cups:1,amount:500},{day:'2026-10-19',cups:1,amount:500}])
})

test('offline retries preserve a deletion made while its add is in flight', async () => {
  const data=new Map<string,unknown>(),storage={read:(key:string)=>data.get(key),write:(key:string,value:unknown)=>{data.set(key,value)}}
  const store=waterStore('a',storage),entry=store.add(waterDay(),500),seen:string[]=[]
  await assert.rejects(store.flush(async()=>{throw new Error('offline')}),/offline/)
  assert.equal(store.entries().length,1)
  await store.flush(async op=>{seen.push(op.entry?'add':'delete');if(op.entry)store.remove(entry.id)})
  assert.deepEqual(seen,['add','delete'])
  assert.equal(store.pending().length,0)
  assert.equal(store.entries().length,0)
})

test('cloud merging retains pending local changes and converges after acknowledgement', async () => {
  const data=new Map<string,unknown>(),storage={read:(key:string)=>data.get(key),write:(key:string,value:unknown)=>{data.set(key,value)}}
  const store=waterStore('a',storage),local=store.add(waterDay(),500)
  store.merge([{id:'remote',day:waterDay(),amount:500,createdAt:new Date().toISOString()}])
  assert.equal(store.entries().length,2)
  store.remove('remote')
  store.merge([{id:'remote',day:waterDay(),amount:500,createdAt:new Date().toISOString()}])
  assert.deepEqual(store.entries().map(e=>e.id),[local.id])
  await store.flush(async()=>{})
  store.merge([{...local,deleted:true}])
  assert.equal(store.entries().length,0)
})

test('millilitre-era logs migrate without changing dates or losing amounts', async () => {
  const legacy=[{id:'old',day:'2026-10-19',amount:330,createdAt:'2026-10-19T12:00:00.000Z'}]
  let value:unknown=legacy
  const store=waterStore('a',{read:()=>value,write:(_key,next)=>{value=next}})
  assert.deepEqual(store.entries(),legacy)
  await store.flush(async op=>{assert.equal(op.entry?.amount,330)})
  assert.equal(store.dailyTotals()[0].amount,330)
  assert.equal(store.pending().length,0)
})

test('fixed cup mood progression and overflow feedback stop encouraging more water', () => {
  assert.equal(WATER_CUP_ML,500)
  assert.deepEqual([0,1,2,3,4].map(waterMood),['dry','waking','happy','satisfied','stuffed'])
  assert.equal(waterMood(100),'stuffed')
  assert.match(waterPraise(4,1),/别为了哄我继续喝/)
})

test('water sharing opens the drink log directly and preserves old invitation links', async () => {
  const source=await readFile('src/services/water-share.ts','utf8'),page=await readFile('src/pages/water-share/water-share.vue','utf8')
  assert.match(source,/WATER_SHARE_ROUTE = '\/pages\/water\/water'/)
  assert.doesNotMatch(source,/cachedHome|currentWaterStore|getStorageSync|owner:|cups:/)
  assert.match(page,/uni\.redirectTo\(\{url:'\/pages\/water\/water'/)
  assert.doesNotMatch(page,/WaterCup|SubpageHeader|提醒朋友喝水/)
  const image=await readFile('src/static/share/water-card.png')
  assert.equal(image.readUInt32BE(16),1000);assert.equal(image.readUInt32BE(20),800)
  const waterPage=await readFile('src/pages/water/water.vue','utf8')
  assert.match(waterPage,/action-appearance="badge" action-open-type="share"/)
  assert.doesNotMatch(waterPage,/label="喝一杯"|navigateTo/)
  assert.match(waterPage,/onShareAppMessage\(waterFriendShare\)/)
  assert.doesNotMatch(waterPage,/<details|referenceCopy|storage-note|<picker|<input/)
  const home=await readFile('src/pages/index/index.vue','utf8')
  assert.match(home,/class="feed-heading"[\s\S]*?<WaterCupIcon\s*\/>/)
  assert.doesNotMatch(home,/water-entry-hint|记下每天喝水的量/)
  const header=await readFile('src/components/SubpageHeader.vue','utf8')
  assert.match(header,/:open-type="actionOpenType"/)
})

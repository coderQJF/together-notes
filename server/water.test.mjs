import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from './index.mjs'

test('water API authenticates, isolates accounts and keeps tombstones across retries', async () => {
  const app=createApp({dbPath:':memory:',testAuth:true})
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${app.server.address().port}/api`
  const request=(path,method='GET',token='',data)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:data?JSON.stringify(data):undefined})
  try{
    assert.equal((await request('/water/entries')).status,401)
    const a=await(await request('/auth/test','POST','',{name:'我'})).json(),b=await(await request('/auth/test','POST','',{name:'小金子'})).json()
    const entry={day:'2026-10-19',amount:500,createdAt:'2026-10-19T12:00:00.000Z'}
    assert.equal((await request('/water/entries/drink-1','PUT',a.token,entry)).status,200)
    await request('/water/entries/drink-1','PUT',a.token,entry)
    assert.equal((await(await request('/water/entries','GET',a.token)).json()).length,1)
    assert.deepEqual(await(await request('/water/entries','GET',b.token)).json(),[])
    await request('/water/entries/drink-1','DELETE',b.token)
    assert.equal((await(await request('/water/entries','GET',a.token)).json())[0].deleted,false)
    // A delayed upload cannot resurrect a deleted event, including a delete arriving first.
    await request('/water/entries/drink-1','DELETE',a.token)
    await request('/water/entries/drink-1','PUT',a.token,entry)
    await request('/water/entries/drink-2','DELETE',a.token)
    await request('/water/entries/drink-2','PUT',a.token,entry)
    assert.ok((await(await request('/water/entries','GET',a.token)).json()).every(value=>value.deleted))
    for(const invalid of [{...entry,day:'2026-02-30'},{...entry,amount:0},{...entry,amount:5001},{...entry,createdAt:'invalid'}])assert.equal((await request('/water/entries/bad','PUT',a.token,invalid)).status,400)
    assert.equal((await request('/water/entries/bad%2Fid','PUT',a.token,entry)).status,400)
    // Re-opening a log from another session of the same account sees the same history.
    const again=await(await request('/auth/test','POST','',{name:'我'})).json()
    assert.equal((await(await request('/water/entries','GET',again.token)).json()).length,2)
    const password='Water-test-password-2026'
    assert.equal((await request('/me/app-credentials','PUT',a.token,{username:'water-test',password,acceptedTerms:true})).status,200)
    assert.equal((await request('/me','DELETE',a.token,{password})).status,200)
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM water_entries WHERE owner=?').get(a.user.id).n,0)
  }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));app.db.close()}
})

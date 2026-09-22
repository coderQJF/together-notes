'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const modulePath = path.join(__dirname, 'index.js')

function loadBridge(sendMessage = async () => ({ errCode: 0 })) {
  delete require.cache[require.resolve(modulePath)]
  global.uniCloud = { getPushManager: options => ({ options, sendMessage }) }
  return require(modulePath)
}

function payload(response) {
  return JSON.parse(response.body)
}

test.afterEach(() => {
  delete global.uniCloud
  delete process.env.APP_PUSH_WEBHOOK_TOKEN
})

test('bridge rejects unauthenticated requests without calling UniPush', async () => {
  let calls = 0
  process.env.APP_PUSH_WEBHOOK_TOKEN = 'secret-token'
  const bridge = loadBridge(async () => { calls++; return { errCode: 0 } })
  const response = await bridge.main({ httpMethod: 'POST', headers: {}, body: '{}' }, {})
  assert.equal(response.statusCode, 401)
  assert.equal(payload(response).code, 'UNAUTHORIZED')
  assert.equal(calls, 0)
})

test('bridge sends a forced notification to unique validated client ids', async () => {
  let sent
  process.env.APP_PUSH_WEBHOOK_TOKEN = 'secret-token'
  const bridge = loadBridge(async message => { sent = message; return { errCode: 0 } })
  const response = await bridge.main({
    httpMethod: 'POST',
    headers: { Authorization: 'Bearer secret-token' },
    body: JSON.stringify({ clientIds: ['android-client-001', 'android-client-001'], title: '喝水', content: '该喝水了', payload: { route: '/pages/detail/detail?id=1' } }),
  }, {})
  assert.equal(response.statusCode, 200)
  assert.deepEqual(sent.push_clientid, ['android-client-001'])
  assert.equal(sent.force_notification, true)
  assert.equal(sent.payload.route, '/pages/detail/detail?id=1')
})

test('bridge supports base64 gateway bodies and rejects oversized payloads', async () => {
  process.env.APP_PUSH_WEBHOOK_TOKEN = 'secret-token'
  const bridge = loadBridge()
  const body = Buffer.from(JSON.stringify({ clientIds: ['android-client-001'], title: '提醒', payload: { value: 'x'.repeat(9000) } })).toString('base64')
  const response = await bridge.main({ httpMethod: 'POST', headers: { authorization: 'Bearer secret-token' }, body, isBase64Encoded: true }, {})
  assert.equal(response.statusCode, 400)
  assert.equal(payload(response).code, 'PAYLOAD_TOO_LARGE')
})

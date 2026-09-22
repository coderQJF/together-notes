'use strict'

const { timingSafeEqual } = require('crypto')

const APP_ID = '__UNI__10E8CA8'
const MAX_RECIPIENTS = 500

function jsonResponse(statusCode, payload) {
  return {
    mpserverlessComposedResponse: true,
    isBase64Encoded: false,
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  }
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase()
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === wanted)
  return String(entry?.[1] || '')
}

function sameSecret(actual, expected) {
  const left = Buffer.from(String(actual || ''))
  const right = Buffer.from(String(expected || ''))
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

function parseBody(event) {
  if (event && event.body && typeof event.body === 'object') return event.body
  let raw = String(event?.body || '')
  if (event?.isBase64Encoded === true || event?.isBase64Encoded === 'true') raw = Buffer.from(raw, 'base64').toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function validatedMessage(body) {
  const clientIds = [...new Set((Array.isArray(body?.clientIds) ? body.clientIds : [])
    .map(value => String(value || '').trim())
    .filter(value => /^[a-z0-9:._-]{8,256}$/i.test(value)))]
  const title = String(body?.title || '').trim().slice(0, 80)
  const content = String(body?.content || title).trim().slice(0, 180)
  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {}

  if (!clientIds.length || clientIds.length > MAX_RECIPIENTS) throw new Error('INVALID_RECIPIENTS')
  if (!title || !content) throw new Error('INVALID_CONTENT')
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 8192) throw new Error('PAYLOAD_TOO_LARGE')

  return {
    push_clientid: clientIds,
    title,
    content,
    payload,
    force_notification: true,
  }
}

exports.main = async (event, context) => {
  if (String(event?.httpMethod || 'POST').toUpperCase() !== 'POST') return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED' })

  const configuredSecret = String(process.env.APP_PUSH_WEBHOOK_TOKEN || '')
  const authorization = headerValue(event?.headers, 'authorization')
  if (!configuredSecret) return jsonResponse(503, { ok: false, code: 'BRIDGE_UNCONFIGURED' })
  if (!authorization.startsWith('Bearer ') || !sameSecret(authorization.slice(7), configuredSecret)) {
    return jsonResponse(401, { ok: false, code: 'UNAUTHORIZED' })
  }

  let message
  try {
    message = validatedMessage(parseBody(event))
  } catch (error) {
    return jsonResponse(400, { ok: false, code: String(error?.message || 'INVALID_REQUEST') })
  }

  try {
    context.PLATFORM = 'app'
    const result = await uniCloud.getPushManager({ appId: APP_ID }).sendMessage(message)
    const code = result?.errCode ?? result?.errcode ?? 0
    if (code !== 0 && code !== '0') return jsonResponse(502, { ok: false, code: String(code), message: String(result?.errMsg || result?.errmsg || 'UniPush rejected the message').slice(0, 160) })
    return jsonResponse(200, { ok: true })
  } catch (error) {
    console.error(JSON.stringify({ event: 'unipush_delivery_failed', code: String(error?.errCode || error?.code || 'UNIPUSH_FAILED') }))
    return jsonResponse(502, { ok: false, code: String(error?.errCode || error?.code || 'UNIPUSH_FAILED') })
  }
}

exports._test = { headerValue, parseBody, sameSecret, validatedMessage }

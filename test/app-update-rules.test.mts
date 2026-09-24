import assert from 'node:assert/strict'
import test from 'node:test'
import { canInstallResourceUpdate, compareVersions } from '../src/services/app-update-rules.ts'

const update = { appId: '__UNI__10E8CA8', resourceVersion: '0.2.9', nativeMinVersion: '0.2.8', wgtUrl: '/app-updates/update.wgt' }

test('resource update versions compare numerically', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1)
  assert.equal(compareVersions('0.2.8', '0.2.8'), 0)
})

test('resource updates require the same app and a compatible native base', () => {
  assert.equal(canInstallResourceUpdate(update, { appId: '__UNI__10E8CA8', nativeVersion: '0.2.8', resourceVersion: '0.2.8' }), true)
  assert.equal(canInstallResourceUpdate(update, { appId: '__UNI__OTHER', nativeVersion: '0.2.8', resourceVersion: '0.2.8' }), false)
  assert.equal(canInstallResourceUpdate(update, { appId: '__UNI__10E8CA8', nativeVersion: '0.2.7', resourceVersion: '0.2.8' }), false)
  assert.equal(canInstallResourceUpdate(update, { appId: '__UNI__10E8CA8', nativeVersion: '0.2.8', resourceVersion: '0.2.9' }), false)
  assert.equal(canInstallResourceUpdate({ ...update, wgtUrl: 'https://untrusted.example/update.wgt' }, { appId: '__UNI__10E8CA8', nativeVersion: '0.2.8', resourceVersion: '0.2.8' }), false)
})

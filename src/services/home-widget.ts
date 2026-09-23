import type { Item } from './api'
import { buildHomeWidgetNotes } from './home-widget-rules'

// #ifdef APP-PLUS
import {
  clearHomeWidgetNotes as nativeClearHomeWidgetNotes,
  consumeHomeWidgetRoute as nativeConsumeHomeWidgetRoute,
  isHomeWidgetPinSupported as nativeIsHomeWidgetPinSupported,
  requestHomeWidgetPin as nativeRequestHomeWidgetPin,
  syncHomeWidgetNotes as nativeSyncHomeWidgetNotes,
} from '@/uni_modules/together-home-widget'
// #endif

function runNativeSafely<T>(fallback: T, action: () => T) {
  try { return action() }
  catch { return fallback }
}

export function syncHomeWidgetNotes(items: Item[]) {
  // #ifdef APP-PLUS
  return runNativeSafely(false, () => nativeSyncHomeWidgetNotes(JSON.stringify(buildHomeWidgetNotes(items))))
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function clearHomeWidgetNotes() {
  // #ifdef APP-PLUS
  return runNativeSafely(false, nativeClearHomeWidgetNotes)
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function requestHomeWidgetPin() {
  // #ifdef APP-PLUS
  return runNativeSafely(false, nativeRequestHomeWidgetPin)
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function isHomeWidgetPinSupported() {
  // #ifdef APP-PLUS
  return runNativeSafely(false, nativeIsHomeWidgetPinSupported)
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function consumeHomeWidgetRoute() {
  // #ifdef APP-PLUS
  return runNativeSafely('', nativeConsumeHomeWidgetRoute)
  // #endif
  // #ifndef APP-PLUS
  return ''
  // #endif
}

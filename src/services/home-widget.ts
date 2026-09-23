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

export function syncHomeWidgetNotes(items: Item[]) {
  // #ifdef APP-PLUS
  return nativeSyncHomeWidgetNotes(JSON.stringify(buildHomeWidgetNotes(items)))
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function clearHomeWidgetNotes() {
  // #ifdef APP-PLUS
  return nativeClearHomeWidgetNotes()
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function requestHomeWidgetPin() {
  // #ifdef APP-PLUS
  return nativeRequestHomeWidgetPin()
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function isHomeWidgetPinSupported() {
  // #ifdef APP-PLUS
  return nativeIsHomeWidgetPinSupported()
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function consumeHomeWidgetRoute() {
  // #ifdef APP-PLUS
  return nativeConsumeHomeWidgetRoute()
  // #endif
  // #ifndef APP-PLUS
  return ''
  // #endif
}

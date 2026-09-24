import { attachmentBase64, type Item } from './api'
import { buildHomeWidgetNotes } from './home-widget-rules'

// #ifdef APP-PLUS
import {
  clearHomeWidgetNotes as nativeClearHomeWidgetNotes,
  cachedHomeWidgetImage as nativeCachedHomeWidgetImage,
  cacheHomeWidgetImage as nativeCacheHomeWidgetImage,
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

let widgetSyncQueue = Promise.resolve(false)

async function performHomeWidgetSync(items: Item[]) {
  // #ifdef APP-PLUS
  try {
    const notes = buildHomeWidgetNotes(items)
    const nativeNotes: Array<Record<string, unknown>> = []
    for (const note of notes) {
      const images: string[] = []
      for (const image of note.images) {
        let key = runNativeSafely('', () => nativeCachedHomeWidgetImage(note.id, image.id))
        if (!key) {
          try {
            const base64 = await attachmentBase64({ id: image.id, name: image.name, size: 0 })
            key = runNativeSafely('', () => nativeCacheHomeWidgetImage(note.id, image.id, base64))
          } catch {
            key = ''
          }
        }
        if (key) images.push(key)
      }
      nativeNotes.push({ ...note, images })
    }
    return runNativeSafely(false, () => nativeSyncHomeWidgetNotes(JSON.stringify(nativeNotes)))
  } catch {
    return false
  }
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function syncHomeWidgetNotes(items: Item[]) {
  // Native image caching and SharedPreferences replacement must stay ordered.
  // A save immediately followed by an index refresh used to let the older list
  // overwrite the newer one while its images were still downloading.
  widgetSyncQueue = widgetSyncQueue.then(
    () => performHomeWidgetSync(items),
    () => performHomeWidgetSync(items),
  )
  return widgetSyncQueue
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

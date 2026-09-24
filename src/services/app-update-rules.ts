export interface AppUpdateMetadata {
  appId: string
  resourceVersion: string
  nativeMinVersion: string
  wgtUrl: string
  sha256?: string
  size?: number
  releaseNotes?: string
  mandatory?: boolean
}

export function compareVersions(left: string, right: string) {
  const parse = (value: string) => String(value || '').split('.').map(part => Number.parseInt(part, 10) || 0)
  const a = parse(left), b = parse(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

export function canInstallResourceUpdate(metadata: AppUpdateMetadata, current: { appId: string; nativeVersion: string; resourceVersion: string }) {
  return metadata.appId === current.appId
    && compareVersions(metadata.nativeMinVersion, current.nativeVersion) <= 0
    && compareVersions(metadata.resourceVersion, current.resourceVersion) > 0
    && /^\/app-updates\/[A-Za-z0-9_.-]+\.wgt$/.test(metadata.wgtUrl)
}

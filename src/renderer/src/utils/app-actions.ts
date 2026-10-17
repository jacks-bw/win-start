export function appLaunchTarget(app: AppItem): { kind: 'path' | 'shell'; value: string } {
  const target = app.launchTarget || (app.lnkPath ? { kind: 'path' as const, value: app.lnkPath } : null)
  if (!target?.value.trim()) throw new Error('当前应用没有可用的启动入口，请刷新应用列表')
  return target
}

export function appActions(app: AppItem) {
  return { showLocation: !!app.lnkPath && app.launchTarget?.kind !== 'shell' }
}

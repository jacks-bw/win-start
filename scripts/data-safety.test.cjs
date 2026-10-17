// Run the actual TypeScript stores with Pinia and a mocked desktop API.
// No browser, new test dependency, or user data directory is required.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  module._compile(outputText, filename)
}
const { createPinia, setActivePinia } = require('pinia')
const { useTilesStore } = require('../src/renderer/src/stores/useTiles.ts')
const { useAppsStore } = require('../src/renderer/src/stores/useApps.ts')
const { useToolbarStore } = require('../src/renderer/src/stores/useToolbar.ts')
const { appActions } = require('../src/renderer/src/utils/app-actions.ts')
const { mergeScannedApps } = require('../src/renderer/src/utils/app-scan.ts')
const { RECENT_APP_WINDOW_MS, selectRecentApps } = require('../src/renderer/src/utils/recent-apps.ts')
const copy = value => JSON.parse(JSON.stringify(value))
const initial = () => ({ groups: [{ id: 'g', name: 'Group', tiles: [{
  id: 't', appId: 'app', size: 'medium', row: 0, col: 0, position: 0, iconColor: 'red'
}] }] })
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(api) {
  setActivePinia(createPinia())
  global.window = { api }
  global.localStorage = { getItem: () => null, setItem: () => {} }
}

test('recent discovery has an exact seven-day boundary and excludes baseline or invalid dates', () => {
  const now = RECENT_APP_WINDOW_MS * 2
  const entries = [
    { id: 'baseline', firstSeenAt: null }, { id: 'missing' },
    { id: 'future', firstSeenAt: now + 1 }, { id: 'invalid', firstSeenAt: NaN },
    { id: 'expired', firstSeenAt: now - RECENT_APP_WINDOW_MS },
    { id: 'recent', firstSeenAt: now - RECENT_APP_WINDOW_MS + 1 },
    { id: 'folder', firstSeenAt: now, folderId: 'f' }
  ]
  assert.deepEqual(selectRecentApps(entries, now).map(app => app.id), ['recent'])
})

test('recent discovery sorts by timestamp with deterministic ties and takes five without mutating input', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({ id: String(index), firstSeenAt: index + 1 }))
  entries.push({ id: 'a', firstSeenAt: 8 })
  const before = copy(entries)
  assert.deepEqual(selectRecentApps(entries, 10).map(app => app.id), ['7', 'a', '6', '5', '4'])
  assert.deepEqual(entries, before)
})

test('menu refresh ages recent entries even when scan throttling skips a native scan', async t => {
  let now = RECENT_APP_WINDOW_MS * 2
  t.mock.method(Date, 'now', () => now)
  let scans = 0
  setup({ getAppScan: async () => {
    scans++
    return { apps: [{ id: 'a', name: 'A', group: 'A', firstSeenAt: now - RECENT_APP_WINDOW_MS + 500 }], complete: true, warnings: [] }
  } })
  const store = useAppsStore()
  await store.loadApps()
  assert.equal(store.recentApps.length, 1)
  now += 1000
  await store.maybeRefreshApps()
  assert.equal(scans, 1)
  assert.equal(store.recentApps.length, 0)
})

test('history warnings remain visible even when discovery itself completed', async t => {
  t.mock.method(console, 'warn', () => {})
  setup({ getAppScan: async () => ({ apps: [{ id: 'a', name: 'A', group: 'A' }], complete: true, warnings: ['最近添加记录不可用'] }) })
  const store = useAppsStore()
  await store.loadApps()
  assert.equal(store.apps.length, 1)
  assert.match(store.scanWarning, /最近添加记录不可用/)
})

test('bridge snapshots replace state, ignore stale hydration and preserve notification content', () => {
  setup({})
  const store = useTilesStore()
  store.applyTileBridgeSnapshot({ revision: 2, entries: { app: { appId: 'app', title: 'Title', body: 'Body', count: 3, timestamp: 20 } } })
  store.applyTileBridgeSnapshot({ revision: 1, entries: {} })
  const [notification] = store.getNotifications('app')
  assert.equal(notification.title, 'Title')
  assert.equal(notification.body, 'Body')
  assert.equal(notification.count, 3)
  assert.equal(notification.timestamp, 20)
  assert.deepEqual(store.getNotifications('toString'), [])
  store.applyTileBridgeSnapshot({ revision: 3, entries: {} })
  assert.deepEqual(store.getNotifications('app'), [])
})

test('partial application scans preserve missing entries; complete scans replace discovery only', () => {
  const previous = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  assert.deepEqual(mergeScannedApps(previous, [{ id: 'a', name: 'Updated' }], false), [
    { id: 'a', name: 'Updated' }, { id: 'b', name: 'B' }
  ])
  assert.deepEqual(mergeScannedApps(previous, [], false), previous)
  assert.deepEqual(mergeScannedApps(previous, [], true), [])
})

test('failed and partial refreshes do not erase applications, tiles or pins', async t => {
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  let response = { apps: [{ id: 'a', name: 'A', group: 'A' }], complete: true, warnings: [] }
  setup({ getAppScan: async () => response, loadTileLayout: async () => initial() })
  const apps = useAppsStore()
  const tiles = useTilesStore()
  await apps.loadApps()
  await tiles.loadLayout()
  const before = copy(tiles.groups)
  apps.pinnedApps = ['a']
  response = { apps: [], complete: false, warnings: ['PowerShell unavailable'] }
  await apps.loadApps()
  assert.equal(apps.apps[0].id, 'a')
  window.api.getAppScan = async () => { throw new Error('scan failed') }
  await apps.loadApps()
  assert.equal(apps.apps[0].id, 'a')
  assert.deepEqual(apps.pinnedApps, ['a'])
  assert.deepEqual(copy(tiles.groups), before)
  assert.ok(apps.scanWarning)
})

test('editor changes and cancel-by-disposal perform no layout writes', async () => {
  let writes = 0
  setup({ loadTileLayout: async () => initial(), saveTileLayout: async () => { writes++ } })
  const editor = useTilesStore()
  editor.beginDraft()
  await editor.loadLayout()
  editor.setTileIconColor('t', 'blue')
  editor.setTileShowName('t', false)
  await Promise.resolve()
  assert.equal(writes, 0)
  editor.$dispose()
  assert.equal(writes, 0)
})

test('refresh restores folder membership and preserves in-session pin state', async () => {
  setup({ getAppScan: async () => ({ apps: [{ id: 'a', name: 'A', group: 'A', pinned: false }], complete: true, warnings: [] }) })
  global.localStorage.getItem = () => JSON.stringify([{ id: 'folder', name: 'Folder', appIds: ['a'] }])
  const store = useAppsStore()
  await store.loadApps()
  assert.equal(store.apps[0].folderId, 'folder')
  assert.equal(store.groupedApps.length, 0)
  store.pinnedApps = ['a']
  await store.loadApps()
  assert.equal(store.apps[0].folderId, 'folder')
  assert.equal(store.apps[0].pinned, true)
})

test('only confirming a draft writes and includes its original snapshot', async () => {
  const calls = []
  setup({ loadTileLayout: async () => initial(), saveTileLayout: async (draft, base) => {
    calls.push({ draft, base })
    return draft
  } })
  const editor = useTilesStore()
  editor.beginDraft()
  await editor.loadLayout()
  editor.setTileIconColor('t', 'blue')
  assert.equal(await editor.commitDraft(), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].base.groups[0].tiles[0].iconColor, 'red')
  assert.equal(calls[0].draft.groups[0].tiles[0].iconColor, 'blue')
})

test('in-flight writes serialize and subsequent edits do not revert remotely merged fields', async () => {
  const first = deferred()
  const calls = []
  setup({ loadTileLayout: async () => initial(), saveTileLayout: async (draft, base) => {
    calls.push({ draft, base })
    if (calls.length === 1) return first.promise
    const merged = copy(draft)
    merged.groups[0].background = 'remote.png'
    return merged
  } })
  const store = useTilesStore()
  await store.loadLayout()
  store.setTileIconColor('t', 'blue')
  await Promise.resolve()
  store.setTileShowName('t', false)
  assert.equal(calls.length, 1)
  const merged = copy(calls[0].draft)
  merged.groups[0].background = 'remote.png'
  first.resolve(merged)
  assert.equal(await store.saveLayout(), true)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].base.groups[0].background, undefined)
  assert.equal(calls[1].draft.groups[0].background, undefined)
  assert.equal(calls[1].draft.groups[0].tiles[0].showName, false)
  assert.equal(store.groups[0].background, 'remote.png')
})

test('conflict keeps editor draft and background reload cannot overwrite it', async t => {
  t.mock.method(console, 'error', () => {})
  setup({ loadTileLayout: async () => initial(), saveTileLayout: async () => { throw new Error('conflict') } })
  const editor = useTilesStore()
  editor.beginDraft()
  await editor.loadLayout()
  editor.setTileIconColor('t', 'blue')
  assert.equal(await editor.commitDraft(), false)
  assert.equal(editor.groups[0].tiles[0].iconColor, 'blue')
  assert.equal(await editor.loadLayout(), false)
  assert.match(editor.layoutError, /conflict/)
})

test('unreadable layout cannot be saved as a fresh empty document', async t => {
  t.mock.method(console, 'error', () => {})
  let writes = 0
  setup({ loadTileLayout: async () => { throw new Error('corrupt file') }, saveTileLayout: async () => { writes++ } })
  const store = useTilesStore()
  assert.equal(await store.loadLayout(), false)
  store.addGroup('new')
  assert.equal(await store.saveLayout(), false)
  assert.equal(writes, 0)
})

test('late load responses cannot overwrite edits made after the request', async () => {
  const late = deferred()
  setup({ loadTileLayout: async () => initial(), saveTileLayout: async draft => draft })
  const store = useTilesStore()
  await store.loadLayout()
  window.api.loadTileLayout = () => late.promise
  const loading = store.loadLayout()
  store.setTileIconColor('t', 'blue')
  await store.saveLayout()
  late.resolve(initial())
  assert.equal(await loading, false)
  assert.equal(store.groups[0].tiles[0].iconColor, 'blue')
})

test('toolbar only changes after successful persistence and failed writes retain saved buttons', async () => {
  const pending = deferred()
  setup({ getToolbarItems: async () => ['explorer'], setToolbarItems: () => pending.promise })
  const toolbar = useToolbarStore()
  await toolbar.load()
  const saving = toolbar.setItems(['downloads', 'explorer'])
  assert.deepEqual(toolbar.items, ['explorer'])
  assert.equal(toolbar.saving, true)
  assert.equal(await toolbar.setItems([]), false)
  pending.resolve(['downloads', 'explorer'])
  assert.equal(await saving, true)
  assert.deepEqual(toolbar.items, ['downloads', 'explorer'])
  window.api.setToolbarItems = async () => { throw new Error('disk full') }
  assert.equal(await toolbar.setItems([]), false)
  assert.deepEqual(toolbar.items, ['downloads', 'explorer'])
  assert.match(toolbar.error, /disk full/)
  window.api.setToolbarItems = async () => []
  assert.equal(await toolbar.setItems([]), true)
  assert.deepEqual(toolbar.items, [])
})

test('toolbar read failure cannot overwrite unread settings with defaults', async () => {
  let writes = 0
  setup({ getToolbarItems: async () => { throw new Error('read failed') }, setToolbarItems: async () => { writes++ } })
  const toolbar = useToolbarStore()
  await toolbar.load()
  assert.equal(toolbar.ready, false)
  assert.equal(await toolbar.setItems(['downloads']), false)
  assert.equal(writes, 0)
})

test('toolbar remote updates take precedence over stale initial loads', async () => {
  const pending = deferred()
  setup({ getToolbarItems: () => pending.promise })
  const toolbar = useToolbarStore()
  const loading = toolbar.load()
  toolbar.updateFromEvent(['downloads'])
  pending.resolve(['explorer'])
  await loading
  assert.deepEqual(toolbar.items, ['downloads'])
})

test('launch and location capabilities use the actual entry rather than a legacy UWP boolean', async () => {
  const calls = []
  setup({
    launchShellApp: async value => { calls.push(['shell', value]) },
    launchApp: async value => { calls.push(['path', value]) },
    hideStartMenu: async () => { calls.push(['hide']) }
  })
  const apps = useAppsStore()
  const desktopShell = { id: 'uwp:Desktop.Aumid', type: 'shell', lnkPath: '', launchTarget: { kind: 'shell', value: 'Desktop.Aumid' } }
  const shortcut = { id: 'lnk:a', lnkPath: 'a.lnk', launchTarget: { kind: 'path', value: 'a.lnk' } }
  assert.equal(appActions(desktopShell).showLocation, false)
  assert.equal(appActions(shortcut).showLocation, true)
  await apps.launchApp(desktopShell)
  await apps.launchApp(shortcut)
  assert.deepEqual(calls, [['shell', 'Desktop.Aumid'], ['hide'], ['path', 'a.lnk'], ['hide']])
})

test('failed application launch keeps menu visible and shows the failure', async t => {
  t.mock.method(console, 'error', () => {})
  let hidden = false
  setup({ launchApp: async () => { throw new Error('missing shortcut') }, hideStartMenu: async () => { hidden = true } })
  const apps = useAppsStore()
  await apps.launchApp({ id: 'a', lnkPath: 'missing.lnk' })
  assert.equal(hidden, false)
  assert.match(apps.launchError, /missing shortcut/)
})

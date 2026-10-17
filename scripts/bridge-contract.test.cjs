const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  })
  module._compile(outputText, filename)
}
const { createDesktopApi } = require('../src/renderer/src/tauri-bridge.ts')
const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
function create(overrides = {}) {
  const calls = []
  const transport = {
    invoke: async (name, args) => { calls.push([name, args]) },
    listen: async () => () => {},
    closeCurrentWindow: async () => {},
    ...overrides
  }
  return { api: createDesktopApi(transport), calls }
}

test('API is frozen and misspelled or removed methods cannot silently succeed', () => {
  const { api } = create()
  assert.ok(Object.isFrozen(api))
  assert.ok(Object.isFrozen(api.capabilities))
  assert.equal(api.nonexistentMethod, undefined)
  assert.equal(api.getShortcut, undefined)
  assert.equal(api.openAvatarCropWindow, undefined)
  assert.throws(() => api.nonexistentMethod(), TypeError)
})

test('every renderer API reference has an actual concrete implementation', () => {
  const { api } = create()
  const root = path.resolve(__dirname, '../src/renderer/src')
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name)
      if (item.isDirectory()) { walk(filename); continue }
      if (!/\.(ts|vue)$/.test(filename)) continue
      const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      function visit(node) {
        if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.expression.getText(source) === 'window' && node.expression.name.text === 'api') {
          assert.ok(Object.hasOwn(api, node.name.text), `${filename}: missing window.api.${node.name.text}`)
        }
        ts.forEachChild(node, visit)
      }
      // Vue script blocks are parsed separately to avoid template syntax
      // changing recovery of the TypeScript AST.
      if (item.name.endsWith('.vue')) {
        const { parse } = require('@vue/compiler-sfc')
        const descriptor = parse(fs.readFileSync(filename, 'utf8')).descriptor
        for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
          const script = ts.createSourceFile(filename, block.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
          // Reuse the visitor with a source that has matching offsets.
          function check(node) {
            if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
              && node.expression.expression.getText(script) === 'window' && node.expression.name.text === 'api') {
              assert.ok(Object.hasOwn(api, node.name.text), `${filename}: missing window.api.${node.name.text}`)
            }
            ts.forEachChild(node, check)
          }
          check(script)
        }
      } else visit(source)
    }
  }
  walk(root)
})

test('bridge command names are registered by the Rust backend', () => {
  const source = ts.createSourceFile('bridge.ts', fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/tauri-bridge.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  const rust = fs.readFileSync(path.resolve(__dirname, '../src-tauri/src/main.rs'), 'utf8')
  const registry = new Set(rust.match(/generate_handler!\[([\s\S]*?)\]/)[1].match(/\b[a-z_][a-z_0-9]*\b/g))
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ['command', 'readAvatar', 'saveCrop'].includes(node.expression.text)
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      assert.ok(registry.has(node.arguments[0].text), `Unregistered command ${node.arguments[0].text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
})

test('direct third-party pinning stays unsupported while real toolbar and power commands are enabled', async () => {
  const { api, calls } = create()
  assert.equal(api.capabilities.powerActions, true)
  assert.equal(api.capabilities.toolbarCustomization, true)
  assert.equal(api.capabilities.taskbarPinning, false)
  assert.equal(api.capabilities.taskbarPinningGuide, true)
  await assert.rejects(api.pinToTaskbar('app.lnk'), /尚未支持/)
  await api.powerAction('shutdown') // mocked transport; never shuts down Windows
  await api.setToolbarItems(['explorer'])
  await api.openTaskbarPinningGuide(null)
  assert.deepEqual(calls, [
    ['power_action', { action: 'shutdown' }],
    ['set_toolbar_items', { items: ['explorer'] }],
    ['open_taskbar_pinning_guide', { path: null }]
  ])
})

test('invocations use the real arguments and void results, and preserve failures', async () => {
  const { api, calls } = create()
  assert.equal(await api.setHotkey('Alt+W'), undefined)
  await api.setMenuBusy(true)
  assert.deepEqual(calls, [['set_hotkey', { hotkey: 'Alt+W' }], ['set_menu_busy', { busy: true }]])
  const failed = create({ invoke: async () => { throw 'native error' } }).api
  await assert.rejects(failed.launchApp('app.lnk'), /native error/)
})

test('failed avatar reads reject instead of looking like an absent avatar', async () => {
  const { api } = create({ invoke: async name => {
    if (name === 'get_user_avatar') return { path: 'avatar.png' }
    throw new Error('image read failed')
  } })
  await assert.rejects(api.getUserAvatar(), /image read failed/)
  await assert.rejects(api.getStagedAvatar(), /image read failed/)
})

test('application scan maps native fields without untyped compatibility stubs', async () => {
  const discoveredAt = Date.now() - 1000
  const { api } = create({ invoke: async () => ({
    complete: false, warnings: ['partial'], apps: [
      { id: 'lnk:x', name: '中文程序', path: 'app.lnk', type: 'win32', icon: 'png' },
      { id: 'uwp:y', name: 'Store App', path: 'package!app', type: 'packaged', icon: '', firstSeenAt: discoveredAt }
    ]
  }) })
  const result = await api.getAppScan()
  assert.equal(result.complete, false)
  assert.deepEqual(result.warnings, ['partial'])
  assert.equal(result.apps[0].group, 'Z')
  assert.equal(result.apps[0].pinyinInitials, 'zwcx')
  assert.equal(result.apps[0].lnkPath, 'app.lnk')
  assert.equal(result.apps[0].icon, 'data:image/png;base64,png')
  assert.deepEqual(result.apps[1].launchTarget, { kind: 'shell', value: 'package!app' })
  assert.equal(result.apps[1].lnkPath, '')
  assert.equal(result.apps[0].recentlyAdded, false)
  assert.equal(result.apps[1].firstSeenAt, discoveredAt)
  assert.equal(result.apps[1].recentlyAdded, true)
})

test('crop completion waits for window close and does not close after a failed save', async () => {
  const closing = deferred()
  let closed = 0
  const { api } = create({ closeCurrentWindow: () => { closed++; return closing.promise } })
  let finished = false
  const saving = api.confirmCrop('data').then(() => { finished = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(closed, 1)
  assert.equal(finished, false)
  closing.resolve()
  await saving
  const failed = create({ invoke: async () => { throw new Error('save failed') }, closeCurrentWindow: async () => { closed++ } }).api
  await assert.rejects(failed.confirmCrop('data'), /save failed/)
  assert.equal(closed, 1)
})

test('subscriptions disposed before registration finishes are cleaned up', async () => {
  const registration = deferred()
  let callback
  let stopped = 0
  let received = 0
  const { api } = create({ listen: (_name, handler) => { callback = handler; return registration.promise } })
  const stop = api.onLayoutUpdated(() => { received++ })
  stop()
  registration.resolve(() => { stopped++ })
  await Promise.resolve()
  callback({ payload: null })
  stop()
  assert.equal(stopped, 1)
  assert.equal(received, 0)
})

test('bridge snapshot hydration starts after listening and disposal suppresses late results', async () => {
  const registration = deferred()
  const snapshot = deferred()
  let fetched = 0
  let stopped = 0
  let received = 0
  const { api } = create({
    listen: () => registration.promise,
    invoke: name => { assert.equal(name, 'get_tile_bridge_snapshot'); fetched++; return snapshot.promise }
  })
  assert.equal(api.capabilities.tileBridge, true)
  const stop = api.onTileBridgeSnapshot(() => received++)
  assert.equal(fetched, 0)
  registration.resolve(() => stopped++)
  await Promise.resolve()
  assert.equal(fetched, 1)
  stop()
  snapshot.resolve({ revision: 1, entries: {} })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(received, 0)
  assert.equal(stopped, 1)
})

test('bridge status and enabled settings use registered native commands', async () => {
  const { api, calls } = create()
  await api.getTileBridgeStatus()
  await api.setTileBridgeEnabled(false)
  assert.deepEqual(calls, [['get_tile_bridge_status', undefined], ['set_tile_bridge_enabled', { enabled: false }]])
})

test('failed listener registrations are reported rather than silently ignored', async t => {
  t.mock.method(console, 'error', () => {})
  const { api } = create({ listen: async () => { throw 'listen failed' } })
  let reported
  const stop = api.onBridgeError(error => { reported = error.message })
  api.onLayoutUpdated(() => {})
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(reported, 'listen failed')
  stop()
})

const fs = require('node:fs')
const assert = require('node:assert/strict')
const test = require('node:test')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename)
}
const { createDisposalScope } = require('../src/renderer/src/utils/disposal.ts')
const { useDisposalScope } = require('../src/renderer/src/utils/useDisposalScope.ts')
const { createRenderer, h, nextTick, onMounted, ref, watch } = require('vue')
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

test('resources release exactly once, including resources added after disposal', () => {
  const scope = createDisposalScope()
  let calls = 0
  const stop = scope.add(() => calls++)
  stop(); stop()
  scope.add(() => calls++)
  scope.dispose(); scope.dispose()
  scope.add(() => calls++)
  assert.equal(calls, 3)
  assert.equal(scope.disposed, true)
})

test('one failed cleanup does not strand other listeners', () => {
  const scope = createDisposalScope()
  let released = false
  const previous = console.error
  console.error = () => {}
  try {
    scope.add(() => { throw Error('native cleanup failed') })
    scope.add(() => { released = true })
    scope.dispose()
    assert.equal(released, true)
  } finally { console.error = previous }
})

test('pending delays are cancelled and completed delays do not run twice', async () => {
  const scope = createDisposalScope()
  let calls = 0
  scope.delay(() => calls++, 0)
  await wait(15)
  assert.equal(calls, 1)
  scope.delay(() => calls++, 10)
  scope.dispose()
  scope.delay(() => calls++, 0)
  await wait(25)
  assert.equal(calls, 1)
})

// Use Vue's actual lifecycle without requiring WebView or a DOM library.
const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
  parentNode: () => null, nextSibling: () => null
})

test('repeated mounts own one listener and release async-created watchers', async () => {
  const listeners = new Set()
  const source = ref(0)
  let callbacks = 0
  for (let iteration = 0; iteration < 3; iteration++) {
    const app = renderer.createApp({ setup() {
      const scope = useDisposalScope()
      onMounted(async () => {
        await Promise.resolve()
        const handler = () => callbacks++
        listeners.add(handler)
        scope.add(() => listeners.delete(handler))
        scope.add(watch(source, handler))
      })
      return () => h('div')
    } })
    app.mount({})
    await nextTick()
    assert.equal(listeners.size, 1)
    source.value++
    await nextTick()
    assert.equal(callbacks, iteration + 1)
    app.unmount()
    assert.equal(listeners.size, 0)
    source.value++
    await nextTick()
    assert.equal(callbacks, iteration + 1)
  }
})

test('closing during async initialization immediately releases late registrations', async () => {
  let resume
  const pending = new Promise(resolve => { resume = resolve })
  let active = 0
  const app = renderer.createApp({ setup() {
    const scope = useDisposalScope()
    onMounted(async () => {
      await pending
      active++
      scope.add(() => active--)
    })
    return () => h('div')
  } })
  app.mount({})
  app.unmount()
  resume()
  await nextTick()
  assert.equal(active, 0)
})

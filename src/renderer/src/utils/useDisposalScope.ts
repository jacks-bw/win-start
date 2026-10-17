import { onUnmounted } from 'vue'
import { createDisposalScope } from './disposal'

// Call synchronously from setup so Vue always associates the cleanup hook.
export function useDisposalScope() {
  const scope = createDisposalScope()
  onUnmounted(scope.dispose)
  return scope
}

import Store from 'electron-store'

interface StoreSchema {
  tileLayout: {
    groups: Array<{
      id: string
      name: string
      tiles: Array<{
        id: string
        appId: string
        size: 'small' | 'medium' | 'wide' | 'large'
        liveEnabled: boolean
        position: number
      }>
    }>
  }
  pinnedApps: string[]
  theme: 'light' | 'dark'
  recentApps: string[]
  userAvatar: string | null
}

const defaults: StoreSchema = {
  tileLayout: {
    groups: [
      {
        id: 'default',
        name: '最常用',
        tiles: [
          { id: 'tile-1', appId: 'calc', size: 'medium', liveEnabled: false, position: 0 },
          { id: 'tile-2', appId: 'notepad', size: 'small', liveEnabled: false, position: 1 },
          { id: 'tile-3', appId: 'browser', size: 'wide', liveEnabled: true, position: 2 },
          { id: 'tile-4', appId: 'files', size: 'medium', liveEnabled: false, position: 3 }
        ]
      }
    ]
  },
  pinnedApps: [],
  theme: 'dark',
  recentApps: [],
  userAvatar: null
}

export function createStore(): Store<StoreSchema> {
  return new Store<StoreSchema>({ defaults })
}

export { StoreSchema }

import http from 'http'
import { BrowserWindow } from 'electron'

/**
 * 磁贴桥接服务（Tile Bridge）
 *
 * 提供本地 HTTP API，允许第三方软件向磁贴推送实时内容。
 * 目前默认不启用，保留作为扩展接口。
 *
 * API 规范：
 * - POST /api/tile/update  推送磁贴内容
 *   Body: { appId: string, title?: string, body?: string, icon?: string, count?: number }
 * - POST /api/tile/clear   清除磁贴内容
 *   Body: { appId: string }
 *
 * 示例（curl）：
 *   curl -X POST http://localhost:18923/api/tile/update \
 *     -H "Content-Type: application/json" \
 *     -d '{"appId":"qq","title":"张三","body":"在吗？","count":3}'
 */

const DEFAULT_PORT = 18923

export interface TilePushData {
  appId: string
  title?: string
  body?: string
  icon?: string
  count?: number
  timestamp?: number
}

class TileBridge {
  private server: http.Server | null = null
  private port: number = DEFAULT_PORT
  private enabled: boolean = false
  // 内存中保存各 appId 最新的推送内容
  private tileData: Map<string, TilePushData> = new Map()

  /**
   * 启动磁贴桥接服务
   * @param port 端口号，默认 18923
   */
  start(port?: number): void {
    if (this.server) {
      console.log('[TileBridge] Already running')
      return
    }

    this.port = port || DEFAULT_PORT
    this.enabled = true

    this.server = http.createServer((req, res) => {
      // CORS 头（仅本地访问）
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }

      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })

      req.on('end', () => {
        try {
          const data = JSON.parse(body)

          if (req.url === '/api/tile/update') {
            this.handleUpdate(data, res)
          } else if (req.url === '/api/tile/clear') {
            this.handleClear(data, res)
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Not found' }))
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
    })

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[TileBridge] Server started at http://127.0.0.1:${this.port}`)
    })

    this.server.on('error', (err) => {
      console.error('[TileBridge] Server error:', err.message)
    })
  }

  /**
   * 停止磁贴桥接服务
   */
  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
      this.enabled = false
      console.log('[TileBridge] Server stopped')
    }
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.enabled
  }

  /**
   * 获取指定 appId 的推送内容
   */
  getTileData(appId: string): TilePushData | undefined {
    return this.tileData.get(appId)
  }

  /**
   * 获取所有推送内容
   */
  getAllTileData(): Record<string, TilePushData> {
    const result: Record<string, TilePushData> = {}
    this.tileData.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  private handleUpdate(data: any, res: http.ServerResponse): void {
    if (!data.appId || typeof data.appId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'appId is required' }))
      return
    }

    const pushData: TilePushData = {
      appId: data.appId,
      title: data.title,
      body: data.body,
      icon: data.icon,
      count: typeof data.count === 'number' ? data.count : undefined,
      timestamp: Date.now()
    }

    this.tileData.set(data.appId, pushData)
    console.log(`[TileBridge] Update tile: ${data.appId}`, pushData.title || pushData.body || '')

    // 通知所有渲染进程
    this.broadcast('tile-bridge:update', pushData)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  }

  private handleClear(data: any, res: http.ServerResponse): void {
    if (!data.appId || typeof data.appId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'appId is required' }))
      return
    }

    this.tileData.delete(data.appId)
    console.log(`[TileBridge] Clear tile: ${data.appId}`)

    // 通知所有渲染进程
    this.broadcast('tile-bridge:clear', { appId: data.appId })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  }

  private broadcast(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(channel, data)
    })
  }
}

// 单例
export const tileBridge = new TileBridge()

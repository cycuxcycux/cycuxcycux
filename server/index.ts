import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { buildCard, handleRpc, parseErrorResponse } from './a2a'
import { startWatch, watchStatus } from './watch'
import { mainAgentStatus, startMainAgent } from './main-agent'

const PORT = Number(process.env.PORT ?? 7860)
const DIST = resolve(process.cwd(), 'dist')
const MAX_BODY = 64 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, a2a-version')
  res.setHeader('Access-Control-Max-Age', '600')
}

function sendJson(res: ServerResponse, status: number, body: unknown, cache = 'no-store') {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', cache)
  res.end(JSON.stringify(body))
}

function originOf(req: IncomingMessage): string {
  const header = (name: string) => {
    const value = req.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  const host = header('x-forwarded-host') ?? header('host') ?? `localhost:${PORT}`
  const local = /^(localhost|127\.0\.0\.1)/.test(host)
  const proto = local ? 'http' : 'https'
  return `${proto}://${host}`
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function serveStatic(pathname: string, res: ServerResponse) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, clean)
  if (!file.startsWith(DIST)) file = join(DIST, 'index.html')
  const isFile = existsSync(file) && statSync(file).isFile()
  // Unknown paths fall back to index.html so deep links and refreshes keep working.
  const target = isFile ? file : join(DIST, 'index.html')
  if (!existsSync(target)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[extname(target)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', target.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  res.end(readFileSync(target))
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (path === '/.well-known/agent-card.json' || path === '/.well-known/agent.json') {
    cors(res)
    if (method === 'OPTIONS') return void ((res.statusCode = 204), res.end())
    return sendJson(res, 200, buildCard(originOf(req)), 'public, max-age=60')
  }

  if (path === '/a2a') {
    cors(res)
    if (method === 'OPTIONS') return void ((res.statusCode = 204), res.end())
    if (method === 'GET') return sendJson(res, 200, buildCard(originOf(req)), 'public, max-age=60')
    if (method !== 'POST') return sendJson(res, 405, { error: 'Use POST with a JSON-RPC 2.0 request' })
    let parsed: unknown
    try {
      parsed = JSON.parse(await readBody(req)) as unknown
    } catch {
      return sendJson(res, 200, parseErrorResponse())
    }
    return sendJson(res, 200, await handleRpc(parsed))
  }

  if (path === '/main-agent') {
    cors(res)
    return sendJson(res, 200, mainAgentStatus())
  }

  if (path === '/health') {
    cors(res)
    return sendJson(res, 200, { ok: true, watch: watchStatus() })
  }

  return serveStatic(path, res)
}

startWatch()

createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    console.error(error)
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal error' })
    else res.end()
  })
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on ${PORT}`)
  startMainAgent(PORT)
})

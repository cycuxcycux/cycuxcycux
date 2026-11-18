import { bytesToString, stringToBytes } from 'viem'

/** Parsed ERC-8004 registration file. Every field is untrusted data and is only ever rendered as text. */
export interface AgentCard {
  name: string
  description: string
  a2aEndpoint?: string
  x402Support: boolean
}

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')

const toHttps = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString().slice(0, 300) : undefined
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseCard(json: unknown): AgentCard | null {
  if (!isRecord(json)) return null
  const name = clip(json.name, 60).trim()
  if (!name) return null
  const services = Array.isArray(json.services) ? (json.services as unknown[]) : []
  let a2aEndpoint: string | undefined
  for (const service of services) {
    if (isRecord(service) && typeof service.name === 'string' && service.name.toLowerCase() === 'a2a') {
      a2aEndpoint = toHttps(service.endpoint)
      break
    }
  }
  return { name, description: clip(json.description, 280).trim(), a2aEndpoint, x402Support: json.x402Support === true }
}

export function encodeCard(card: { name: string; description: string; a2aEndpoint?: string; x402Support: boolean }): string {
  const services = card.a2aEndpoint ? [{ name: 'A2A', endpoint: card.a2aEndpoint, version: '0.3.0' }] : []
  const body = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: card.name,
    description: card.description,
    services,
    x402Support: card.x402Support,
    active: true,
    supportedTrust: ['reputation'],
    app: 'cycuxio',
  }
  const bytes = stringToBytes(JSON.stringify(body))
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return `data:application/json;base64,${btoa(binary)}`
}

function decodeDataUri(uri: string): unknown {
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const meta = uri.slice(5, comma)
  const payload = uri.slice(comma + 1)
  if (meta.includes(';base64')) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return JSON.parse(bytesToString(bytes))
  }
  return JSON.parse(decodeURIComponent(payload))
}

/** Resolve an agent URI to a card. Only data: and https: URIs are read; anything else yields null. */
export async function resolveCard(uri: string): Promise<AgentCard | null> {
  try {
    if (uri.length > 20000) return null
    if (uri.startsWith('data:application/json')) return parseCard(decodeDataUri(uri))
    if (uri.startsWith('https://')) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const res = await fetch(uri, { signal: controller.signal })
        if (!res.ok) return null
        const text = await res.text()
        if (text.length > 20000) return null
        return parseCard(JSON.parse(text))
      } finally {
        clearTimeout(timer)
      }
    }
    return null
  } catch {
    return null
  }
}

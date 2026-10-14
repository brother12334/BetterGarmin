export interface CloudFile {
  name: string
  size: number
  lastModified: string
}

export interface CloudConfig {
  workerUrl: string
  token: string
}

function normalizeUrl(workerUrl: string): string {
  return workerUrl.replace(/\/+$/, '')
}

async function cloudFetch(config: CloudConfig, path: string): Promise<Response> {
  const res = await fetch(`${normalizeUrl(config.workerUrl)}${path}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  })
  if (res.status === 401) throw new Error('Access token was rejected. Check the token in your Worker settings.')
  if (!res.ok) throw new Error(`Cloud sync request failed (${res.status})`)
  return res
}

export async function fetchManifest(config: CloudConfig): Promise<CloudFile[]> {
  const res = await cloudFetch(config, '/manifest')
  const data = (await res.json()) as { files: CloudFile[] }
  return data.files
}

export async function fetchCloudFile(config: CloudConfig, name: string): Promise<ArrayBuffer> {
  const res = await cloudFetch(config, `/files/${encodeURIComponent(name)}`)
  return res.arrayBuffer()
}

/** Quick reachability + auth check, used when the user first enters their Worker URL/token. */
export async function testCloudConfig(config: CloudConfig): Promise<{ ok: true; files: CloudFile[] } | { ok: false; error: string }> {
  try {
    const files = await fetchManifest(config)
    return { ok: true, files }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

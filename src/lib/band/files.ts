import { decodeMessage, type ProtoField } from './proto'
import { SMART } from './smart'

/** FileAccess ItemListResponse (Smart 43 → 10), per the recovered GDIFileAccess schema. */
export const ITEM_LIST_STATUS = ['SUCCESS', 'FAIL_UNKNOWN_SESSION_ID', 'FAIL_TOO_MANY_EXCLUDE_FLAGS', 'FAIL_TOO_MANY_GET_FLAGS', 'FAIL_OTHER', 'FAIL_TOO_MANY_INCLUDE_TYPES', 'FAIL_INVALID_DATA_TYPE'] as const

export interface FileItem {
  /** ItemReference.uid halves as their raw fixed64 wire bytes (never converted to Number). */
  uid: { ms: Uint8Array; ls: Uint8Array } | null
  /** Stable identity for dedupe: the two halves as hex. */
  uidHex: string | null
  /** DataType string, resolved from a per-response key when the band sends only the key. */
  dataType: string | null
  dataTypeFormat: number | null
  fileIdentifier: string | null
  dataSize: bigint | null
  modifiedTime: number | null
}

export interface FileListPage {
  status: number
  sessionId: number | null
  nextTransactionId: number | null
  items: FileItem[]
  /** No session ID means the band has nothing more to list. */
  complete: boolean
}

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ')

function scalar(fields: ProtoField[], field: number): number | null {
  const f = fields.filter((x) => x.field === field)
  if (f.length > 1) throw new Error(`Duplicate file response field ${field}`)
  if (f.length === 0) return null
  if (f[0].wire !== 0) throw new Error(`File response field ${field} has an unexpected wire type`)
  return Number(f[0].value)
}

export function decodeFileListPage(smart: ProtoField[] | null): FileListPage {
  const fa = smart?.find((f) => f.field === SMART.FILE_ACCESS && f.wire === 2)
  const service = fa ? decodeMessage(fa.value as Uint8Array) : null
  const resp = service?.find((f) => f.field === 10 && f.wire === 2)
  const n = resp ? decodeMessage(resp.value as Uint8Array) : null
  if (!n) throw new Error('The band answered without an item-list response')
  const status = scalar(n, 1)
  if (status == null) throw new Error('File list has no status')
  if (status !== 0) throw new Error(`File list rejected: ${ITEM_LIST_STATUS[status] ?? `status ${status}`}`)
  const sessionId = scalar(n, 2)
  const nextTransactionId = scalar(n, 3)
  if (sessionId == null && nextTransactionId == null) throw new Error('File list has neither a session nor a next-transaction marker')
  // Data-type strings can be sent once with a key and then by key only; keys are scoped to this response.
  const keyed = new Map<number, string>()
  const raw = n.filter((f) => f.field === 4 && f.wire === 2).map((f) => decodeMessage(f.value as Uint8Array) ?? [])
  const dataTypes = raw.map((item) => {
    const dt = item.find((x) => x.field === 2 && x.wire === 2)
    const fields = dt ? (decodeMessage(dt.value as Uint8Array) ?? []) : []
    const str = fields.find((x) => x.field === 2 && x.wire === 2)
    const key = scalar(fields, 3)
    const text = str ? new TextDecoder().decode(str.value as Uint8Array) : null
    if (text != null && key != null) keyed.set(key, text)
    const ident = fields.find((x) => x.field === 4 && x.wire === 2)
    return { text, key, format: scalar(fields, 1), ident: ident ? new TextDecoder().decode(ident.value as Uint8Array) : null }
  })
  const items: FileItem[] = raw.map((item, i) => {
    const uidField = item.find((x) => x.field === 1 && x.wire === 2)
    const uidMsg = uidField ? (decodeMessage(uidField.value as Uint8Array) ?? []) : []
    const ms = uidMsg.find((x) => x.field === 1 && x.wire === 1)?.value as Uint8Array | undefined
    const ls = uidMsg.find((x) => x.field === 2 && x.wire === 1)?.value as Uint8Array | undefined
    const size = item.find((x) => x.field === 3 && x.wire === 0)
    const dt = dataTypes[i]
    return {
      uid: ms && ls ? { ms, ls } : null,
      uidHex: ms && ls ? `${hexOf(ms).replace(/ /g, '')}${hexOf(ls).replace(/ /g, '')}` : null,
      dataType: dt.text ?? (dt.key != null ? (keyed.get(dt.key) ?? null) : null),
      dataTypeFormat: dt.format,
      fileIdentifier: dt.ident,
      dataSize: size ? BigInt(size.value as number | bigint) : null,
      modifiedTime: scalar(item, 7),
    }
  })
  return { status, sessionId, nextTransactionId, items, complete: sessionId == null }
}

export const ITEM_ACCESS_RESULT = [
  'SUCCESS',
  'ITEM_TYPE_NOT_SUPPORTED',
  'NO_SUPPORTED_TRANSPORT',
  'NO_AVAILABLE_RESOURCES',
  'INTERNAL_ERROR',
  'INVALID_PARAMS',
  'INVALID_OFFSET',
  'AMBIGUOUS_DATA_TYPE',
  'UNKNOWN_ITEM',
  'NO_SPACE',
  'DATA_TYPE_ERROR',
  'CONFLICTING_PUSH_REQUEST',
] as const

export interface PullResponse {
  transferHandle: number
  compressionWindow: number | null
  filePath: string | null
}

/** PullItemDataResponse (Smart 43 → 2). Throws unless the band explicitly agreed to a pipe transfer. */
export function decodePullResponse(smart: ProtoField[] | null): PullResponse {
  const fa = smart?.find((f) => f.field === SMART.FILE_ACCESS && f.wire === 2)
  const service = fa ? decodeMessage(fa.value as Uint8Array) : null
  const resp = service?.find((f) => f.field === 2 && f.wire === 2)
  const n = resp ? decodeMessage(resp.value as Uint8Array) : null
  if (!n) throw new Error('The band answered without a pull response')
  const result = scalar(n, 1)
  if (result == null) throw new Error('Pull response has no result')
  if (result !== 0) throw new Error(`The band refused the download: ${ITEM_ACCESS_RESULT[result] ?? `result ${result}`}`)
  const transport = scalar(n, 2)
  if (transport !== 0) throw new Error(`The band offered an unsupported transport (${transport ?? 'none'})`)
  const transferHandle = scalar(n, 3)
  if (transferHandle == null) throw new Error('Pull response has no transfer handle')
  const path = n.find((f) => f.field === 4 && f.wire === 2)
  return { transferHandle, compressionWindow: scalar(n, 7), filePath: path ? new TextDecoder().decode(path.value as Uint8Array) : null }
}

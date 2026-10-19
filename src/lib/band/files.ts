import { decodeMessage, type ProtoField } from './proto'
import { SMART } from './smart'

/** FileAccess ItemListResponse (Smart 43 → 10), per the recovered GDIFileAccess schema. */
export const ITEM_LIST_STATUS = ['SUCCESS', 'FAIL_UNKNOWN_SESSION_ID', 'FAIL_TOO_MANY_EXCLUDE_FLAGS', 'FAIL_TOO_MANY_GET_FLAGS', 'FAIL_OTHER', 'FAIL_TOO_MANY_INCLUDE_TYPES', 'FAIL_INVALID_DATA_TYPE'] as const

export interface FileItem {
  /** ItemReference.uid (a DataTypes.UUID message), as raw bytes. */
  uidHex: string | null
  dataSize: number | null
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
  const items = n
    .filter((f) => f.field === 4 && f.wire === 2)
    .map((f) => {
      const item = decodeMessage(f.value as Uint8Array) ?? []
      const uid = item.find((x) => x.field === 1 && x.wire === 2)
      return { uidHex: uid ? hexOf(uid.value as Uint8Array) : null, dataSize: scalar(item, 3), modifiedTime: scalar(item, 7) }
    })
  return { status, sessionId, nextTransactionId, items, complete: sessionId == null }
}

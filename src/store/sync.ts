import type { Database } from '@/data/types'
import { COLLECTIONS, TABLES, fromRow, toRow, type CollectionKey } from '@/data/schema'
import { requireSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import { toast } from '@/components/ui/feedback'

/* ============================================================================
   SYNC

   The store's ~40 actions are left untouched. Instead this subscribes to the
   store, diffs each collection against the last synced snapshot by id, and
   pushes only what changed. Writes are debounced and coalesced, so dragging a
   moodboard item across a section is one round trip, not thirty.

   Last-write-wins. That is honest for a small studio where two people rarely
   edit the same record in the same second; proper conflict resolution would
   need per-field versioning and is noted in the README as future work.
   ========================================================================== */

type Row = Record<string, unknown>
type Snapshot = Partial<Record<CollectionKey, Map<string, string>>>

let workspaceId: string | null = null
let snapshot: Snapshot = {}
let unsubscribe: (() => void) | null = null
let timer: number | undefined
/** Set while hydrating, so writing the fetched state back is not mistaken for an edit. */
let applyingRemote = false

const pending = new Set<CollectionKey>()
/** Tables already complained about, so a retry loop cannot spam. */
const reported = new Set<CollectionKey>()
/** Set while a slow retry is armed for writes that keep failing. */
let retryTimer: number | undefined

/** Stable identity for a record, used to detect "did this actually change". */
function fingerprint(record: unknown): string {
  return JSON.stringify(record)
}

function indexOf(records: Array<{ id: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const record of records) map.set(record.id, fingerprint(record))
  return map
}

/* --------------------------------------------------------------- hydrate -- */

/**
 * Pull the whole workspace into the store. Returns false when the workspace is
 * empty — and crucially, does not touch local state in that case.
 *
 * Overwriting unconditionally destroyed data: an interrupted first sign-in left
 * a workspace row with nothing under it, and hydrating from it wiped the local
 * store before anything had been pushed. The result was an empty studio with a
 * currentUserId pointing at a team member that no longer existed.
 */
export async function hydrate(ws: string): Promise<boolean> {
  const supabase = requireSupabase()
  workspaceId = ws

  const next: Partial<Database> = {}
  let total = 0

  await Promise.all(
    COLLECTIONS.map(async (key) => {
      const { data, error } = await supabase
        .from(TABLES[key].table)
        .select('*')
        .eq('workspace_id', ws)

      if (error) throw new Error(`${TABLES[key].table}: ${error.message}`)
      const records = (data ?? []).map((row) => fromRow(row as Row))
      total += records.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = records
    }),
  )

  // Nothing there yet. Leave the local store alone so the caller can push it up
  // rather than losing it.
  if (total === 0) return false

  // Personal preferences are per user as well as per workspace — filtering on
  // the workspace alone returns a row per team member and maybeSingle() throws.
  const { data: auth } = await supabase.auth.getUser()
  const { data: prefs } = await supabase
    .from('user_settings')
    .select('*')
    .eq('workspace_id', ws)
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle()

  const { data: ws_row } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', ws)
    .maybeSingle()

  applyingRemote = true
  useStore.setState((state) => ({
    ...state,
    ...next,
    settings: {
      ...state.settings,
      // A stored 'light' nobody picked is the old column default, not a choice.
      theme:
        prefs?.theme && !(prefs.theme === 'light' && prefs.theme_chosen === false)
          ? (prefs.theme as Database['settings']['theme'])
          : state.settings.theme,
      themeChosen: (prefs?.theme_chosen as boolean | undefined) ?? state.settings.themeChosen,
      density: (prefs?.density as Database['settings']['density']) ?? state.settings.density,
      notifications: (prefs?.notifications as never) ?? state.settings.notifications,
      currentUserId: (prefs?.current_user_id as string) ?? state.settings.currentUserId,
      workspace: {
        ...state.settings.workspace,
        name: (ws_row?.name as string) ?? state.settings.workspace.name,
        tagline: (ws_row?.tagline as string) ?? state.settings.workspace.tagline,
        accent: (ws_row?.accent as never) ?? state.settings.workspace.accent,
        onboarded: true,
      },
    },
  }))
  applyingRemote = false

  snapshot = {}
  const state = useStore.getState()
  for (const key of COLLECTIONS) {
    snapshot[key] = indexOf(state[key] as Array<{ id: string }>)
  }

  return true
}

/* ---------------------------------------------------------------- errors -- */

/**
 * A write that will not land has to say so.
 *
 * It used to be a console.error, which meant a column the database did not
 * have yet — a migration not run — looked exactly like everything working.
 * The change stayed in this browser, the retry failed forever in silence, and
 * the next sign-in hydrated the old row over the top of it. Whatever you had
 * just done was simply gone, with nothing on screen having suggested it might.
 */
function report(key: CollectionKey, table: string, error: unknown) {
  if (reported.has(key)) return
  reported.add(key)

  const message = (error as { message?: string })?.message ?? String(error)
  // PostgREST says "Could not find the 'x' column of 'y' in the schema cache".
  const schema = /column|schema cache/i.test(message)

  toast.error(schema ? `Your database is missing a column` : `Could not save to ${table}`, {
    detail: schema
      ? `${table} is behind this version of the app, so that change is saved on this device only. Run the migrations in supabase/migrations, then edit anything to push it up. (${message})`
      : message,
  })
}

/** Keep trying, slowly, so running the migration is enough to heal it. */
function armRetry() {
  if (pending.size === 0 || retryTimer) return
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined
    void flush()
  }, 20_000)
}

/* ----------------------------------------------------------------- flush -- */

async function flush() {
  if (!workspaceId) return
  const supabase = requireSupabase()
  const state = useStore.getState()
  const keys = Array.from(pending)
  pending.clear()

  for (const key of keys) {
    const spec = TABLES[key]
    const records = state[key] as Array<{ id: string }>
    const before = snapshot[key] ?? new Map()
    const after = indexOf(records)

    const changed = records.filter((record) => before.get(record.id) !== after.get(record.id))
    const removed = [...before.keys()].filter((id) => !after.has(id))

    try {
      if (changed.length > 0) {
        const rows = changed.map((record) =>
          toRow(record as unknown as Row, workspaceId!),
        )
        const { error } = await supabase
          .from(spec.table)
          .upsert(rows, { onConflict: 'workspace_id,id' })
        if (error) throw error
      }

      if (removed.length > 0) {
        const { error } = await supabase
          .from(spec.table)
          .delete()
          .eq('workspace_id', workspaceId)
          .in('id', removed)
        if (error) throw error
      }

      snapshot[key] = after
      reported.delete(key)
    } catch (error) {
      // Keep the old snapshot so the change is retried on the next flush
      // rather than being silently dropped.
      pending.add(key)
      console.error(`[crmo] sync failed for ${spec.table}`, error)
      report(key, spec.table, error)
    }
  }

  armRetry()

  // Settings ride along with whatever else changed.
  const prefs = {
    workspace_id: workspaceId,
    user_id: (await supabase.auth.getUser()).data.user?.id,
    theme: state.settings.theme,
    theme_chosen: state.settings.themeChosen ?? false,
    density: state.settings.density,
    notifications: state.settings.notifications,
    current_user_id: state.settings.currentUserId,
    onboarded: true,
  }
  const { error: prefsError } = await supabase
    .from('user_settings')
    .upsert(prefs, { onConflict: 'workspace_id,user_id' })
  // Until 0006_dark_default.sql has been run the column does not exist; the
  // rest of the preferences should still sync.
  if (prefsError?.message.includes('theme_chosen')) {
    const { theme_chosen: _, ...withoutChosen } = prefs
    await supabase
      .from('user_settings')
      .upsert(withoutChosen, { onConflict: 'workspace_id,user_id' })
  }

  await supabase
    .from('workspaces')
    .update({
      name: state.settings.workspace.name,
      tagline: state.settings.workspace.tagline,
      accent: state.settings.workspace.accent,
    })
    .eq('id', workspaceId)
}

/* ----------------------------------------------------------------- start -- */

/** Begin mirroring store changes to Postgres. Idempotent. */
export function startSync(ws: string) {
  workspaceId = ws
  unsubscribe?.()

  unsubscribe = useStore.subscribe((state, previous) => {
    if (applyingRemote) return

    let dirty = false
    for (const key of COLLECTIONS) {
      if (state[key] !== previous[key]) {
        pending.add(key)
        dirty = true
      }
    }
    if (state.settings !== previous.settings) dirty = true
    if (!dirty) return

    window.clearTimeout(timer)
    timer = window.setTimeout(() => void flush(), 400)
  })
}

export function stopSync() {
  unsubscribe?.()
  unsubscribe = null
  workspaceId = null
  snapshot = {}
  pending.clear()
  reported.clear()
  window.clearTimeout(timer)
  window.clearTimeout(retryTimer)
  retryTimer = undefined
}

export interface PushProgress {
  done: number
  total: number
  /** Human label for what is being written right now. */
  label: string
}

/** Readable names for the progress indicator, rather than table names. */
const COLLECTION_LABELS: Partial<Record<CollectionKey, string>> = {
  team: 'the studio roster',
  companies: 'companies',
  contacts: 'clients',
  leadSources: 'lead sources',
  shoots: 'shoots',
  milestones: 'milestones',
  tasks: 'tasks',
  licenses: 'licences',
  invoices: 'invoices',
  pipeline: 'lifecycle stages',
  moodboards: 'moodboards',
  moodSections: 'moodboard sections',
  moodItems: 'references',
  assets: 'deliverables',
  assetVersions: 'versions',
  comments: 'feedback',
  activity: 'activity history',
  tags: 'tags',
  customFields: 'custom fields',
  savedViews: 'saved views',
}

/**
 * Push the entire current store up — used when seeding a new workspace.
 * Reports progress per collection so setup can show what it is doing rather
 * than spinning silently through a few hundred inserts.
 */
export async function pushAll(ws: string, onProgress?: (progress: PushProgress) => void) {
  workspaceId = ws
  snapshot = {}

  const keys = COLLECTIONS.filter(
    (key) => (useStore.getState()[key] as unknown[]).length > 0,
  )
  const total = keys.length + 1

  for (const [index, key] of keys.entries()) {
    onProgress?.({ done: index, total, label: COLLECTION_LABELS[key] ?? key })
    pending.add(key)
    await flush()
  }

  onProgress?.({ done: total - 1, total, label: 'your preferences' })
  await flush()
  onProgress?.({ done: total, total, label: 'done' })
}

/** The workspace the app is currently synced to, or null in local mode. */
export function getWorkspaceId(): string | null {
  return workspaceId
}

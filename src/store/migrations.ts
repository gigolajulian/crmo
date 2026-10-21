import { DEFAULT_PIPELINE } from '@/data/pipeline'
import { EMPTY_BILLING, DEFAULT_NOTIFICATIONS } from '@/data/defaults'
import type {
  Database,
  Deliverable,
  ID,
  LeadSource,
  LineItem,
  Shoot,
  ShootDate,
  ShootType,
} from '@/data/types'

/* ============================================================================
   v3 -> v4 — deals and projects become shoots

   The old model split one photography job across two records: a Deal for the
   sale and a Project for the delivery, linked by id. Every Tier-1 feature
   pushed against that seam, so they are folded into a single Shoot.

   This runs against real saved data, so it is written to be total: anything it
   cannot interpret gets a defensible default rather than throwing, because a
   migration that throws leaves the user with a blank app and no way back.
   ========================================================================== */

/* --------------------------------------------------------- legacy shapes -- */

interface LegacyDeliverable {
  id: ID
  name: string
  quantity?: string
  done?: boolean
}

interface LegacyProject {
  id: ID
  name: string
  code?: string
  summary?: string
  clientContactId?: ID
  companyId?: ID
  coverUrl?: string
  artSeed?: string
  stage?: string
  health?: string
  leadId?: ID
  memberIds?: ID[]
  startDate?: string
  dueDate?: string
  budget?: number
  spent?: number
  deliverables?: LegacyDeliverable[]
  tags?: ID[]
  brief?: Shoot['brief']
  dealId?: ID
  archived?: boolean
  createdAt?: string
}

interface LegacyDeal {
  id: ID
  name: string
  companyId?: ID
  contactId?: ID
  stageId?: ID
  value?: number
  probability?: number
  expectedCloseDate?: string
  ownerId?: ID
  projectId?: ID
  source?: string
  notes?: string
  tags?: ID[]
  createdAt?: string
  closedAt?: string
}

interface LegacyStage {
  id: ID
  name?: string
  order?: number
  kind?: string
}

interface LegacyDatabase extends Omit<Partial<Database>, 'pipeline'> {
  projects?: LegacyProject[]
  deals?: LegacyDeal[]
  pipeline?: LegacyStage[]
}

/* ---------------------------------------------------------------- helpers -- */

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * The old project stages map onto the new lifecycle one-for-one. A lost deal
 * overrides whatever its project said, because "lost" is the more specific
 * fact about the job.
 */
function resolveStage(project: LegacyProject | undefined, legacyKind: string | undefined): ID {
  if (legacyKind === 'lost') return 'st_lost'

  switch (project?.stage) {
    case 'discovery':
      return 'st_inquiry'
    case 'concept':
      return 'st_quoted'
    case 'production':
      return 'st_shot'
    case 'review':
      return 'st_edited'
    case 'delivery':
      return 'st_delivered'
    case 'complete':
      return 'st_wrapped'
    default:
      break
  }

  // Deal with no project: it was won if it closed, otherwise still in the sale.
  if (legacyKind === 'won') return 'st_deposit'
  return 'st_quoted'
}

/** Guess from the name, since the old model had no shoot type at all. */
function inferShootType(name: string): ShootType {
  const text = name.toLowerCase()
  if (/portrait|headshot|profile/.test(text)) return 'portrait'
  if (/event|launch|party|conference|wedding/.test(text)) return 'event'
  if (/product|packshot|still|catalogue|catalog/.test(text)) return 'product'
  if (/editorial|feature|story|magazine|issue/.test(text)) return 'editorial'
  return 'commercial'
}

/**
 * The old model held one number. Rather than invent a split across shoot fee,
 * post and licensing that was never entered, it becomes a single shoot-fee
 * line — accurate, and obviously in need of breaking up when next edited.
 */
function foldMoney(shootId: ID, deal?: LegacyDeal, project?: LegacyProject): LineItem[] {
  const value = deal?.value ?? project?.budget ?? 0
  if (!value) return []
  return [
    {
      id: `li_${shootId}_migrated`,
      kind: 'shoot-fee',
      desc: deal?.name || project?.name || 'Shoot fee',
      qty: 1,
      rate: value,
    },
  ]
}

function foldDeliverables(legacy: LegacyDeliverable[] | undefined): Deliverable[] {
  return (legacy ?? []).map((item) => {
    // "3 hero images" -> 3; "Full set" -> 1.
    const contracted = Number.parseInt(String(item.quantity ?? ''), 10) || 1
    return {
      id: item.id,
      name: item.name,
      contracted,
      delivered: item.done ? contracted : 0,
      revisionsIncluded: 2,
      revisionsUsed: 0,
    }
  })
}

/**
 * A project's start date is the closest thing the old model had to a shoot
 * day. Carried across so the calendar and call sheets have something real to
 * work from; anything already delivered is not marked tentative.
 */
function foldShootDates(shootId: ID, project: LegacyProject | undefined): ShootDate[] {
  if (!project?.startDate) return []
  return [
    {
      id: `sd_${shootId}_migrated`,
      date: project.startDate,
      tentative: false,
      outdoor: false,
    },
  ]
}

/* ------------------------------------------------------------- the migrate -- */

export function migrateToV4(persisted: unknown): Database {
  const state = (persisted ?? {}) as LegacyDatabase

  // Already migrated, or a fresh store: nothing to fold.
  if (!state.projects && !state.deals) return state as Database

  const projects = state.projects ?? []
  const deals = state.deals ?? []
  const legacyStages = state.pipeline ?? []
  const kindOf = (stageId?: ID) =>
    legacyStages.find((stage) => stage.id === stageId)?.kind

  /* Lead sources were free text on the deal. Distinct values become records so
     they can be reported on; the mapping keeps every shoot pointing at one. */
  const sourceIds = new Map<string, ID>()
  const leadSources: LeadSource[] = []
  for (const deal of deals) {
    const label = (deal.source ?? '').trim()
    if (!label || sourceIds.has(label.toLowerCase())) continue
    const id = `ls_${slug(label) || leadSources.length}`
    sourceIds.set(label.toLowerCase(), id)
    leadSources.push({
      id,
      label,
      category: /refer/i.test(label)
        ? 'referral'
        : /instagram|social|tiktok/i.test(label)
          ? 'social'
          : /agency/i.test(label)
            ? 'agency'
            : /repeat|existing/i.test(label)
              ? 'repeat'
              : 'direct',
      active: true,
    })
  }

  /* Old id -> new shoot id. A project keeps its own id (most records point at
     projects), and its deal's references are redirected onto it. */
  const shootIdOf = new Map<ID, ID>()
  const shoots: Shoot[] = []
  const claimedDeals = new Set<ID>()

  for (const project of projects) {
    const deal = deals.find(
      (candidate) => candidate.id === project.dealId || candidate.projectId === project.id,
    )
    if (deal) claimedDeals.add(deal.id)

    const id = project.id
    shootIdOf.set(project.id, id)
    if (deal) shootIdOf.set(deal.id, id)

    const legacyKind = kindOf(deal?.stageId)
    const sourceLabel = (deal?.source ?? '').trim().toLowerCase()

    shoots.push({
      id,
      name: project.name,
      code: project.code ?? '',
      summary: project.summary ?? '',
      contactId: project.clientContactId ?? deal?.contactId ?? '',
      companyId: project.companyId ?? deal?.companyId ?? '',
      coverUrl: project.coverUrl,
      artSeed: project.artSeed ?? project.id,
      stageId: resolveStage(project, legacyKind),
      health: (project.health as Shoot['health']) ?? 'on-track',
      shootType: inferShootType(project.name),
      ownerId: project.leadId ?? deal?.ownerId ?? '',
      memberIds: project.memberIds ?? [],

      leadSourceId: sourceLabel ? sourceIds.get(sourceLabel) : undefined,
      probability: deal?.probability ?? 0,
      inquiredAt: deal?.createdAt ?? project.createdAt ?? project.startDate ?? '',
      quotedAt: deal?.createdAt,

      lineItems: foldMoney(id, deal, project),
      depositPct: 50,
      expectedCloseDate: deal?.expectedCloseDate ?? project.dueDate ?? '',

      shootDates: foldShootDates(id, project),
      locationIds: [],
      talentIds: [],

      deliverables: foldDeliverables(project.deliverables),
      contractStatus: 'none',
      releaseStatus: 'none',

      tags: project.tags ?? [],
      brief: project.brief ?? {
        objective: '',
        audience: '',
        direction: '',
        constraints: '',
        successCriteria: [],
      },
      notes: deal?.notes ?? '',
      archived: project.archived ?? false,
      createdAt: project.createdAt ?? '',
      closedAt: deal?.closedAt,
    })
  }

  /* Deals that never became a project are leads. They are still jobs. */
  for (const deal of deals) {
    if (claimedDeals.has(deal.id)) continue
    const id = deal.id
    shootIdOf.set(deal.id, id)
    const legacyKind = kindOf(deal.stageId)
    const sourceLabel = (deal.source ?? '').trim().toLowerCase()

    shoots.push({
      id,
      name: deal.name,
      code: '',
      summary: '',
      contactId: deal.contactId ?? '',
      companyId: deal.companyId ?? '',
      artSeed: deal.id,
      stageId: resolveStage(undefined, legacyKind),
      health: 'on-track',
      shootType: inferShootType(deal.name),
      ownerId: deal.ownerId ?? '',
      memberIds: [],

      leadSourceId: sourceLabel ? sourceIds.get(sourceLabel) : undefined,
      probability: deal.probability ?? 0,
      inquiredAt: deal.createdAt ?? '',
      quotedAt: deal.createdAt,

      lineItems: foldMoney(id, deal),
      depositPct: 50,
      expectedCloseDate: deal.expectedCloseDate ?? '',

      shootDates: [],
      locationIds: [],
      talentIds: [],

      deliverables: [],
      contractStatus: 'none',
      releaseStatus: 'none',

      tags: deal.tags ?? [],
      brief: {
        objective: '',
        audience: '',
        direction: '',
        constraints: '',
        successCriteria: [],
      },
      notes: deal.notes ?? '',
      archived: false,
      createdAt: deal.createdAt ?? '',
      closedAt: deal.closedAt,
    })
  }

  const remap = (oldId?: ID): ID | undefined => (oldId ? shootIdOf.get(oldId) : undefined)

  /* ----------------------------------------------------- redirect references */

  const milestones = (state.milestones ?? []).map((milestone) => {
    const legacy = milestone as unknown as { projectId?: ID; shootId?: ID }
    return { ...milestone, shootId: remap(legacy.projectId ?? legacy.shootId) ?? '' }
  })

  const tasks = (state.tasks ?? []).map((task) => {
    const legacy = task as unknown as { projectId?: ID; dealId?: ID }
    const { projectId, dealId, ...rest } = { ...task, ...legacy }
    void projectId
    void dealId
    return { ...rest, shootId: remap(legacy.projectId ?? legacy.dealId) }
  })

  const moodboards = (state.moodboards ?? []).map((board) => {
    const legacy = board as unknown as { projectId?: ID; shootId?: ID }
    return { ...board, shootId: remap(legacy.projectId ?? legacy.shootId) ?? '' }
  })

  const assets = (state.assets ?? []).map((asset) => {
    const legacy = asset as unknown as { projectId?: ID; shootId?: ID }
    return {
      ...asset,
      shootId: remap(legacy.projectId ?? legacy.shootId) ?? '',
      // 'design' and 'copy' were design-studio kinds; a photo studio has neither.
      kind: (asset.kind as string) === 'design' || (asset.kind as string) === 'copy'
        ? 'photo'
        : asset.kind,
    }
  }) as Database['assets']

  const activity = (state.activity ?? []).map((event) => {
    const links = (event.links ?? {}) as {
      projectId?: ID
      dealId?: ID
      shootId?: ID
      [key: string]: unknown
    }
    const { projectId, dealId, ...keptLinks } = links
    const shootId = remap(projectId ?? dealId ?? links.shootId)
    return {
      ...event,
      // 'deal' is no longer an activity type; those entries were stage moves.
      type: (event.type as string) === 'deal' ? 'status' : event.type,
      links: shootId ? { ...keptLinks, shootId } : keptLinks,
    }
  }) as Database['activity']

  const comments = (state.comments ?? []).map((comment) =>
    (comment.targetType as string) === 'project'
      ? { ...comment, targetType: 'shoot' as const, targetId: remap(comment.targetId) ?? comment.targetId }
      : comment,
  )

  const savedViews = (state.savedViews ?? []).map((view) =>
    (view.scope as string) === 'projects' || (view.scope as string) === 'deals'
      ? { ...view, scope: 'shoots' as const }
      : view,
  )

  const customFields = (state.customFields ?? []).map((field) =>
    (field.entity as string) === 'project' || (field.entity as string) === 'deal'
      ? { ...field, entity: 'shoot' as const }
      : field,
  )

  /* ------------------------------------------------------------- settings */

  const legacySettings = (state.settings ?? {}) as Database['settings'] & {
    workspace?: Database['settings']['workspace'] & { billing?: unknown }
    notifications?: Record<string, unknown>
  }

  const settings: Database['settings'] = {
    ...legacySettings,
    notifications: {
      ...DEFAULT_NOTIFICATIONS,
      ...(legacySettings.notifications ?? {}),
      // Renamed when deals stopped existing.
      stageChanges: Boolean(
        legacySettings.notifications?.stageChanges ??
          legacySettings.notifications?.dealStageChanges ??
          true,
      ),
    } as Database['settings']['notifications'],
    workspace: {
      ...legacySettings.workspace,
      billing: {
        ...EMPTY_BILLING,
        ...((legacySettings.workspace?.billing as object) ?? {}),
      },
    } as Database['settings']['workspace'],
  }

  const { projects: _projects, deals: _deals, ...rest } = state
  void _projects
  void _deals

  return {
    ...(rest as unknown as Database),
    leadSources: state.leadSources ?? leadSources,
    shoots,
    milestones,
    tasks,
    licenses: state.licenses ?? [],
    invoices: state.invoices ?? [],
    // The old pipeline described a sale. The new one describes the whole job,
    // so it is replaced rather than extended — the stage ids changed anyway.
    pipeline: DEFAULT_PIPELINE,
    moodboards,
    assets,
    activity,
    comments,
    savedViews,
    customFields,
    settings,
  } as Database
}

/* ============================================================================
   v4 -> v5 — dark becomes the default theme

   Nothing recorded whether a saved 'light' was picked or merely inherited, and
   light was the default everywhere, so it is read as inherited. Picking a
   theme now sets themeChosen, which this and any later default change leave
   alone.
   ========================================================================== */

export function migrateToV5(state: Database): Database {
  const settings = state.settings
  if (!settings || settings.themeChosen || settings.theme !== 'light') return state
  return { ...state, settings: { ...settings, theme: 'dark' } }
}

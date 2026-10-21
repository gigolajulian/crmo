import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ActivityEvent,
  ActivityType,
  ApprovalStatus,
  Asset,
  AssetVersion,
  Comment,
  Company,
  Contact,
  Database,
  ID,
  Invoice,
  LeadSource,
  License,
  LineItem,
  Milestone,
  Moodboard,
  MoodItem,
  MoodSection,
  PipelineStage,
  SavedView,
  Settings,
  Shoot,
  Tag,
  Task,
  Workspace,
} from '@/data/types'
import { createEmptyDatabase, createSeedDatabase } from '@/data/seed'
import { arrayMove, toISODate, uid } from '@/lib/utils'
import { setMoneyFormat } from '@/lib/intl'
import { generatePortrait } from '@/lib/art'
import { migrateToV4, migrateToV5 } from './migrations'
import { EMPTY_BILLING } from '@/data/defaults'
import { isClosed } from '@/data/pipeline'

const STORAGE_KEY = 'crmo/v1'

/* ------------------------------------------------------------------------ */

type Actions = {
  /* shoots */
  addShoot: (draft: Partial<Shoot> & Pick<Shoot, 'name' | 'companyId' | 'contactId'>) => ID
  updateShoot: (id: ID, patch: Partial<Shoot>) => void
  deleteShoot: (id: ID) => void
  /** Move along the lifecycle. Handles probability and the closed date. */
  moveShoot: (id: ID, stageId: ID) => void
  addLineItem: (shootId: ID, draft?: Partial<LineItem>) => ID
  updateLineItem: (shootId: ID, itemId: ID, patch: Partial<LineItem>) => void
  deleteLineItem: (shootId: ID, itemId: ID) => void

  /* milestones */
  addMilestone: (milestone: Omit<Milestone, 'id'>) => ID
  updateMilestone: (id: ID, patch: Partial<Milestone>) => void
  deleteMilestone: (id: ID) => void

  /* contacts & companies */
  addContact: (draft: Partial<Contact> & Pick<Contact, 'name' | 'companyId'>) => ID
  updateContact: (id: ID, patch: Partial<Contact>) => void
  deleteContact: (id: ID) => void
  addCompany: (draft: Partial<Company> & Pick<Company, 'name'>) => ID
  updateCompany: (id: ID, patch: Partial<Company>) => void
  deleteCompany: (id: ID) => void

  /* licences, invoices & lead sources */
  addLicense: (draft: Partial<License> & Pick<License, 'shootId'>) => ID
  updateLicense: (id: ID, patch: Partial<License>) => void
  deleteLicense: (id: ID) => void

  addInvoice: (shootId: ID, kind: Invoice['kind']) => ID
  updateInvoice: (id: ID, patch: Partial<Invoice>) => void
  deleteInvoice: (id: ID) => void
  markInvoicePaid: (id: ID, paidAt?: string) => void

  addLeadSource: (label: string, category?: LeadSource['category']) => ID
  updateLeadSource: (id: ID, patch: Partial<LeadSource>) => void
  deleteLeadSource: (id: ID) => void

  /* tasks */
  addTask: (draft: Partial<Task> & Pick<Task, 'title'>) => ID
  updateTask: (id: ID, patch: Partial<Task>) => void
  toggleTask: (id: ID) => void
  deleteTask: (id: ID) => void
  bulkUpdateTasks: (ids: ID[], patch: Partial<Task>) => void

  /* moodboards */
  addMoodItem: (item: Omit<MoodItem, 'id' | 'order' | 'createdAt'> & { order?: number }) => ID
  updateMoodItem: (id: ID, patch: Partial<MoodItem>) => void
  deleteMoodItem: (id: ID) => void
  toggleMoodPin: (id: ID) => void
  reorderMoodItems: (sectionId: ID, activeId: ID, overId: ID) => void
  moveMoodItemToSection: (itemId: ID, sectionId: ID, index?: number) => void
  addMoodSection: (boardId: ID, title: string) => ID
  updateMoodSection: (id: ID, patch: Partial<MoodSection>) => void
  deleteMoodSection: (id: ID) => void
  ensureMoodboard: (shootId: ID) => ID
  updateMoodboard: (id: ID, patch: Partial<Moodboard>) => void

  /* assets, versions, approvals */
  addAssetVersion: (assetId: ID, draft: Partial<AssetVersion>) => ID
  addAsset: (draft: Omit<Asset, 'id' | 'currentVersionId' | 'createdAt'> & { versionUrl?: string }) => ID
  setVersionStatus: (versionId: ID, status: ApprovalStatus, decision?: string) => void
  addComment: (draft: Omit<Comment, 'id' | 'createdAt' | 'resolved'>) => ID
  toggleCommentResolved: (id: ID) => void
  deleteComment: (id: ID) => void

  /* activity */
  logActivity: (draft: Omit<ActivityEvent, 'id' | 'at'> & { at?: string }) => ID
  completeFollowUp: (id: ID) => void
  deleteActivity: (id: ID) => void

  /* settings & meta */
  updateSettings: (patch: Partial<Settings>) => void
  addTag: (label: string, tone?: Tag['tone']) => ID
  updateTag: (id: ID, patch: Partial<Tag>) => void
  deleteTag: (id: ID) => void
  updatePipelineStage: (id: ID, patch: Partial<PipelineStage>) => void
  addPipelineStage: (name: string) => ID
  deletePipelineStage: (id: ID) => void
  reorderPipeline: (activeId: ID, overId: ID) => void
  updateTeamMember: (id: ID, patch: Partial<Database['team'][number]>) => void
  addTeamMember: (name: string, role: string, email: string) => ID
  removeTeamMember: (id: ID) => void
  saveView: (view: Omit<SavedView, 'id'>) => ID
  deleteView: (id: ID) => void

  /* workspace setup */
  updateWorkspace: (patch: Partial<Workspace>) => void
  applySetup: (result: { pipeline: PipelineStage[]; tags: Tag[]; start: 'demo' | 'empty' }) => void
  completeSetup: (workspace: Partial<Workspace>, start: 'demo' | 'empty') => void

  resetDemoData: () => void
  clearDemoData: () => void
}

export type Store = Database & Actions

/* ------------------------------------------------------------------ helpers */

const nowISO = () => new Date().toISOString()
const today = () => toISODate(new Date())

/** Patch one record inside a collection, leaving the rest untouched. */
function patchIn<T extends { id: ID }>(list: T[], id: ID, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

/**
 * MMYY, the scheme the studio already uses — with a suffix once a month has
 * more than one invoice, so two in August cannot both be "0826".
 */
function nextInvoiceNumber(invoices: Invoice[], issuedAt: string): string {
  const [year, month] = issuedAt.split('-')
  const stem = `${month}${year.slice(2)}`
  const taken = invoices.filter((inv) => inv.number === stem || inv.number.startsWith(`${stem}-`))
  return taken.length === 0 ? stem : `${stem}-${taken.length + 1}`
}

/* -------------------------------------------------------------------- store */

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...createSeedDatabase(),

      /* ------------------------------------------------------------ shoots */

      addShoot: (draft) => {
        const id = uid('sh')
        const { pipeline, settings } = get()
        const stageId = draft.stageId ?? pipeline[0]?.id
        const stage = pipeline.find((p) => p.id === stageId)
        const shoot: Shoot = {
          id,
          name: draft.name,
          code: draft.code ?? `NEW-${get().shoots.length + 1}`,
          summary: draft.summary ?? '',
          contactId: draft.contactId,
          companyId: draft.companyId,
          coverUrl: draft.coverUrl,
          artSeed: draft.artSeed ?? `${draft.name}-${id}`,
          stageId,
          health: draft.health ?? 'on-track',
          shootType: draft.shootType ?? 'commercial',
          ownerId: draft.ownerId ?? settings.currentUserId,
          memberIds: draft.memberIds ?? [settings.currentUserId],

          leadSourceId: draft.leadSourceId,
          referredByContactId: draft.referredByContactId,
          probability: draft.probability ?? stage?.probability ?? 10,
          inquiredAt: draft.inquiredAt ?? today(),
          quotedAt: draft.quotedAt,

          lineItems: draft.lineItems ?? [],
          // The studio's usual split, so a new quote starts from the real terms.
          depositPct: draft.depositPct ?? settings.workspace.billing?.depositPct ?? 50,
          expectedCloseDate: draft.expectedCloseDate ?? today(),

          shootDates: draft.shootDates ?? [],
          locationIds: draft.locationIds ?? [],
          talentIds: draft.talentIds ?? [],

          deliverables: draft.deliverables ?? [],
          promisedTurnaroundDays: draft.promisedTurnaroundDays,
          galleryUrl: draft.galleryUrl,
          galleryExpiresAt: draft.galleryExpiresAt,
          catalogPath: draft.catalogPath,

          contractStatus: draft.contractStatus ?? 'none',
          releaseStatus: draft.releaseStatus ?? 'none',

          gmailThreadUrl: draft.gmailThreadUrl,
          tags: draft.tags ?? [],
          brief:
            draft.brief ??
            {
              objective: '',
              audience: '',
              direction: '',
              constraints: '',
              successCriteria: [],
            },
          notes: draft.notes ?? '',
          archived: false,
          createdAt: today(),
        }
        set((s) => ({ shoots: [shoot, ...s.shoots] }))
        get().ensureMoodboard(id)
        get().logActivity({
          type: 'update',
          subject: `Shoot created — ${shoot.name}`,
          actorId: settings.currentUserId,
          actorKind: 'team',
          links: { shootId: id, companyId: shoot.companyId, contactId: shoot.contactId },
        })
        return id
      },

      updateShoot: (id, patch) => set((s) => ({ shoots: patchIn(s.shoots, id, patch) })),

      deleteShoot: (id) =>
        set((s) => {
          const boardIds = s.moodboards.filter((b) => b.shootId === id).map((b) => b.id)
          const assetIds = s.assets.filter((a) => a.shootId === id).map((a) => a.id)
          return {
            shoots: s.shoots.filter((p) => p.id !== id),
            milestones: s.milestones.filter((m) => m.shootId !== id),
            tasks: s.tasks.filter((t) => t.shootId !== id),
            moodboards: s.moodboards.filter((b) => b.shootId !== id),
            moodSections: s.moodSections.filter((sec) => !boardIds.includes(sec.boardId)),
            moodItems: s.moodItems.filter((i) => !boardIds.includes(i.boardId)),
            assets: s.assets.filter((a) => a.shootId !== id),
            assetVersions: s.assetVersions.filter((v) => !assetIds.includes(v.assetId)),
            licenses: s.licenses.filter((l) => l.shootId !== id),
            invoices: s.invoices.filter((inv) => inv.shootId !== id),
            activity: s.activity.filter((a) => a.links.shootId !== id),
          }
        }),

      moveShoot: (id, stageId) => {
        const shoot = get().shoots.find((p) => p.id === id)
        const stage = get().pipeline.find((p) => p.id === stageId)
        if (!shoot || !stage || shoot.stageId === stageId) return

        set((s) => ({
          shoots: patchIn(s.shoots, id, {
            stageId,
            probability: stage.probability,
            closedAt: isClosed(stage.kind) ? today() : undefined,
            // Entering the quoted stage starts the follow-up clock.
            quotedAt: stage.kind === 'quoted' ? (shoot.quotedAt ?? today()) : shoot.quotedAt,
            deliveredAt:
              stage.kind === 'delivered' ? (shoot.deliveredAt ?? today()) : shoot.deliveredAt,
          }),
        }))
        get().logActivity({
          type: 'status',
          subject: `${shoot.name} moved to ${stage.name}`,
          actorId: get().settings.currentUserId,
          actorKind: 'team',
          links: { shootId: id, companyId: shoot.companyId, contactId: shoot.contactId },
        })
      },

      /* --------------------------------------------------------- line items */

      addLineItem: (shootId, draft) => {
        const id = uid('li')
        const item: LineItem = {
          id,
          kind: draft?.kind ?? 'shoot-fee',
          desc: draft?.desc ?? '',
          qty: draft?.qty ?? 1,
          rate: draft?.rate ?? 0,
        }
        set((s) => ({
          shoots: s.shoots.map((shoot) =>
            shoot.id === shootId ? { ...shoot, lineItems: [...shoot.lineItems, item] } : shoot,
          ),
        }))
        return id
      },

      updateLineItem: (shootId, itemId, patch) =>
        set((s) => ({
          shoots: s.shoots.map((shoot) =>
            shoot.id === shootId
              ? {
                  ...shoot,
                  lineItems: shoot.lineItems.map((item) =>
                    item.id === itemId ? { ...item, ...patch } : item,
                  ),
                }
              : shoot,
          ),
        })),

      deleteLineItem: (shootId, itemId) =>
        set((s) => ({
          shoots: s.shoots.map((shoot) =>
            shoot.id === shootId
              ? { ...shoot, lineItems: shoot.lineItems.filter((item) => item.id !== itemId) }
              : shoot,
          ),
        })),

      /* -------------------------------------------------------- milestones */

      addMilestone: (milestone) => {
        const id = uid('ms')
        set((s) => ({ milestones: [...s.milestones, { ...milestone, id }] }))
        return id
      },
      updateMilestone: (id, patch) =>
        set((s) => ({ milestones: patchIn(s.milestones, id, patch) })),
      deleteMilestone: (id) =>
        set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) })),

      /* -------------------------------------------------- contacts & orgs */

      addContact: (draft) => {
        const id = uid('ct')
        const contact: Contact = {
          id,
          name: draft.name,
          role: draft.role ?? '',
          companyId: draft.companyId,
          email: draft.email ?? '',
          phone: draft.phone ?? '',
          avatar: draft.avatar,
          tags: draft.tags ?? [],
          location: draft.location,
          creativePrefs: draft.creativePrefs ?? '',
          instagram: draft.instagram,
          notes: draft.notes ?? '',
          lastTouchedAt: today(),
          favourite: draft.favourite ?? false,
        }
        set((s) => ({ contacts: [contact, ...s.contacts] }))
        get().logActivity({
          type: 'note',
          subject: `Added ${contact.name}`,
          actorId: get().settings.currentUserId,
          actorKind: 'team',
          links: { contactId: id, companyId: contact.companyId },
        })
        return id
      },
      updateContact: (id, patch) => set((s) => ({ contacts: patchIn(s.contacts, id, patch) })),
      deleteContact: (id) =>
        set((s) => ({
          contacts: s.contacts.filter((c) => c.id !== id),
          tasks: s.tasks.map((t) => (t.contactId === id ? { ...t, contactId: undefined } : t)),
        })),

      addCompany: (draft) => {
        const id = uid('co')
        const company: Company = {
          id,
          name: draft.name,
          industry: draft.industry ?? '',
          website: draft.website ?? '',
          location: draft.location ?? '',
          size: draft.size ?? '',
          tags: draft.tags ?? [],
          notes: draft.notes ?? '',
          instagram: draft.instagram,
          artSeed: draft.artSeed ?? `${draft.name}-${id}`,
          since: today(),
        }
        set((s) => ({ companies: [company, ...s.companies] }))
        return id
      },
      updateCompany: (id, patch) => set((s) => ({ companies: patchIn(s.companies, id, patch) })),
      deleteCompany: (id) =>
        set((s) => ({
          companies: s.companies.filter((c) => c.id !== id),
          contacts: s.contacts.filter((c) => c.companyId !== id),
        })),

      /* --------------------------------------------------------- licences */

      addLicense: (draft) => {
        const id = uid('lc')
        const shoot = get().shoots.find((s) => s.id === draft.shootId)
        const license: License = {
          id,
          shootId: draft.shootId,
          companyId: draft.companyId ?? shoot?.companyId ?? '',
          name: draft.name ?? (shoot ? `${shoot.name} — usage` : 'Usage licence'),
          scope: draft.scope ?? '',
          media: draft.media ?? [],
          territory: draft.territory ?? '',
          startDate: draft.startDate ?? today(),
          endDate: draft.endDate ?? today(),
          fee: draft.fee ?? 0,
          exclusive: draft.exclusive ?? false,
          status: draft.status ?? 'active',
          assetIds: draft.assetIds ?? [],
          notes: draft.notes ?? '',
          createdAt: today(),
        }
        set((s) => ({ licenses: [license, ...s.licenses] }))
        get().logActivity({
          type: 'license',
          subject: `Licence created — ${license.name}`,
          actorId: get().settings.currentUserId,
          actorKind: 'team',
          links: { licenseId: id, shootId: license.shootId, companyId: license.companyId },
        })
        return id
      },
      updateLicense: (id, patch) => set((s) => ({ licenses: patchIn(s.licenses, id, patch) })),
      deleteLicense: (id) => set((s) => ({ licenses: s.licenses.filter((l) => l.id !== id) })),

      /* --------------------------------------------------------- invoices */

      addInvoice: (shootId, kind) => {
        const id = uid('in')
        const { shoots, invoices, settings } = get()
        const shoot = shoots.find((s) => s.id === shootId)
        const billing = settings.workspace.billing ?? EMPTY_BILLING

        /*
         * A deposit bills a percentage of the whole quote, so it is stored as a
         * single derived line rather than a share of each one — that is what the
         * client is actually agreeing to pay, and it keeps the document honest
         * when the quote is later revised.
         */
        const quoted = (shoot?.lineItems ?? []).reduce((sum, li) => sum + li.qty * li.rate, 0)
        const pct = shoot?.depositPct ?? billing.depositPct
        const paidAlready = invoices
          .filter((inv) => inv.shootId === shootId && inv.status !== 'void')
          .reduce(
            (sum, inv) => sum + inv.lineItems.reduce((n, li) => n + li.qty * li.rate, 0),
            0,
          )

        const lineItems: LineItem[] =
          kind === 'deposit'
            ? [
                {
                  id: uid('li'),
                  kind: 'shoot-fee',
                  desc: `Deposit — ${pct}% of agreed fee`,
                  qty: 1,
                  rate: Math.round(quoted * (pct / 100) * 100) / 100,
                },
              ]
            : kind === 'balance'
              ? [
                  {
                    id: uid('li'),
                    kind: 'shoot-fee',
                    desc: 'Balance due on delivery',
                    qty: 1,
                    rate: Math.round((quoted - paidAlready) * 100) / 100,
                  },
                ]
              : // A full invoice bills the quote itself, line for line.
                (shoot?.lineItems ?? []).map((li) => ({ ...li, id: uid('li') }))

        const issued = today()
        const due = new Date(issued)
        due.setDate(due.getDate() + billing.paymentTermsDays)

        const invoice: Invoice = {
          id,
          shootId,
          number: nextInvoiceNumber(invoices, issued),
          kind,
          lineItems,
          status: 'draft',
          issuedAt: issued,
          dueAt: toISODate(due),
          notes: billing.defaultNotes,
          signoff: billing.defaultSignoff,
          paper: 'light',
          createdAt: issued,
        }
        set((s) => ({ invoices: [invoice, ...s.invoices] }))
        get().logActivity({
          type: 'invoice',
          subject: `Invoice ${invoice.number} raised${shoot ? ` — ${shoot.name}` : ''}`,
          actorId: settings.currentUserId,
          actorKind: 'team',
          links: { invoiceId: id, shootId, companyId: shoot?.companyId },
        })
        return id
      },
      updateInvoice: (id, patch) => set((s) => ({ invoices: patchIn(s.invoices, id, patch) })),
      deleteInvoice: (id) => set((s) => ({ invoices: s.invoices.filter((i) => i.id !== id) })),

      markInvoicePaid: (id, paidAt) => {
        const invoice = get().invoices.find((i) => i.id === id)
        if (!invoice) return
        set((s) => ({
          invoices: patchIn(s.invoices, id, { status: 'paid', paidAt: paidAt ?? today() }),
        }))
        get().logActivity({
          type: 'invoice',
          subject: `Invoice ${invoice.number} paid`,
          actorId: get().settings.currentUserId,
          actorKind: 'team',
          links: { invoiceId: id, shootId: invoice.shootId },
        })
      },

      /* ----------------------------------------------------- lead sources */

      addLeadSource: (label, category) => {
        const id = uid('ls')
        set((s) => ({
          leadSources: [...s.leadSources, { id, label, category: category ?? 'other', active: true }],
        }))
        return id
      },
      updateLeadSource: (id, patch) =>
        set((s) => ({ leadSources: patchIn(s.leadSources, id, patch) })),
      deleteLeadSource: (id) =>
        set((s) => ({
          leadSources: s.leadSources.filter((l) => l.id !== id),
          // Never leave a shoot pointing at a source that no longer exists.
          shoots: s.shoots.map((shoot) =>
            shoot.leadSourceId === id ? { ...shoot, leadSourceId: undefined } : shoot,
          ),
        })),

      /* ------------------------------------------------------------ tasks */

      addTask: (draft) => {
        const id = uid('tk')
        const task: Task = {
          id,
          title: draft.title,
          detail: draft.detail,
          status: draft.status ?? 'todo',
          priority: draft.priority ?? 'normal',
          dueDate: draft.dueDate,
          assigneeId: draft.assigneeId ?? get().settings.currentUserId,
          shootId: draft.shootId,
          contactId: draft.contactId,
          reminderAt: draft.reminderAt,
          createdAt: today(),
        }
        set((s) => ({ tasks: [task, ...s.tasks] }))
        return id
      },
      updateTask: (id, patch) => set((s) => ({ tasks: patchIn(s.tasks, id, patch) })),
      toggleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id)
        if (!task) return
        const done = task.status !== 'done'
        set((s) => ({
          tasks: patchIn(s.tasks, id, {
            status: done ? 'done' : 'todo',
            completedAt: done ? nowISO() : undefined,
          }),
        }))
      },
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      bulkUpdateTasks: (ids, patch) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (ids.includes(t.id) ? { ...t, ...patch } : t)),
        })),

      /* ------------------------------------------------------- moodboards */

      ensureMoodboard: (shootId) => {
        const existing = get().moodboards.find((b) => b.shootId === shootId)
        if (existing) return existing.id
        const boardId = uid('mb')
        const shoot = get().shoots.find((p) => p.id === shootId)
        set((s) => ({
          moodboards: [
            ...s.moodboards,
            { id: boardId, shootId, title: shoot?.name ?? 'Moodboard', updatedAt: nowISO() },
          ],
          moodSections: [
            ...s.moodSections,
            { id: uid('sec'), boardId, title: 'References', order: 0 },
          ],
        }))
        return boardId
      },

      updateMoodboard: (id, patch) =>
        set((s) => ({
          moodboards: patchIn(s.moodboards, id, { ...patch, updatedAt: nowISO() }),
        })),

      addMoodItem: (item) => {
        const id = uid('mi')
        const siblings = get().moodItems.filter((i) => i.sectionId === item.sectionId)
        set((s) => ({
          moodItems: [
            ...s.moodItems,
            {
              ...item,
              id,
              order: item.order ?? siblings.length,
              createdAt: nowISO(),
            } as MoodItem,
          ],
          moodboards: patchIn(s.moodboards, item.boardId, { updatedAt: nowISO() }),
        }))
        return id
      },
      updateMoodItem: (id, patch) =>
        set((s) => ({ moodItems: patchIn(s.moodItems, id, patch) })),
      deleteMoodItem: (id) => set((s) => ({ moodItems: s.moodItems.filter((i) => i.id !== id) })),
      toggleMoodPin: (id) => {
        const item = get().moodItems.find((i) => i.id === id)
        if (!item) return
        set((s) => ({ moodItems: patchIn(s.moodItems, id, { pinned: !item.pinned }) }))
      },

      reorderMoodItems: (sectionId, activeId, overId) =>
        set((s) => {
          const inSection = s.moodItems
            .filter((i) => i.sectionId === sectionId)
            .sort((a, b) => a.order - b.order)
          const from = inSection.findIndex((i) => i.id === activeId)
          const to = inSection.findIndex((i) => i.id === overId)
          if (from === -1 || to === -1) return {}
          const reordered = arrayMove(inSection, from, to)
          const orderById = new Map(reordered.map((item, index) => [item.id, index]))
          return {
            moodItems: s.moodItems.map((item) =>
              orderById.has(item.id) ? { ...item, order: orderById.get(item.id)! } : item,
            ),
          }
        }),

      moveMoodItemToSection: (itemId, sectionId, index) =>
        set((s) => {
          const item = s.moodItems.find((i) => i.id === itemId)
          if (!item || item.sectionId === sectionId) return {}
          const target = s.moodItems
            .filter((i) => i.sectionId === sectionId)
            .sort((a, b) => a.order - b.order)
          const at = index ?? target.length
          const moved = { ...item, sectionId, order: at }
          const shifted = s.moodItems.map((i) => {
            if (i.id === itemId) return moved
            if (i.sectionId === sectionId && i.order >= at) return { ...i, order: i.order + 1 }
            if (i.sectionId === item.sectionId && i.order > item.order)
              return { ...i, order: i.order - 1 }
            return i
          })
          return { moodItems: shifted }
        }),

      addMoodSection: (boardId, title) => {
        const id = uid('sec')
        const count = get().moodSections.filter((s) => s.boardId === boardId).length
        set((s) => ({
          moodSections: [...s.moodSections, { id, boardId, title, order: count }],
        }))
        return id
      },
      updateMoodSection: (id, patch) =>
        set((s) => ({ moodSections: patchIn(s.moodSections, id, patch) })),
      deleteMoodSection: (id) =>
        set((s) => ({
          moodSections: s.moodSections.filter((sec) => sec.id !== id),
          moodItems: s.moodItems.filter((i) => i.sectionId !== id),
        })),

      /* ------------------------------------------- assets and approvals */

      addAsset: (draft) => {
        const assetId = uid('as')
        const versionId = uid('av')
        set((s) => ({
          assets: [
            {
              id: assetId,
              shootId: draft.shootId,
              name: draft.name,
              kind: draft.kind,
              currentVersionId: versionId,
              createdAt: today(),
            },
            ...s.assets,
          ],
          assetVersions: [
            ...s.assetVersions,
            {
              id: versionId,
              assetId,
              label: 'v1',
              url: draft.versionUrl,
              artSeed: `${draft.name}-1`,
              ratio: 4 / 3,
              uploadedById: get().settings.currentUserId,
              createdAt: nowISO(),
              status: 'draft',
            },
          ],
        }))
        return assetId
      },

      addAssetVersion: (assetId, draft) => {
        const id = uid('av')
        const count = get().assetVersions.filter((v) => v.assetId === assetId).length
        const version: AssetVersion = {
          id,
          assetId,
          label: draft.label ?? `v${count + 1}`,
          url: draft.url,
          artSeed: draft.artSeed ?? `${assetId}-${count + 1}`,
          ratio: draft.ratio ?? 4 / 3,
          uploadedById: draft.uploadedById ?? get().settings.currentUserId,
          createdAt: nowISO(),
          status: draft.status ?? 'draft',
          notes: draft.notes,
        }
        set((s) => ({
          assetVersions: [...s.assetVersions, version],
          assets: patchIn(s.assets, assetId, { currentVersionId: id }),
        }))
        return id
      },

      setVersionStatus: (versionId, status, decision) => {
        const version = get().assetVersions.find((v) => v.id === versionId)
        if (!version) return
        const asset = get().assets.find((a) => a.id === version.assetId)
        const decided = status === 'approved' || status === 'changes-requested'
        set((s) => ({
          assetVersions: patchIn(s.assetVersions, versionId, {
            status,
            decision: decision ?? version.decision,
            decidedById: decided ? s.settings.currentUserId : undefined,
            decidedAt: decided ? nowISO() : undefined,
          }),
        }))
        const label =
          status === 'approved'
            ? 'approved'
            : status === 'changes-requested'
              ? 'changes requested on'
              : status === 'pending'
                ? 'sent for review —'
                : 'returned to draft —'
        get().logActivity({
          type: 'approval',
          subject: `${asset?.name ?? 'Asset'} ${version.label} ${label}`,
          body: decision,
          actorId: get().settings.currentUserId,
          actorKind: 'team',
          links: { shootId: asset?.shootId, assetVersionId: versionId },
        })
      },

      addComment: (draft) => {
        const id = uid('cm')
        set((s) => ({
          comments: [...s.comments, { ...draft, id, createdAt: nowISO(), resolved: false }],
        }))
        return id
      },
      toggleCommentResolved: (id) => {
        const comment = get().comments.find((c) => c.id === id)
        if (!comment) return
        set((s) => ({ comments: patchIn(s.comments, id, { resolved: !comment.resolved }) }))
      },
      deleteComment: (id) => set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),

      /* --------------------------------------------------------- activity */

      logActivity: (draft) => {
        const id = uid('ac')
        const event: ActivityEvent = {
          id,
          at: draft.at ?? nowISO(),
          type: draft.type as ActivityType,
          subject: draft.subject,
          body: draft.body,
          actorId: draft.actorId,
          actorKind: draft.actorKind,
          direction: draft.direction,
          links: draft.links,
          followUpAt: draft.followUpAt,
          followUpDone: draft.followUpDone,
        }
        set((s) => ({ activity: [event, ...s.activity] }))

        // Logging a touch against a contact keeps "last contacted" honest.
        if (draft.links.contactId) {
          set((s) => ({
            contacts: patchIn(s.contacts, draft.links.contactId!, { lastTouchedAt: today() }),
          }))
        }
        return id
      },
      completeFollowUp: (id) =>
        set((s) => ({ activity: patchIn(s.activity, id, { followUpDone: true }) })),
      deleteActivity: (id) => set((s) => ({ activity: s.activity.filter((a) => a.id !== id) })),

      /* --------------------------------------------------------- settings */

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addTag: (label, tone = 'neutral') => {
        const id = uid('tag')
        set((s) => ({ tags: [...s.tags, { id, label, tone }] }))
        return id
      },
      updateTag: (id, patch) => set((s) => ({ tags: patchIn(s.tags, id, patch) })),
      deleteTag: (id) =>
        set((s) => ({
          tags: s.tags.filter((t) => t.id !== id),
          shoots: s.shoots.map((p) => ({ ...p, tags: p.tags.filter((t) => t !== id) })),
          contacts: s.contacts.map((c) => ({ ...c, tags: c.tags.filter((t) => t !== id) })),
          companies: s.companies.map((c) => ({ ...c, tags: c.tags.filter((t) => t !== id) })),
        })),

      updatePipelineStage: (id, patch) =>
        set((s) => ({ pipeline: patchIn(s.pipeline, id, patch) })),
      addPipelineStage: (name) => {
        const id = uid('ps')
        const liveStages = get().pipeline.filter((p) => !isClosed(p.kind))
        const order = liveStages.length
        set((s) => ({
          pipeline: [
            ...liveStages,
            { id, name, order, probability: 50, kind: 'production' as const },
            ...s.pipeline.filter((p) => isClosed(p.kind)).map((p) => ({ ...p, order: p.order + 1 })),
          ],
        }))
        return id
      },
      deletePipelineStage: (id) => {
        const remaining = get().pipeline.filter((p) => p.id !== id && !isClosed(p.kind))
        const fallback = remaining[0]?.id
        if (!fallback) return
        set((s) => ({
          pipeline: s.pipeline.filter((p) => p.id !== id),
          shoots: s.shoots.map((d) => (d.stageId === id ? { ...d, stageId: fallback } : d)),
        }))
      },
      reorderPipeline: (activeId, overId) =>
        set((s) => {
          const live = s.pipeline.filter((p) => !isClosed(p.kind)).sort((a, b) => a.order - b.order)
          const from = live.findIndex((p) => p.id === activeId)
          const to = live.findIndex((p) => p.id === overId)
          if (from === -1 || to === -1) return {}
          const reordered = arrayMove(live, from, to).map((p, index) => ({ ...p, order: index }))
          const closed = s.pipeline
            .filter((p) => isClosed(p.kind))
            .map((p, index) => ({ ...p, order: reordered.length + index }))
          return { pipeline: [...reordered, ...closed] }
        }),

      updateTeamMember: (id, patch) => set((s) => ({ team: patchIn(s.team, id, patch) })),
      addTeamMember: (name, role, email) => {
        const id = uid('tm')
        set((s) => ({
          team: [
            ...s.team,
            { id, name, role, email, permissionRole: 'member', capacity: 40, active: true },
          ],
        }))
        return id
      },
      removeTeamMember: (id) =>
        set((s) => ({ team: s.team.map((m) => (m.id === id ? { ...m, active: false } : m)) })),

      saveView: (view) => {
        const id = uid('sv')
        set((s) => ({ savedViews: [...s.savedViews, { ...view, id }] }))
        return id
      },
      deleteView: (id) => set((s) => ({ savedViews: s.savedViews.filter((v) => v.id !== id) })),

      /* -------------------------------------------------------- workspace */

      updateWorkspace: (patch) =>
        set((s) => ({
          settings: { ...s.settings, workspace: { ...s.settings.workspace, ...patch } },
        })),

      completeSetup: (patch, start) => {
        const workspace = { ...get().settings.workspace, ...patch, onboarded: true }

        if (start === 'empty') {
          // The theme was chosen in the same flow; an empty workspace must not
          // fall back to the seed's.
          const { theme, themeChosen } = get().settings
          const empty = createEmptyDatabase(workspace)
          set({ ...empty, settings: { ...empty.settings, theme, themeChosen } })
          return
        }

        /*
         * Asking for the demo studio when the store has been emptied — by a
         * failed first sign-in, or a reset — has to rebuild it. Renaming the
         * owner inside an empty roster would otherwise produce a workspace
         * with nothing in it and no team member to be.
         */
        const base = get().team.length === 0 ? createSeedDatabase() : null

        set((s) => {
          const team = base?.team ?? s.team
          const currentUserId = base ? base.settings.currentUserId : s.settings.currentUserId

          return {
            ...(base ?? {}),
            // Rename the owner's own record so the studio reads as theirs
            // rather than as somebody else's.
            team: team.map((m) =>
              m.id === currentUserId
                ? {
                    ...m,
                    name: workspace.ownerName || m.name,
                    role: workspace.ownerRole || m.role,
                    email: workspace.ownerEmail || m.email,
                    // Their own picture, or none — never the demo character's
                    // stock portrait standing in for a real person.
                    avatar: workspace.ownerAvatar,
                  }
                : m,
            ),
            settings: { ...s.settings, currentUserId, workspace },
          }
        })
      },


      /**
       * Apply the structural answers from setup: the pipeline the studio
       * actually sells through, and the services it sells. Starting empty means
       * these replace the defaults outright; starting from the demo keeps the
       * seeded stages, because the demo shoots are already sitting in them.
       */
      applySetup: (result) =>
        set((s) => {
          if (result.start === 'demo') {
            // Merge the chosen services in without dropping the demo's own tags.
            const existing = new Set(s.tags.map((t) => t.label.toLowerCase()))
            const added = result.tags.filter((t) => !existing.has(t.label.toLowerCase()))
            return { tags: [...s.tags, ...added] }
          }
          return {
            pipeline: result.pipeline,
            tags: result.tags.length > 0 ? result.tags : s.tags,
          }
        }),


      /**
       * Empty the workspace of records without touching how it is configured.
       *
       * Keeps the studio identity, your own profile, the pipeline you chose,
       * your tags and custom fields — the answers you gave at setup. Removes
       * the demo clients, work, moodboards, approvals and history, and anyone
       * on the roster who is not you. Connected mode syncs the deletions.
       */
      clearDemoData: () =>
        set((s) => {
          const me =
            s.team.find((m) => m.id === s.settings.currentUserId) ?? s.team[0]

          return {
            team: me ? [me] : [],
            companies: [],
            contacts: [],
            leadSources: [],
            shoots: [],
            milestones: [],
            tasks: [],
            licenses: [],
            invoices: [],
            moodboards: [],
            moodSections: [],
            moodItems: [],
            assets: [],
            assetVersions: [],
            comments: [],
            activity: [],
            savedViews: [],
          }
        }),

      resetDemoData: () => {
        const fresh = createSeedDatabase()
        // Theme and workspace identity are preferences, not demo data.
        const { theme, themeChosen, workspace } = get().settings
        set({
          ...fresh,
          settings: { ...fresh.settings, theme, themeChosen, workspace },
        })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      // Actions are recreated on every load; only the data is persisted.
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([, value]) => typeof value !== 'function'),
        ) as Database,

      /*
       * The default merge is shallow, so a `settings` object saved before a
       * field existed replaces the whole thing and silently drops it — which
       * blanked the app when settings.workspace went missing. Nested objects
       * are merged over their current defaults so an old snapshot can only ever
       * be missing values, never structure.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Database>
        const savedSettings = saved.settings as Partial<Settings> | undefined

        return {
          ...current,
          ...saved,
          settings: {
            ...current.settings,
            ...savedSettings,
            notifications: {
              ...current.settings.notifications,
              ...(savedSettings?.notifications ?? {}),
            },
            workspace: {
              ...current.settings.workspace,
              ...(savedSettings?.workspace ?? {}),
              billing: {
                ...current.settings.workspace.billing,
                ...(savedSettings?.workspace?.billing ?? {}),
              },
            },
          },
        }
      },

      /*
       * Migrations run in sequence from whatever version was saved, because a
       * workspace that has been sitting on v2 must arrive at v4 by the same
       * route as everyone else.
       *
       * v3 removes the third-party avatar service. Anyone still holding one of
       * its URLs gets a locally drawn portrait instead — except the signed-in
       * user, who is cleared to initials, because inheriting a demo character's
       * face as your own was never right and a real upload should replace it.
       *
       * v4 folds deals and projects into shoots. See store/migrations.ts.
       *
       * v5 makes dark the default. Light was the only default before, so a
       * saved 'light' without themeChosen is the old default, not a choice.
       */
      migrate: (persisted, version) => {
        let state = persisted as Database | undefined
        if (!state?.team) return state as Database

        if (version < 3) {
          const isService = (url?: string) => Boolean(url && url.includes('pravatar.cc'))
          const meId = state.settings?.currentUserId

          state = {
            ...state,
            team: state.team.map((member) =>
              isService(member.avatar)
                ? { ...member, avatar: member.id === meId ? undefined : generatePortrait(member.id) }
                : member,
            ),
            contacts: (state.contacts ?? []).map((contact) =>
              isService(contact.avatar)
                ? { ...contact, avatar: generatePortrait(contact.id) }
                : contact,
            ),
          }
        }

        if (version < 4) state = migrateToV4(state)
        if (version < 5) state = migrateToV5(state)

        return state as Database
      },
    },
  ),
)

/* ----------------------------------------------------------------- intl -- */

// Currency and locale are read from render paths all over the app, so the
// formatters keep a module-level copy rather than every call site taking a hook.
function syncMoneyFormat(state: Store) {
  // Runs at module scope, where a throw is unrecoverable and blanks the page.
  // Optional chaining keeps a malformed store a formatting problem, not a crash.
  setMoneyFormat(state.settings?.workspace?.currency, state.settings?.workspace?.locale)
}
syncMoneyFormat(useStore.getState())
useStore.subscribe(syncMoneyFormat)

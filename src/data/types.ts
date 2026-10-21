/* ============================================================================
   CRMO — DOMAIN MODEL

   A photography business. One Shoot record carries a job from first inquiry
   through quote, deposit, shoot day, edit, delivery and on into the licence
   term — because that is one job, not two.

   Records reference each other by id only. Every derived figure (totals,
   balance due, health, workload) is computed in store/selectors.ts, never
   stored, so a quote edit can never desync from what was invoiced.
   ========================================================================== */

export type ID = string
/** ISO date (YYYY-MM-DD) or full ISO datetime. */
export type ISODate = string

/* ------------------------------------------------------------- people --- */

export type PermissionRole = 'owner' | 'admin' | 'member' | 'guest'

export interface TeamMember {
  id: ID
  name: string
  role: string
  permissionRole: PermissionRole
  email: string
  avatar?: string
  /** Weekly capacity in hours — drives the workload report. */
  capacity: number
  active: boolean
}

export interface Contact {
  id: ID
  name: string
  role: string
  companyId: ID
  email: string
  phone: string
  avatar?: string
  tags: ID[]
  location?: string
  /** How this client likes to work — surfaced on the profile and in briefs. */
  creativePrefs: string
  notes: string
  lastTouchedAt: ISODate
  favourite: boolean
  /** Handle only, never a URL — see components/common/InstagramField. */
  instagram?: string
  /** Pasted Gmail thread permalink. No OAuth — see README. */
  gmailThreadUrl?: string
}

export interface Company {
  id: ID
  name: string
  industry: string
  website: string
  location: string
  size: string
  tags: ID[]
  notes: string
  instagram?: string
  /** Seed for the generated identity mark. */
  artSeed: string
  since: ISODate
}

/* ------------------------------------------------------ lead sourcing --- */

/** Where work comes from. Structured rather than free text so it can be reported on. */
export interface LeadSource {
  id: ID
  label: string
  category: 'referral' | 'direct' | 'social' | 'agency' | 'repeat' | 'other'
  active: boolean
}

/* ------------------------------------------------------------- shoots --- */

export type ShootType = 'editorial' | 'event' | 'portrait' | 'commercial' | 'product'

export type ShootHealth = 'on-track' | 'at-risk' | 'blocked'

/** Contract and model-release progress. The signed file lives on an Asset. */
export type PaperworkStatus = 'none' | 'sent' | 'signed' | 'not-required'

/**
 * A priced line on a quote or invoice. `kind` is what makes revenue
 * reportable by type — licensing income is the number worth watching.
 */
export type LineItemKind = 'shoot-fee' | 'post' | 'licensing' | 'studio'

export interface LineItem {
  id: ID
  kind: LineItemKind
  desc: string
  qty: number
  rate: number
}

/** A day on the calendar. A shoot can span several. */
export interface ShootDate {
  id: ID
  date: ISODate
  /** Local times, HH:MM. */
  callTime?: string
  wrapTime?: string
  /** A hold that is not yet confirmed — shown dashed on the calendar. */
  tentative: boolean
  /** Outdoor days get sunset and weather; indoor ones do not. */
  outdoor: boolean
  locationId?: ID
  note?: string
}

export interface Brief {
  objective: string
  audience: string
  direction: string
  constraints: string
  successCriteria: string[]
}

/**
 * What was contracted versus what has actually gone out, and how many of the
 * included revision rounds have been used. Both halves matter: the first is
 * whether the job is done, the second is whether it is still profitable.
 */
export interface Deliverable {
  id: ID
  name: string
  contracted: number
  delivered: number
  revisionsIncluded: number
  revisionsUsed: number
}

export interface Shoot {
  id: ID
  name: string
  /** Short code shown on cards and in search, e.g. "MRW-01". */
  code: string
  summary: string
  contactId: ID
  companyId: ID
  coverUrl?: string
  artSeed: string
  /** Position in the full lifecycle. Stages are user-editable. */
  stageId: ID
  health: ShootHealth
  shootType: ShootType
  ownerId: ID
  memberIds: ID[]

  /* sales */
  leadSourceId?: ID
  /** Set when the lead came from a person rather than a channel. */
  referredByContactId?: ID
  probability: number
  inquiredAt: ISODate
  quotedAt?: ISODate

  /* money — totals are derived, never stored */
  lineItems: LineItem[]
  /** Percentage taken up front, 0–100. */
  depositPct: number
  expectedCloseDate: ISODate

  /* schedule */
  shootDates: ShootDate[]
  locationIds: ID[]
  talentIds: ID[]

  /* production */
  deliverables: Deliverable[]
  promisedTurnaroundDays?: number
  deliveredAt?: ISODate
  galleryUrl?: string
  galleryExpiresAt?: ISODate
  /** Where the catalog lives on disk, so it can be found a year later. */
  catalogPath?: string

  /* paperwork */
  contractStatus: PaperworkStatus
  releaseStatus: PaperworkStatus
  contractAssetId?: ID
  releaseAssetId?: ID

  gmailThreadUrl?: string
  tags: ID[]
  brief: Brief
  notes: string
  archived: boolean
  createdAt: ISODate
  /** Set when the shoot enters a won/lost stage. */
  closedAt?: ISODate
}

export type MilestoneStatus = 'upcoming' | 'in-progress' | 'done' | 'missed'

export interface Milestone {
  id: ID
  shootId: ID
  name: string
  date: ISODate
  status: MilestoneStatus
  note?: string
}

/* ------------------------------------------------------------ licences --- */

export type LicenseStatus = 'active' | 'expiring' | 'expired' | 'renewed' | 'lapsed'

/**
 * Usage rights sold on a shoot. The end date is the point of the record —
 * an expiring licence is renewal revenue that would otherwise walk away.
 */
export interface License {
  id: ID
  shootId: ID
  companyId: ID
  name: string
  /** Plain-language scope, e.g. "Web and paid social, North America". */
  scope: string
  media: string[]
  territory: string
  startDate: ISODate
  endDate: ISODate
  fee: number
  exclusive: boolean
  status: LicenseStatus
  assetIds: ID[]
  notes: string
  createdAt: ISODate
}

/* ------------------------------------------------------------ invoices --- */

export type InvoiceKind = 'deposit' | 'balance' | 'full'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

/**
 * A document, not a view onto the shoot. `lineItems` is a snapshot taken when
 * the invoice is raised — editing the quote afterwards must never rewrite an
 * invoice that has already gone out.
 */
export interface Invoice {
  id: ID
  shootId: ID
  /** MMYY, with a sequence suffix when a month has more than one. */
  number: string
  kind: InvoiceKind
  lineItems: LineItem[]
  status: InvoiceStatus
  issuedAt?: ISODate
  dueAt?: ISODate
  paidAt?: ISODate
  notes: string
  signoff: string
  /** Which of the two paper treatments the document was drawn on. */
  paper: 'light' | 'inverted'
  createdAt: ISODate
}

/* -------------------------------------------------------------- tasks --- */

export type TaskStatus = 'todo' | 'in-progress' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Task {
  id: ID
  title: string
  detail?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: ISODate
  assigneeId?: ID
  shootId?: ID
  contactId?: ID
  /** A reminder is a follow-up nudge, shown on the dashboard. */
  reminderAt?: ISODate
  createdAt: ISODate
  completedAt?: ISODate
}

/* --------------------------------------------------------- lifecycle --- */

/**
 * What a stage *means*, so selectors never have to match on its name. The
 * stages themselves are user-editable; these kinds are what the app reasons
 * about — whether to count the money, show it on the board, chase a reply.
 */
export type StageKind =
  | 'lead'
  | 'quoted'
  | 'booked'
  | 'production'
  | 'delivered'
  | 'licensing'
  | 'won'
  | 'lost'

export interface PipelineStage {
  id: ID
  name: string
  order: number
  /** Default win probability applied to shoots entering this stage. */
  probability: number
  kind: StageKind
}

/* --------------------------------------------------------- moodboards --- */

export type MoodItemKind = 'image' | 'shot' | 'link' | 'color' | 'type' | 'material' | 'note'

export interface MoodPayloadImage {
  url?: string
  artSeed: string
  /** Aspect ratio, drives the masonry row span. */
  ratio: number
  credit?: string
  /** The page this was pulled from — a Cosmos cluster, usually. */
  sourceUrl?: string
}
export interface MoodPayloadLink {
  url: string
  title: string
  site: string
}
export interface MoodPayloadColor {
  hex: string
  name: string
}
export interface MoodPayloadType {
  family: string
  /** CSS font stack used to actually render the specimen. */
  stack: string
  weight: number
  sample: string
  usage: string
}
export interface MoodPayloadNote {
  body: string
}

export type MoodPayload =
  | ({ kind: 'image' | 'shot' | 'material' } & MoodPayloadImage)
  | ({ kind: 'link' } & MoodPayloadLink)
  | ({ kind: 'color' } & MoodPayloadColor)
  | ({ kind: 'type' } & MoodPayloadType)
  | ({ kind: 'note' } & MoodPayloadNote)

export interface MoodItem {
  id: ID
  boardId: ID
  sectionId: ID
  order: number
  kind: MoodItemKind
  payload: MoodPayload
  caption: string
  tags: ID[]
  note?: string
  pinned: boolean
  addedBy: ID
  createdAt: ISODate
}

export interface MoodSection {
  id: ID
  boardId: ID
  title: string
  description?: string
  order: number
}

export interface Moodboard {
  id: ID
  shootId: ID
  title: string
  updatedAt: ISODate
  /** A linked cosmos.so cluster. Validated to that host — see CosmosPanel. */
  cosmosUrl?: string
  /** What to call it on screen; Cosmos will not tell us, so the user does. */
  cosmosTitle?: string
}

/* ------------------------------------------------ assets & approvals --- */

export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'changes-requested'

export interface AssetVersion {
  id: ID
  assetId: ID
  label: string
  url?: string
  artSeed: string
  ratio: number
  uploadedById: ID
  createdAt: ISODate
  status: ApprovalStatus
  /** Free-text summary of the decision, shown in the audit trail. */
  decision?: string
  decidedById?: ID
  decidedAt?: ISODate
  notes?: string
}

export interface Asset {
  id: ID
  shootId: ID
  name: string
  kind: 'photo' | 'video' | 'document' | 'contract' | 'release'
  currentVersionId: ID
  createdAt: ISODate
}

export type CommentTarget = 'assetVersion' | 'shoot' | 'moodItem'

export interface Comment {
  id: ID
  targetType: CommentTarget
  targetId: ID
  authorId: ID
  /** Client-side reviewers are contacts; internal reviewers are team members. */
  authorKind: 'team' | 'client'
  body: string
  createdAt: ISODate
  resolved: boolean
  /** Normalised 0–1 position, for a pin dropped on the artwork. */
  pin?: { x: number; y: number }
}

/* ----------------------------------------------------------- activity --- */

export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'status'
  | 'update'
  | 'approval'
  | 'task'
  | 'invoice'
  | 'license'

export interface ActivityEvent {
  id: ID
  type: ActivityType
  subject: string
  body?: string
  actorId: ID
  actorKind: 'team' | 'client' | 'system'
  at: ISODate
  /** Direction for communication types. */
  direction?: 'inbound' | 'outbound'
  links: {
    shootId?: ID
    contactId?: ID
    companyId?: ID
    taskId?: ID
    assetVersionId?: ID
    invoiceId?: ID
    licenseId?: ID
  }
  /** A pasted Gmail permalink, when this entry records an email exchange. */
  threadUrl?: string
  /** Follow-ups appear on the dashboard until cleared. */
  followUpAt?: ISODate
  followUpDone?: boolean
}

/* ----------------------------------------------------------- settings --- */

export interface Tag {
  id: ID
  label: string
  /** One of the named swatch keys, so tags stay inside the palette. */
  tone: 'neutral' | 'lime' | 'positive' | 'caution' | 'critical' | 'info'
}

export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'checkbox'

export interface CustomField {
  id: ID
  label: string
  type: CustomFieldType
  entity: 'shoot' | 'contact' | 'company'
  options?: string[]
  required: boolean
}

export interface NotificationPrefs {
  approvalRequests: boolean
  taskAssignments: boolean
  stageChanges: boolean
  milestoneReminders: boolean
  clientReplies: boolean
  licenceExpiry: boolean
  weeklyDigest: boolean
  channel: 'email' | 'in-app' | 'both'
}

export interface SavedView {
  id: ID
  scope: 'shoots' | 'contacts' | 'tasks' | 'invoices' | 'licenses'
  name: string
  filters: Record<string, string[] | string>
  sort?: string
  layout?: string
}

/** The five accent presets. Each is a background colour that carries ink text. */
export type Accent = 'lime' | 'amber' | 'coral' | 'sky' | 'iris'

/**
 * Billing identity — everything the document engine needs to letterhead an
 * invoice. Entered once here rather than retyped per document.
 */
export interface BillingProfile {
  businessName: string
  addressLines: string[]
  email: string
  phone: string
  /** Tax id as it should print, e.g. "EIN #: 00-0000000". */
  taxId: string
  /** Square PNG/SVG data URL used as the document mark. */
  logoDataUrl?: string
  defaultNotes: string
  defaultSignoff: string
  /** Default deposit percentage applied to a new shoot. */
  depositPct: number
  /** Days from issue to due on a new invoice. */
  paymentTermsDays: number
}

/**
 * The workspace's own identity, set during setup and editable in Settings.
 */
export interface Workspace {
  /** Studio name, shown in the nav, settings and page copy. */
  name: string
  tagline: string
  /** The person using the app. Maps onto their TeamMember record. */
  ownerName: string
  ownerRole: string
  ownerEmail: string
  /** Small square data URL. Undefined means tinted initials. */
  ownerAvatar?: string
  accent: Accent
  currency: string
  locale: string
  /** Home base, used for sunset times when a shoot has no location of its own. */
  latitude?: number
  longitude?: number
  billing: BillingProfile
  /** False until setup has been completed once. */
  onboarded: boolean
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  /** True once someone has picked a theme, so a new default never overrides it. */
  themeChosen?: boolean
  density: 'comfortable' | 'compact'
  notifications: NotificationPrefs
  currentUserId: ID
  workspace: Workspace
}

/* ------------------------------------------------------- ui view state --- */

export type ShootView = 'gallery' | 'board' | 'timeline' | 'list'
export type TaskBucket = 'today' | 'upcoming' | 'overdue' | 'completed'

/** Shape of the whole persisted database. */
export interface Database {
  team: TeamMember[]
  companies: Company[]
  contacts: Contact[]
  leadSources: LeadSource[]
  shoots: Shoot[]
  milestones: Milestone[]
  tasks: Task[]
  licenses: License[]
  invoices: Invoice[]
  pipeline: PipelineStage[]
  moodboards: Moodboard[]
  moodSections: MoodSection[]
  moodItems: MoodItem[]
  assets: Asset[]
  assetVersions: AssetVersion[]
  comments: Comment[]
  activity: ActivityEvent[]
  tags: Tag[]
  customFields: CustomField[]
  savedViews: SavedView[]
  settings: Settings
}

/* --------------------------------------------------------- label maps --- */

export const SHOOT_TYPES: Array<{ id: ShootType; label: string; hint: string }> = [
  { id: 'editorial', label: 'Editorial', hint: 'Magazine and press' },
  { id: 'commercial', label: 'Commercial', hint: 'Brand and advertising' },
  { id: 'portrait', label: 'Portrait', hint: 'People and headshots' },
  { id: 'event', label: 'Event', hint: 'Live coverage' },
  { id: 'product', label: 'Product', hint: 'Studio and still life' },
]

export const LINE_ITEM_KINDS: Array<{ id: LineItemKind; label: string; hint: string }> = [
  { id: 'shoot-fee', label: 'Shoot fee', hint: 'Day rate and crew' },
  { id: 'post', label: 'Post-production', hint: 'Editing and retouching' },
  { id: 'licensing', label: 'Usage licensing', hint: 'Rights granted' },
  { id: 'studio', label: 'Studio & expenses', hint: 'Passed through at cost' },
]

export const SHOOT_HEALTH: Record<ShootHealth, { label: string; tone: string }> = {
  'on-track': { label: 'On track', tone: 'positive' },
  'at-risk': { label: 'At risk', tone: 'caution' },
  blocked: { label: 'Blocked', tone: 'critical' },
}

export const PAPERWORK_STATUS: Record<PaperworkStatus, { label: string; tone: string }> = {
  none: { label: 'Not sent', tone: 'critical' },
  sent: { label: 'Awaiting signature', tone: 'caution' },
  signed: { label: 'Signed', tone: 'positive' },
  'not-required': { label: 'Not required', tone: 'neutral' },
}

export const LICENSE_STATUS: Record<LicenseStatus, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'positive' },
  expiring: { label: 'Expiring', tone: 'caution' },
  expired: { label: 'Expired', tone: 'critical' },
  renewed: { label: 'Renewed', tone: 'positive' },
  lapsed: { label: 'Lapsed', tone: 'neutral' },
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'caution' },
  paid: { label: 'Paid', tone: 'positive' },
  void: { label: 'Void', tone: 'neutral' },
}

export const INVOICE_KINDS: Record<InvoiceKind, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Full amount',
}

export const STAGE_KINDS: Record<StageKind, { label: string; hint: string }> = {
  lead: { label: 'Lead', hint: 'Enquiry in, nothing sent yet' },
  quoted: { label: 'Quoted', hint: 'Waiting on a reply — follow-ups run from here' },
  booked: { label: 'Booked', hint: 'Deposit taken, work is committed' },
  production: { label: 'In production', hint: 'Shooting or editing' },
  delivered: { label: 'Delivered', hint: 'Finals are out' },
  licensing: { label: 'Licensing', hint: 'Rights are live and worth watching' },
  won: { label: 'Closed won', hint: 'Counts as revenue' },
  lost: { label: 'Closed lost', hint: 'Leaves the board' },
}

export const TASK_PRIORITIES: Array<{ id: TaskPriority; label: string }> = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'normal', label: 'Normal' },
  { id: 'low', label: 'Low' },
]

export const APPROVAL_STATUS: Record<ApprovalStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Awaiting review', tone: 'caution' },
  approved: { label: 'Approved', tone: 'positive' },
  'changes-requested': { label: 'Changes requested', tone: 'critical' },
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
  status: 'Status change',
  update: 'Shoot update',
  approval: 'Approval',
  task: 'Task',
  invoice: 'Invoice',
  license: 'Licence',
}

export const MOOD_KIND_LABELS: Record<MoodItemKind, string> = {
  image: 'Image',
  shot: 'Shot',
  link: 'Link',
  color: 'Colour',
  type: 'Typography',
  material: 'Material',
  note: 'Note',
}

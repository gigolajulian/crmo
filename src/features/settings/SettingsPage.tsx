import { useState } from 'react'
import {
  Bell,
  Eraser,
  GripVertical,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  UserCog,
  Users,
  Workflow,
} from 'lucide-react'
import type { CustomFieldType, PermissionRole, Tag } from '@/data/types'
import { useStore } from '@/store/useStore'
import { isClosed } from '@/data/pipeline'
import { useActiveTeam } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'
import { PageHeader } from '@/components/common/PageHeader'
import { Button, Card, IconButton, Meter, Pill } from '@/components/ui/primitives'
import { Input, Select, Switch } from '@/components/ui/form'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog, Menu } from '@/components/ui/overlay'
import { toast } from '@/components/ui/feedback'
import { SectionHeading } from '@/components/common/records'
import { Wordmark } from '@/components/shell/Logo'
import { ACCENTS } from '@/features/onboarding/accents'
import { CURRENCIES, LOCALES } from '@/lib/intl'
import { StorageModeBadge } from '@/features/auth/AuthGate'
import { AvatarUpload } from '@/components/common/AvatarUpload'

/* ============================================================================
   SETTINGS
   Everything that changes how the workspace behaves, grouped by what a person
   would actually be looking for.
   ========================================================================== */

const SECTIONS = [
  { id: 'account', label: 'Account & studio', icon: UserCog },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'team', label: 'Team & roles', icon: Users },
  { id: 'pipeline', label: 'Pipeline', icon: Workflow },
  { id: 'tags', label: 'Tags & fields', icon: Tags },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data', icon: RotateCcw },
] as const

type Section = (typeof SECTIONS)[number]['id']

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('account')

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description={`How ${BRAND.full} behaves for you and the rest of the studio.`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections">
          <ul className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const active = section === item.id
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-pill px-3.5 py-2.5 text-left text-base whitespace-nowrap',
                      'transition-colors duration-fast ease-out-soft',
                      active ? 'bg-inverse text-on-inverse' : 'text-ink-muted hover:bg-surface hover:text-ink',
                    )}
                  >
                    <Icon size={16} aria-hidden />
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {section === 'account' && <AccountSettings />}
          {section === 'appearance' && <Appearance />}
          {section === 'team' && <TeamSettings />}
          {section === 'pipeline' && <PipelineSettings />}
          {section === 'tags' && <TagSettings />}
          {section === 'notifications' && <NotificationSettings />}
          {section === 'data' && <DataSettings />}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- account -- */

/**
 * The workspace's own identity. A local profile, not authentication — there is
 * no server behind this, so there is no password and nothing leaves the browser.
 */
function AccountSettings() {
  const workspace = useStore((s) => s.settings.workspace)
  const updateWorkspace = useStore((s) => s.updateWorkspace)
  const updateTeamMember = useStore((s) => s.updateTeamMember)
  const addTeamMember = useStore((s) => s.addTeamMember)
  const updateSettings = useStore((s) => s.updateSettings)
  const currentUserId = useStore((s) => s.settings.currentUserId)
  const me = useStore((s) => s.team.find((m) => m.id === s.settings.currentUserId))

  const [studio, setStudio] = useState(workspace.name)
  const [tagline, setTagline] = useState(workspace.tagline)
  const [name, setName] = useState(workspace.ownerName)
  const [role, setRole] = useState(workspace.ownerRole)
  const [email, setEmail] = useState(workspace.ownerEmail)
  const [currency, setCurrency] = useState(workspace.currency)
  const [locale, setLocale] = useState(workspace.locale)
  const [avatar, setAvatar] = useState<string | undefined>(me?.avatar ?? workspace.ownerAvatar)
  const [rerun, setRerun] = useState(false)

  const dirty =
    studio !== workspace.name ||
    tagline !== workspace.tagline ||
    name !== workspace.ownerName ||
    role !== workspace.ownerRole ||
    email !== workspace.ownerEmail ||
    currency !== workspace.currency ||
    locale !== workspace.locale ||
    avatar !== (me?.avatar ?? workspace.ownerAvatar)

  function save() {
    updateWorkspace({
      name: studio.trim() || workspace.name,
      tagline: tagline.trim(),
      ownerName: name.trim() || workspace.ownerName,
      ownerRole: role.trim(),
      ownerEmail: email.trim(),
      currency,
      locale,
      ownerAvatar: avatar,
    })
    // The owner's profile and their team record are the same person.
    //
    // Unless currentUserId points at nobody — which happens on a workspace
    // hydrated from elsewhere — in which case patching it renames no one and
    // the studio goes on calling you by whatever name it already had. Give
    // yourself a record and claim it.
    if (me) {
      updateTeamMember(currentUserId, {
        name: name.trim() || workspace.ownerName,
        role: role.trim() || me.role,
        email: email.trim() || me.email,
        avatar,
      })
    } else {
      const id = addTeamMember(name.trim() || workspace.ownerName, role.trim(), email.trim())
      updateTeamMember(id, { avatar, permissionRole: 'owner' })
      updateSettings({ currentUserId: id })
    }
    toast.success('Saved')
  }

  return (
    <div className="flex flex-col gap-5">
      <Card variant="raised" padding="lg" radius="3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Wordmark />
          <StorageModeBadge />
        </div>

        <SectionHeading
          title="Your studio"
          description="What this workspace is called, wherever it refers to itself."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Studio name" value={studio} onChange={(e) => setStudio(e.target.value)} />
          <Input
            label="Tagline"
            placeholder="Creative relationship management"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
        </div>

        <SectionHeading
          title="You"
          description="Your profile in the studio — the person work is assigned to and decisions are recorded against."
          className="mt-8"
        />
        <AvatarUpload
          name={name || me?.name || 'You'}
          value={avatar}
          onChange={setAvatar}
          className="mb-5"
          hint="Optional. Without one you get your initials."
        />
        <div className="flex items-start gap-4">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Your role" value={role} onChange={(e) => setRole(e.target.value)} />
            <Input
              label="Email"
              type="email"
              hint="Stored in this browser only."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="sm:col-span-2"
            />
          </div>
        </div>

        <SectionHeading
          title="Money & region"
          description="Every quote, invoice and revenue figure is shown in this currency, formatted for your region."
          className="mt-8"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` }))}
          />
          <Select
            label="Region format"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
          />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-pretty text-ink-muted">
            {BRAND.product} runs entirely in this browser. There is no sign-in and no server —
            your workspace lives in local storage.
          </p>
          <Button variant="primary" onClick={save} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading
          title="Run setup again"
          description="Walk back through the four setup steps to rename the studio, change the accent, or start from an empty workspace."
        />
        <Button icon={<Sparkles size={15} />} onClick={() => setRerun(true)}>
          Open setup
        </Button>
      </Card>

      <ConfirmDialog
        open={rerun}
        onClose={() => setRerun(false)}
        title="Run setup again?"
        body="You will be taken back through the setup steps. Nothing is deleted unless you choose to start from an empty workspace at the end."
        confirmLabel="Open setup"
        onConfirm={() => updateWorkspace({ onboarded: false })}
      />
    </div>
  )
}

/* ----------------------------------------------------------- appearance -- */

function Appearance() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const themes = [
    { id: 'dark' as const, label: 'Dark', icon: Moon, hint: 'The studio default' },
    { id: 'light' as const, label: 'Light', icon: Sun, hint: 'For bright rooms' },
    { id: 'system' as const, label: 'System', icon: Monitor, hint: 'Follow the OS' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <AccentPicker />

      <Card variant="raised" padding="lg" radius="3xl">
        <SectionHeading title="Theme" description="Applies immediately, and is remembered." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themes.map((theme) => {
            const Icon = theme.icon
            const active = settings.theme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  updateSettings({ theme: theme.id, themeChosen: true })
                  toast.success(`${theme.label} theme`)
                }}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-2xl p-4 text-left transition-[background-color,box-shadow] duration-base',
                  active ? 'bg-inverse text-on-inverse' : 'bg-surface hover:bg-surface-hover',
                )}
              >
                <Icon size={18} aria-hidden />
                <span className="text-base font-medium">{theme.label}</span>
                <span className={cn('text-xs', active ? 'text-on-inverse-muted' : 'text-ink-muted')}>
                  {theme.hint}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading title="Density" description="How much breathing room lists get." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(['comfortable', 'compact'] as const).map((density) => (
            <button
              key={density}
              type="button"
              onClick={() => updateSettings({ density })}
              aria-pressed={settings.density === density}
              className={cn(
                'rounded-2xl p-4 text-left transition-colors duration-base',
                settings.density === density
                  ? 'bg-inverse text-on-inverse'
                  : 'bg-raised hover:bg-surface-hover',
              )}
            >
              <span className="text-base font-medium capitalize">{density}</span>
              <span
                className={cn(
                  'mt-1 block text-xs',
                  settings.density === density ? 'text-on-inverse-muted' : 'text-ink-muted',
                )}
              >
                {density === 'comfortable'
                  ? 'Generous spacing, easier to scan'
                  : 'More rows on screen at once'}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

/**
 * The accent is the only chromatic decision in the product — everything else is
 * warm grey and ink — so it gets its own panel with a real preview.
 */
function AccentPicker() {
  const accent = useStore((s) => s.settings.workspace.accent)
  const updateWorkspace = useStore((s) => s.updateWorkspace)

  return (
    <Card variant="raised" padding="lg" radius="3xl">
      <SectionHeading
        title="Accent"
        description="One saturated colour carries every highlight. It is always a background with ink on top, never coloured text."
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {ACCENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={accent === option.id}
            onClick={() => {
              updateWorkspace({ accent: option.id })
              toast.success(`${option.label} accent`)
            }}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-[box-shadow,transform] duration-fast',
              accent === option.id
                ? 'bg-surface shadow-md ring-2 ring-ink'
                : 'bg-surface hover:bg-surface-hover',
            )}
          >
            <span
              className="h-8 w-full rounded-md"
              style={{ backgroundColor: option.swatch }}
              aria-hidden
            />
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-4">
        <span className="eyebrow mr-1">Preview</span>
        <Pill tone="lime" size="md">
          Today
        </Pill>
        <Pill tone="ink" size="md">
          In production
        </Pill>
        <Button variant="accent" size="sm">
          Approve
        </Button>
        <Meter value={0.68} tone="lime" className="mt-2 w-full" label="Accent meter preview" />
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------------- team -- */

const ROLES: PermissionRole[] = ['owner', 'admin', 'member', 'guest']

const ROLE_MEANING: Record<PermissionRole, string> = {
  owner: 'Everything, including billing and deleting the workspace.',
  admin: 'Everything except billing. Can manage people and pipelines.',
  member: 'Create and edit work. Cannot change workspace settings.',
  guest: 'Read-only, and only on projects they are added to.',
}

function TeamSettings() {
  const team = useActiveTeam()
  const updateTeamMember = useStore((s) => s.updateTeamMember)
  const addTeamMember = useStore((s) => s.addTeamMember)
  const removeTeamMember = useStore((s) => s.removeTeamMember)
  const currentUserId = useStore((s) => s.settings.currentUserId)
  const updateSettings = useStore((s) => s.updateSettings)

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Card variant="raised" padding="lg" radius="3xl">
        <SectionHeading
          title="Team"
          count={team.length}
          description="Who is in the studio, and what they can change."
        />
        <ul className="flex flex-col">
          {team.map((member, index) => (
            <li
              key={member.id}
              className={cn(
                'flex flex-wrap items-center gap-3 py-3.5',
                index > 0 && 'border-t border-line-soft',
              )}
            >
              <Avatar name={member.name} src={member.avatar} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-base">
                  {member.name}
                  {member.id === currentUserId && (
                    <Pill tone="lime" size="sm">
                      You
                    </Pill>
                  )}
                </p>
                <p className="truncate text-sm text-ink-muted">
                  {member.role} · {member.email}
                </p>
              </div>

              <Menu
                label={`Change role for ${member.name}`}
                items={ROLES.map((r) => ({
                  label: r.charAt(0).toUpperCase() + r.slice(1),
                  selected: r === member.permissionRole,
                  onSelect: () => {
                    updateTeamMember(member.id, { permissionRole: r })
                    toast.success(`${member.name} is now ${r}`)
                  },
                }))}
                trigger={({ onClick, ...rest }) => (
                  <Button size="sm" onClick={onClick} {...rest}>
                    {member.permissionRole}
                  </Button>
                )}
              />

              {member.id !== currentUserId && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => updateSettings({ currentUserId: member.id })}>
                    View as
                  </Button>
                  <IconButton
                    label={`Remove ${member.name}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoving(member.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading title="Invite someone" />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            addTeamMember(name.trim(), role.trim() || 'Designer', email.trim() || `${name.split(' ')[0].toLowerCase()}@plcbo.studio`)
            toast.success(`${name.trim()} added to the studio`)
            setName('')
            setRole('')
            setEmail('')
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Role" placeholder="Designer" value={role} onChange={(e) => setRole(e.target.value)} />
          <Input
            label="Email"
            type="email"
            placeholder="name@plcbo.studio"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="sm:col-span-3">
            <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!name.trim()}>
              Add to studio
            </Button>
          </div>
        </form>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading title="What each role can do" />
        <dl className="flex flex-col gap-3">
          {ROLES.map((r) => (
            <div key={r} className="flex flex-wrap gap-x-4 gap-y-1">
              <dt className="w-20 shrink-0 text-sm font-medium capitalize">{r}</dt>
              <dd className="flex-1 text-sm text-ink-muted">{ROLE_MEANING[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove from the studio?"
        body="They lose access immediately. Their past work and comments stay attributed to them."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (removing) {
            removeTeamMember(removing)
            toast.show('Removed from the studio')
          }
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------- pipeline -- */

function PipelineSettings() {
  const pipeline = useStore((s) => s.pipeline)
  const updatePipelineStage = useStore((s) => s.updatePipelineStage)
  const addPipelineStage = useStore((s) => s.addPipelineStage)
  const deletePipelineStage = useStore((s) => s.deletePipelineStage)
  const reorderPipeline = useStore((s) => s.reorderPipeline)
  const shoots = useStore((s) => s.shoots)

  const [newStage, setNewStage] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const sorted = [...pipeline].sort((a, b) => a.order - b.order)
  const openStages = sorted.filter((s) => !isClosed(s.kind))

  return (
    <div className="flex flex-col gap-5">
      <Card variant="raised" padding="lg" radius="3xl">
        <SectionHeading
          title="Lifecycle stages"
          description="Rename, reorder, or add stages. Shoots in a deleted stage move to the first one."
        />
        <ul className="flex flex-col gap-2">
          {sorted.map((stage, index) => {
            const count = shoots.filter((d: { stageId: string }) => d.stageId === stage.id).length
            const canMoveUp = !isClosed(stage.kind) && index > 0 && !isClosed(sorted[index - 1].kind)
            const canMoveDown =
              !isClosed(stage.kind) && index < sorted.length - 1 && !isClosed(sorted[index + 1].kind)

            return (
              <li
                key={stage.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3"
              >
                <span className="text-ink-faint" aria-hidden>
                  <GripVertical size={15} />
                </span>

                <input
                  value={stage.name}
                  onChange={(e) => updatePipelineStage(stage.id, { name: e.target.value })}
                  aria-label={`Stage name: ${stage.name}`}
                  className="h-9 min-w-32 flex-1 rounded-lg bg-raised px-3 text-base shadow-xs"
                />

                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className="sr-only-focusable absolute">
                    Default probability for {stage.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stage.probability}
                    disabled={isClosed(stage.kind)}
                    onChange={(e) =>
                      updatePipelineStage(stage.id, { probability: Number(e.target.value) })
                    }
                    aria-label={`Default probability for ${stage.name}`}
                    className="tabular h-9 w-20 rounded-lg bg-raised px-3 text-base shadow-xs disabled:text-ink-faint"
                  />
                  %
                </label>

                <Pill tone={!isClosed(stage.kind) ? 'neutral' : stage.kind === 'won' ? 'positive' : 'critical'} size="sm">
                  {count} {count === 1 ? 'shoot' : 'shoots'}
                </Pill>

                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Move ${stage.name} earlier`}
                    size="sm"
                    variant="ghost"
                    disabled={!canMoveUp}
                    onClick={() => reorderPipeline(stage.id, sorted[index - 1].id)}
                  >
                    <span aria-hidden>↑</span>
                  </IconButton>
                  <IconButton
                    label={`Move ${stage.name} later`}
                    size="sm"
                    variant="ghost"
                    disabled={!canMoveDown}
                    onClick={() => reorderPipeline(stage.id, sorted[index + 1].id)}
                  >
                    <span aria-hidden>↓</span>
                  </IconButton>
                  <IconButton
                    label={`Delete ${stage.name}`}
                    size="sm"
                    variant="ghost"
                    disabled={isClosed(stage.kind) || openStages.length <= 1}
                    onClick={() => setDeleting(stage.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!newStage.trim()) return
            addPipelineStage(newStage.trim())
            toast.success(`Added “${newStage.trim()}”`)
            setNewStage('')
          }}
          className="mt-4 flex items-end gap-2"
        >
          <Input
            label="New stage"
            placeholder="Contract out"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!newStage.trim()}>
            Add
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this stage?"
        body="Any shoots in it move to the first open stage. This cannot be undone."
        confirmLabel="Delete stage"
        destructive
        onConfirm={() => {
          if (deleting) {
            deletePipelineStage(deleting)
            toast.show('Stage deleted')
          }
        }}
      />
    </div>
  )
}

/* ----------------------------------------------------------------- tags -- */

const TONES: Tag['tone'][] = ['neutral', 'lime', 'positive', 'caution', 'critical', 'info']

function TagSettings() {
  const tags = useStore((s) => s.tags)
  const addTag = useStore((s) => s.addTag)
  const updateTag = useStore((s) => s.updateTag)
  const deleteTag = useStore((s) => s.deleteTag)
  const customFields = useStore((s) => s.customFields)

  const [label, setLabel] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Card variant="raised" padding="lg" radius="3xl">
        <SectionHeading
          title="Tags"
          count={tags.length}
          description="Shared across shoots, clients and companies."
        />
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1 rounded-pill bg-surface p-1 pl-1">
              <Menu
                label={`Change colour of ${tag.label}`}
                items={TONES.map((tone) => ({
                  label: tone.charAt(0).toUpperCase() + tone.slice(1),
                  selected: tone === tag.tone,
                  onSelect: () => updateTag(tag.id, { tone }),
                }))}
                trigger={({ onClick, ...rest }) => (
                  <button type="button" onClick={onClick} {...rest}>
                    <Pill tone={tag.tone}>{tag.label}</Pill>
                  </button>
                )}
              />
              <IconButton
                label={`Delete tag ${tag.label}`}
                size="sm"
                variant="ghost"
                onClick={() => setDeleting(tag.id)}
              >
                <Trash2 size={12} />
              </IconButton>
            </li>
          ))}
        </ul>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!label.trim()) return
            addTag(label.trim())
            toast.success(`Tag “${label.trim()}” added`)
            setLabel('')
          }}
          className="mt-5 flex items-end gap-2"
        >
          <Input
            label="New tag"
            placeholder="Sustainability"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!label.trim()}>
            Add
          </Button>
        </form>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading
          title="Custom fields"
          count={customFields.length}
          description="Extra fields the studio tracks on its records."
        />
        <ul className="flex flex-col">
          {customFields.map((field, index) => (
            <li
              key={field.id}
              className={cn(
                'flex flex-wrap items-center gap-3 py-3',
                index > 0 && 'border-t border-line-soft',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-base">{field.label}</p>
                <p className="text-xs text-ink-muted">
                  on {field.entity}
                  {field.options && ` · ${field.options.join(', ')}`}
                </p>
              </div>
              <Pill tone="neutral" size="sm">
                {FIELD_LABELS[field.type]}
              </Pill>
              {field.required && (
                <Pill tone="caution" size="sm">
                  Required
                </Pill>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this tag?"
        body="It is removed from every record that uses it. This cannot be undone."
        confirmLabel="Delete tag"
        destructive
        onConfirm={() => {
          if (deleting) {
            deleteTag(deleting)
            toast.show('Tag deleted')
          }
        }}
      />
    </div>
  )
}

const FIELD_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  select: 'Choice',
  date: 'Date',
  checkbox: 'Yes / no',
}

/* -------------------------------------------------------- notifications -- */

function NotificationSettings() {
  const notifications = useStore((s) => s.settings.notifications)
  const updateSettings = useStore((s) => s.updateSettings)

  function set(key: keyof typeof notifications, value: boolean | string) {
    updateSettings({ notifications: { ...notifications, [key]: value } })
  }

  const toggles: Array<{ key: keyof typeof notifications; label: string; description: string }> = [
    {
      key: 'approvalRequests',
      label: 'Approval requests',
      description: 'When a version is sent for review, or a client makes a decision.',
    },
    {
      key: 'taskAssignments',
      label: 'Task assignments',
      description: 'When someone assigns work to you.',
    },
    {
      key: 'stageChanges',
      label: 'Stage changes',
      description: 'When a shoot you own moves along the lifecycle or is lost.',
    },
    {
      key: 'milestoneReminders',
      label: 'Milestone reminders',
      description: 'Two days before a milestone on your projects.',
    },
    {
      key: 'clientReplies',
      label: 'Client replies',
      description: 'When a client comments on work or answers a follow-up.',
    },
    {
      key: 'weeklyDigest',
      label: 'Weekly digest',
      description: 'A Monday summary of the week ahead.',
    },
  ]

  return (
    <Card variant="raised" padding="lg" radius="3xl">
      <SectionHeading
        title="Notifications"
        description="Only the things worth interrupting you for."
      />

      <div className="mb-6">
        <Select
          label="Where to send them"
          value={notifications.channel}
          onChange={(e) => set('channel', e.target.value)}
          options={[
            { value: 'both', label: 'Email and in-app' },
            { value: 'email', label: 'Email only' },
            { value: 'in-app', label: 'In-app only' },
          ]}
        />
      </div>

      <ul className="flex flex-col">
        {toggles.map((item, index) => (
          <li key={item.key} className={cn('py-4', index > 0 && 'border-t border-line-soft')}>
            <Switch
              checked={notifications[item.key] as boolean}
              onChange={(value) => set(item.key, value)}
              label={item.label}
              description={item.description}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* ----------------------------------------------------------------- data -- */

function DataSettings() {
  const resetDemoData = useStore((s) => s.resetDemoData)
  const clearDemoData = useStore((s) => s.clearDemoData)
  // Each count is selected as a primitive: returning an object from a zustand
  // selector creates a new reference every render and loops forever.
  const counts = {
    projects: useStore((s) => s.shoots.length),
    contacts: useStore((s) => s.contacts.length),
    shoots: useStore((s) => s.shoots.length),
    tasks: useStore((s) => s.tasks.length),
    references: useStore((s) => s.moodItems.length),
    activity: useStore((s) => s.activity.length),
  }
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <Card variant="raised" padding="lg" radius="3xl">
        <SectionHeading
          title="What is in this workspace"
          description="Everything is stored in your browser — nothing is sent anywhere."
        />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Object.entries(counts).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-surface p-4">
              <dt className="text-xs text-ink-muted capitalize">{key}</dt>
              <dd className="tabular mt-1 text-title font-medium tracking-title">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* The common case: keep the studio you set up, drop the sample records. */}
      <Card variant="raised" padding="lg" radius="2xl">
        <SectionHeading
          title="Clear the demo data"
          description="Start working for real, without setting the workspace up again."
        />
        <p className="mb-4 max-w-prose text-sm text-pretty text-ink-muted">
          Removes the sample clients, shoots, moodboards, invoices, licences, tasks and history, and everyone
          on the roster except you. Keeps your studio details, your profile, your pipeline stages
          and your tags — everything you chose at setup.
        </p>
        <Button variant="primary" icon={<Eraser size={15} />} onClick={() => setClearing(true)}>
          Clear demo data
        </Button>
      </Card>

      <Card variant="surface" padding="lg" radius="2xl">
        <SectionHeading
          title="Reset to the demo studio"
          description="The opposite: put the sample workspace back the way it started."
        />
        <p className="mb-4 max-w-prose text-sm text-pretty text-ink-muted">
          Everything you have created, edited or deleted is replaced with the original demo
          dataset. Your theme and studio identity are kept. This cannot be undone.
        </p>
        <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setConfirming(true)}>
          Reset to the demo studio
        </Button>
      </Card>

      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        title="Clear the demo data?"
        body="The sample clients, shoots, moodboards, invoices, licences and history are removed. Your studio, profile, pipeline and tags stay exactly as they are. This cannot be undone."
        confirmLabel="Clear it"
        destructive
        onConfirm={() => {
          clearDemoData()
          toast.success('Demo data cleared', {
            detail: 'Your studio, pipeline and tags are untouched.',
          })
        }}
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset everything?"
        body="All of your changes are discarded and the original demo studio is restored. This cannot be undone."
        confirmLabel="Reset workspace"
        destructive
        onConfirm={() => {
          resetDemoData()
          toast.success('Workspace reset', { detail: 'The demo studio is back to its original state.' })
        }}
      />
    </div>
  )
}

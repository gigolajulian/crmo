import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Accent, PipelineStage, Tag } from '@/data/types'
import { useStore } from '@/store/useStore'
import { cn, uid } from '@/lib/utils'
import { CURRENCIES, LOCALES, setMoneyFormat } from '@/lib/intl'
import { Button, Card, IconButton, Pill } from '@/components/ui/primitives'
import { Input, Select } from '@/components/ui/form'
import { Logo } from '@/components/shell/Logo'
import { AvatarUpload } from '@/components/common/AvatarUpload'
import { ACCENTS } from './accents'
import { PIPELINE_TEMPLATES, SERVICE_TAGS, buildPipeline } from './pipelines'

/* ============================================================================
   SETUP

   Everything the CRM needs before it is useful: who the studio is, who you are,
   what you charge in, how you sell, and what you sell. Six steps, none longer
   than a screen, and every answer editable afterwards in Settings.

   Local mode applies the answers straight to the store. Connected mode hands
   them to `onProvision`, which creates the workspace in Postgres and seeds it.
   ========================================================================== */

export interface SetupResult {
  name: string
  tagline: string
  ownerName: string
  ownerRole: string
  ownerEmail: string
  /** Data URL, or undefined to keep tinted initials. */
  ownerAvatar?: string
  accent: Accent
  currency: string
  locale: string
  theme: 'light' | 'dark' | 'system'
  pipeline: PipelineStage[]
  tags: Tag[]
  start: 'demo' | 'empty'
}

const STEPS = ['Studio', 'You', 'Money', 'Pipeline', 'Services', 'Look'] as const

export function Onboarding({
  onProvision,
  defaultEmail,
}: {
  /** Connected mode: hand the answers off instead of applying them locally. */
  onProvision?: (result: SetupResult) => void
  defaultEmail?: string
}) {
  const workspace = useStore((s) => s.settings.workspace)
  const completeSetup = useStore((s) => s.completeSetup)
  const updateWorkspace = useStore((s) => s.updateWorkspace)
  const updateSettings = useStore((s) => s.updateSettings)
  const applySetup = useStore((s) => s.applySetup)

  const [step, setStep] = useState(0)

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerRole, setOwnerRole] = useState('')
  const [ownerEmail, setOwnerEmail] = useState(defaultEmail ?? '')
  const [ownerAvatar, setOwnerAvatar] = useState<string | undefined>(undefined)

  const [currency, setCurrency] = useState(guessCurrency())
  const [locale, setLocale] = useState(guessLocale())

  const [templateId, setTemplateId] = useState('studio')
  const [stages, setStages] = useState(PIPELINE_TEMPLATES[0].stages)

  const [services, setServices] = useState<string[]>([
    'Brand',
    'Campaign',
    'Digital',
    'Print',
  ])

  const [accent, setAccent] = useState<Accent>(workspace.accent)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark')

  /* Preview the look and the money format live while they are being chosen. */
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  useEffect(() => {
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }, [theme])

  useEffect(() => {
    setMoneyFormat(currency, locale)
  }, [currency, locale])

  const canContinue = useMemo(() => {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return ownerName.trim().length > 0
    if (step === 3) return stages.some((s) => s.name.trim().length > 0)
    return true
  }, [step, name, ownerName, stages])

  function collect(start: 'demo' | 'empty'): SetupResult {
    return {
      name: name.trim(),
      tagline: tagline.trim() || 'Creative relationship management',
      ownerName: ownerName.trim(),
      ownerRole: ownerRole.trim() || 'Founder',
      ownerEmail: ownerEmail.trim(),
      ownerAvatar,
      accent,
      currency,
      locale,
      theme,
      pipeline: buildPipeline(stages),
      tags: services.map((label) => ({
        id: `tag_${label.toLowerCase().replace(/\W+/g, '')}`,
        label,
        tone: 'neutral' as const,
      })),
      start,
    }
  }

  function finish(start: 'demo' | 'empty') {
    const result = collect(start)

    if (onProvision) {
      onProvision(result)
      return
    }

    updateSettings({ theme: result.theme, themeChosen: true })
    completeSetup(
      {
        name: result.name,
        tagline: result.tagline,
        ownerName: result.ownerName,
        ownerRole: result.ownerRole,
        ownerEmail: result.ownerEmail,
        ownerAvatar: result.ownerAvatar,
        accent: result.accent,
        currency: result.currency,
        locale: result.locale,
      },
      start,
    )
    applySetup(result)
  }

  const last = STEPS.length - 1

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Logo size={40} />
          <ol className="flex flex-wrap items-center gap-1" aria-label="Setup progress">
            {STEPS.map((label, index) => (
              <li key={label}>
                <span
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium transition-colors duration-base',
                    index === step
                      ? 'bg-inverse text-on-inverse'
                      : index < step
                        ? 'bg-lime-pale text-ink'
                        : 'text-ink-faint',
                  )}
                  aria-current={index === step ? 'step' : undefined}
                >
                  {index < step && <Check size={11} aria-hidden />}
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          {step === 0 && (
            <Section
              eyebrow="Step one"
              title="What is the studio called?"
              body="It appears in the sidebar, on reports, and anywhere the workspace refers to itself."
            >
              <Input
                label="Studio name"
                placeholder="Northlight Studio"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
              <Input
                label="Tagline"
                hint="Optional. Shown under the name in Settings."
                placeholder="Creative relationship management"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </Section>
          )}

          {step === 1 && (
            <Section
              eyebrow="Step two"
              title="And who are you?"
              body="This becomes your profile in the studio — the person tasks get assigned to and approvals get recorded against."
            >
              <Input
                label="Your name"
                placeholder="Alex Moreau"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                autoFocus
                required
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Your role"
                  placeholder="Founder & Creative Director"
                  value={ownerRole}
                  onChange={(e) => setOwnerRole(e.target.value)}
                />
                <Input
                  label="Email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
              </div>

              <fieldset>
                <legend className="eyebrow mb-3">Profile picture</legend>
                <AvatarUpload
                  name={ownerName}
                  value={ownerAvatar}
                  onChange={setOwnerAvatar}
                  hint="Optional. Without one you get your initials, which is a perfectly good look."
                />
              </fieldset>
            </Section>
          )}

          {step === 2 && (
            <Section
              eyebrow="Step three"
              title="What do you bill in?"
              body="Every quote, invoice and revenue figure is shown in this currency, formatted for your region."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  options={CURRENCIES.map((c) => ({
                    value: c.code,
                    label: `${c.code} — ${c.label}`,
                  }))}
                />
                <Select
                  label="Region format"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
                />
              </div>

              <Card variant="surface" padding="md" radius="2xl">
                <p className="eyebrow mb-3">Preview</p>
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  <div>
                    <dt className="text-xs text-ink-muted">Quote value</dt>
                    <dd className="tabular text-xl font-medium tracking-tight">
                      {money(148000, currency, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Compact</dt>
                    <dd className="tabular text-xl font-medium tracking-tight">
                      {money(148000, currency, locale, true)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">A date</dt>
                    <dd className="text-xl font-medium tracking-tight">
                      {new Intl.DateTimeFormat(locale, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }).format(new Date())}
                    </dd>
                  </div>
                </dl>
              </Card>
            </Section>
          )}

          {step === 3 && (
            <Section
              eyebrow="Step four"
              title="How does work come in?"
              body="Your lifecycle, from first enquiry to the licence running out. Pick the closest shape, then rename anything that does not fit."
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {PIPELINE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={templateId === template.id}
                    onClick={() => {
                      setTemplateId(template.id)
                      setStages(template.stages)
                    }}
                    className={cn(
                      'rounded-xl p-3.5 text-left transition-colors duration-base',
                      templateId === template.id
                        ? 'bg-inverse text-on-inverse'
                        : 'bg-surface hover:bg-surface-hover',
                    )}
                  >
                    <span className="block text-base font-medium">{template.label}</span>
                    <span
                      className={cn(
                        'mt-1 block text-xs text-pretty',
                        templateId === template.id ? 'text-on-inverse-muted' : 'text-ink-muted',
                      )}
                    >
                      {template.hint}
                    </span>
                  </button>
                ))}
              </div>

              <fieldset>
                <legend className="eyebrow mb-2">Your stages</legend>
                <ul className="flex flex-col gap-2">
                  {stages.map((stage, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <span className="tabular w-5 shrink-0 text-sm text-ink-faint">
                        {index + 1}
                      </span>
                      <input
                        value={stage.name}
                        aria-label={`Stage ${index + 1} name`}
                        onChange={(e) =>
                          setStages((current) =>
                            current.map((s, i) =>
                              i === index ? { ...s, name: e.target.value } : s,
                            ),
                          )
                        }
                        className="h-10 min-w-0 flex-1 rounded-lg bg-raised px-3 text-base shadow-xs"
                      />
                      <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={stage.probability}
                          aria-label={`Default win probability for stage ${index + 1}`}
                          onChange={(e) =>
                            setStages((current) =>
                              current.map((s, i) =>
                                i === index ? { ...s, probability: Number(e.target.value) } : s,
                              ),
                            )
                          }
                          className="tabular h-10 w-16 rounded-lg bg-raised px-2 text-base shadow-xs"
                        />
                        %
                      </label>
                      <IconButton
                        label={`Remove stage ${index + 1}`}
                        size="sm"
                        variant="ghost"
                        disabled={stages.length <= 1}
                        onClick={() =>
                          setStages((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-3"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() =>
                    setStages((current) => [...current, { name: '', probability: 50 }])
                  }
                >
                  Add stage
                </Button>

                <p className="mt-3 text-xs text-ink-muted">
                  Won and Lost are added automatically — the reports need to know which
                  stages close a shoot.
                </p>
              </fieldset>
            </Section>
          )}

          {step === 4 && (
            <Section
              eyebrow="Step five"
              title="What do you sell?"
              body="These become tags on projects, clients and deals, and the filters you will use most. Add your own or change them later."
            >
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_TAGS.map((service) => {
                  const on = services.includes(service)
                  return (
                    <button
                      key={service}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setServices((current) =>
                          on ? current.filter((s) => s !== service) : [...current, service],
                        )
                      }
                      className={cn(
                        'h-9 rounded-pill px-3.5 text-sm font-medium transition-colors duration-fast',
                        on
                          ? 'bg-inverse text-on-inverse'
                          : 'bg-raised text-ink-muted shadow-xs hover:text-ink',
                      )}
                    >
                      {service}
                    </button>
                  )
                })}
              </div>
              <p className="text-sm text-ink-muted">
                {services.length === 0
                  ? 'None selected — you can add tags any time in Settings.'
                  : `${services.length} selected.`}
              </p>
            </Section>
          )}

          {step === 5 && (
            <Section
              eyebrow="Step six"
              title="Pick an accent"
              body="One saturated colour carries every highlight in the workspace. The rest of the palette stays warm grey and near-black."
            >
              <fieldset>
                <legend className="eyebrow mb-3">Accent</legend>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  {ACCENTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={accent === option.id}
                      onClick={() => setAccent(option.id)}
                      className={cn(
                        'flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-[box-shadow,transform] duration-fast',
                        accent === option.id
                          ? 'bg-raised shadow-md ring-2 ring-ink'
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
              </fieldset>

              <fieldset>
                <legend className="eyebrow mb-3">Theme</legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'dark', label: 'Dark', hint: 'The studio default' },
                      { id: 'light', label: 'Light', hint: 'For bright rooms' },
                      { id: 'system', label: 'System', hint: 'Follow the OS' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={theme === option.id}
                      onClick={() => setTheme(option.id)}
                      className={cn(
                        'rounded-xl p-3.5 text-left transition-colors duration-base',
                        theme === option.id
                          ? 'bg-inverse text-on-inverse'
                          : 'bg-surface hover:bg-surface-hover',
                      )}
                    >
                      <span className="block text-base font-medium">{option.label}</span>
                      <span
                        className={cn(
                          'mt-0.5 block text-xs',
                          theme === option.id ? 'text-on-inverse-muted' : 'text-ink-muted',
                        )}
                      >
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <Card variant="raised" padding="md" radius="2xl">
                <p className="eyebrow mb-3">Preview</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="lime" size="md">
                    Today
                  </Pill>
                  <Pill tone="ink" size="md">
                    {stages[0]?.name || 'In production'}
                  </Pill>
                  <Pill tone="neutral" size="md">
                    {money(148000, currency, locale, true)}
                  </Pill>
                  <Button variant="accent" size="sm">
                    Approve
                  </Button>
                </div>
              </Card>

              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => finish('demo')}
                  className="flex flex-col gap-2 rounded-2xl bg-raised p-5 text-left shadow-sm transition-[box-shadow,transform] duration-base hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <Sparkles size={18} className="text-ink-muted" aria-hidden />
                  <span className="text-lg font-medium tracking-tight">
                    Start with the demo studio
                  </span>
                  <span className="text-sm text-pretty text-ink-muted">
                    Nine projects, real moodboards, a pipeline and an approval history — the
                    fastest way to see how it all connects. Clear it whenever.
                  </span>
                  <span className="mt-1">
                    <Pill tone="lime">Recommended</Pill>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => finish('empty')}
                  className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left transition-colors duration-base hover:bg-surface-hover"
                >
                  <span className="grid size-[18px] place-items-center text-ink-muted" aria-hidden>
                    ○
                  </span>
                  <span className="text-lg font-medium tracking-tight">Start empty</span>
                  <span className="text-sm text-pretty text-ink-muted">
                    Just your studio, your pipeline and your tags. Add real clients and work
                    from here.
                  </span>
                </button>
              </div>
            </Section>
          )}
        </main>

        <footer className="mt-10 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={15} />}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>

          <div className="flex items-center gap-2">
            {!onProvision && (
              <Button variant="ghost" onClick={() => updateWorkspace({ onboarded: true })}>
                Skip setup
              </Button>
            )}
            {step < last && (
              <Button
                variant="primary"
                iconAfter={<ArrowRight size={15} />}
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue}
              >
                Continue
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- helpers -- */

function Section({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <section className="animate-in flex flex-col gap-5">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="text-title font-medium tracking-display text-balance sm:text-display">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-body text-pretty text-ink-muted">{body}</p>
      </div>
      {children}
    </section>
  )
}

function money(value: number, currency: string, locale: string, compact = false): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
    }).format(value)
  } catch {
    return String(value)
  }
}

/** Sensible defaults from the browser, so most people never touch step three. */
function guessLocale(): string {
  const candidates = LOCALES.map((l) => l.code) as readonly string[]
  const browser = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return candidates.includes(browser) ? browser : 'en-US'
}

function guessCurrency(): string {
  const byLocale: Record<string, string> = {
    'en-GB': 'GBP',
    'en-AU': 'AUD',
    'en-CA': 'CAD',
    'de-DE': 'EUR',
    'fr-FR': 'EUR',
    'es-ES': 'EUR',
    'nl-NL': 'EUR',
    'pt-BR': 'BRL',
    'da-DK': 'DKK',
  }
  return byLocale[guessLocale()] ?? 'USD'
}

export { uid }

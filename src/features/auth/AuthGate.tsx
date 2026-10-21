import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, Check, Cloud, HardDrive, Loader2 } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { isRemote, requireSupabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import { hydrate, pushAll, startSync, stopSync, type PushProgress } from '@/store/sync'
import { createSeedDatabase, createEmptyDatabase } from '@/data/seed'
import { Button, Card, Meter, Pill, Skeleton } from '@/components/ui/primitives'
import { Input } from '@/components/ui/form'
import { Logo } from '@/components/shell/Logo'
import { Onboarding, type SetupResult } from '@/features/onboarding/Onboarding'
import { cn } from '@/lib/utils'

/* ============================================================================
   AUTH GATE

   Local mode is a pass-through. With Supabase configured this owns the whole
   pre-app sequence:

     signed out -> sign in
     no workspace yet -> setup, then provision with visible progress
     workspace exists -> hydrate, start syncing, hand over to the app
   ========================================================================== */

type Phase =
  | 'checking'
  | 'signed-out'
  | 'recovery'
  | 'resolving'
  | 'setup'
  | 'provisioning'
  | 'ready'
  | 'error'

/*
 * A password reset link or a Google sign-in lands back here with the result in
 * the URL: a session (type=recovery for a reset) or the reason it failed, in
 * the hash or, for some provider errors, the query. Read once, before
 * supabase-js consumes and clears it.
 */
const landing = new URLSearchParams(window.location.hash.slice(1))
const landingQuery = new URLSearchParams(window.location.search)
const arrivedToRecover = landing.get('type') === 'recovery'
const linkError =
  landing.get('error_description') ?? landingQuery.get('error_description') ?? ''

/** Where Supabase sends people back to: this app, wherever it is served from. */
const RETURN_URL = `${window.location.origin}${import.meta.env.BASE_URL}`

export function AuthGate({ children }: { children: ReactNode }) {
  if (!isRemote) return <>{children}</>
  return <RemoteGate>{children}</RemoteGate>
}

function RemoteGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [progress, setProgress] = useState<PushProgress | null>(null)
  const [stepLabel, setStepLabel] = useState('Creating your workspace')
  // Set when a workspace row already exists but is empty, so provisioning
  // fills it in rather than creating a second one.
  const [existingWorkspace, setExistingWorkspace] = useState<string | null>(null)
  // A reset link signs you in, but the studio stays shut until a new password
  // is chosen; otherwise following the link would skip the reset entirely.
  const recovering = useRef(arrivedToRecover)

  const applySetup = useStore((s) => s.applySetup)
  const completeSetup = useStore((s) => s.completeSetup)
  const updateSettings = useStore((s) => s.updateSettings)

  /* ------------------------------------------------------------- session */

  useEffect(() => {
    const supabase = requireSupabase()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setPhase('signed-out')
      else setPhase(recovering.current ? 'recovery' : 'resolving')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') recovering.current = true
      setSession(next)
      if (!next) {
        stopSync()
        setPhase('signed-out')
      } else if (recovering.current) {
        setPhase('recovery')
      } else {
        setPhase((current) =>
          current === 'setup' || current === 'provisioning' ? current : 'resolving',
        )
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  /* ------------------------------------------- does a workspace exist yet */

  useEffect(() => {
    if (phase !== 'resolving' || !session) return
    let cancelled = false

    ;(async () => {
      try {
        const existing = await findWorkspace()
        if (cancelled) return

        // First sign-in: ask for everything the CRM needs before creating anything.
        if (!existing) {
          setPhase('setup')
          return
        }

        setStepLabel('Opening your studio')
        const hasData = await hydrate(existing)
        if (cancelled) return

        /*
         * The workspace row exists but holds nothing — a first sign-in that was
         * interrupted before its data was written. Finish setup rather than
         * opening a studio with no team, no pipeline and no way back.
         */
        if (!hasData) {
          setExistingWorkspace(existing)
          setPhase('setup')
          return
        }

        startSync(existing)
        setPhase('ready')
      } catch (caught) {
        if (cancelled) return
        setError(describe(caught))
        setPhase('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [phase, session])

  /* ------------------------------------------------------- provisioning */

  const provision = useCallback(
    async (result: SetupResult) => {
      if (!session) return
      setPhase('provisioning')
      setProgress(null)

      try {
        // 1. Apply the answers locally first, so what gets pushed is already
        //    the studio they asked for rather than the defaults.
        setStepLabel('Setting up your studio')
        updateSettings({ theme: result.theme, themeChosen: true })
        completeSetup(
          {
            name: result.name,
            tagline: result.tagline,
            ownerName: result.ownerName,
            ownerRole: result.ownerRole,
            ownerEmail: result.ownerEmail,
            accent: result.accent,
            currency: result.currency,
            locale: result.locale,
          },
          result.start,
        )
        applySetup(result)
        await tick()

        // 2. Create the workspace row and the owner's membership, atomically.
        setStepLabel(existingWorkspace ? 'Preparing your workspace' : 'Creating your workspace')
        const workspaceId = existingWorkspace ?? (await createWorkspace(result))

        // 3. Write everything up, reporting what is going where.
        setStepLabel('Saving to your database')
        await pushAll(workspaceId, setProgress)

        // 4. Read it back, so what is on screen is what is actually stored.
        setStepLabel('Opening your studio')
        await hydrate(workspaceId)
        startSync(workspaceId)
        setPhase('ready')
      } catch (caught) {
        setError(describe(caught))
        setPhase('error')
      }
    },
    [session, applySetup, completeSetup, updateSettings, existingWorkspace],
  )

  /* --------------------------------------------------------------- render */

  if (phase === 'signed-out') return <SignIn initialMessage={linkError} />
  if (phase === 'recovery') {
    return (
      <SetNewPassword
        email={session?.user.email ?? ''}
        onDone={() => {
          recovering.current = false
          setPhase('resolving')
        }}
      />
    )
  }
  if (phase === 'setup') {
    return (
      <Onboarding
        onProvision={provision}
        defaultEmail={session?.user.email ?? ''}
        // Google hands over a name; email sign-up does not.
        defaultName={(session?.user.user_metadata?.full_name as string | undefined) ?? ''}
      />
    )
  }
  if (phase === 'provisioning') {
    return <Provisioning label={stepLabel} progress={progress} />
  }
  if (phase === 'checking' || phase === 'resolving') return <Loading label={stepLabel} />
  if (phase === 'error') {
    return <ConnectionError message={error} onRetry={() => setPhase('resolving')} />
  }
  return <>{children}</>
}

/* ------------------------------------------------------------- workspace -- */

/** The caller's workspace id, or null if they have not set one up yet. */
async function findWorkspace(): Promise<string | null> {
  const supabase = requireSupabase()

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.workspace_id as string) ?? null
}

/**
 * Creates the workspace and the owner's membership in one security-definer
 * call. Doing it from the client as two inserts is not atomic, and the first
 * insert has to satisfy a policy that cannot yet see a membership row.
 */
async function createWorkspace(result: SetupResult): Promise<string> {
  const supabase = requireSupabase()

  const { data, error } = await supabase.rpc('create_workspace', {
    p_name: result.name || 'My studio',
    p_tagline: result.tagline ?? '',
    p_accent: result.accent ?? 'lime',
  })

  if (error) {
    if (/function .*create_workspace/i.test(error.message)) {
      throw new Error(
        'The workspace bootstrap function is missing. Run supabase/migrations/0002_bootstrap.sql in the SQL editor.',
      )
    }
    const { data: uid } = await supabase.rpc('whoami')
    if (!uid) {
      throw new Error(
        `The database did not receive your session, so every permission check failed. ` +
          `Original error: ${error.message}`,
      )
    }
    throw new Error(error.message)
  }

  if (!data) throw new Error('The workspace was not created.')
  return data as string
}

function describe(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

/** Let React paint the state change before the next await blocks the thread. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 60))

/* ---------------------------------------------------------------- screens -- */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-5 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

function SignIn({ initialMessage = '' }: { initialMessage?: string }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(
    initialMessage && `That did not work: ${initialMessage}. Try again.`,
  )

  async function continueWithGoogle() {
    setBusy(true)
    setMessage('')
    // On success the browser leaves for Google, so busy is only ever reset on failure.
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: RETURN_URL },
    })
    if (error) {
      setBusy(false)
      setMessage(error.message)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const supabase = requireSupabase()

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Back to this app, wherever it is served from.
        redirectTo: RETURN_URL,
      })
      setBusy(false)
      // Same answer whether or not the address has an account, so the form
      // cannot be used to find out who does.
      setMessage(
        error
          ? error.message
          : `If ${email} has an account, a reset link is on its way. It opens CRMO and asks for a new password.`,
      )
      return
    }

    const { error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    if (mode === 'sign-up') {
      setMessage('Check your email to confirm the address, then sign in.')
    }
  }

  return (
    <Shell>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo size={44} />
        <div>
          <h1 className="text-title font-medium tracking-title">{BRAND.full}</h1>
          <p className="mt-1 text-base text-ink-muted">{BRAND.tagline}</p>
        </div>
      </div>

      <Card variant="raised" padding="lg" radius="3xl">
        {mode === 'reset' ? (
          <div className="mb-6">
            <h2 className="text-lg font-medium tracking-tight">Reset your password</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Enter the email you sign in with and we will send you a link to choose a new
              password.
            </p>
          </div>
        ) : (
          <div role="tablist" aria-label="Sign in or create an account" className="mb-6 flex gap-1.5">
            {(['sign-in', 'sign-up'] as const).map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={mode === option}
                onClick={() => {
                  setMode(option)
                  setMessage('')
                }}
                className={cn(
                  'h-9 flex-1 rounded-pill text-sm font-medium transition-colors duration-fast',
                  mode === option ? 'bg-inverse text-on-inverse' : 'bg-surface text-ink-muted',
                )}
              >
                {option === 'sign-in' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}

        {mode !== 'reset' && (
          <>
            <Button
              block
              icon={<GoogleMark />}
              onClick={continueWithGoogle}
              disabled={busy}
              // The card and a secondary button share a surface; the ring keeps it a button.
              className="ring-1 ring-line-strong ring-inset"
            >
              Continue with Google
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs text-ink-faint" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              or with email
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          {mode !== 'reset' && (
            <Input
              label="Password"
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
              required
            />
          )}

          {message && (
            <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-muted" role="status">
              {message}
            </p>
          )}

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy
              ? 'Working…'
              : mode === 'sign-in'
                ? 'Sign in'
                : mode === 'sign-up'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>

          {mode !== 'sign-up' && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'reset' ? 'sign-in' : 'reset')
                setMessage('')
              }}
              className="self-center text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          )}
        </form>
      </Card>

      <p className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-faint">
        <Cloud size={12} aria-hidden />
        Connected to Supabase
      </p>
    </Shell>
  )
}

/** Google's own four-colour G, which its sign-in branding asks for. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

/** Shown after following a reset link: the session exists, the password does not yet. */
function SetNewPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setMessage('The two passwords do not match.')
      return
    }
    setBusy(true)
    setMessage('')
    const { error } = await requireSupabase().auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    onDone()
  }

  return (
    <Shell>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo size={44} />
        <div>
          <h1 className="text-title font-medium tracking-title">Choose a new password</h1>
          {email && <p className="mt-1 text-base text-ink-muted">For {email}</p>}
        </div>
      </div>

      <Card variant="raised" padding="lg" radius="3xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            hint="At least 8 characters."
            required
            autoFocus
          />
          <Input
            label="Confirm it"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />

          {message && (
            <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-muted" role="status">
              {message}
            </p>
          )}

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Saving…' : 'Save and open CRMO'}
          </Button>
        </form>
      </Card>
    </Shell>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <Shell>
      <div className="flex flex-col items-center gap-5">
        <Logo size={44} />
        <p className="flex items-center gap-2 text-base text-ink-muted">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {label}…
        </p>
        <div className="w-full space-y-2" aria-hidden>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </Shell>
  )
}

/**
 * Provisioning can move a few hundred records, so it says what it is doing and
 * how far along it is rather than showing an unqualified spinner.
 */
function Provisioning({ label, progress }: { label: string; progress: PushProgress | null }) {
  const workspace = useStore((s) => s.settings.workspace)
  const seen = useRef<string[]>([])

  if (progress?.label && progress.label !== 'done' && !seen.current.includes(progress.label)) {
    seen.current = [...seen.current.slice(-3), progress.label]
  }

  const ratio = progress ? progress.done / Math.max(1, progress.total) : 0

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo size={48} />
          <div>
            <h1 className="text-title font-medium tracking-title text-balance">
              Building {workspace.name || 'your studio'}
            </h1>
            <p className="mt-2 text-base text-pretty text-ink-muted">
              Setting up your workspace, your pipeline and your profile. This only happens once.
            </p>
          </div>
        </div>

        <Card variant="raised" padding="lg" radius="3xl">
          <p
            className="flex items-center gap-2.5 text-base font-medium"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={16} className="animate-spin text-ink-muted" aria-hidden />
            {label}
          </p>

          {progress && (
            <>
              <Meter value={ratio} tone="lime" className="mt-4" label="Setup progress" />
              <p className="tabular mt-2 flex items-baseline justify-between text-xs text-ink-muted">
                <span>
                  {progress.label === 'done' ? 'Finishing up' : `Writing ${progress.label}`}
                </span>
                <span>
                  {progress.done} of {progress.total}
                </span>
              </p>
            </>
          )}

          {seen.current.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1.5 border-t border-line-soft pt-4">
              {seen.current.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-ink-muted">
                  <Check size={13} className="shrink-0 text-positive" aria-hidden />
                  <span className="truncate">Saved {item}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="mt-5 text-center text-xs text-ink-faint">
          Nothing here is permanent — everything can be changed in Settings.
        </p>
      </div>
    </div>
  )
}

function ConnectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const supabase = requireSupabase()

  return (
    <Shell>
      <Card variant="raised" padding="lg" radius="3xl" className="text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-critical-wash text-critical">
          <AlertTriangle size={20} aria-hidden />
        </span>
        <h1 className="text-xl font-medium tracking-title">Could not open the workspace</h1>
        <p className="mt-2 text-sm text-pretty text-ink-muted">{message}</p>
        <p className="mt-3 text-xs text-pretty text-ink-faint">
          If this mentions a missing table or function, a migration in
          <code className="mx-1">supabase/migrations</code> has not been run yet.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" block onClick={onRetry}>
            Try again
          </Button>
          <Button block onClick={() => void supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </Shell>
  )
}

/* --------------------------------------------------------- mode indicator -- */

/** Badge for Settings showing where the data actually lives. */
export function StorageModeBadge() {
  return isRemote ? (
    <Pill tone="positive" icon={<Cloud size={11} />}>
      Synced to Supabase
    </Pill>
  ) : (
    <Pill tone="neutral" icon={<HardDrive size={11} />}>
      This browser only
    </Pill>
  )
}

export async function signOut() {
  stopSync()
  await requireSupabase().auth.signOut()
}

export { createSeedDatabase, createEmptyDatabase }

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================================
   FORM CONTROLS
   Every control is labelled, every error is announced, and the focus ring is
   the one defined in base.css — never removed.
   ========================================================================== */

const CONTROL =
  'w-full rounded-lg bg-raised px-3.5 text-base text-ink shadow-xs ' +
  'transition-[box-shadow,background-color] duration-fast ease-out-soft ' +
  'hover:shadow-sm focus:shadow-sm disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-faint ' +
  // A shadow does not show on a dark raised card, so dark draws the edge.
  'dark:ring-1 dark:ring-inset dark:ring-line-strong'

/* ---------------------------------------------------------------- Field -- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 text-critical" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Input -- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id, required, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  const control = (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'h-11', icon ? 'pl-10' : '', className)}
        {...rest}
      />
    </div>
  )

  if (!label) return control
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      {control}
    </Field>
  )
})

/* ------------------------------------------------------------- Textarea -- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, rows = 4, ...rest },
  ref,
) {
  const generatedId = useId()
  const areaId = id ?? generatedId

  const control = (
    <textarea
      ref={ref}
      id={areaId}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, 'resize-y py-3 leading-relaxed', className)}
      {...rest}
    />
  )

  if (!label) return control
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={areaId}>
      {control}
    </Field>
  )
})

/* --------------------------------------------------------------- Select -- */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id, required, ...rest },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  const control = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'h-11 cursor-pointer appearance-none pr-10', className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
    </div>
  )

  if (!label) return control
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={selectId}>
      {control}
    </Field>
  )
})

/* ------------------------------------------------------------- Checkbox -- */

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-xs border transition-colors duration-fast ease-out-soft',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
          checked
            ? 'border-ink bg-ink text-on-inverse'
            : 'border-line-strong bg-raised group-hover:border-ink-faint',
        )}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-base leading-tight">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>}
      </span>
    </label>
  )
}

/* --------------------------------------------------------------- Switch -- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <p className="text-base">{label}</p>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-pill transition-colors duration-base ease-out-soft',
          checked ? 'bg-ink' : 'bg-line-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1 size-4 rounded-full bg-raised shadow-sm transition-[left] duration-base ease-out-soft',
            checked ? 'left-6' : 'left-1',
          )}
        />
      </button>
    </div>
  )
}

/* ---------------------------------------------------------- SearchInput -- */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  className?: string
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only-focusable absolute">
        {label}
      </label>
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-11 w-full rounded-pill bg-raised pr-10 pl-11 text-base shadow-xs',
          'transition-shadow duration-fast ease-out-soft hover:shadow-sm focus:shadow-sm',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-faint transition-colors duration-fast hover:bg-surface hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------ Inline editable -- */

/**
 * Click-to-edit text. Used for moodboard section titles and captions, where
 * opening a modal to change three words would be the wrong weight.
 */
export function InlineEdit({
  value,
  onCommit,
  label,
  placeholder = 'Untitled',
  as: As = 'span',
  className,
}: {
  value: string
  onCommit: (value: string) => void
  label: string
  placeholder?: string
  as?: 'span' | 'h2' | 'h3' | 'p'
  className?: string
}) {
  return (
    <As className={className}>
      <span
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        aria-label={label}
        data-placeholder={placeholder}
        onBlur={(event) => {
          const next = event.currentTarget.textContent?.trim() ?? ''
          if (next !== value) onCommit(next || placeholder)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.currentTarget.textContent = value
            event.currentTarget.blur()
          }
        }}
        className={cn(
          '-mx-1 inline-block min-w-8 cursor-text rounded-xs px-1 outline-none',
          'transition-colors duration-fast hover:bg-surface focus:bg-surface',
          'empty:before:text-ink-faint empty:before:content-[attr(data-placeholder)]',
        )}
      >
        {value}
      </span>
    </As>
  )
}

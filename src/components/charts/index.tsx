import { useId } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================================
   CHARTS
   Hand-drawn SVG rather than a charting library, because the reference look —
   thin strokes, diagonal-hatch fills, grey bars with a single lime one, one
   lime pill callout — is not something a library will give you.

   All of them are decorative-by-default and paired with real numbers in text,
   so a screen reader user never depends on the drawing.
   ========================================================================== */

/** Reusable 45° hatch pattern, the signature fill from the references. */
function Hatch({ id, color = 'var(--color-ink)' }: { id: string; color?: string }) {
  return (
    <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="2.4" opacity="0.28" />
    </pattern>
  )
}

function buildPath(points: number[], width: number, height: number, pad = 2): string {
  if (points.length === 0) return ''
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const step = points.length > 1 ? width / (points.length - 1) : width
  return points
    .map((value, index) => {
      const x = index * step
      const y = pad + (1 - (value - min) / range) * (height - pad * 2)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/* ------------------------------------------------------------- Sparkline -- */

export function Sparkline({
  points,
  width = 120,
  height = 32,
  className,
  tone = 'ink',
}: {
  points: number[]
  width?: number
  height?: number
  className?: string
  tone?: 'ink' | 'lime'
}) {
  const path = buildPath(points, width, height)
  const stroke = tone === 'lime' ? 'var(--color-lime)' : 'var(--color-ink)'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle
          cx={width}
          cy={
            2 +
            (1 -
              (points[points.length - 1] - Math.min(...points, 0)) /
                (Math.max(...points, 1) - Math.min(...points, 0) || 1)) *
              (height - 4)
          }
          r="2.5"
          fill={stroke}
        />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------ HatchArea -- */

/**
 * Two series with the gap between them hatched — the "Comparison of Revenue"
 * chart from the references. Optionally shows one lime callout badge.
 */
export function HatchArea({
  seriesA,
  seriesB,
  labels,
  callout,
  height = 150,
  labelA = 'This period',
  labelB = 'Last period',
  className,
}: {
  seriesA: number[]
  seriesB: number[]
  labels: string[]
  callout?: { index: number; text: string }
  height?: number
  labelA?: string
  labelB?: string
  className?: string
}) {
  const hatchId = useId()
  const width = 520
  const chartH = height - 26

  const all = [...seriesA, ...seriesB]
  const max = Math.max(...all, 1)
  const min = Math.min(...all, 0)
  const range = max - min || 1
  const step = seriesA.length > 1 ? width / (seriesA.length - 1) : width

  const y = (value: number) => 6 + (1 - (value - min) / range) * (chartH - 12)
  const x = (index: number) => index * step

  const pathA = seriesA.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const pathB = seriesB.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const band = `${pathA} L${x(seriesB.length - 1)},${y(seriesB[seriesB.length - 1])} ${seriesB
    .slice()
    .reverse()
    .map((v, i) => `L${x(seriesB.length - 1 - i)},${y(v)}`)
    .join(' ')} Z`

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${labelA} compared with ${labelB} across ${labels.join(', ')}`}
      >
        <defs>
          <Hatch id={hatchId} />
        </defs>
        <path d={band} fill={`url(#${hatchId})`} />
        <path d={pathB} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.2" />
        <path d={pathA} fill="none" stroke="var(--color-ink)" strokeWidth="1.4" />
        {seriesA.map((v, i) => (
          <circle key={`a${i}`} cx={x(i)} cy={y(v)} r="2.4" fill="var(--color-ink)" />
        ))}
        {seriesB.map((v, i) => (
          <circle key={`b${i}`} cx={x(i)} cy={y(v)} r="2.4" fill="var(--color-line-strong)" />
        ))}

        {callout && seriesA[callout.index] !== undefined && (
          <g transform={`translate(${x(callout.index)}, ${y(seriesA[callout.index])})`}>
            <line y1="0" y2={y(seriesB[callout.index]) - y(seriesA[callout.index])} stroke="var(--color-ink)" strokeWidth="1" />
            <rect x="-24" y="-12" width="48" height="21" rx="10.5" fill="var(--color-lime)" />
            <text
              x="0"
              y="2.5"
              textAnchor="middle"
              fontSize="11"
              fontWeight="500"
              fill="#0a0a0a"
              className="font-sans"
            >
              {callout.text}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-1.5 flex justify-between text-xs opacity-70">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------ BarSeries -- */

/**
 * Rounded grey bars with one highlighted in lime — the "Activity" chart from
 * the references. The highlighted bar carries a value badge.
 */
export function BarSeries({
  data,
  highlightIndex,
  height = 120,
  formatValue,
  className,
  label,
}: {
  data: Array<{ label: string; value: number }>
  highlightIndex?: number
  height?: number
  formatValue?: (value: number) => string
  className?: string
  label: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const peak = highlightIndex ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)

  return (
    <figure className={cn('w-full', className)}>
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height }}
        role="img"
        aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      >
        {data.map((item, index) => {
          const isPeak = index === peak
          const barHeight = Math.max(6, (item.value / max) * (height - 26))
          return (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {isPeak && (
                <span className="tabular rounded-pill bg-lime px-2 py-0.5 text-2xs font-medium text-[#0a0a0a]">
                  {formatValue ? formatValue(item.value) : item.value}
                </span>
              )}
              <div
                className={cn(
                  'w-full rounded-md transition-[height] duration-slow ease-out-soft',
                  isPeak ? 'bg-lime' : 'bg-line-soft dark:bg-line-strong',
                )}
                style={{ height: barHeight }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {data.map((item) => (
          <span key={item.label} className="min-w-0 flex-1 truncate text-center text-xs opacity-70">
            {item.label}
          </span>
        ))}
      </div>
    </figure>
  )
}

/* ---------------------------------------------------------- PipelineBar -- */

/** Proportional stacked bar for pipeline value by stage. */
export function PipelineBar({
  segments,
  className,
}: {
  segments: Array<{ id: string; name: string; value: number }>
  className?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const shades = ['bg-ink', 'bg-ink/70', 'bg-lime', 'bg-lime-pale', 'bg-line-strong']

  if (total === 0) {
    return <div className={cn('h-3 w-full rounded-pill bg-line', className)} aria-hidden />
  }

  return (
    <div
      className={cn('flex h-3 w-full gap-0.5 overflow-hidden rounded-pill', className)}
      role="img"
      aria-label={segments.map((s) => `${s.name}: ${s.value}`).join(', ')}
    >
      {segments.map((segment, index) => (
        <div
          key={segment.id}
          className={cn('h-full first:rounded-l-pill last:rounded-r-pill', shades[index % shades.length])}
          style={{ width: `${(segment.value / total) * 100}%` }}
          title={segment.name}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- Heatgrid -- */

/**
 * The rounded-square matrix from the references, used for activity density.
 * Values are 0–1.
 */
export function Heatgrid({
  values,
  columns = 14,
  label,
  className,
}: {
  values: number[]
  columns?: number
  label: string
  className?: string
}) {
  return (
    <div
      className={cn('grid gap-1', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="img"
      aria-label={label}
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            'aspect-square rounded-xs',
            // The light tints sit almost exactly on a dark raised card, so dark
            // steps through the accent's own opacity instead.
            value === 0
              ? 'bg-line-soft dark:bg-line-strong'
              : value < 0.34
                ? 'bg-lime-wash dark:bg-lime/30'
                : value < 0.67
                  ? 'bg-lime-pale dark:bg-lime/60'
                  : 'bg-lime',
          )}
        />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------- DonutSplit -- */

/** Two-value donut used for budget and capacity reads. */
export function DonutSplit({
  value,
  size = 120,
  caption,
  centre,
  tone = 'ink',
}: {
  value: number
  size?: number
  caption?: string
  centre?: string
  tone?: 'ink' | 'lime' | 'caution' | 'critical'
}) {
  const clamped = Math.max(0, Math.min(1, value))
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const colors = {
    ink: 'var(--color-ink)',
    lime: 'var(--color-lime)',
    caution: 'var(--color-caution)',
    critical: 'var(--color-critical)',
  }

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            className="transition-[stroke-dashoffset] duration-slow ease-out-soft"
          />
        </svg>
        {centre && (
          <span className="tabular absolute inset-0 grid place-items-center text-xl font-medium tracking-tight">
            {centre}
          </span>
        )}
      </div>
      {caption && <figcaption className="text-sm text-ink-muted">{caption}</figcaption>}
    </figure>
  )
}

import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { forwardRef } from 'react'

import { cn } from '@/shared/lib/cn'

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ className, variant = 'primary', size = 'md', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'btn-base',
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && 'px-3 py-2 text-sm',
        size === 'md' && 'px-4 py-3 text-sm',
        size === 'lg' && 'px-5 py-3.5 text-base',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none',
        className,
      )}
      {...props}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn('field-shell', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn('field-shell min-h-32 resize-y', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn('field-shell appearance-none', className)} {...props} />
})

export function Panel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <section className={cn('blend-section', className)}>{children}</section>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: ReactNode
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div className="space-y-5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="hero-title max-w-[16ch] text-black">{title}</h1>
        <p className="body-copy max-w-3xl">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3 xl:justify-end">{actions}</div> : null}
    </header>
  )
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-[1.58rem] font-medium tracking-[-0.045em] text-black">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-7 text-[#666d80]">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint: string
  accent?: string
}) {
  return (
    <div className="surface-subtle p-5">
      <div className="space-y-6">
        <p className="eyebrow">{label}</p>
        <div className="space-y-2">
          <p className="metric-value" style={accent ? { color: accent } : undefined}>
            {value}
          </p>
          <p className="text-sm leading-6 text-[#666d80]">{hint}</p>
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="surface-subtle flex flex-col items-start gap-3 p-5">
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="max-w-xl text-sm leading-6 text-[#666d80]">{description}</p>
      {action}
    </div>
  )
}

export function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="page-shell flex min-h-screen items-center justify-center">
      <div className="blend-section flex w-full max-w-xl flex-col gap-5 px-8 py-10 text-center">
        <p className="eyebrow">Potato Todo</p>
        <h1 className="section-title">Opening your workspace</h1>
        <p className="body-copy">{message}</p>
        <div className="mx-auto h-1.5 w-40 overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
          <div className="h-full w-1/2 rounded-full bg-[#796dff]" />
        </div>
      </div>
    </div>
  )
}

export function InlineMessage({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'danger' | 'success'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[18px] px-4 py-3 text-sm',
        tone === 'neutral' && 'bg-[#f3f3f3] text-[#666d80]',
        tone === 'danger' && 'bg-[rgba(196,81,67,0.1)] text-[#8e3e36]',
        tone === 'success' && 'bg-[rgba(45,138,94,0.1)] text-[#236746]',
      )}
    >
      {children}
    </div>
  )
}

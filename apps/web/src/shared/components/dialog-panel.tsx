import type { ReactNode } from 'react'

import * as Dialog from '@radix-ui/react-dialog'

export function DialogPanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  title: string
  description: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(18,24,36,0.16)] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.98)] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.12)]">
          <div className="space-y-5">
            <div className="space-y-2">
              <Dialog.Title className="text-2xl font-semibold leading-[1.04] tracking-[-0.05em] text-[#1d1d1f]">{title}</Dialog.Title>
              <Dialog.Description className="text-sm leading-7 text-[#6e6e73]">
                {description}
              </Dialog.Description>
            </div>
            <div>{children}</div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button className="btn-base btn-ghost px-4 py-2.5 text-sm">Close</button>
              </Dialog.Close>
              {footer}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

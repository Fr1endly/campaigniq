import { ChartNoAxesCombined } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-emerald-300 text-emerald-950 shadow-sm">
        <ChartNoAxesCombined className="size-4.5" strokeWidth={2.25} />
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold text-inherit">
          CampaignIQ
        </span>
      )}
    </div>
  )
}

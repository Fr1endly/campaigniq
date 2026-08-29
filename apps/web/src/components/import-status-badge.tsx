import type { ImportStatus } from '@campaign-iq/contracts'
import { LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const statusLabels: Record<ImportStatus, string> = {
  received: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const active =
    status === 'received' || status === 'uploading' || status === 'processing'
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md',
        status === 'completed' &&
          'border-emerald-200 bg-emerald-50 text-emerald-800',
        status === 'failed' && 'border-red-200 bg-red-50 text-red-700',
        active && 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      {active && <LoaderCircle className="animate-spin" />}
      {statusLabels[status]}
    </Badge>
  )
}

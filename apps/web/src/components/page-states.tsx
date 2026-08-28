import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-5 sm:p-7 lg:p-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 bg-card p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-5 h-7 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[340px] w-full rounded-lg" />
    </div>
  )
}

export function PageError({
  error,
  reset,
}: {
  error: Error
  reset?: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Unable to load this view</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        {reset && (
          <Button className="mt-5" variant="outline" onClick={reset}>
            <RotateCcw data-icon="inline-start" />
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

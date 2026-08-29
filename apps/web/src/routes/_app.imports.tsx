import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileWarning, RefreshCw } from 'lucide-react'
import { importListQuerySchema } from '@campaign-iq/contracts'
import type { ImportListQuery } from '@campaign-iq/contracts'
import { ImportStatusBadge } from '@/components/import-status-badge'
import { ImportUpload } from '@/components/import-upload'
import { PageError, PageLoading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from '@/lib/formatters'
import { getImportsFn, getWarehouseStatusFn } from '@/lib/server-functions'

export const Route = createFileRoute('/_app/imports')({
  validateSearch: (search) => importListQuerySchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [imports, warehouse] = await Promise.all([
      getImportsFn({ data: deps }),
      getWarehouseStatusFn(),
    ])
    return { ...imports, warehouse }
  },
  head: () => ({ meta: [{ title: 'Imports | CampaignIQ' }] }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: ImportsPage,
})

function ImportsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const { session } = Route.useRouteContext()
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const hasActiveImports = data.items.some(
    (item) => item.status === 'received' || item.status === 'processing',
  )
  const refreshPending =
    data.warehouse.reporting.status === 'refreshing' ||
    data.warehouse.reporting.status === 'stale'

  useEffect(() => {
    if (!hasActiveImports && !refreshPending) return
    const timeout = window.setTimeout(() => void router.invalidate(), 2000)
    return () => window.clearTimeout(timeout)
  }, [hasActiveImports, refreshPending, router, data.items])

  async function retryRefresh() {
    setRefreshBusy(true)
    setRefreshError('')
    try {
      const response = await fetch('/api/warehouse/refresh', { method: 'POST' })
      if (!response.ok)
        throw new Error(`Refresh request failed (${response.status})`)
      await router.invalidate()
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : 'Refresh request failed',
      )
    } finally {
      setRefreshBusy(false)
    }
  }

  function updateSearch(next: Partial<ImportListQuery>) {
    navigate({ search: (previous) => ({ ...previous, ...next }) })
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Imports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Load canonical campaign CSVs and monitor warehouse processing.
        </p>
      </div>

      <section
        className="mt-6 grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Warehouse status"
      >
        <div className="border-b p-4 sm:border-r xl:border-b-0">
          <p className="text-xs font-medium text-muted-foreground">
            Data through
          </p>
          <p className="mt-2 text-xl font-semibold">
            {data.warehouse.dataAsOf
              ? formatDate(data.warehouse.dataAsOf, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'No data'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.warehouse.reporting.status === 'current'
              ? 'Reporting current'
              : `Reporting ${data.warehouse.reporting.status}`}
          </p>
        </div>
        <div className="border-b p-4 xl:border-b-0 xl:border-r">
          <p className="text-xs font-medium text-muted-foreground">
            Warehouse facts
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {formatNumber(data.warehouse.factCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(data.warehouse.campaignCount)} campaigns
          </p>
        </div>
        <div className="border-b p-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-muted-foreground">
            Valid rows · 30d
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {formatPercent(data.warehouse.trailing30Days.validRate, 1)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(data.warehouse.trailing30Days.loadedRows)} loaded
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Processing rate · 30d
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {data.warehouse.trailing30Days.rowsPerSecond === null
              ? '—'
              : `${formatNumber(data.warehouse.trailing30Days.rowsPerSecond)} rows/s`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercent(data.warehouse.trailing30Days.successRate, 1)}{' '}
            successful
          </p>
        </div>
      </section>

      {(data.warehouse.reporting.status === 'stale' ||
        data.warehouse.reporting.status === 'failed') && (
        <div className="mt-3 flex flex-col gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-amber-950">
            Reporting is using live warehouse facts while the aggregate is{' '}
            {data.warehouse.reporting.status}.
            {data.warehouse.reporting.errorMessage
              ? ` ${data.warehouse.reporting.errorMessage}`
              : ''}
          </p>
          {['owner', 'admin'].includes(session.organization.role) && (
            <Button
              variant="outline"
              size="sm"
              disabled={refreshBusy}
              onClick={retryRefresh}
            >
              <RefreshCw className={refreshBusy ? 'animate-spin' : undefined} />
              Retry refresh
            </Button>
          )}
        </div>
      )}
      {refreshError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {refreshError}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        <ImportUpload />

        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-semibold">Import history</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Received, loaded, and rejected row totals for this workspace.
            </p>
          </div>
          <Select
            value={search.status || 'all'}
            onValueChange={(status) =>
              updateSearch({
                status:
                  status === 'all' ? '' : (status as ImportListQuery['status']),
                page: 1,
              })
            }
          >
            <SelectTrigger
              className="w-full sm:w-40"
              aria-label="Filter imports by status"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="uploading">Uploading</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.items.length ? (
          <div className="max-w-full overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Loaded</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Changed</TableHead>
                  <TableHead className="text-right">Unchanged</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium">{item.filename}</p>
                      {item.errorMessage && (
                        <p
                          className="mt-0.5 truncate text-xs text-destructive"
                          title={item.errorMessage}
                        >
                          {item.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <ImportStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(item.receivedRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(item.loadedRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(item.rejectedRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.insertedRows === null
                        ? '—'
                        : formatNumber(item.insertedRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.updatedRows === null
                        ? '—'
                        : formatNumber(item.updatedRows)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.unchangedRows === null
                        ? '—'
                        : formatNumber(item.unchangedRows)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(item.durationMs)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/data-quality" search={{ importId: item.id }}>
                          <FileWarning />
                          Inspect
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center p-8 text-center">
            <div>
              <p className="font-medium">No imports found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload a CSV or change the status filter.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-muted-foreground">
            {data.pagination.totalItems === 0
              ? '0 imports'
              : `${(data.pagination.page - 1) * data.pagination.pageSize + 1}–${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalItems)} of ${data.pagination.totalItems}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page <= 1}
              onClick={() => updateSearch({ page: data.pagination.page - 1 })}
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => updateSearch({ page: data.pagination.page + 1 })}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

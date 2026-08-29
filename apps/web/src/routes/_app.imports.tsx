import { useEffect } from 'react'
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react'
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
import { formatDateTime, formatDuration, formatNumber } from '@/lib/formatters'
import { getImportsFn } from '@/lib/server-functions'

export const Route = createFileRoute('/_app/imports')({
  validateSearch: (search) => importListQuerySchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getImportsFn({ data: deps }),
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
  const hasActiveImports = data.items.some(
    (item) => item.status === 'received' || item.status === 'processing',
  )

  useEffect(() => {
    if (!hasActiveImports) return
    const timeout = window.setTimeout(() => void router.invalidate(), 2000)
    return () => window.clearTimeout(timeout)
  }, [hasActiveImports, router, data.items])

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
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Loaded</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
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

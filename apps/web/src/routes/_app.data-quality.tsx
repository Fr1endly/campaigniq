import { useEffect } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, LoaderCircle, Rows3 } from 'lucide-react'
import { z } from 'zod'
import { ImportStatusBadge } from '@/components/import-status-badge'
import { PageError, PageLoading } from '@/components/page-states'
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
import { formatDateTime, formatNumber } from '@/lib/formatters'
import { getImportIssuesFn, getImportsFn } from '@/lib/server-functions'

const dataQualitySearchSchema = z.object({
  importId: z.string().uuid().optional(),
})

export const Route = createFileRoute('/_app/data-quality')({
  validateSearch: (search) => dataQualitySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const imports = await getImportsFn({
      data: { status: '', page: 1, pageSize: 100 },
    })
    const selectedId =
      deps.importId ??
      imports.items.find((item) => item.status === 'completed')?.id ??
      imports.items[0]?.id
    const report = selectedId
      ? await getImportIssuesFn({ data: { id: selectedId } })
      : null
    return { imports: imports.items, selectedId, report }
  },
  head: () => ({ meta: [{ title: 'Data Quality | CampaignIQ' }] }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: DataQualityPage,
})

const issueLabels: Record<string, string> = {
  missing_required_value: 'Missing required value',
  invalid_date: 'Invalid date',
  invalid_integer: 'Invalid integer',
  invalid_decimal: 'Invalid decimal',
  value_out_of_range: 'Value out of range',
  negative_value: 'Negative value',
  clicks_exceed_impressions: 'Clicks exceed impressions',
  conversions_exceed_clicks: 'Conversions exceed clicks',
  duplicate_record: 'Duplicate input record',
}

function issueLabel(value: string) {
  return issueLabels[value] ?? value.replaceAll('_', ' ')
}

function DataQualityPage() {
  const data = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const report = data.report
  const pending =
    report &&
    report.import.status !== 'completed' &&
    report.import.status !== 'failed'

  useEffect(() => {
    if (!pending) return
    const timeout = window.setTimeout(() => void router.invalidate(), 2000)
    return () => window.clearTimeout(timeout)
  }, [pending, router, report])

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Data Quality</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect rejected rows by validation rule and canonical field.
          </p>
        </div>
        {data.imports.length > 0 && (
          <Select
            value={data.selectedId}
            onValueChange={(importId) => navigate({ search: { importId } })}
          >
            <SelectTrigger
              className="w-full sm:w-72"
              aria-label="Select import"
            >
              <SelectValue placeholder="Select an import" />
            </SelectTrigger>
            <SelectContent>
              {data.imports.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.filename} · {formatDateTime(item.createdAt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!report ? (
        <div className="mt-6 flex min-h-72 items-center justify-center rounded-lg border bg-card p-8 text-center">
          <div>
            <Rows3 className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No imports to inspect</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a CSV from Imports to create a quality report.
            </p>
          </div>
        </div>
      ) : (
        <>
          <section
            className="mt-6 overflow-hidden rounded-lg border bg-card"
            aria-labelledby="quality-summary-heading"
          >
            <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <h2
                  id="quality-summary-heading"
                  className="truncate text-base font-semibold"
                >
                  {report.import.filename}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Created {formatDateTime(report.import.createdAt)}
                </p>
              </div>
              <ImportStatusBadge status={report.import.status} />
            </div>

            <div className="grid divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4 sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">
                  Valid records
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {report.summary.validPercentage === null
                    ? '—'
                    : `${report.summary.validPercentage.toFixed(2)}%`}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">
                  Loaded rows
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatNumber(report.import.loadedRows)}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">
                  Rejected rows
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatNumber(report.import.rejectedRows)}
                </p>
              </div>
            </div>

            {report.import.receivedRows > 0 && (
              <div className="px-4 py-4 sm:px-6">
                <div
                  className="flex h-2 overflow-hidden rounded-full bg-muted"
                  aria-label="Loaded and rejected row proportion"
                >
                  <div
                    className="bg-emerald-600"
                    style={{ width: `${report.summary.validPercentage ?? 0}%` }}
                  />
                  <div
                    className="bg-amber-500"
                    style={{
                      width: `${100 - (report.summary.validPercentage ?? 0)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-600" />
                    Loaded
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-amber-500" />
                    Rejected
                  </span>
                </div>
              </div>
            )}
          </section>

          <section
            className="mt-6 overflow-hidden rounded-lg border bg-card"
            aria-labelledby="issues-heading"
          >
            <div className="border-b px-4 py-4 sm:px-6">
              <h2 id="issues-heading" className="text-base font-semibold">
                Issue breakdown
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                One primary validation issue is recorded per rejected row.
              </p>
            </div>
            {report.issues.length > 0 ? (
              <div className="max-w-full overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">
                        Share of issues
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.issues.map((issue) => (
                      <TableRow key={issue.id}>
                        <TableCell className="font-medium">
                          {issueLabel(issue.issueType)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {issue.field ?? 'Record'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(issue.count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {report.summary.totalIssues === 0
                            ? '—'
                            : `${((issue.count / report.summary.totalIssues) * 100).toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex min-h-48 items-center justify-center p-8 text-center">
                {report.import.status === 'failed' ? (
                  <div>
                    <AlertTriangle className="mx-auto size-6 text-amber-600" />
                    <p className="mt-3 font-medium">
                      The file could not be processed
                    </p>
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                      {report.import.errorMessage ??
                        'No row-level issues were produced.'}
                    </p>
                  </div>
                ) : report.import.status === 'completed' ? (
                  <div>
                    <CheckCircle2 className="mx-auto size-6 text-emerald-700" />
                    <p className="mt-3 font-medium">No row-level issues</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Every received row passed validation.
                    </p>
                  </div>
                ) : (
                  <div>
                    <LoaderCircle className="mx-auto size-6 animate-spin text-amber-700" />
                    <p className="mt-3 font-medium">Report pending</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Row-level results will appear when processing finishes.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

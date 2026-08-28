import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { campaignListQuerySchema } from '@campaign-iq/contracts'
import type { CampaignListQuery } from '@campaign-iq/contracts'
import { CampaignTable } from '@/components/campaign-table'
import { PageError, PageLoading } from '@/components/page-states'
import { RangeSelector } from '@/components/range-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCampaignsFn } from '@/lib/server-functions'

export const Route = createFileRoute('/_app/campaigns/')({
  validateSearch: (search) => campaignListQuerySchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getCampaignsFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Campaigns | CampaignIQ' }] }),
  pendingComponent: PageLoading,
  errorComponent: ({ error, reset }) => (
    <PageError error={error} reset={reset} />
  ),
  component: CampaignsPage,
})

function CampaignsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [searchInput, setSearchInput] = useState(search.search)

  useEffect(() => setSearchInput(search.search), [search.search])

  function updateSearch(next: Partial<CampaignListQuery>) {
    navigate({ search: (previous) => ({ ...previous, ...next }) })
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateSearch({ search: searchInput.trim(), page: 1 })
  }

  function sortBy(field: CampaignListQuery['sort']) {
    const order =
      search.sort === field
        ? search.order === 'desc'
          ? 'asc'
          : 'desc'
        : field === 'name' || field === 'channel'
          ? 'asc'
          : 'desc'
    updateSearch({ sort: field, order, page: 1 })
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare channel and campaign performance.
          </p>
        </div>
        <RangeSelector
          value={search.range}
          onChange={(range) => updateSearch({ range, page: 1 })}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <form className="flex w-full max-w-md gap-2" onSubmit={submitSearch}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search campaigns"
                className="pl-9"
                aria-label="Search campaigns"
              />
              {searchInput && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setSearchInput('')
                    updateSearch({ search: '', page: 1 })
                  }}
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <Select
            value={search.channel || 'all'}
            onValueChange={(channel) =>
              updateSearch({
                channel: channel === 'all' ? '' : channel,
                page: 1,
              })
            }
          >
            <SelectTrigger
              className="w-full sm:w-40"
              aria-label="Filter by channel"
            >
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {data.channels.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.items.length ? (
          <CampaignTable
            campaigns={data.items}
            range={search.range}
            sort={search.sort}
            order={search.order}
            onSort={sortBy}
          />
        ) : (
          <div className="flex min-h-64 items-center justify-center p-8 text-center">
            <div>
              <p className="font-medium">No campaigns found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust the search or channel filter.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            {data.pagination.totalItems === 0
              ? '0 campaigns'
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
      </section>
    </div>
  )
}

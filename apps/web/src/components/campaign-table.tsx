import type {
  CampaignPerformance,
  CampaignListQuery,
} from '@campaign-iq/contracts'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRatio,
} from '@/lib/formatters'

const channelStyles: Record<string, string> = {
  Google: 'border-blue-200 bg-blue-50 text-blue-700',
  Meta: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  LinkedIn: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  TikTok: 'border-pink-200 bg-pink-50 text-pink-700',
}

type SortKey = CampaignListQuery['sort']

export function CampaignTable({
  campaigns,
  range,
  sort,
  order,
  onSort,
  compact = false,
}: {
  campaigns: CampaignPerformance[]
  range: CampaignListQuery['range']
  sort?: SortKey
  order?: CampaignListQuery['order']
  onSort?: (sort: SortKey) => void
  compact?: boolean
}) {
  const SortHeader = ({
    label,
    field,
    align = 'right',
  }: {
    label: string
    field: SortKey
    align?: 'left' | 'right'
  }) => {
    const active = sort === field
    const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead className={align === 'right' ? 'text-right' : undefined}>
        {onSort ? (
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground',
              align === 'right' && 'justify-end',
            )}
            onClick={() => onSort(field)}
          >
            {label}
            <Icon className="size-3" />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
      </TableHead>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortHeader label="Campaign" field="name" align="left" />
          <SortHeader label="Channel" field="channel" align="left" />
          {!compact && <SortHeader label="Clicks" field="clicks" />}
          <SortHeader label="Spend" field="spend" />
          <SortHeader label="Revenue" field="revenue" />
          {!compact && <SortHeader label="CTR" field="ctr" />}
          <SortHeader label="ROAS" field="roas" />
          <TableHead className="w-10">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell className="min-w-48 py-3">
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId: campaign.id }}
                search={{ range }}
                className="font-medium hover:underline"
              >
                {campaign.name}
              </Link>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {campaign.externalId}
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={cn(
                  'rounded-md font-medium',
                  channelStyles[campaign.channel],
                )}
              >
                {campaign.channel}
              </Badge>
            </TableCell>
            {!compact && (
              <TableCell className="text-right tabular-nums">
                {formatNumber(campaign.clicks)}
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">
              {formatCurrency(campaign.spend)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(campaign.revenue)}
            </TableCell>
            {!compact && (
              <TableCell className="text-right tabular-nums">
                {formatPercent(campaign.ctr)}
              </TableCell>
            )}
            <TableCell className="text-right font-medium tabular-nums">
              {formatRatio(campaign.roas)}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon-sm"
                asChild
                title={`Open ${campaign.name}`}
              >
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: campaign.id }}
                  search={{ range }}
                >
                  <ChevronRight />
                  <span className="sr-only">Open {campaign.name}</span>
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

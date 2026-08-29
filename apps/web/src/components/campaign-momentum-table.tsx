import type { CampaignMomentum, RangePreset } from '@campaign-iq/contracts'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight } from 'lucide-react'
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
import { formatCurrency, formatPercent, formatRatio } from '@/lib/formatters'
import { cn } from '@/lib/utils'

const channelStyles: Record<string, string> = {
  Google: 'border-blue-200 bg-blue-50 text-blue-700',
  Meta: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  LinkedIn: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  TikTok: 'border-pink-200 bg-pink-50 text-pink-700',
}

function RankMovement({ value }: { value: number | null }) {
  const Icon =
    value === null || value === 0 ? ArrowRight : value > 0 ? ArrowUp : ArrowDown
  const label =
    value === null
      ? 'No prior rank'
      : value === 0
        ? 'No rank change'
        : `${Math.abs(value)} ${value > 0 ? 'up' : 'down'}`
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 tabular-nums',
        value !== null && value > 0 && 'text-emerald-700',
        value !== null && value < 0 && 'text-amber-700',
        (value === null || value === 0) && 'text-muted-foreground',
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="size-3.5" />
      {value === null ? '—' : Math.abs(value)}
    </span>
  )
}

export function CampaignMomentumTable({
  campaigns,
  range,
}: {
  campaigns: CampaignMomentum[]
  range: RangePreset
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead className="text-right">Movement</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Revenue change</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell className="font-semibold tabular-nums">
                {campaign.currentRank}
              </TableCell>
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
              <TableCell className="text-right">
                <RankMovement value={campaign.rankChange} />
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(campaign.revenue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(campaign.revenueChange, 1)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
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
    </div>
  )
}

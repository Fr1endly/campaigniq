import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  campaignDetailResponseSchema,
  campaignListQuerySchema,
  campaignListResponseSchema,
  dashboardQuerySchema,
  dashboardSummarySchema,
  sessionResponseSchema,
} from '@campaign-iq/contracts'

async function apiRequest(path: string) {
  const cookie = getRequestHeader('cookie')
  const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001'
  return fetch(new URL(path, apiOrigin), {
    headers: cookie ? { cookie } : undefined,
  })
}

async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `Request failed (${response.status})`)
    throw new Error(message)
  }
  return schema.parse(await response.json())
}

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const response = await apiRequest('/api/session')
    if (response.status === 401) return null
    return parseApiResponse(response, sessionResponseSchema)
  },
)

export const getDashboardFn = createServerFn({ method: 'GET' })
  .validator(dashboardQuerySchema)
  .handler(async ({ data }) => {
    const response = await apiRequest(
      `/api/dashboard/summary?range=${data.range}`,
    )
    return parseApiResponse(response, dashboardSummarySchema)
  })

export const getCampaignsFn = createServerFn({ method: 'GET' })
  .validator(campaignListQuerySchema)
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      range: data.range,
      search: data.search,
      channel: data.channel,
      sort: data.sort,
      order: data.order,
      page: String(data.page),
      pageSize: String(data.pageSize),
    })
    const response = await apiRequest(`/api/campaigns?${params}`)
    return parseApiResponse(response, campaignListResponseSchema)
  })

const campaignDetailInputSchema = z.object({
  id: z.string().uuid(),
  range: dashboardQuerySchema.shape.range,
})

export const getCampaignDetailFn = createServerFn({ method: 'GET' })
  .validator(campaignDetailInputSchema)
  .handler(async ({ data }) => {
    const response = await apiRequest(
      `/api/campaigns/${data.id}?range=${data.range}`,
    )
    return parseApiResponse(response, campaignDetailResponseSchema)
  })

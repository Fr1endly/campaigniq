import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '@/lib/server-functions'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (session)
      throw redirect({
        to: '/overview',
        search: { range: '30d', trend: 'daily' },
      })
    throw redirect({ to: '/login' })
  },
})

import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { PageLoading } from '@/components/page-states'
import { getSessionFn } from '@/lib/server-functions'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const session = await getSessionFn()
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    return { session }
  },
  pendingComponent: PageLoading,
  component: ProtectedLayout,
})

function ProtectedLayout() {
  const { session } = Route.useRouteContext()
  return (
    <AppShell session={session}>
      <Outlet />
    </AppShell>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionResponse } from '@campaign-iq/contracts'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3,
  ChartNoAxesCombined,
  ChevronDown,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  UploadCloud,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { authClient } from '@/lib/auth-client'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

function Navigation({
  pathname,
  mobile = false,
  onNavigate,
}: {
  pathname: string
  mobile?: boolean
  onNavigate?: () => void
}) {
  const navItems = [
    {
      to: '/overview' as const,
      label: 'Overview',
      icon: LayoutDashboard,
      search: { range: '30d' as const, trend: 'daily' as const },
    },
    {
      to: '/campaigns' as const,
      label: 'Campaigns',
      icon: BarChart3,
      search: {
        range: '30d' as const,
        search: '',
        channel: '',
        sort: 'revenue' as const,
        order: 'desc' as const,
        page: 1,
        pageSize: 10,
      },
    },
    {
      to: '/imports' as const,
      label: 'Imports',
      icon: UploadCloud,
      search: {
        status: '' as const,
        page: 1,
        pageSize: 20,
      },
    },
    {
      to: '/data-quality' as const,
      label: 'Data Quality',
      icon: FileWarning,
      search: {},
    },
    {
      to: '/insights' as const,
      label: 'Insights',
      icon: ChartNoAxesCombined,
      search: {
        sort: 'forecast' as const,
        order: 'desc' as const,
      },
    },
  ]
  return (
    <nav
      className={cn('space-y-1', mobile ? 'px-3' : 'px-3')}
      aria-label="Primary navigation"
    >
      {navItems.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(`${item.to}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.to}
            to={item.to}
            search={item.search as never}
            onClick={onNavigate}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? mobile
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-sidebar-accent text-sidebar-accent-foreground'
                : mobile
                  ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-4" strokeWidth={1.9} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserMenu({
  session,
  dark = false,
  compact = false,
}: {
  session: SessionResponse
  dark?: boolean
  compact?: boolean
}) {
  const initials = session.user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  async function signOut() {
    await authClient.signOut()
    window.location.assign('/login')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md p-2 text-left outline-none transition-colors',
            compact ? 'w-auto' : 'w-full',
            dark
              ? 'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring'
              : 'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Avatar className="size-8 rounded-md">
            <AvatarFallback className="rounded-md bg-emerald-200 text-xs font-semibold text-emerald-950">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className={cn('min-w-0 flex-1', compact && 'hidden')}>
            <span className="block truncate text-sm font-medium">
              {session.user.name}
            </span>
            <span
              className={cn(
                'block truncate text-xs',
                dark ? 'text-sidebar-foreground/55' : 'text-muted-foreground',
              )}
            >
              {session.organization.name}
            </span>
          </span>
          {!compact && <ChevronDown className="size-3.5 opacity-55" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block font-medium text-foreground">
            {session.user.name}
          </span>
          <span className="block truncate font-normal text-muted-foreground">
            {session.user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  session,
  children,
}: {
  session: SessionResponse
  children: ReactNode
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandMark />
        </div>
        <Navigation pathname={pathname} />
        <div className="mt-auto border-t border-sidebar-border p-3">
          <UserMenu session={session} dark />
        </div>
      </aside>

      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <BrandMark />
          <div className="flex items-center gap-1">
            <UserMenu session={session} compact />
            <Sheet
              open={mobileNavigationOpen}
              onOpenChange={setMobileNavigationOpen}
            >
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-16 items-center border-b px-5">
                  <BrandMark />
                </div>
                <div className="pt-3">
                  <Navigation
                    pathname={pathname}
                    mobile
                    onNavigate={() => setMobileNavigationOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}

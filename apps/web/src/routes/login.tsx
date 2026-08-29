import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { getSessionFn } from '@/lib/server-functions'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (session)
      throw redirect({
        to: '/overview',
        search: { range: '30d', trend: 'daily' },
      })
  },
  head: () => ({ meta: [{ title: 'Sign in | CampaignIQ' }] }),
  component: LoginPage,
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message ?? 'Email or password is incorrect.')
        return
      }
      window.location.assign('/overview')
    } catch {
      setError('CampaignIQ could not reach the authentication service.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(420px,0.85fr)_1.15fr]">
      <main className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[380px]">
          <BrandMark className="mb-12 text-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your marketing workspace.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-10 pl-9"
                  placeholder="you@company.com"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10 px-9"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              Sign in
            </Button>
          </form>
          <p className="mt-8 text-xs leading-5 text-muted-foreground">
            Access is limited to approved CampaignIQ workspaces.
          </p>
        </div>
      </main>

      <aside className="relative hidden min-h-screen overflow-hidden bg-[#19332d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative ml-auto flex items-center gap-2 text-xs text-emerald-100/75">
          <span className="size-1.5 rounded-full bg-emerald-300" />
          Warehouse synced
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-medium text-emerald-200">
            Northstar Growth
          </p>
          <p className="mt-4 max-w-lg text-4xl font-medium leading-[1.12]">
            Every campaign signal, connected.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-white/15 ring-1 ring-white/15">
            {[
              ['Revenue', '$1.61M', '+7.31%'],
              ['ROAS', '5.46x', '+2.41%'],
              ['CTR', '3.33%', '+0.12 pts'],
            ].map(([label, value, change]) => (
              <div key={label} className="bg-[#1e3c35] p-5">
                <p className="text-xs text-emerald-100/60">{label}</p>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
                <p className="mt-2 text-xs text-emerald-300">{change}</p>
              </div>
            ))}
          </div>
          <div className="mt-px h-40 rounded-b-lg bg-[#1e3c35] p-5 ring-1 ring-white/10">
            <div className="flex h-full items-end gap-2" aria-hidden="true">
              {[
                35, 41, 38, 48, 53, 50, 61, 58, 67, 72, 69, 78, 82, 76, 88, 92,
              ].map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-sm bg-emerald-300/70"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="relative text-xs text-emerald-100/45">
          CampaignIQ analytics workspace
        </p>
      </aside>
    </div>
  )
}

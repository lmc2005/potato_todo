import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '@/features/auth/auth-provider'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, InlineMessage, Input } from '@/shared/components/ui'
import { ApiError } from '@/shared/lib/api'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must contain at least 8 characters.'),
})

const registerSchema = loginSchema
  .extend({
    confirm_password: z.string().min(8, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  })

type LoginValues = z.infer<typeof loginSchema>
type RegisterValues = z.infer<typeof registerSchema>

const authHighlights = [
  {
    label: 'Daily desk',
    value: 'One view',
    detail: 'Tasks, focus sessions, planning, and calendar blocks stay on one page.',
  },
  {
    label: 'Long sessions',
    value: 'Low noise',
    detail: 'A lighter interface stays comfortable over longer study stretches.',
  },
  {
    label: 'Shared rooms',
    value: 'Quiet sync',
    detail: 'Bring other people into the day without losing your own rhythm.',
  },
]

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const authCardRef = useRef<HTMLElement | null>(null)
  const isLogin = mode === 'login'
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    shouldUnregister: true,
  })
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirm_password: '',
    },
    shouldUnregister: true,
  })

  const scrollToForm = (smooth = true) => {
    authCardRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'start',
    })
  }

  const moveToMode = async (target: 'login' | 'register') => {
    if (target === mode) {
      scrollToForm()
      return
    }
    await navigate({ to: target === 'login' ? '/login' : '/register' })
  }

  async function onLoginSubmit(values: LoginValues) {
    try {
      await auth.login({
        email: values.email,
        password: values.password,
      })
      await navigate({ to: '/app/workspace' })
    } catch (error) {
      const message =
        error instanceof ApiError
          ? typeof error.payload === 'object' && error.payload && 'detail' in error.payload
            ? String(error.payload.detail)
            : `Request failed with status ${error.status}.`
          : 'Unexpected error while submitting credentials.'
      loginForm.setError('root', { message })
    }
  }

  async function onRegisterSubmit(values: RegisterValues) {
    try {
      await auth.register(values)
      await navigate({ to: '/app/workspace' })
    } catch (error) {
      const message =
        error instanceof ApiError
          ? typeof error.payload === 'object' && error.payload && 'detail' in error.payload
            ? String(error.payload.detail)
            : `Request failed with status ${error.status}.`
          : 'Unexpected error while submitting credentials.'
      registerForm.setError('root', { message })
    }
  }

  return (
    <div className="min-h-screen">
      <div className="page-shell flex min-h-screen flex-col gap-8 pb-10 pt-4 sm:pt-5">
        <header className="sticky top-0 z-20 bg-white/94 py-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button type="button" className="nav-wordmark bg-transparent p-0" onClick={() => void moveToMode('login')}>
              Potato Todo
            </button>

            <nav className="flex items-center gap-5">
              <button
                type="button"
                className={`repay-link bg-transparent p-0 ${mode === 'login' ? 'repay-link-active' : ''}`}
                onClick={() => void moveToMode('login')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`repay-link bg-transparent p-0 ${mode === 'register' ? 'repay-link-active' : ''}`}
                onClick={() => void moveToMode('register')}
              >
                Create account
              </button>
            </nav>
          </div>
        </header>

        <main className="grid flex-1 gap-8">
          <section className="repay-hero-bg">
            <ScrollReveal className="mx-auto max-w-[860px] text-center">
              <p className="eyebrow">The smart way to study.</p>
              <h1 className="hero-title mt-6 text-black">
                Keep the whole day
                <br />
                <span className="gradient-heading">in full view.</span>
              </h1>
              <p className="body-copy mx-auto mt-6 max-w-3xl text-[1.02rem]">
                One desk for tasks, focus, planning, and shared rooms. Clear enough to open every day, calm enough to leave open for hours.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" className="auth-jump-btn" onClick={() => void moveToMode('login')}>
                  Sign in
                </Button>
                <Button type="button" variant="secondary" className="auth-jump-btn" onClick={() => void moveToMode('register')}>
                  Create account
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal className="repay-stage" delayMs={90}>
              <div className="repay-stage-screen grid gap-6">
                <div className="space-y-4">
                  <p className="eyebrow">A cleaner start</p>
                  <h2 className="section-title text-black">
                    Study flow,
                    <br />
                    from first task to final review.
                  </h2>
                  <p className="max-w-2xl text-[0.98rem] leading-8 text-[#40424f]">
                    The page opens with the right signals, then the desk unfolds as you move into focus, planning, and the next scheduled block.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {authHighlights.map((item) => (
                    <div key={item.label} className="rounded-[28px] bg-white p-5">
                      <p className="eyebrow">{item.label}</p>
                      <p className="mt-4 text-[1.35rem] font-semibold leading-[1.04] tracking-[-0.05em] text-black">{item.value}</p>
                      <p className="mt-2 text-sm leading-7 text-[#666d80]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </section>

          <section className="auth-form-deck auth-form-deck-single">
            <ScrollReveal>
              <article ref={authCardRef} className="auth-form-card">
                <div className="space-y-3">
                  <p className="eyebrow">{isLogin ? 'Welcome back' : 'Create your desk'}</p>
                  <h2 className="text-[clamp(2rem,3vw,2.8rem)] font-semibold leading-[1.02] tracking-[-0.08em] text-black">
                    {isLogin ? 'Step back into the day.' : 'Open your account.'}
                  </h2>
                  <p className="text-sm leading-7 text-[#666d80]">
                    {isLogin
                      ? 'Sign in to continue your tasks, focus sessions, planning drafts, and shared rooms.'
                      : 'Create an account and move straight into your study workspace.'}
                  </p>
                </div>

                {isLogin ? (
                  <form className="mt-8 grid gap-4" onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                    <label className="grid gap-2 text-sm font-medium text-[#40424f]">
                      Email
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...loginForm.register('email')} />
                      {loginForm.formState.errors.email ? <span className="text-sm text-[#b9574b]">{loginForm.formState.errors.email.message}</span> : null}
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#40424f]">
                      Password
                      <Input type="password" autoComplete="current-password" placeholder="Minimum 8 characters" {...loginForm.register('password')} />
                      {loginForm.formState.errors.password ? <span className="text-sm text-[#b9574b]">{loginForm.formState.errors.password.message}</span> : null}
                    </label>

                    {loginForm.formState.errors.root?.message ? <InlineMessage tone="danger">{loginForm.formState.errors.root.message}</InlineMessage> : null}

                    <Button type="submit" size="lg" disabled={loginForm.formState.isSubmitting} className="mt-2">
                      {loginForm.formState.isSubmitting ? 'Working...' : 'Open workspace'}
                    </Button>
                  </form>
                ) : (
                  <form className="mt-8 grid gap-4" onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
                    <label className="grid gap-2 text-sm font-medium text-[#40424f]">
                      Email
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...registerForm.register('email')} />
                      {registerForm.formState.errors.email ? <span className="text-sm text-[#b9574b]">{registerForm.formState.errors.email.message}</span> : null}
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#40424f]">
                      Password
                      <Input type="password" autoComplete="new-password" placeholder="Minimum 8 characters" {...registerForm.register('password')} />
                      {registerForm.formState.errors.password ? <span className="text-sm text-[#b9574b]">{registerForm.formState.errors.password.message}</span> : null}
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#40424f]">
                      Confirm password
                      <Input type="password" autoComplete="new-password" placeholder="Repeat your password" {...registerForm.register('confirm_password')} />
                      {registerForm.formState.errors.confirm_password ? <span className="text-sm text-[#b9574b]">{registerForm.formState.errors.confirm_password.message}</span> : null}
                    </label>

                    {registerForm.formState.errors.root?.message ? <InlineMessage tone="danger">{registerForm.formState.errors.root.message}</InlineMessage> : null}

                    <Button type="submit" size="lg" disabled={registerForm.formState.isSubmitting} className="mt-2">
                      {registerForm.formState.isSubmitting ? 'Working...' : 'Create account'}
                    </Button>
                  </form>
                )}

                <div className="auth-form-switch-row">
                  <p className="text-sm leading-7 text-[#666d80]">
                    {isLogin ? 'Need a new workspace account?' : 'Already created your account?'}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="auth-jump-btn"
                    onClick={() => void moveToMode(isLogin ? 'register' : 'login')}
                  >
                    {isLogin ? 'Create account' : 'Sign in'}
                  </Button>
                </div>
              </article>
            </ScrollReveal>
          </section>
        </main>
      </div>
    </div>
  )
}

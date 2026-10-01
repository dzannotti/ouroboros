import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-6', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle cx="16" cy="16" r="8" fill="none" strokeWidth="3" className="stroke-primary-foreground" />
      <circle cx="22" cy="10.5" r="2.5" className="fill-primary-foreground" />
    </svg>
  )
}

export function Logo({ withName = true }: { withName?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <LogoMark />
      {withName && <span>Ouroboros</span>}
    </Link>
  )
}

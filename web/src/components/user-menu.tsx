import { useQuery } from '@tanstack/react-query'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/use-theme'
import { api } from '@/lib/api'

export function UserMenu() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })
  const { theme, setTheme } = useTheme()
  const initials = (user?.name ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
          <Avatar className="size-7">
            {user?.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="flex items-center gap-2">
            {user?.name}
            {user?.role === 'admin' && <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground uppercase">Admin</span>}
          </span>
          {user?.email && <span className="text-xs font-normal text-muted-foreground">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {user && user.authMode !== 'dev' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/auth/logout">
                <LogOut /> Sign out
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client';

import { memo } from 'react';
import { Bell, Bot, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import type { AppView } from '@/lib/app-view';
import { APP_VIEWS } from '@/lib/app-view';
import { CURRENT_USER } from '@/data/current-user';
import { formatSimTime } from '@/lib/sim/clock';
import type { TopBarIndicator } from '@/components/top-bar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppHeaderProps {
  view: AppView;
  indicators: TopBarIndicator[];
  simTs: number | null;
  shiftId: string | null;
  running: boolean;
  onViewChange: (view: AppView) => void;
}

function AppHeaderBase({ view, indicators, simTs, shiftId, running, onViewChange }: AppHeaderProps) {
  const meta = APP_VIEWS.find((v) => v.id === view);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 !h-5" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold leading-tight">{meta?.label}</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">{meta?.description}</span>
      </div>

      <div className="mx-auto hidden items-center gap-2 xl:flex">
        {indicators.map((ind) => (
          <Card key={ind.label} className="gap-0 border-border/70 bg-card/60 px-2.5 py-1">
            <span className="font-mono text-[13px] leading-none">{ind.value}</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{ind.label}</span>
          </Card>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5 font-mono text-xs">
          <span className={running ? 'size-1.5 animate-pulse rounded-full bg-success' : 'size-1.5 rounded-full bg-muted-foreground'} />
          {simTs !== null ? formatSimTime(simTs) : '--:--:--'}
        </Badge>
        {shiftId && (
          <Badge variant="secondary" className="hidden font-mono text-xs md:inline-flex">
            Turno {shiftId}
          </Badge>
        )}

        <Button
          variant={view === 'assistant' ? 'default' : 'ghost'}
          size="icon"
          className="size-8"
          onClick={() => onViewChange('assistant')}
          aria-label="Asistente IA"
          title="Asistente IA"
        >
          <Bot />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Notificaciones">
          <Bell />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                  {CURRENT_USER.initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium lg:inline">{CURRENT_USER.name}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{CURRENT_USER.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{CURRENT_USER.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onViewChange('profile')}>
                <UserRound />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange('profile')}>
                <Settings />
                Preferencias
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export const AppHeader = memo(AppHeaderBase);

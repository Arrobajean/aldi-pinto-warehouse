'use client';

import { memo } from 'react';
import Image from 'next/image';
import { Boxes, Bot, MapPin, UserCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ZoneId } from '@/lib/types';
import { APP_VIEWS, type AppView } from '@/lib/app-view';
import type { ZoneSummary } from '@/hooks/use-warehouse-scene';
import { CURRENT_USER } from '@/data/current-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const VIEW_ICONS: Record<AppView, LucideIcon> = {
  warehouse: Boxes,
  assistant: Bot,
  profile: UserCircle2,
};

interface AppSidebarProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  zones: ZoneSummary[];
  onSelectZone: (zoneId: ZoneId) => void;
}

function AppSidebarBase({ view, onViewChange, zones, onSelectZone }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:!p-1.5"
              onClick={() => onViewChange('warehouse')}
            >
              <Image
                src="/branding/aldi-nord.png"
                alt="ALDI"
                width={32}
                height={32}
                className="size-8 flex-none rounded-md"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-xs text-muted-foreground">Plataforma Pinto</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Vistas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {APP_VIEWS.map((item) => {
                const Icon = VIEW_ICONS[item.id];
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={view === item.id}
                      tooltip={item.label}
                      onClick={() => onViewChange(item.id)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Zonas del almacén</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Zonas" onClick={() => onViewChange('warehouse')}>
                  <MapPin />
                  <span>Zonas</span>
                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                    {zones.length}
                  </Badge>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {zones.map((zone) => (
                    <SidebarMenuSubItem key={zone.id}>
                      <SidebarMenuSubButton asChild>
                        <button
                          type="button"
                          onClick={() => {
                            onViewChange('warehouse');
                            onSelectZone(zone.id);
                          }}
                        >
                          <span
                            className="size-2.5 flex-none rounded-[3px]"
                            style={{ background: zone.color }}
                          />
                          <span className="truncate">{zone.label}</span>
                        </button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={`${CURRENT_USER.name} · ${CURRENT_USER.role}`}
              onClick={() => onViewChange('profile')}
              isActive={view === 'profile'}
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                  {CURRENT_USER.initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{CURRENT_USER.name}</span>
                <span className="truncate text-xs text-muted-foreground">{CURRENT_USER.role}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export const AppSidebar = memo(AppSidebarBase);

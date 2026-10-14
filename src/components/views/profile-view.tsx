'use client';

import { useState } from 'react';
import {
  Activity,
  BellRing,
  Building2,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import type { CurrentUser, UserActivity } from '@/data/current-user';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ProfileMetrics {
  locations: number;
  zones: number;
  dockCount: number;
  aisles: number;
  machines: number;
  tasks: number;
  activeDocks: number;
}

interface ProfileViewProps {
  user: CurrentUser;
  metrics: ProfileMetrics;
}

const ACTIVITY_STYLE: Record<UserActivity['kind'], { icon: LucideIcon; className: string }> = {
  query: { icon: Activity, className: 'bg-primary/15 text-primary' },
  focus: { icon: MapPin, className: 'bg-emerald-500/15 text-emerald-300' },
  alert: { icon: BellRing, className: 'bg-destructive/15 text-destructive' },
  shift: { icon: Building2, className: 'bg-amber-500/15 text-amber-300' },
};

export function ProfileView({ user, metrics }: ProfileViewProps) {
  const [prefs, setPrefs] = useState(() => user.preferences.map((p) => p.enabled));

  const metricCards = [
    { label: 'Ubicaciones', value: metrics.locations.toLocaleString('es-ES'), hint: `${metrics.aisles} pasillos` },
    { label: 'Zonas', value: String(metrics.zones), hint: 'térmicas y de flujo' },
    { label: 'Muelles', value: `${metrics.activeDocks}/${metrics.dockCount}`, hint: 'ocupados ahora' },
    { label: 'Máquinas', value: String(metrics.machines), hint: `${metrics.tasks} tareas activas` },
  ];

  return (
    <ScrollArea className="min-h-0 flex-1 bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
        <Card className="overflow-hidden gap-0 py-0">
          <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
          <CardContent className="px-6 pb-6">
            <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
              <Avatar className="size-20 border-4 border-card">
                <AvatarFallback className="bg-primary/15 text-2xl font-black text-primary">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-sm text-muted-foreground">{user.role}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="size-3" />
                    {user.site}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <IdCard className="size-3" />
                    {user.employeeId}
                  </Badge>
                </div>
              </div>
              <Button variant="outline">
                <Settings2 />
                Editar perfil
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {user.kpis.map((kpi) => (
            <Card key={kpi.label} className="gap-1 py-4">
              <CardContent className="px-4">
                <div className="text-2xl font-bold">{kpi.value}</div>
                <div className="text-xs font-medium">{kpi.label}</div>
                <div className="text-[10px] text-muted-foreground">{kpi.hint}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs defaultValue="activity" className="gap-3">
              <TabsList>
                <TabsTrigger value="activity" className="gap-1.5">
                  <Activity className="size-3.5" />
                  Actividad
                </TabsTrigger>
                <TabsTrigger value="preferences" className="gap-1.5">
                  <Settings2 className="size-3.5" />
                  Preferencias
                </TabsTrigger>
              </TabsList>

              <TabsContent value="activity">
                <Card className="gap-0 py-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm">Actividad reciente</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ol className="flex flex-col">
                      {user.activity.map((item, i) => {
                        const style = ACTIVITY_STYLE[item.kind];
                        const Icon = style.icon;
                        return (
                          <li key={item.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <span className={cn('flex size-7 items-center justify-center rounded-full', style.className)}>
                                <Icon className="size-3.5" />
                              </span>
                              {i < user.activity.length - 1 && <span className="my-0.5 w-px flex-1 bg-border" />}
                            </div>
                            <div className="pb-3">
                              <p className="text-sm">{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.time}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="preferences">
                <Card className="gap-0 py-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm">Notificaciones</CardTitle>
                    <CardDescription>Elige qué avisos quieres recibir.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 px-4 pb-4">
                    {user.preferences.map((pref, i) => (
                      <div key={pref.id}>
                        {i > 0 && <Separator className="my-2" />}
                        <label className="flex cursor-pointer items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">{pref.label}</p>
                            <p className="text-xs text-muted-foreground">{pref.description}</p>
                          </div>
                          <Switch
                            checked={prefs[i]}
                            onCheckedChange={(v) => setPrefs((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
                            aria-label={pref.label}
                          />
                        </label>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 py-0">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm">Datos de cuenta</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4 pb-4 text-sm">
                <InfoRow icon={Mail} label="Correo" value={user.email} />
                <InfoRow icon={Phone} label="Teléfono" value={user.phone} />
                <InfoRow icon={Building2} label="Departamento" value={user.department} />
                <InfoRow icon={MapPin} label="Turno" value={user.shift} />
                <InfoRow icon={IdCard} label="Alta" value={user.memberSince} />
              </CardContent>
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm">Resumen del almacén</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 px-4 pb-4">
                {metricCards.map((m) => (
                  <div key={m.label} className="rounded-lg border bg-secondary/40 p-2.5">
                    <div className="text-lg font-bold">{m.value}</div>
                    <div className="text-[11px] font-medium">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.hint}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-3.5 flex-none text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto truncate text-right text-xs font-medium">{value}</span>
    </div>
  );
}

# Gemelo digital — Plataforma logística ALDI Pinto

Visor 3D tipo **Los Sims 1** de la plataforma logística de ALDI en Pinto (Madrid):
almacén de 50.895 m², máquinas con localización en tiempo real (RTLS simulado),
stock por ubicación, muelles, camiones y un asistente IA (RAG sobre el estado en vivo).

> **Datos simulados con fines de demostración.** No hay plano interior público:
> la distribución es inventada pero verosímil, en metros reales. Toda tienda,
> matrícula, operario o SKU es simulado.

## Requisitos

- Node.js ≥ 20
- Docker (solo para la base de datos local de Supabase)
- Supabase CLI (`npm i -g supabase`), opcional si usas `npx supabase`

## Puesta en marcha

```bash
npm i
cp .env.example .env.local   # rellena las claves
supabase start               # enciende Postgres + pgvector en local
supabase db reset            # aplica las migraciones
supabase gen types typescript > src/lib/supabase/database.types.ts
npm run dev                  # http://localhost:3000
```

## Scripts

```bash
npm run dev      # Next.js en el puerto 3000
npm run build    # next build
npm run lint     # eslint
```

## Stack

- Next.js (App Router) · React 19 · Tailwind CSS v4 · three.js
- Supabase (Postgres + pgvector, Auth, Realtime) para servidor y base de datos
- Google Gemini (servidor, vía route handlers) para el asistente IA — fase F5
# GV-One

Aplicación construida con [Next.js](https://nextjs.org) 16 (App Router) y [Supabase](https://supabase.com).

## Desarrollo

```bash
pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build de producción |
| `pnpm lint` | ESLint |

## Variables de entorno

Definir en `.env` (o en el panel del hosting para producción):

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | Clave publishable / anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | Salta RLS; nunca exponer al navegador |
| `CRON_SECRET` | **solo servidor** | Clave para `/api/faltas` (`Authorization: Bearer <clave>`); Vercel Cron la envía sola |

## Tareas programadas

[`vercel.json`](vercel.json) ejecuta `GET /api/faltas` cada día a las 06:00 UTC (00:00 en Ciudad de México), solo en el deployment de producción. Guarda como falta cada día sin registro hasta ayer.

## Clientes de Supabase

- [`src/lib/supabase/client.ts`](src/lib/supabase/client.ts) — navegador (Client Components).
- [`src/lib/supabase/server.ts`](src/lib/supabase/server.ts) — servidor (Server Components, Route Handlers, Server Actions); respeta RLS con la sesión del usuario.
- [`src/lib/supabase/admin.ts`](src/lib/supabase/admin.ts) — servidor de confianza con `service_role`; salta RLS.

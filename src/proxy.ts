import { NextResponse, type NextRequest } from 'next/server'

const ORIGENES_PERMITIDOS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean)

const CABECERAS_CORS = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
}

export function proxy(request: NextRequest) {
  const origen = request.headers.get('origin') ?? ''
  const respuesta =
    request.method === 'OPTIONS' ? new NextResponse(null, { status: 204 }) : NextResponse.next()

  if (ORIGENES_PERMITIDOS.includes(origen)) {
    respuesta.headers.set('Access-Control-Allow-Origin', origen)
  }
  for (const [cabecera, valor] of Object.entries(CABECERAS_CORS)) {
    respuesta.headers.set(cabecera, valor)
  }
  return respuesta
}

export const config = {
  matcher: '/api/:path*',
}

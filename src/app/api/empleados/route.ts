import { NextResponse, type NextRequest} from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const supabase = await createAdminClient()

  let query = supabase.from('Empleados').select('*')

  const { data, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json(data, { headers: CORS_HEADERS })
}
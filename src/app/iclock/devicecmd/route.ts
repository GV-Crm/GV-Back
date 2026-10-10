import { texto } from '@/lib/checador/adms'

/** El checador avisa el resultado de una orden. Como todavía no le mandamos órdenes, solo se confirma. */
export async function POST() {
  return texto('OK')
}

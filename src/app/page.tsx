'use client'

import { useEffect, useState } from 'react'

type Asistencia = {
  Empleado: string
  HoraEntrada: string
  HoraSalida: string
}

export default function Home() {
  const [asistencias, setAsistencias] = useState<Asistencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/asistencias')
      .then((res) => res.json())
      .then((body: Asistencia[] | { error: string }) => {
        if ('error' in body) {
          setError(body.error)
        } else {
          setAsistencias(body)
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main>
      <h1>Asistencias</h1>

      {loading && <p>Cargando...</p>}
      {error && <p role="alert">Error: {error}</p>}

      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Hora entrada</th>
              <th>Hora salida</th>
            </tr>
          </thead>
          <tbody>
            {asistencias.map((a, i) => (
              <tr key={i}>
                <td>{a.Empleado}</td>
                <td>{a.HoraEntrada}</td>
                <td>{a.HoraSalida}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

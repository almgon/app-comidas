import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useDatos } from './lib/datos'
import { supabaseConfigurado } from './lib/supabase'
import Login from './pages/Login'
import Hogar from './pages/Hogar'
import Recetas from './pages/Recetas'
import RecetaDetalle from './pages/RecetaDetalle'
import EditarReceta from './pages/EditarReceta'
import Importar from './pages/Importar'
import Ajustes from './pages/Ajustes'
import Ingredientes from './pages/Ingredientes'

function Pestanas() {
  const { enLinea } = useDatos()
  return (
    <div className="app">
      {!enLinea && <div className="aviso-offline">Sin conexión: estás viendo la última copia guardada</div>}
      <main className="contenido">
        <Outlet />
      </main>
      <nav className="pestanas">
        <NavLink to="/" end>
          <span>📖</span>Recetas
        </NavLink>
        <NavLink to="/importar">
          <span>🔗</span>Importar
        </NavLink>
        <NavLink to="/receta/nueva">
          <span>➕</span>Nueva
        </NavLink>
        <NavLink to="/ajustes">
          <span>⚙️</span>Ajustes
        </NavLink>
      </nav>
    </div>
  )
}

export default function App() {
  const { cargando, sesion, perfil, hogar } = useDatos()
  const loc = useLocation()

  if (!supabaseConfigurado)
    return (
      <div className="pantalla-centro">
        <h1>Falta configurar Supabase</h1>
        <p>Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver README).</p>
      </div>
    )
  if (cargando && !perfil) return <div className="pantalla-centro">Cargando…</div>
  if (!sesion) return <Login />
  if (!hogar) return perfil ? <Hogar /> : <div className="pantalla-centro">Cargando…</div>

  return (
    <Routes>
      <Route element={<Pestanas />}>
        <Route index element={<Recetas />} />
        <Route path="receta/nueva" element={<EditarReceta key={loc.key} />} />
        <Route path="receta/:id" element={<RecetaDetalle />} />
        <Route path="receta/:id/editar" element={<EditarReceta />} />
        <Route path="importar" element={<Importar />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="ingredientes" element={<Ingredientes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

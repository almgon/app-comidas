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
import Menu from './pages/Menu'
import Domingo from './pages/Domingo'
import Congelador from './pages/Congelador'
import Compra from './pages/Compra'
import { MenuProvider } from './lib/menu'

function Pestanas() {
  const { enLinea } = useDatos()
  const loc = useLocation()
  return (
    <div className="app">
      {!enLinea && <div className="aviso-offline">Sin conexión: estás viendo la última copia guardada</div>}
      <main className="contenido">
        <Outlet />
      </main>
      <nav className="pestanas">
        <NavLink to="/" end className={({ isActive }) => (isActive || ['/domingo', '/congelador'].includes(loc.pathname) ? 'active' : '')}>
          <span>🗓️</span>Menú
        </NavLink>
        <NavLink to="/compra">
          <span>🛒</span>Compra
        </NavLink>
        <NavLink to="/recetas" className={({ isActive }) => (isActive || loc.pathname.startsWith('/receta') ? 'active' : '')}>
          <span>📖</span>Recetas
        </NavLink>
        <NavLink to="/importar">
          <span>🔗</span>Importar
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
    <MenuProvider>
    <Routes>
      <Route element={<Pestanas />}>
        <Route index element={<Menu />} />
        <Route path="domingo" element={<Domingo />} />
        <Route path="congelador" element={<Congelador />} />
        <Route path="compra" element={<Compra />} />
        <Route path="recetas" element={<Recetas />} />
        <Route path="receta/nueva" element={<EditarReceta key={loc.key} />} />
        <Route path="receta/:id" element={<RecetaDetalle />} />
        <Route path="receta/:id/editar" element={<EditarReceta />} />
        <Route path="importar" element={<Importar />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="ingredientes" element={<Ingredientes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </MenuProvider>
  )
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// Смотреть сайт можно без входа; сюда попадают только страницы, где что-то
// меняют. После входа возвращаем туда, куда человек шёл.
export function ProtectedRoute() {
  const { auth } = useAuth();
  const { pathname } = useLocation();
  if (!auth) return <Navigate to="/login" state={{ from: pathname }} replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { auth, isAdmin } = useAuth();
  const { pathname } = useLocation();
  if (!auth) return <Navigate to="/login" state={{ from: pathname }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import TournamentView from "./pages/TournamentView.jsx";
import TournamentForm from "./pages/TournamentForm.jsx";
import UsersAdmin from "./pages/UsersAdmin.jsx";
import Cabinet from "./pages/Cabinet.jsx";
import Stats from "./pages/Stats.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/me" element={<Cabinet />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/tournaments/:id" element={<TournamentView />} />

            <Route element={<AdminRoute />}>
              <Route path="/users" element={<UsersAdmin />} />
              <Route path="/tournaments/new" element={<TournamentForm />} />
              <Route path="/tournaments/:id/edit" element={<TournamentForm />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import Cursor from "./components/Cursor.jsx";
import Login from "./pages/Login.jsx";
import SteamCallback from "./pages/SteamCallback.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import TournamentView from "./pages/TournamentView.jsx";
import TournamentMedia from "./pages/TournamentMedia.jsx";
import TournamentForm from "./pages/TournamentForm.jsx";
import UsersAdmin from "./pages/UsersAdmin.jsx";
import Cabinet from "./pages/Cabinet.jsx";
import Stats from "./pages/Stats.jsx";
import Players from "./pages/Players.jsx";
import History from "./pages/History.jsx";
import Lobbies from "./pages/Lobbies.jsx";
import Skins from "./pages/Skins.jsx";
import PlayerProfile from "./pages/PlayerProfile.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Cursor />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login/steam" element={<SteamCallback />} />

        {/* Смотреть можно без входа; вход нужен, чтобы что-то менять. */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:id" element={<PlayerProfile />} />
          <Route path="/history" element={<History />} />
          <Route path="/skins" element={<Skins />} />
          <Route path="/lobbies" element={<Lobbies />} />
          <Route path="/tournaments/:id" element={<TournamentView />} />
          <Route path="/tournaments/:id/media" element={<TournamentMedia />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/me" element={<Cabinet />} />
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/users" element={<UsersAdmin />} />
            <Route path="/tournaments/new" element={<TournamentForm />} />
            <Route path="/tournaments/:id/edit" element={<TournamentForm />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

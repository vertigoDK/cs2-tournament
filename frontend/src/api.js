import axios from "axios";

const api = axios.create({ baseURL: "/api" });

function storedToken() {
  try {
    const raw = localStorage.getItem("auth");
    return raw ? JSON.parse(raw).token : null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = storedToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // На страницу входа отправляем, только если сессия была и протухла:
    // гость смотрит турниры без входа, и его 401 никуда не уводит.
    if (err.response?.status === 401 && err.config?.headers?.Authorization) {
      try {
        localStorage.removeItem("auth");
      } catch {
        /* ignore */
      }
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const apiErrorMessage = (err) =>
  err?.response?.data?.detail || err?.message || "Что-то пошло не так";

export default api;

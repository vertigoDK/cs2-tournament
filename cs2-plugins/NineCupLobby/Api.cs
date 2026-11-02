using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NineCupLobby;

// Ответы сайта (backend/app/routers/game_server.py). Поля — snake_case.
public record LobbyPlayer(string SteamId, string Name, int Team);

public record Lobby(int Id, string Mode, string Map, string MapId, string? WorkshopId, string Status, List<LobbyPlayer> Players, string? Side1 = null);

public record LobbyState(Lobby? Lobby, List<string> Admins, List<string> Known);

public record PlayerStat(string SteamId, int Kills, int Deaths, int Assists);

public record StatusIn(int LobbyId, string Status, List<int>? Score, List<PlayerStat>? Stats = null);

public record ApiError(string? Detail);

// Запросы к сайту. Вызывается не из игрового потока: результат в игру
// возвращаем через Server.NextFrame.
public sealed class SiteApi(string baseUrl, string key)
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http = new()
    {
        BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"),
        // Функция на Vercel после простоя просыпается пару секунд.
        Timeout = TimeSpan.FromSeconds(20),
        DefaultRequestHeaders = { { "X-Server-Key", key } },
    };

    public async Task<LobbyState> State()
    {
        using var resp = await _http.GetAsync("api/server/lobby");
        return await Read(resp);
    }

    public async Task<LobbyState> Status(StatusIn body)
    {
        using var resp = await _http.PostAsJsonAsync("api/server/lobby-status", body, Json);
        return await Read(resp);
    }

    private static async Task<LobbyState> Read(HttpResponseMessage resp)
    {
        if (!resp.IsSuccessStatusCode)
        {
            var err = await resp.Content.ReadFromJsonAsync<ApiError>(Json).ConfigureAwait(false);
            throw new HttpRequestException($"{(int)resp.StatusCode}: {err?.Detail ?? resp.ReasonPhrase}");
        }
        return (await resp.Content.ReadFromJsonAsync<LobbyState>(Json))!;
    }
}

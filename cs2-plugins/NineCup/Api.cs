using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NineCup;

// Ответы сайта (backend/app/routers/game_server.py). Поля — snake_case.
public record ServerPlayer(int Id, string Name, string? SteamId);

public record ServerDuel(int G, int R, int I, string Label, List<ServerPlayer> Players);

public record ServerPlace(int Place, string Name);

public record ServerState(
    int TournamentId,
    string Tournament,
    List<ServerPlayer> Allowed,
    List<string> MissingSteam,
    string? DuelMap,
    ServerDuel? Duel,
    int DuelsLeft,
    List<ServerPlace> DuelPlaces);

public record DuelResultIn(int? TournamentId, List<string> SteamIds, List<int> Score);

public record DuelResultOut(List<string> Chat, ServerState State);

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

    public async Task<ServerState> State(int tournamentId)
    {
        var url = "api/server/state" + (tournamentId > 0 ? $"?tournament_id={tournamentId}" : "");
        using var resp = await _http.GetAsync(url);
        return await Read<ServerState>(resp);
    }

    public async Task<DuelResultOut> DuelResult(DuelResultIn body)
    {
        using var resp = await _http.PostAsJsonAsync("api/server/duel-result", body, Json);
        return await Read<DuelResultOut>(resp);
    }

    private static async Task<T> Read<T>(HttpResponseMessage resp)
    {
        if (!resp.IsSuccessStatusCode)
        {
            var err = await resp.Content.ReadFromJsonAsync<ApiError>(Json).ConfigureAwait(false);
            throw new HttpRequestException($"{(int)resp.StatusCode}: {err?.Detail ?? resp.ReasonPhrase}");
        }
        return (await resp.Content.ReadFromJsonAsync<T>(Json))!;
    }
}

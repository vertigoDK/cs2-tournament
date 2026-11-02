using System.Diagnostics;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using Microsoft.Extensions.Logging;

namespace NineCupLobby;

// Сторож кадров: ищем, отчего сервер подвисает. Каждый тик меряем паузу с
// прошлого тика; если она длиннее порога — пишем в лог, сколько за это время
// процессора потратил процесс (занят ли он был работой или стоял), паузы
// сборщика мусора .NET и последнее игровое событие перед остановкой.
public sealed class Watchdog(ILogger logger)
{
    private const double ThresholdMs = 50;
    private readonly Stopwatch _sw = Stopwatch.StartNew();
    private readonly Process _proc = Process.GetCurrentProcess();
    private double _lastTick;
    private TimeSpan _lastCpu;
    private TimeSpan _lastGc;
    private int _lastGen2;
    public string LastEvent { get; set; } = "—";
    private double _lastEventAt;

    private int _count;
    private double _max;
    private double _sumOver;
    private double _windowStart;

    public void Mark(string name)
    {
        LastEvent = name;
        _lastEventAt = _sw.Elapsed.TotalMilliseconds;
    }

    public void OnTick()
    {
        var now = _sw.Elapsed.TotalMilliseconds;
        _proc.Refresh();
        var cpu = _proc.TotalProcessorTime;
        var gc = GC.GetTotalPauseDuration();
        var gen2 = GC.CollectionCount(2);
        if (_lastTick > 0)
        {
            var gap = now - _lastTick;
            if (gap > ThresholdMs)
            {
                var cpuMs = (cpu - _lastCpu).TotalMilliseconds;
                var gcMs = (gc - _lastGc).TotalMilliseconds;
                var sinceEvent = now - _lastEventAt;
                logger.LogWarning(
                    "watchdog: кадр {Gap:F0} мс | процессор за это время {Cpu:F0} мс ({Load:F0}% одного ядра) | GC пауза {Gc:F0} мс, gen2 +{Gen2} | " +
                    "последнее событие: {Event} за {Since:F0} мс до остановки | игроков {Players}, потоков {Threads}",
                    gap, cpuMs, gap > 0 ? cpuMs / gap * 100 : 0, gcMs, gen2 - _lastGen2, LastEvent, sinceEvent,
                    Utilities.GetPlayers().Count(p => p is { IsValid: true }), _proc.Threads.Count);
                _count++;
                _sumOver += gap;
                _max = Math.Max(_max, gap);
            }
        }
        if (now - _windowStart > 60_000)
        {
            if (_count > 0)
                logger.LogInformation("watchdog: за минуту {Count} зависаний, самое долгое {Max:F0} мс, всего {Sum:F0} мс", _count, _max, _sumOver);
            _count = 0;
            _max = _sumOver = 0;
            _windowStart = now;
        }
        _lastTick = now;
        _lastCpu = cpu;
        _lastGc = gc;
        _lastGen2 = gen2;
    }
}

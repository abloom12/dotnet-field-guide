---
title: Application Startup and Services
description: Understand entry points, the generic host, dependency injection, configuration, logging, and shutdown.
sidebar:
  order: 6
---

Modern .NET applications commonly use the generic host to coordinate dependency injection, configuration, logging, application lifetime, and hosted background work.

## Quick reference

### Hosted application skeleton

```csharp
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddTransient<ReportGenerator>();
builder.Services.AddHostedService<Worker>();

using IHost host = builder.Build();
await host.RunAsync();
```

ASP.NET Core uses a web-specific builder/host on the same hosting, configuration, logging, and DI foundations.

### Service lifetimes

| Lifetime | One instance per | Use for |
| --- | --- | --- |
| Singleton | Service provider/application | Stateless thread-safe services or truly shared state |
| Scoped | Created DI scope | Unit-of-work/request/circuit-aligned dependencies |
| Transient | Resolution | Lightweight independent services |

A singleton must not capture a scoped service. In background services, create a scope for scoped work.

### Configuration precedence

Providers are ordered; later providers normally override earlier values for the same key. Typical defaults include:

```text
appsettings.json
→ appsettings.{Environment}.json
→ user secrets in Development (supported project types)
→ environment variables
→ command-line arguments
```

Exact providers and ordering come from the builder and can be changed.

```csharp
string? connection = builder.Configuration["Database:ConnectionString"];
```

Environment variables commonly use `Database__ConnectionString` because `__` maps to `:`.

### Startup rules

- Register services before `Build()`.
- Resolve dependencies through constructors rather than a global service locator.
- Validate critical configuration during startup.
- Keep startup deterministic and observable.
- Honor the host’s cancellation token during shutdown.
- Do not launch unsupervised background tasks from `Program.cs`.

## Entry points and top-level statements

The runtime starts an executable through a suitable `Main` method:

```csharp
public static async Task Main(string[] args)
{
    using IHost host = CreateHost(args);
    await host.RunAsync();
}
```

Modern templates often use top-level statements:

```csharp
HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);
using IHost host = builder.Build();
await host.RunAsync();
```

The compiler generates the containing entry-point type/method. Only one compilation unit can contain top-level statements. The generated form and explicit `Main` are functionally compatible approaches; follow project style.

Exit codes can be returned from `Main` or top-level statements. Unhandled startup exceptions normally terminate the process and should be surfaced to deployment supervision/logging.

## The purpose of `Program.cs`

`Program.cs` is conventionally the composition root where the application:

1. creates a builder,
2. adds configuration providers,
3. registers services,
4. configures framework/application infrastructure,
5. builds the host,
6. starts it.

It is not a special filename required by the runtime. Keep it focused on composition rather than business logic. Extract cohesive registration methods when startup grows:

```csharp
builder.Services.AddApplicationServices(builder.Configuration);
```

Extensions should make ownership clearer, not hide ordering-sensitive behavior in an untraceable chain.

## What the generic host provides

`Microsoft.Extensions.Hosting` coordinates:

- a dependency-injection service provider,
- configuration through `IConfiguration`,
- logging through `ILogger<T>`,
- application lifetime and graceful shutdown,
- hosted services (`IHostedService` / `BackgroundService`),
- environment information through `IHostEnvironment`.

The host does not automatically turn arbitrary code into a reliable distributed job system. Retry, persistence, scheduling, concurrency limits, idempotency, and failure recovery remain application/design concerns.

ASP.NET Core’s `WebApplication` integrates this foundation with a web server, routing, middleware, and web lifetimes.

## Creating and configuring a host

The default builder supplies standard configuration and logging behavior:

```csharp
HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);

builder.Configuration.AddJsonFile(
    "featureflags.json",
    optional: true,
    reloadOnChange: true);

builder.Logging.AddConsole();
builder.Services.AddHostedService<Worker>();

using IHost host = builder.Build();
await host.RunAsync();
```

Configuration of the builder must happen before building. After `Build()`, treat the service registration graph as fixed.

For a short-lived command, start the host, resolve a scoped operation, execute, and stop/dispose deliberately. For long-running processes, `RunAsync` manages startup, waits for shutdown, and stops services.

Avoid sync-over-async during startup. If initialization requires asynchronous I/O, perform it in a hosted lifecycle, a scoped startup operation before `RunAsync`, or an application-specific migration step with clear failure handling.

## Registering and resolving services

Register service contracts and implementations:

```csharp
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddTransient<IReportFormatter, PdfReportFormatter>();
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
```

Consume with constructor injection:

```csharp
public sealed class ReportService
{
    private readonly IClock _clock;
    private readonly IOrderRepository _orders;

    public ReportService(IClock clock, IOrderRepository orders)
    {
        _clock = clock;
        _orders = orders;
    }
}
```

The container resolves constructor graphs and disposes container-created disposable services according to lifetime. Do not manually dispose injected services unless ownership is explicitly transferred.

Multiple registrations of one service type are resolved differently depending on requesting one service versus `IEnumerable<T>`. Newer keyed-service features are available for intentional named/keyed choices, but a strategy object may be clearer than container-driven branching.

Avoid injecting `IServiceProvider` broadly. Direct dependencies make contracts and lifetime problems visible.

## Singleton lifetime

A singleton registration creates one instance per root service provider:

```csharp
builder.Services.AddSingleton<IClock, SystemClock>();
```

Singletons must be safe for concurrent callers in multithreaded hosts. They should not store request/user-specific mutable state. They also live until provider shutdown, so retained references remain for the application lifetime.

The container disposes a singleton it creates. An externally supplied instance has ownership nuances; avoid relying on implicit disposal without verifying the registration contract.

Never constructor-inject a scoped dependency into a singleton. This “captive dependency” effectively extends scoped state and can cause cross-request/circuit data leakage or disposed-object errors. Enable scope validation in development where applicable.

## Scoped lifetime

A scoped service has one instance within an `IServiceScope`:

```csharp
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
```

ASP.NET Core creates a request scope. Other hosts do not create arbitrary work scopes automatically. A `BackgroundService` is registered as singleton, so it must create a scope for each unit of scoped work:

```csharp
public sealed class Worker(IServiceScopeFactory scopeFactory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await using AsyncServiceScope scope = scopeFactory.CreateAsyncScope();
            var job = scope.ServiceProvider.GetRequiredService<IScopedJob>();
            await job.RunAsync(stoppingToken);
        }
    }
}
```

Dispose the scope after the unit of work. Never cache a scoped service beyond its scope.

## Transient lifetime

A transient service is created each time it is resolved:

```csharp
builder.Services.AddTransient<ReportGenerator>();
```

Use it for lightweight, independent services. “Transient” does not guarantee immediate disposal: disposable transients resolved by the root container can be retained for disposal until the provider shuts down. Avoid disposable transient design when possible, or resolve it within a bounded scope/factory with clear ownership.

Choose lifetime based on state ownership and thread safety, not perceived performance alone.

## Configuration sources and precedence

`Host.CreateApplicationBuilder(args)` adds conventional sources. Later providers generally win when the same key appears. Configuration is a hierarchical key/value system:

```json
{
  "Email": {
    "Sender": "noreply@example.com",
    "RetryCount": 3
  }
}
```

```csharp
string? sender = builder.Configuration["Email:Sender"];
```

Bind related settings to options:

```csharp
builder.Services
    .AddOptions<EmailOptions>()
    .Bind(builder.Configuration.GetSection("Email"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

Use `IOptions<T>` for stable configuration, `IOptionsSnapshot<T>` for scoped snapshots in supported hosts, and `IOptionsMonitor<T>` for change notifications/current values. Reload support depends on the provider.

Do not store secrets in committed JSON. Use development user secrets only for local development and an approved secret provider/environment mechanism in deployment.

## Environment-specific configuration

The host environment name is commonly read from `DOTNET_ENVIRONMENT`; web hosts also support framework-specific conventions. Typical names are `Development`, `Staging`, and `Production`, but they are strings, not a security boundary.

```csharp
if (builder.Environment.IsDevelopment())
{
    // Development-only registration
}
```

Default configuration may load `appsettings.{Environment}.json`. Do not use environment checks to conceal missing authorization or safety controls. Deployment must set the intended environment explicitly and validate critical settings.

Build configuration (`Debug`/`Release`) and host environment (`Development`/`Production`) are independent.

## Logging providers and categories

Inject a category-specific logger:

```csharp
public sealed class Worker(ILogger<Worker> logger)
{
    public void Run(Guid jobId)
    {
        logger.LogInformation("Starting job {JobId}", jobId);
    }
}
```

The category is usually the fully qualified type name. Providers route logs to console, debug output, event systems, telemetry services, or other destinations. Configuration controls minimum levels by category/provider.

Use structured message templates rather than string interpolation so providers retain named fields. Do not log secrets or sensitive payloads.

Log exceptions with the exception parameter:

```csharp
logger.LogError(exception, "Job {JobId} failed", jobId);
```

Avoid logging the same failure at every layer. Log where the application handles, translates, retries, or terminates the operation.

## Startup and graceful shutdown

`IHostedService` defines `StartAsync` and `StopAsync`; `BackgroundService` supplies a long-running `ExecuteAsync` pattern. Startup completes only after hosted services start, so lengthy initialization delays readiness.

Shutdown can be requested by Ctrl+C/SIGTERM, `IHostApplicationLifetime.StopApplication`, or host infrastructure. The host signals cancellation and gives services a bounded time to stop.

A background loop should:

- observe `stoppingToken`,
- pass it to delays and I/O,
- stop accepting new work,
- finish or safely abandon in-flight work according to policy,
- release resources,
- surface unexpected failures.

```csharp
while (!stoppingToken.IsCancellationRequested)
{
    await ProcessNextAsync(stoppingToken);
}
```

Graceful shutdown is time-bounded and not guaranteed under forced termination. Persist critical state transactionally and design operations to be idempotent/recoverable rather than relying only on shutdown callbacks.

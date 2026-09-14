---
title: Application Startup
description: Assemble services, configuration, middleware, endpoints, and web-server lifetime in Program.cs.
sidebar:
  order: 2
---

ASP.NET Core startup has two visible phases: configure a builder and its services, then build/configure/run the application.

## Quick reference

### Startup skeleton

```csharp
var builder = WebApplication.CreateBuilder(args);

// Builder phase: configuration, logging, and service registrations.
builder.Services.AddProblemDetails();
builder.Services.AddAuthentication("Cookies").AddCookie("Cookies");
builder.Services.AddAuthorization();
builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

// Application phase: ordered middleware and endpoint mappings.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));
app.MapOrderEndpoints();

await app.RunAsync();
```

### Read `Program.cs` in this order

1. How is `builder.Configuration` extended?
2. Which framework/application services are registered?
3. Where is `builder.Build()`?
4. Which middleware runs, and in what order?
5. Which endpoints are mapped and with what authorization?
6. How does the app start, initialize dependencies, and shut down?

### Registration versus pipeline

| Call shape | Usually does |
| --- | --- |
| `builder.Services.AddX()` | Registers services/options before build |
| `builder.Configuration.AddX()` | Adds a configuration provider |
| `builder.Logging.AddX()` | Adds/configures logging providers |
| `app.UseX()` | Adds ordered middleware |
| `app.MapX()` | Adds endpoint(s) or a branch |
| `app.Run()` / `RunAsync()` | Starts server and waits for shutdown |

Names are conventions, not guarantees—inspect unfamiliar extension methods.

### Startup rules

- Add registrations before `builder.Build()`.
- Put exception handling early enough to catch downstream failures.
- Put authentication before authorization.
- Map endpoints after middleware they depend on.
- Validate critical configuration at startup.
- Avoid blocking async startup with `.Result`/`.Wait()`.
- Keep database migration/deployment ownership explicit.

## The role of `Program.cs`

`Program.cs` is the application composition root. It connects infrastructure and framework choices to application abstractions:

```text
create builder
→ load/adjust configuration and logging
→ register services
→ build WebApplication
→ configure HTTP pipeline
→ map endpoints
→ run
```

The filename itself is conventional. Top-level statements compile into an entry point.

Keep business logic out of startup. Extract cohesive registration/mapping extensions when useful:

```csharp
builder.Services.AddApplicationServices();
builder.Services.AddInfrastructure(builder.Configuration);
app.MapOrderEndpoints();
```

Extensions should preserve discoverability. Avoid one opaque `AddEverything`/`UseEverything` call whose internal ordering cannot be reviewed.

## `WebApplication.CreateBuilder`

```csharp
WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
```

The builder sets up common defaults, including:

- configuration providers,
- logging providers,
- dependency injection,
- host and web server defaults,
- environment/content-root information,
- command-line argument integration.

It exposes:

```csharp
builder.Services
builder.Configuration
builder.Logging
builder.Environment
builder.WebHost
builder.Host
```

Defaults are customizable. Before adding duplicate providers, understand what the builder already configured.

The working/content root, application name, environment, URLs, and server settings can come from command line, environment variables, configuration, or host setup. Capture `dotnet --info` and non-secret startup configuration when environments behave differently.

## Configuration during startup

Default application configuration commonly includes, in increasing precedence:

```text
appsettings.json
appsettings.{Environment}.json
user secrets in Development (when configured by defaults)
environment variables
command-line arguments
```

Exact ordering changes when code adds/removes providers. Later providers usually override earlier keys.

```csharp
string connectionString = builder.Configuration
    .GetConnectionString("Orders")
    ?? throw new InvalidOperationException("Orders connection is not configured.");
```

Bind and validate related settings:

```csharp
builder.Services
    .AddOptions<EmailOptions>()
    .BindConfiguration("Email")
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

Fail startup for critical invalid configuration rather than waiting for the first request. Keep secrets out of committed JSON and logs; use approved environment/secret providers.

## Logging during startup

The builder provides logging configuration:

```csharp
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
```

Most apps keep defaults and configure levels through configuration. After building, resolve/inject `ILogger<T>` rather than creating independent logger factories.

For very early bootstrap failures, startup infrastructure may need limited bootstrap logging, but avoid maintaining two inconsistent logging pipelines.

Use structured templates:

```csharp
app.Logger.LogInformation(
    "Starting {Application} in {Environment}",
    app.Environment.ApplicationName,
    app.Environment.EnvironmentName);
```

Never log secrets, tokens, full connection strings, or sensitive request content.

## Registering services

Registrations describe how the DI container creates services:

```csharp
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddTransient<CreateOrderHandler>();
```

Framework registration methods add groups of related services:

```csharp
builder.Services.AddControllers();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();
```

Registration alone does not necessarily activate request behavior. `AddAuthentication` registers services; `UseAuthentication` adds middleware. `AddControllers` registers MVC services; `MapControllers` creates endpoints.

Respect lifetimes:

- singleton: application service-provider lifetime, shared and thread-safe,
- scoped: one instance per request scope,
- transient: new per resolution.

A singleton must not capture a scoped service. Let the container dispose services it creates.

## Building the application

```csharp
WebApplication app = builder.Build();
```

Build creates the service provider and application pipeline builder. Treat service registrations as complete after this point. Resolving services from `builder.Services` is not how the container is used.

Avoid calling `BuildServiceProvider()` during registration. It creates a second container, duplicates singleton lifetimes, bypasses validation, and confuses disposal. Use registration factories that receive `IServiceProvider`, options, or restructure dependencies.

Enable useful validation according to environment/configuration. The default builder commonly enables service scope/build validation in Development. Production startup tests can catch graphs not exercised locally.

## Development and production environments

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler();
    app.UseHsts();
}
```

The environment name commonly comes from `DOTNET_ENVIRONMENT` or `ASPNETCORE_ENVIRONMENT` according to host precedence. Set it explicitly in deployment.

Environment is not the same as build configuration. A Release build can run in Development, and a Debug build can run in Production.

Do not expose developer exception pages outside trusted development because they reveal stack traces and internal details. Do not disable authorization, HTTPS, or validation merely by claiming an environment name; environment variables are configuration, not a security boundary.

## Configuring the request pipeline

Each `app.Use...` adds middleware in order:

```csharp
app.UseExceptionHandler();
app.UseForwardedHeaders();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
```

Order determines which middleware sees requests, endpoints, users, and responses. Middleware before `await next(context)` runs top to bottom; after it runs bottom to top.

Some `WebApplication` features add routing/auth middleware automatically when services/endpoints require it, but explicit ordering is clearer when inserting CORS, forwarded headers, rate limits, sessions, or custom middleware. Follow each middleware’s documented placement.

Never place terminal middleware before endpoints that must run.

## Mapping endpoints

Endpoint mapping adds routeable handlers:

```csharp
app.MapGet("/status", () => Results.Ok());
app.MapControllers();
app.MapRazorComponents<App>();
app.MapHub<NotificationsHub>("/hubs/notifications");
app.MapHealthChecks("/health");
```

Mappings can carry metadata:

```csharp
app.MapGet("/admin", HandleAdmin)
    .RequireAuthorization("Administrators")
    .WithName("AdminSummary")
    .WithTags("Administration");
```

Group cohesive endpoints:

```csharp
RouteGroupBuilder orders = app.MapGroup("/api/orders")
    .RequireAuthorization();

orders.MapGet("/{id:guid}", GetOrder);
orders.MapPost("/", CreateOrder);
```

Ensure endpoint mappings happen before the application starts. Order can matter for fallback endpoints and overlapping patterns.

## Starting the web server

```csharp
app.Run();
// or
await app.RunAsync();
```

This starts hosted services/server, listens on configured endpoints, and waits until shutdown. It is normally the final statement.

Server addresses can be configured through application settings, environment variables such as `ASPNETCORE_URLS`, command-line `--urls`, Kestrel configuration, or deployment hosting integration. In containers, listen interfaces/ports must align with container networking.

Do not treat launch profile URLs as production configuration. `launchSettings.json` is development tooling input.

## Startup initialization

Some applications need migrations, seeding, or warmup. Keep ownership explicit:

```csharp
await using (AsyncServiceScope scope = app.Services.CreateAsyncScope())
{
    var initializer = scope.ServiceProvider.GetRequiredService<IInitializer>();
    await initializer.InitializeAsync(app.Lifetime.ApplicationStopping);
}
```

Consider whether this belongs in application startup or deployment automation. Multiple instances starting simultaneously can race on migrations/seeding. A failed migration may require privileged credentials that the running app should not hold.

Readiness should not report healthy before required initialization is complete. Make initialization bounded, observable, idempotent, and safe under partial failure.

## Graceful shutdown

The host responds to Ctrl+C, SIGTERM, hosting integration, or `StopApplication`. It stops accepting work according to server behavior, signals cancellation, and gives requests/hosted services a bounded shutdown period.

Request handlers receive `HttpContext.RequestAborted` when clients disconnect or shutdown aborts work. Background services receive a stopping token.

Graceful shutdown is not guaranteed under process kill, crash, or machine loss. Persist critical operations transactionally and design retries/idempotency. Do not start unsupervised fire-and-forget tasks from requests or startup; use a durable queue/background-service design with explicit ownership.

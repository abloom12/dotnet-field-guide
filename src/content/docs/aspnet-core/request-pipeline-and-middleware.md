---
title: Request Pipeline and Middleware
description: Understand ordered middleware execution, branching, short-circuiting, HttpContext, and pipeline diagnostics.
sidebar:
  order: 3
---

ASP.NET Core handles each HTTP request through an ordered middleware pipeline. Each middleware can inspect or change the request, call the next delegate, inspect or change the response, or short-circuit.

## Quick reference

### Execution order

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("A before");
    await next(context);
    Console.WriteLine("A after");
});

app.Use(async (context, next) =>
{
    Console.WriteLine("B before");
    await next(context);
    Console.WriteLine("B after");
});

app.MapGet("/", () => "Endpoint");
```

```text
A before → B before → endpoint → B after → A after
```

### `Use`, `Run`, and `Map`

| API | Behavior |
| --- | --- |
| `Use(...)` / `UseMiddleware<T>()` | Adds middleware that may call the next delegate |
| `Run(...)` | Adds a terminal delegate; no `next` |
| `Map("/path", branch => ...)` | Branches by request path and removes matched path segment in branch |
| `MapWhen(predicate, branch => ...)` | Branches when a predicate matches |
| `UseWhen(predicate, branch => ...)` | Conditionally runs a branch, then can rejoin main pipeline |
| `MapGet`/`MapPost` etc. | Maps routable endpoints, not the same as path-branch `Map` |

### Common ordering shape

```csharp
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseHsts();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors("Api");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapRazorComponents<App>();
```

This is an orientation, not universal copy/paste. Placement requirements depend on each middleware and hosting/proxy design.

### Custom middleware

```csharp
public sealed class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            await next(context);
        }
        finally
        {
            logger.LogInformation(
                "{Method} {Path} returned {StatusCode} in {ElapsedMs} ms",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        }
    }
}

app.UseMiddleware<RequestTimingMiddleware>();
```

Do not log secrets, tokens, or sensitive body/query values.

## How a request moves through the pipeline

A middleware is conceptually:

```csharp
RequestDelegate middleware = async context =>
{
    // request-side work
    await next(context);
    // response-side work
};
```

The first registered middleware receives the request first and response last. If middleware does not call `next`, downstream middleware and the selected endpoint do not run.

Exceptions propagate back toward earlier middleware unless caught. This is why exception handling belongs early enough to wrap the rest of the pipeline.

Once response headers/body begin, upstream middleware may be unable to replace status/headers. Check `context.Response.HasStarted` in error logic.

## Middleware ordering

Ordering is part of application correctness and security:

- forwarded headers must run before components that consume scheme/host/client IP,
- exception handling must wrap code whose exceptions it handles,
- static files can short-circuit before endpoint authorization unless separately protected,
- routing must select endpoint metadata before middleware that depends on it,
- CORS placement must satisfy routing/response requirements,
- authentication must establish the user before authorization evaluates it,
- authorization must run before protected endpoints,
- endpoint mappings/fallbacks must not be hidden behind a terminal delegate.

Some `WebApplication` defaults insert routing/auth behavior automatically. Explicit `UseRouting`, `UseAuthentication`, and `UseAuthorization` gives control when custom placement is required.

Review official docs for middleware with special ordering needs; there is no single correct pipeline for every app.

## `Use`

Inline middleware:

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    await next(context);
});
```

`Use` receives `next` and chooses whether to invoke it. Prefer `Use`/`UseMiddleware<T>` overloads that avoid unnecessary per-request allocations when writing infrastructure code.

Do not modify response headers after `await next` unless you know the response has not started. Register `Response.OnStarting` when a value must be applied immediately before headers are sent:

```csharp
context.Response.OnStarting(() =>
{
    context.Response.Headers["X-Trace-Id"] = context.TraceIdentifier;
    return Task.CompletedTask;
});
```

## `Run`

`Run` creates terminal middleware:

```csharp
app.Run(async context =>
{
    context.Response.StatusCode = StatusCodes.Status404NotFound;
    await context.Response.WriteAsync("Not found");
});
```

Anything registered after this terminal delegate in the same pipeline is unreachable. Use endpoint fallback mappings for route-aware terminal behavior where appropriate.

`app.Run()` with no request delegate starts the host; that startup API is distinct from `app.Run(context => ...)` terminal middleware.

## `Map`, `MapWhen`, and `UseWhen`

Path branch:

```csharp
app.Map("/admin", admin =>
{
    admin.UseMiddleware<AdminAuditMiddleware>();
    admin.Run(context => context.Response.WriteAsync("Admin branch"));
});
```

`Map` matches a path prefix and adjusts `PathBase`/`Path` within the branch. It is middleware branching, not endpoint route-template matching.

Predicate branch:

```csharp
app.MapWhen(
    context => context.Request.Query.ContainsKey("debug"),
    branch => branch.Run(context => context.Response.WriteAsync("Debug")));
```

`MapWhen` does not rejoin the main branch when matched. `UseWhen` creates a conditional branch that can rejoin when branch middleware calls next.

Keep branches rare and visible; endpoint metadata/groups are often clearer for route-specific policies.

## Common built-in middleware

| Middleware | Purpose |
| --- | --- |
| Forwarded headers | Uses trusted proxy headers to restore original scheme/host/IP |
| Exception handler/developer page | Converts or displays unhandled failures |
| HSTS / HTTPS redirection | HTTPS policy support |
| Static files | Serves files and may short-circuit |
| Routing | Selects endpoint and metadata |
| CORS | Applies cross-origin response/preflight policy |
| Authentication | Builds `HttpContext.User` |
| Authorization | Enforces endpoint policy |
| Rate limiter | Limits matching traffic according to policy |
| Response compression/caching | Response optimization/caching behavior |
| Session | Loads/saves server-backed session state |
| Status code pages | Generates bodies for otherwise empty error statuses |

Each usually needs corresponding service registration/options. Add only what the application requires and understand whether it acts before or after endpoints.

## Writing custom middleware

Conventional middleware has a constructor receiving `RequestDelegate` and an `Invoke`/`InvokeAsync` method receiving `HttpContext`:

```csharp
public sealed class CorrelationMiddleware
{
    private readonly RequestDelegate next;

    public CorrelationMiddleware(RequestDelegate next) => this.next = next;

    public async Task InvokeAsync(HttpContext context, ILogger<CorrelationMiddleware> logger)
    {
        string correlationId = context.Request.Headers["X-Correlation-Id"].FirstOrDefault()
            ?? context.TraceIdentifier;

        context.Items[CorrelationKey] = correlationId;
        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await next(context);
        }
    }
}
```

Middleware instances created conventionally are effectively singleton-like, so constructor-injected dependencies must be safe for that lifetime. Scoped services can be injected into `InvokeAsync`, or middleware can implement `IMiddleware` and be registered with an appropriate lifetime.

Avoid mutable per-request fields on a shared middleware instance; use locals or `HttpContext`.

## Short-circuiting

Middleware can finish a request without calling next:

```csharp
if (!context.Request.Headers.ContainsKey("X-Required"))
{
    context.Response.StatusCode = StatusCodes.Status400BadRequest;
    await context.Response.WriteAsJsonAsync(new { error = "Missing header" });
    return;
}

await next(context);
```

Common short-circuits include static files, authentication challenges, authorization forbids, rate limits, cache hits, redirects, and maintenance responses.

A short-circuit must produce a complete intentional response and preserve required headers/logging. Do not duplicate endpoint validation/business logic in generic middleware.

## Before and after `next`

Use request-side work before `next`:

- normalize safe context,
- start timing/activity,
- establish correlation/log scope,
- reject at cross-cutting gates.

Use response-side work after `next`:

- stop timing,
- record status/metrics,
- clean up request resources,
- inspect outcome when headers are still mutable.

Always use `try/finally` for cleanup that must run when downstream throws:

```csharp
try
{
    await next(context);
}
finally
{
    cleanup.Dispose();
}
```

Do not catch all exceptions unless the middleware is explicitly the application’s exception boundary and maps/logs them consistently.

## Per-request state

Preferred per-request state mechanisms are:

- scoped services for cohesive behavior/state,
- endpoint/route values for routing data,
- features for server/framework capabilities,
- `HttpContext.Items` for small pipeline-local values,
- `Activity`/logging scope for diagnostics.

```csharp
private static readonly object CorrelationKey = new();
context.Items[CorrelationKey] = correlationId;
```

Use an object key to avoid string collisions between components. `Items` is discarded after the request and is not session/persistence.

Do not store request state in static fields or singleton mutable properties. Many requests execute concurrently.

## Accessing `HttpContext`

Middleware and handlers receive it directly. Controllers expose `HttpContext`; services can use `IHttpContextAccessor` when truly tied to the current request:

```csharp
builder.Services.AddHttpContextAccessor();
```

Prefer passing required values (user ID, cancellation token, correlation ID) into application operations rather than making deep layers depend on ambient HTTP state.

Never retain `HttpContext` after the request. It is not thread-safe for arbitrary concurrent access and can be invalid once the request completes. Copy immutable values needed for separately owned work.

Useful members include:

```csharp
context.Request
context.Response
context.User
context.RequestServices
context.RequestAborted
context.TraceIdentifier
context.GetEndpoint()
```

Avoid service-location through `RequestServices` when normal injection is available.

## Diagnosing order problems

Symptoms include:

- `User` empty before authorization,
- endpoint metadata null,
- CORS headers missing on errors,
- redirects use HTTP behind HTTPS proxy,
- static files bypass expected policy,
- exception handler cannot alter a started response,
- endpoint never runs,
- status-code pages do not produce expected body.

Debug systematically:

1. list middleware exactly in registration order,
2. mark which ones short-circuit,
3. identify when endpoint routing occurs,
4. log path, method, endpoint display name, user authentication, status, and `HasStarted`,
5. test direct and proxy-hosted requests,
6. temporarily reduce to the smallest pipeline,
7. check each middleware’s documented placement.

Do not log authorization headers, cookies, tokens, or sensitive request bodies while diagnosing.

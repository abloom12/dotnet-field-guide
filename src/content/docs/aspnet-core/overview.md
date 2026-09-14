---
title: ASP.NET Core Overview
description: Understand ASP.NET Core's place in .NET and the path from HTTP request to application code.
sidebar:
  order: 1
---

ASP.NET Core is .NET’s cross-platform web framework. It supplies HTTP hosting, middleware, routing, endpoints, security integration, configuration, logging, and web-focused dependency injection conventions.

## Quick reference

### Stack map

```text
C# language
  → .NET runtime, libraries, SDK, hosting, DI, configuration, logging
    → ASP.NET Core server + HTTP pipeline + routing + web security
      → Minimal APIs, controllers, Razor Pages, Blazor, SignalR, gRPC
        → application and domain logic
```

### Request path

```text
Client
  → reverse proxy/load balancer (sometimes)
  → Kestrel web server
  → ordered middleware pipeline
  → routing selects endpoint
  → authentication/authorization
  → endpoint filter/model binding/validation as applicable
  → Minimal API handler or controller action
  → application service
  → endpoint result becomes HTTP response
  → middleware unwinds in reverse order
```

### Minimal application

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddAuthorization();
builder.Services.AddScoped<IOrderService, OrderService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthorization();

app.MapGet("/orders/{id:guid}", async (
    Guid id,
    IOrderService orders,
    CancellationToken cancellationToken) =>
{
    var order = await orders.FindAsync(id, cancellationToken);
    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.Run();
```

### Framework versus application responsibilities

| ASP.NET Core boundary | Application boundary |
| --- | --- |
| HTTP route/method/status/header/cookie | Use case and business outcome |
| Authentication scheme and user principal | Permission/business ownership rule |
| Binding and request-shape validation | Domain invariant |
| Middleware and exception translation | Application operation orchestration |
| Request cancellation token | Transaction/consistency boundary |
| JSON format and Problem Details | Domain result/error meaning |

### Rules worth keeping

- Keep endpoint code thin: translate HTTP input, call an application operation, map its result.
- Middleware order is behavior; review it top to bottom and bottom to top.
- Treat all request data and client identity claims as untrusted until validated.
- Authenticate who the caller is; authorize what that caller may do.
- Use asynchronous APIs and pass `RequestAborted`/`CancellationToken` through.
- Never expose stack traces, secrets, or internal exception details in production responses.
- Test behind the same proxy, HTTPS, path-base, and hosting topology used in production.

## Where ASP.NET Core fits within .NET

ASP.NET Core is a framework built on .NET. It uses the generic host, dependency-injection abstractions, configuration, logging, tasks, networking, and base libraries. It adds web-specific concepts including:

- `WebApplication` and Kestrel integration,
- `HttpContext`, request, and response abstractions,
- middleware composition,
- endpoint routing,
- model binding and formatters,
- authentication and authorization handlers,
- Problem Details and status-code behavior,
- web application models such as controllers and Razor components.

ASP.NET Core is not the C# language and not a separate runtime. A console or worker application can use .NET hosting and DI without using ASP.NET Core.

## What ASP.NET Core provides

The shared framework includes building blocks for:

- HTTP/1.1, HTTP/2, and supported HTTP/3 hosting,
- middleware and endpoint routing,
- Minimal APIs and MVC controllers,
- JSON and other formatter integration,
- dependency injection and options,
- cookies, bearer authentication, claims, policies, and antiforgery,
- static files, response compression, caching, rate limiting, and health checks,
- SignalR, Razor Pages, Blazor, and gRPC integration,
- testing and diagnostics hooks.

Not every application needs every subsystem. Add services and middleware intentionally; calling a registration method usually adds DI services, while calling `Use...` or `Map...` participates in request processing.

## ASP.NET Core and Blazor

A Blazor Web App is hosted by ASP.NET Core. ASP.NET Core handles HTTP requests, endpoint routing, authentication/authorization infrastructure, static assets, and server hosting. Blazor adds Razor component rendering and interactive server/browser UI behavior.

Blazor render modes change where component code executes:

- static SSR executes components during an ASP.NET Core request,
- Interactive Server retains components in a server circuit,
- Interactive WebAssembly executes downloaded code in the browser and calls server APIs for protected resources.

A hidden Blazor button is not endpoint authorization. Server operations must still enforce access. See the [Blazor Overview](/blazor/overview/) for the component model.

## Web server and hosting model

Kestrel is ASP.NET Core’s cross-platform web server. `WebApplication.Run` starts the host and listens on configured endpoints. In production, Kestrel may be internet-facing or run behind IIS, nginx, Apache, a cloud ingress, or another reverse proxy.

The generic/web host supplies:

- application lifetime,
- DI container and scopes,
- configuration and logging,
- hosted services,
- graceful shutdown,
- integration with Kestrel and server features.

A reverse proxy can terminate TLS and set the apparent scheme, host, and remote IP. Configure trusted forwarded headers so redirects, authentication, URL generation, and security decisions see correct values. Never trust forwarded headers from arbitrary clients.

Each request receives an `HttpContext` and normally a request DI scope. Request code can execute concurrently across many threads/requests; singleton services and shared state must be thread-safe.

## Minimal APIs

Minimal APIs define handlers directly on route builders:

```csharp
app.MapPost("/orders", async Task<Results<Created<OrderResponse>, ValidationProblem>> (
    CreateOrderRequest request,
    ICreateOrder useCase,
    CancellationToken cancellationToken) =>
{
    // map request, invoke use case, return typed result
});
```

They provide concise routing, parameter binding, DI, filters, authorization metadata, OpenAPI metadata, and typed results. They work well for focused APIs, small services, and vertical feature organization.

“Minimal” refers to ceremony, not capability or architecture. Handlers can still become unmaintainable if they contain database queries, business rules, and response mapping inline.

## Controllers

Controllers group action methods under MVC conventions:

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderResponse>> Get(
        Guid id,
        CancellationToken cancellationToken)
    {
        // invoke application service and map result
    }
}
```

Controllers provide attributes, filters, conventions, formatters, model validation behavior, and an established structure useful for larger HTTP APIs or teams familiar with MVC.

Choose Minimal APIs or controllers per API area based on organization and framework features. Both use the same host, middleware, routing, DI, security, and application services. Avoid mixing styles randomly inside one cohesive feature.

## Basic application structure

A common repository shape is:

```text
src/
├── Product.Web/
│   ├── Program.cs
│   ├── Endpoints/ or Controllers/
│   ├── Middleware/
│   ├── Contracts/
│   ├── appsettings.json
│   └── wwwroot/
├── Product.Application/
├── Product.Domain/
└── Product.Infrastructure/
```

The web project is the HTTP composition and delivery boundary. Exact project layering depends on application size and architecture; folder names do not enforce dependencies.

`Program.cs` registers services and configures middleware/endpoints. Request DTOs describe the external HTTP contract. Application services/handlers implement use cases. Infrastructure integrates databases and external systems. Domain code represents core rules when the domain warrants it.

## How a request reaches code

1. Kestrel accepts a request and creates an `HttpContext`.
2. Middleware executes in registration order on the way in.
3. Routing matches path, method, constraints, and metadata to an endpoint.
4. Authentication establishes `HttpContext.User`; authorization evaluates endpoint policy.
5. Framework binding creates handler/action arguments from route, query, headers, services, and body.
6. Validation runs according to the selected application model and configured validators.
7. The handler/action calls application code.
8. A result writes status, headers, and body.
9. Control returns through earlier middleware in reverse order.
10. Request-scoped services are disposed when the request ends.

Any middleware can short-circuit before the endpoint. Exceptions can be translated by earlier exception-handling middleware. A started response limits what later error handling can change.

## Keep application logic out of the web layer

Endpoint code should own web translation:

```text
HTTP request DTO
  → command/query/application input
  → application operation
  → application result
  → HTTP status + response DTO/Problem Details
```

Move out of endpoints:

- business decisions and invariants,
- transaction coordination,
- reusable workflows,
- direct persistence implementation,
- third-party protocol details,
- domain authorization/ownership decisions.

Keep in ASP.NET Core:

- route and HTTP method selection,
- request/response contracts,
- binding and transport validation,
- authentication setup and endpoint policy metadata,
- status/header/cookie mapping,
- middleware concerns tied to HTTP.

Thin endpoints make behavior reusable from jobs, messages, tests, or another interface and prevent domain outcomes from becoming coupled to status-code classes.

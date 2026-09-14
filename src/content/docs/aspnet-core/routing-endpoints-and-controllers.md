---
title: Routing, Endpoints, and Controllers
description: Match HTTP requests to Minimal API handlers or controller actions and describe endpoint behavior.
sidebar:
  order: 4
---

Endpoint routing selects executable code by HTTP method, route template, constraints, and metadata. Minimal API handlers and controller actions are two application models built on that same routing system.

## Quick reference

### Minimal API

```csharp
RouteGroupBuilder orders = app.MapGroup("/api/orders")
    .WithTags("Orders")
    .RequireAuthorization();

orders.MapGet("/{id:guid}", GetOrderAsync)
    .WithName("GetOrder")
    .Produces<OrderResponse>(StatusCodes.Status200OK)
    .ProducesProblem(StatusCodes.Status404NotFound);

static async Task<Results<Ok<OrderResponse>, NotFound>> GetOrderAsync(
    Guid id,
    IOrderQueries queries,
    CancellationToken cancellationToken)
{
    OrderResponse? order = await queries.FindAsync(id, cancellationToken);
    return order is null ? TypedResults.NotFound() : TypedResults.Ok(order);
}
```

### Controller

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController(IOrderQueries queries) : ControllerBase
{
    [HttpGet("{id:guid}", Name = "GetOrder")]
    [ProducesResponseType<OrderResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<OrderResponse>> Get(
        Guid id,
        CancellationToken cancellationToken)
    {
        var order = await queries.FindAsync(id, cancellationToken);
        return order is null ? NotFound() : Ok(order);
    }
}
```

### Route syntax

| Template | Meaning |
| --- | --- |
| `/orders/{id}` | Required segment named `id` |
| `/orders/{id:guid}` | Required GUID segment |
| `/reports/{year:int?}` | Optional constrained segment |
| `/files/{*path}` | Catch-all path |
| `/orders/{id=1}` | Segment with default |

### Choose an application model

| Minimal APIs | Controllers |
| --- | --- |
| Concise handlers and feature-local groups | Attribute/convention-based action classes |
| Strong typed-result patterns | MVC filters, formatters, conventions |
| Good for focused HTTP APIs | Good for large APIs needing MVC conventions |
| Endpoint filters | Action/resource/exception/result filters |

Both support DI, authentication/authorization, OpenAPI metadata, model binding, and the same middleware pipeline.

## Route templates and parameters

A template describes path segments:

```csharp
app.MapGet("/customers/{customerId}/orders/{orderId:guid}",
    (string customerId, Guid orderId) => ...);
```

Literal segments must match. Parameter names are case-insensitive for matching, but keep names/casing consistent with handler/action parameters and generated links.

Constraints narrow matches:

```csharp
app.MapGet("/products/{id:int:min(1)}", ...);
app.MapGet("/events/{date:datetime}", ...);
```

Constraints should disambiguate route shape, not perform business validation. A valid integer can still be an invalid product ID; return an application-appropriate response after matching.

Optional/default/catch-all routes can overlap broadly. Prefer stable, unambiguous resource-oriented paths and test edge cases including encoded characters, trailing slashes, path base, and case behavior.

## HTTP method matching

Map the methods an endpoint actually supports:

```csharp
app.MapGet("/orders", ListOrders);
app.MapPost("/orders", CreateOrder);
app.MapPut("/orders/{id:guid}", ReplaceOrder);
app.MapPatch("/orders/{id:guid}", UpdateOrder);
app.MapDelete("/orders/{id:guid}", DeleteOrder);
```

A matching path with the wrong method normally yields `405 Method Not Allowed`; no route match yields `404 Not Found`. Avoid `MapMethods` with broad methods unless needed.

HTTP method semantics matter:

- GET/HEAD should be safe and not change business state,
- PUT is conventionally idempotent replacement/update at a known URI,
- DELETE should be designed for retry/idempotency,
- POST commonly creates or invokes a non-idempotent operation,
- PATCH applies a partial update with an explicit format/contract.

Do not rely only on convention for security; apply authorization to every operation.

## Minimal API handlers

A handler can be a lambda, local function, static method, or method group:

```csharp
app.MapPost("/orders", CreateOrderAsync);

static async Task<Created<OrderResponse>> CreateOrderAsync(
    CreateOrderRequest request,
    ICreateOrder useCase,
    CancellationToken cancellationToken)
{
    OrderResponse created = await useCase.ExecuteAsync(request, cancellationToken);
    return TypedResults.Created($"/orders/{created.Id}", created);
}
```

Binding supplies parameters from route/query/header/body/services/special framework types. Keep handlers thin and name extracted handlers when inline lambdas become difficult to scan.

Route handlers can return values, `IResult`, typed results, or supported serializable types. Explicit typed result unions improve compile-time checking and OpenAPI description.

Filters can run around Minimal API handlers:

```csharp
endpoint.AddEndpointFilter<ValidationFilter>();
```

Use endpoint filters for handler-level cross-cutting behavior. Use middleware for pipeline-wide HTTP behavior and application services for business rules.

## Controllers and actions

Register/map controllers:

```csharp
builder.Services.AddControllers();
// ...
app.MapControllers();
```

An API controller usually derives from `ControllerBase` and uses attributes:

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class ProductsController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult Get(int id) => ...;
}
```

`[ApiController]` enables API-focused conventions such as attribute-routing requirement, inferred binding sources, and automatic validation-problem responses for invalid model state.

Controllers are created per request through DI. Inject dependencies through constructors. Keep actions focused on HTTP mapping rather than using inheritance-heavy base controllers or service location.

MVC filters can run authorization/resource/action/exception/result concerns. Their scope and order differ from middleware; choose the layer whose context and reach fit the behavior.

## Route groups

Group Minimal APIs by prefix and shared metadata:

```csharp
RouteGroupBuilder api = app.MapGroup("/api")
    .RequireAuthorization()
    .WithOpenApi();

RouteGroupBuilder orders = api.MapGroup("/orders")
    .WithTags("Orders");

orders.MapGet("/", ListOrders);
orders.MapGet("/{id:guid}", GetOrder);
```

Metadata/conventions applied to groups flow to endpoints. Nested groups can compose prefixes and policies.

Groups improve organization without hiding routes in separate middleware branches. Extract extension methods by feature:

```csharp
app.MapOrderEndpoints();
```

Keep route templates visible in the feature mapping method and avoid reflection-based automatic discovery unless its benefit outweighs lost traceability.

Controllers can share route prefixes/policies through class attributes and conventions rather than `MapGroup`.

## Endpoint metadata

An endpoint contains a request delegate plus metadata used by routing and middleware. Metadata can describe:

- authorization policies/anonymous access,
- endpoint name,
- response types/status codes,
- OpenAPI operation details,
- CORS/rate-limit policies,
- antiforgery requirements,
- custom application markers.

```csharp
app.MapPost("/orders", CreateOrder)
    .RequireAuthorization("CanCreateOrders")
    .RequireRateLimiting("writes")
    .WithName("CreateOrder")
    .WithTags("Orders");
```

Middleware after routing can inspect:

```csharp
Endpoint? endpoint = context.GetEndpoint();
```

Metadata is declarative input to a component that enforces behavior. Adding a custom attribute does nothing unless middleware/filter/framework code reads it.

Endpoint names should be unique and stable when used for link generation.

## Injecting dependencies into handlers

Minimal APIs infer registered services or accept `[FromServices]` when ambiguity/clarity requires it:

```csharp
static Task<IResult> Handle(
    [FromServices] IOrderService orders,
    HttpContext context,
    CancellationToken cancellationToken)
```

Controllers use constructor injection:

```csharp
public sealed class OrdersController(IOrderService orders) : ControllerBase
```

Action parameter injection with `[FromServices]` exists for action-specific dependencies, but constructor injection better reveals dependencies used across actions.

Do not inject a database context directly into every endpoint merely because DI permits it. An application/query service gives operations a stable contract, centralizes authorization/business/transaction behavior, and improves testing.

The request `CancellationToken` binds to `HttpContext.RequestAborted` in route handlers/actions. Pass it through.

## Organizing endpoints

Useful organization preserves a readable path from route to behavior:

```text
Orders/
├── OrderEndpoints.cs       route mappings and HTTP translation
├── CreateOrderRequest.cs   request contract
├── OrderResponse.cs        response contract
└── application operation elsewhere
```

Patterns that scale:

- route groups by feature,
- named static handler methods,
- endpoint mapping extension methods,
- controllers grouped by cohesive resource/feature,
- separate request/response DTOs.

Avoid:

- one giant `Program.cs`,
- one giant controller,
- clever assembly scanning that hides methods/policies,
- deep generic endpoint base classes,
- endpoints that directly implement business workflows.

A developer should be able to locate the route, policy, input contract, application call, and response mapping quickly.

## Choosing Minimal APIs or controllers

Choose Minimal APIs when concise endpoint mapping, route groups, typed results, and endpoint filters fit the API. Choose controllers when MVC conventions, action filters, formatter customization, established controller organization, or team consistency provide value.

Do not decide based on application size alone. Both can support production systems. More important questions are:

1. Which framework features does the API need?
2. Which style makes routes and policies easiest to audit?
3. How will input/output contracts be documented and tested?
4. Can handlers/actions remain thin?
5. What style is already consistent in the repository?

Use one primary style per cohesive area. Shared application services should remain independent of either.

## OpenAPI at a high level

OpenAPI is a machine-readable description of HTTP operations, parameters, security, and response schemas. ASP.NET Core can generate documents from endpoint/controller metadata, with tooling depending on framework version and selected packages.

Modern built-in setup can look like:

```csharp
builder.Services.AddOpenApi();
// ...
app.MapOpenApi();
```

Endpoint metadata and typed signatures improve the document:

```csharp
app.MapGet("/orders/{id:guid}", GetOrder)
    .WithName("GetOrder")
    .WithSummary("Gets one order")
    .Produces<OrderResponse>()
    .ProducesProblem(StatusCodes.Status404NotFound);
```

OpenAPI generation does not prove runtime behavior matches documentation. Test status codes, schemas, validation, and security. Expose interactive API documentation only according to environment/security policy, and never include secrets or internal-only details unintentionally.

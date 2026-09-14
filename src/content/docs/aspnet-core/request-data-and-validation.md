---
title: Request Data and Validation
description: Bind route, query, header, body, and file data into explicit validated request contracts.
sidebar:
  order: 5
---

Request data is untrusted. Binding converts HTTP representations into .NET values; validation decides whether those values satisfy the request contract. Domain/application rules still belong beyond the transport layer.

## Quick reference

### Minimal API binding

```csharp
app.MapPost("/customers/{customerId:guid}/orders", async (
    Guid customerId,                              // route
    [FromQuery] bool notify,                     // query
    [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
    [FromBody] CreateOrderRequest request,        // JSON body
    ICreateOrder useCase,                        // DI service
    HttpContext httpContext,
    CancellationToken cancellationToken) =>      // RequestAborted
{
    // validate/map/call/map result
});
```

### Controller binding

```csharp
[HttpPost("{customerId:guid}/orders")]
public async Task<ActionResult<OrderResponse>> Create(
    [FromRoute] Guid customerId,
    [FromQuery] bool notify,
    [FromHeader(Name = "Idempotency-Key")] string idempotencyKey,
    [FromBody] CreateOrderRequest request,
    CancellationToken cancellationToken)
```

### Request DTO

```csharp
public sealed record CreateOrderRequest(
    [property: Required] string ProductCode,
    [property: Range(1, 1_000)] int Quantity,
    string? Note);
```

Do not bind persistence/domain entities directly from public request bodies.

### Validation response

```csharp
return Results.ValidationProblem(new Dictionary<string, string[]>
{
    ["quantity"] = ["Quantity must be between 1 and 1,000."]
});
```

A validation problem normally uses HTTP 400 and `application/problem+json` with field errors.

### Input-source guide

| Source | Good for | Caution |
| --- | --- | --- |
| Route | Resource identity/hierarchy | Constraint is not business validation |
| Query | Filtering, sort, paging, optional controls | URLs are logged/shared; enforce bounds |
| Header | Protocol metadata, conditional/idempotency keys | Case-insensitive names; do not invent when standard header exists |
| Body | Structured command/resource representation | Usually one body; size/depth/content-type limits |
| Form/file | Browser form and uploads | Antiforgery, size, streaming, filename/content validation |

## Route values

Route parameters come from matched template segments:

```csharp
app.MapGet("/orders/{id:guid}", (Guid id) => ...);
```

Controllers can be explicit:

```csharp
public IActionResult Get([FromRoute] Guid id)
```

A route constraint (`:guid`, `:int`) determines whether the route matches. It does not establish that the resource exists or that the caller may access it.

When a value cannot satisfy the route constraint, the request generally becomes no route match (404), not a validation response. If malformed input should match and return a detailed 400, accept a broader route and parse/validate deliberately.

Use route values for stable resource identity. Avoid sensitive data in paths because URLs appear in logs/history/telemetry.

## Query-string parameters

Minimal handler names can bind query values when no route/body/service source takes precedence:

```csharp
app.MapGet("/orders", (int page = 1, int pageSize = 25, string? status = null) => ...);
```

Explicit attributes improve clarity in complex signatures:

```csharp
([FromQuery(Name = "sort")] string? sortBy) => ...
```

Controllers use model binding similarly. Complex query objects can group filters:

```csharp
public sealed class OrderQuery
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;
    public string? Search { get; init; }
}
```

Validate bounds to prevent huge page sizes, expensive queries, and integer errors. Define repeated-key/array and empty-value semantics in the public API.

Use proper URL encoding. Never put access tokens, credentials, or sensitive payloads in query strings.

## Request headers

Bind a header:

```csharp
[FromHeader(Name = "If-Match")] string? etag
```

or access typed/raw headers through `HttpRequest.Headers`. Header names are case-insensitive and can have multiple values.

Prefer standard HTTP headers where semantics already exist: `Authorization`, `Accept`, `Content-Type`, `If-Match`, `ETag`, `Location`, `Retry-After`, and tracing headers. Custom headers should have documented format and size limits.

Do not trust `Host`, forwarded headers, IP headers, or identity-like custom headers unless hosting middleware validates them against trusted proxies/authentication. Avoid logging `Authorization`, cookies, API keys, or sensitive correlation payloads.

## JSON request bodies

A JSON request normally binds one complex body parameter:

```csharp
app.MapPost("/orders", (CreateOrderRequest request) => ...);
```

The client should send an appropriate `Content-Type`, usually `application/json`. JSON deserialization can fail because syntax, type, required-member, numeric, enum, or converter expectations are not met.

Configure shared JSON behavior deliberately:

```csharp
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});
```

MVC has its own JSON options registration path through `AddJsonOptions`.

Avoid reading large or unbounded object graphs. Configure request body/server/form limits according to endpoint need and reject unsupported media types. Serialization settings are part of the external contract.

Only one component should consume the request body unless buffering is explicitly enabled and the stream is rewound.

## Model binding

Model binding combines value providers, metadata, converters, and application-model rules to create handler/action arguments. Sources can be inferred or declared with:

```csharp
[FromRoute]
[FromQuery]
[FromHeader]
[FromBody]
[FromForm]
[FromServices]
```

Minimal APIs also bind special types such as `HttpContext`, `HttpRequest`, `HttpResponse`, `ClaimsPrincipal`, and `CancellationToken`, and can use custom `TryParse`/`BindAsync` patterns or `[AsParameters]` grouping.

Controllers with `[ApiController]` infer binding sources under conventions and automatically return validation problems for invalid model state. Minimal API validation behavior depends on framework version and configured validation/filters; make it explicit and test it.

Binding success does not mean authorization or domain validity. It only means the request could be represented by the target .NET shape.

## Request DTOs

A request DTO is an HTTP contract tailored to one operation:

```csharp
public sealed record UpdateCustomerRequest(
    string DisplayName,
    string? PhoneNumber);
```

Benefits:

- allows only intended fields,
- separates API versioning from persistence/domain models,
- provides transport validation metadata,
- prevents clients from setting ownership/audit/internal fields,
- makes OpenAPI clearer,
- supports mapping and compatibility tests.

Do not accept database entities directly. This can cause overposting, persistence tracking surprises, accidental contract expansion, and domain coupling.

Map explicitly to an application command:

```csharp
var command = new UpdateCustomer(customerId, request.DisplayName, request.PhoneNumber, userId);
```

Server-derived values such as owner ID, tenant, permissions, timestamps, and prices should not be trusted from request DTOs.

## Required and optional values

C# nullability, `required`, binding attributes, and validation attributes solve different parts:

- non-nullable annotations communicate compiler/API intent,
- JSON `required` metadata affects deserialization in supported configurations,
- `[Required]` participates in validation,
- route template presence controls matching,
- a default parameter value makes a handler parameter optional,
- nullable `T?` represents allowed absence.

```csharp
public sealed class SearchRequest
{
    [Required]
    public string Term { get; init; } = "";

    public int Page { get; init; } = 1;
    public string? Category { get; init; }
}
```

`[Required]` on a non-nullable value type such as `int` does not reject zero; use `[Range]` or a nullable type when missing must be distinguishable.

Define semantics for missing, explicit `null`, empty string, and default values. Do not rely on compiler nullable warnings as runtime validation.

## Validation layers

Use several focused layers:

| Layer | Examples |
| --- | --- |
| Parsing/binding | Is text a GUID/int/date? Is JSON structurally readable? |
| Request validation | Required field, length, range, supported value |
| Application/domain validation | Resource state, uniqueness, ownership, invariant |
| Persistence/external enforcement | Unique constraint, concurrency token, provider limits |

Data annotations provide common synchronous DTO checks:

```csharp
[Required]
[StringLength(100, MinimumLength = 1)]
public string Name { get; init; } = "";
```

Cross-resource checks such as “code is unique” require application/infrastructure access and can race; enforce the invariant in the database/domain operation too.

For Minimal APIs, validation can use supported built-in validation in newer frameworks, endpoint filters, or a chosen validation library. Avoid duplicating subtly different rules across filter, handler, and application service.

## Returning validation problems

Minimal API:

```csharp
return TypedResults.ValidationProblem(errors);
```

Controller with `[ApiController]` automatically returns a validation problem when `ModelState` is invalid. Manual controller response:

```csharp
return ValidationProblem(ModelState);
```

Use a consistent Problem Details contract containing stable field keys and safe messages. Do not include stack traces, SQL errors, internal exception text, or sensitive submitted values.

Distinguish malformed/invalid requests (usually 400) from authentication (401), authorization (403), missing resources (404), state/concurrency conflicts (409/412), and unsupported content (415).

Client teams need documented rules for property naming and nested/collection field paths.

## File uploads

Small buffered uploads can bind `IFormFile`:

```csharp
app.MapPost("/documents", async (IFormFile file, CancellationToken token) =>
{
    await using Stream input = file.OpenReadStream(maxAllowedSize: 10 * 1024 * 1024);
    // copy/scan/store safely
});
```

For large files, use streaming patterns to avoid buffering entire content in memory/disk unexpectedly. Configure multipart/body limits per endpoint/host/proxy.

Security requirements:

- enforce authenticated/authorized upload permissions,
- impose size/count/time limits,
- generate server-side storage names,
- never trust `FileName` or `ContentType`,
- validate signatures/content according to business need,
- store outside executable/static-content paths unless intentionally served safely,
- scan/quarantine where policy requires,
- prevent path traversal and archive/decompression bombs,
- apply antiforgery to browser cookie-authenticated forms.

Do not load an arbitrary upload into one byte array. Stream with cancellation and cleanup partial files on failure.

## Client disconnect cancellation

`HttpContext.RequestAborted` is signaled when the server detects the client disconnected or the request is aborted:

```csharp
CancellationToken cancellationToken // bound automatically in handlers/actions
```

Pass it through:

```csharp
await service.ProcessAsync(request, cancellationToken);
```

Cancellation is cooperative and detection is not instantaneous. A client disconnect does not automatically roll back a committed database or external side effect.

Choose cancellation boundaries deliberately:

- cancel expensive reads or work whose result is no longer useful,
- preserve consistency once a critical write/transaction reaches a no-cancel point,
- make retryable commands idempotent,
- do not log normal disconnect cancellation as an unexpected server error.

If work must outlive the request, enqueue a durable/background job and return an operation identifier. Do not discard a request task and hope it completes after the scope is disposed.

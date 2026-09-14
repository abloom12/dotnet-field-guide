---
title: Responses and Error Handling
description: Map application outcomes to consistent HTTP statuses, headers, JSON, typed results, and Problem Details.
sidebar:
  order: 6
---

An endpoint should translate an application outcome into an intentional HTTP status, headers, and response representation. Global exception handling covers unexpected failures; expected outcomes should not rely on exceptions by default.

## Quick reference

### Status guide

| Outcome | Typical status |
| --- | --- |
| Successful read/update with body | `200 OK` |
| Resource created | `201 Created` + `Location` |
| Successful command with no body | `204 No Content` |
| Invalid request | `400 Bad Request` |
| Missing/invalid authentication | `401 Unauthorized` |
| Authenticated but not allowed | `403 Forbidden` |
| Resource not found | `404 Not Found` |
| State/uniqueness conflict | `409 Conflict` |
| Failed precondition/ETag | `412 Precondition Failed` |
| Unsupported body content type | `415 Unsupported Media Type` |
| Valid shape but semantic validation rejected (API policy) | often `422 Unprocessable Content` |
| Rate limited | `429 Too Many Requests` (+ `Retry-After` when known) |
| Unexpected server failure | `500 Internal Server Error` |
| Temporary upstream unavailable | `502`/`503`/`504` according to actual failure |

Status selection is API-contract design, not an exception-name lookup.

### Minimal API typed results

```csharp
static async Task<Results<Ok<OrderResponse>, NotFound, ProblemHttpResult>> GetOrder(
    Guid id,
    IOrderQueries queries,
    CancellationToken cancellationToken)
{
    var result = await queries.FindAsync(id, cancellationToken);

    return result switch
    {
        FindOrderResult.Found found => TypedResults.Ok(found.Order),
        FindOrderResult.Missing => TypedResults.NotFound(),
        _ => TypedResults.Problem(statusCode: 500)
    };
}
```

### Controller action

```csharp
public async Task<ActionResult<OrderResponse>> Get(Guid id, CancellationToken token)
{
    OrderResponse? order = await queries.FindAsync(id, token);
    return order is null ? NotFound() : Ok(order);
}
```

### Global error setup

```csharp
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
```

Customize exception-to-problem mapping centrally and never expose production stack traces.

## HTTP status codes

A status code communicates the protocol outcome independently of the response body. Choose the most specific stable semantics clients can use.

### Success

- `200 OK`: successful response with representation.
- `201 Created`: new resource; include a `Location` URI when one exists.
- `202 Accepted`: work accepted but not completed; provide operation/status information.
- `204 No Content`: success with no response body.

Do not return `200` with `{ success: false }` for normal HTTP errors; it breaks caches, monitoring, clients, and intermediaries.

### Client errors

- `400`: malformed or request-contract validation failure.
- `401`: authentication required/failed; despite its name, it means unauthenticated.
- `403`: authenticated identity lacks permission.
- `404`: resource/route not found; sometimes intentionally hides existence.
- `409`: conflict with current resource state or uniqueness.
- `412`: conditional request precondition failed.
- `415`: unsupported content type.
- `422`: syntactically readable request rejected semantically when API policy distinguishes it from 400.
- `429`: rate policy rejected request.

### Server errors

Use `500` for unexpected server failure. Gateway/service statuses should reflect real upstream/proxy semantics, not serve as generic “something failed” codes.

Once the response starts, status and headers usually cannot be changed. Complete validation/authorization before streaming a success body where possible.

## JSON responses

Minimal handlers can return an object for JSON serialization:

```csharp
app.MapGet("/status", () => new StatusResponse("healthy"));
```

or explicitly:

```csharp
return Results.Json(response, statusCode: StatusCodes.Status200OK);
```

Controllers with configured formatters serialize action values. Shared options control property naming, enums, converters, cycles, and other contract behavior. Minimal API and MVC JSON option registration paths differ; configure the application model actually used.

Use response DTOs rather than serializing persistence/domain entities directly. Explicit contracts avoid cycles, lazy-loading surprises, accidental sensitive fields, and breaking changes when internal models evolve.

Do not manually serialize JSON into a string and return it as ordinary text. Let the framework set content type and encode the object, or write a correctly typed response deliberately.

## Minimal API results

`Results` factory methods return `IResult`:

```csharp
return Results.Ok(value);
return Results.Created($"/orders/{value.Id}", value);
return Results.NoContent();
return Results.NotFound();
return Results.BadRequest(error);
return Results.Problem(...);
```

A handler can return a concrete serializable value, string, or `IResult`. Mixed branches often infer poorly unless all use result factories or an explicit return type.

`Results` methods are flexible but generally return interface-typed results, giving less compile-time response metadata than typed factories.

Use `Results.File`, `Results.Stream`, redirects, and other specialized results rather than manually writing low-level responses when a standard result exists.

## Typed results

`TypedResults` returns concrete result types:

```csharp
Ok<OrderResponse> ok = TypedResults.Ok(order);
NotFound missing = TypedResults.NotFound();
```

Declare possible outcomes with `Results<T1,T2,...>`:

```csharp
Task<Results<Created<OrderResponse>, ValidationProblem>> Create(...)
```

Benefits include compile-time enforcement of declared alternatives, testable concrete results, and richer automatically inferred OpenAPI metadata.

Typed unions can become cumbersome when an endpoint has too many outcomes. That often indicates the operation/result mapping should be extracted and standardized—not that all errors should collapse into 200 or 500.

## `IActionResult`

Controller actions can return any MVC action result:

```csharp
public IActionResult Delete(Guid id)
{
    bool deleted = service.Delete(id);
    return deleted ? NoContent() : NotFound();
}
```

`IActionResult` is flexible when several status/body shapes are possible, but the successful body type is not visible in the method signature. Add response metadata for OpenAPI where needed.

Common helpers include `Ok`, `CreatedAtAction`, `NoContent`, `BadRequest`, `NotFound`, `Conflict`, `Unauthorized`, `Forbid`, `Problem`, and `ValidationProblem`.

`Unauthorized()` produces 401. `Forbid()` produces authorization failure behavior (normally 403 through the configured scheme). Do not reverse them.

## `ActionResult<T>`

`ActionResult<T>` communicates the success body type while allowing error action results:

```csharp
public async Task<ActionResult<OrderResponse>> Get(Guid id)
{
    OrderResponse? order = await service.FindAsync(id);
    if (order is null)
        return NotFound();

    return order;
}
```

This improves API metadata and readability. Interface-typed result collections can require explicit conversion because C# implicit operators do not chain through arbitrary interface conversions; return a concrete DTO/list when needed.

For `201`, prefer `CreatedAtAction`/`CreatedAtRoute` when link generation is configured correctly:

```csharp
return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
```

Test generated paths behind route groups, controllers, and path bases.

## Response headers

Set headers before the response starts:

```csharp
Response.Headers.ETag = $"\"{version}\"";
Response.Headers.CacheControl = "no-store";
```

Minimal handler via `HttpContext`:

```csharp
httpContext.Response.Headers.Location = location;
```

Prefer result helpers for `Location`, content type, file metadata, and redirects. Use typed header properties where available and append only when multiple values are valid.

Common headers include:

- `Location` for created/redirected resource URI,
- `ETag` and `Last-Modified` for cache/concurrency,
- `Cache-Control`/`Vary` for caching,
- `Retry-After` for known retry windows,
- `Content-Disposition` for downloads,
- security headers according to deployment policy.

Do not reflect arbitrary request header values into a response without validation. Header injection and cache poisoning are security concerns.

Register `Response.OnStarting` when middleware needs to set a final header immediately before sending.

## Problem Details

Problem Details provides a standard error object (`application/problem+json`) with fields such as:

```json
{
  "type": "https://example.com/problems/order-conflict",
  "title": "Order conflict",
  "status": 409,
  "detail": "The order changed before this update was applied.",
  "instance": "/orders/123"
}
```

Validation problems add an `errors` map. Configure services:

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["traceId"] =
            context.HttpContext.TraceIdentifier;
    };
});
```

Use stable `type` URIs/error codes if clients need machine-readable categories. Keep `title`/safe `detail` useful without revealing implementation. Correlation IDs help server-side investigation; they are not secret proof of an error.

Problem Details standardizes shape, not application error taxonomy. Define consistent mapping and document it.

## Exception-handling middleware

Place global exception handling early:

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler();
}
```

`UseExceptionHandler` can re-execute an error endpoint or use registered exception handlers/Problem Details according to framework configuration. Central handling should:

- map known exception categories only when exceptions are the chosen contract,
- log unexpected failures once,
- preserve cancellation semantics,
- produce safe consistent responses,
- account for responses that already started.

A developer exception page is for trusted development only. It exposes code, stack, headers, query values, and internals.

Exception filters handle controller/action scope but do not catch failures from all middleware. Middleware is the broad HTTP exception boundary.

## Expected failures versus exceptions

Expected outcomes include not found, validation rejection, conflict, and denied business action when these are ordinary possibilities. Represent them explicitly:

```csharp
public abstract record SubmitOrderResult
{
    public sealed record Success(OrderResponse Order) : SubmitOrderResult;
    public sealed record Missing : SubmitOrderResult;
    public sealed record Conflict(string Reason) : SubmitOrderResult;
}
```

Unexpected infrastructure failures and violated programmer/system invariants can throw and reach centralized handling.

Do not catch `Exception` in every endpoint and return 400. That mislabels server bugs as client errors and duplicates logging. Do not use exceptions for routine high-volume branching when a result contract communicates expected outcomes more clearly.

## Mapping application results to HTTP

Keep mapping at the web boundary:

| Application result | Possible HTTP mapping |
| --- | --- |
| Created value | 201 + response + `Location` |
| Successful no-result command | 204 |
| Query value | 200 |
| Missing | 404 |
| Invalid input | 400 validation problem |
| Conflict | 409 problem |
| Concurrency token mismatch | 412 or 409 by API contract |
| Unauthenticated | authentication challenge/401 |
| Forbidden | forbid/403 |

The application layer should not return `IActionResult` or `IResult`; those couple use cases to ASP.NET Core. Map in a handler/controller or reusable web-layer mapper.

Be consistent across Minimal APIs and controllers so clients do not receive different shapes for the same category.

## Protect sensitive information

Production errors must not expose:

- stack traces/type internals,
- SQL/provider errors,
- connection strings or service URLs,
- filesystem paths,
- tokens, cookies, API keys, or credentials,
- sensitive request/body values,
- details that reveal inaccessible resource existence when policy hides it.

Log server diagnostics under access controls with structured redaction. Return a safe message plus correlation/trace identifier.

Even logs can leak through exception `Data`, nested messages, headers, scopes, and object destructuring. Review logging policy and telemetry exporters. Error handling is part of the public API and the security boundary.

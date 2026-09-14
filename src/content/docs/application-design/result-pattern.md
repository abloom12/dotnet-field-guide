---
title: Result Pattern
description: Represent successful and expected unsuccessful outcomes explicitly.
sidebar:
  order: 8
---

The Result pattern represents an operation's expected outcomes as a return value. A caller can distinguish success, validation rejection, missing data, conflict, and other known outcomes without using exceptions as routine control flow.

**Links:** [ardalis/Result repository](https://github.com/ardalis/Result) · [Documentation](https://result.ardalis.com/) · [NuGet package](https://www.nuget.org/packages/Ardalis.Result)

## Quick reference

### Return contract

```text
application operation
  → success(value)
  → invalid(validation errors)
  → not found
  → conflict(reason)
  → forbidden
  → another explicitly supported outcome
```

Unexpected failures can still throw and reach centralized exception handling. A result is not a requirement to convert every exception into a status value.

### Basic Ardalis.Result example

```csharp
using Ardalis.Result;

public async Task<Result<OrderSummary>> GetOrderAsync(
    Guid orderId,
    CancellationToken cancellationToken)
{
    Order? order = await orders.FindAsync(orderId, cancellationToken);

    if (order is null)
    {
        return Result<OrderSummary>.NotFound();
    }

    return Result<OrderSummary>.Success(
        new OrderSummary(order.Id, order.Status, order.Total));
}
```

The caller branches on the result status rather than catching a “not found” exception:

```csharp
Result<OrderSummary> result = await service.GetOrderAsync(id, cancellationToken);

if (result.Status == ResultStatus.NotFound)
{
    // Map the expected application outcome at this boundary.
}
```

### Common statuses

| Ardalis status | Application meaning | Possible HTTP mapping |
| --- | --- | --- |
| `Ok` | Operation succeeded with a value | 200 |
| `Created` | A resource was created | 201 |
| `NoContent` | Operation succeeded without response content | 204 |
| `Invalid` | Supplied data failed validation | 400 or another API-defined validation status |
| `NotFound` | Requested resource does not exist or is not visible | 404 |
| `Conflict` | Current state prevents the operation | 409 or 412 by contract |
| `Unauthorized` | Caller is not authenticated | 401/challenge |
| `Forbidden` | Identified caller is not permitted | 403 |
| `Unavailable` | Required service is temporarily unavailable | 503 |
| `Error` / `CriticalError` | Operation failed | Usually 5xx, with safe external details |

The application meaning comes first. HTTP is only one possible delivery mapping.

### Result, exception, or nullable value?

| Situation | Usually clearest |
| --- | --- |
| Lookup where absence is the only non-success outcome | `T?` may be enough |
| Operation with several expected outcomes | `Result<T>` |
| Successful operation with no value | `Result` or a simple completion return |
| Invalid programmer argument | Argument exception or guard clause |
| Violated internal invariant | Exception |
| Database/network failure not handled locally | Exception reaching a centralized boundary |
| User-correctable validation failure | Invalid result containing validation errors |

### Practical rules

- Define outcomes in application terms before mapping them to HTTP.
- Put a value only on statuses whose contract includes one.
- Preserve structured validation errors rather than flattening them too early.
- Keep exception details, SQL messages, and secrets out of result errors.
- Handle every supported status at the delivery boundary.
- Do not ignore non-success and read `Value` unconditionally.
- Use a simpler return type when there is only one obvious outcome distinction.

## Expected failures versus exceptions

Expected failures are ordinary alternatives a caller is designed to handle:

- a requested order is missing,
- submitted data is invalid,
- an order has already been submitted,
- a caller lacks permission for an operation,
- an optimistic concurrency check fails.

Exceptions are appropriate for failures that interrupt the normal contract:

- a database connection unexpectedly fails,
- an invariant believed to be guaranteed is broken,
- required configuration is missing,
- a dependency returns a malformed response,
- code uses an API incorrectly.

The distinction is contextual. “Payment declined” is an expected payment outcome; “payment provider timed out” may be an unavailable result when the application has a deliberate recovery policy, or it may remain an exception handled at a higher boundary.

Avoid this pattern:

```csharp
try
{
    // application work
}
catch (Exception exception)
{
    return Result.Error(exception.ToString());
}
```

It hides defects and cancellation, loses centralized diagnostics, and risks exposing sensitive details. Catch only failures the operation can classify and handle meaningfully. Let unexpected exceptions propagate.

Guard clauses and results therefore serve different contracts. A guard often rejects invalid programmer use by throwing; a result communicates an expected operation outcome to its caller. See [Guard Clauses](../guard-clauses/).

## `Result` and `Result<T>`

Ardalis.Result provides:

- `Result<T>` for an outcome that can carry a successful value,
- `Result` for an outcome with no successful value,
- `ResultStatus` for the outcome category,
- `ValidationError` for structured validation failures,
- error messages, correlation identifiers, and related metadata,
- mapping and binding operations,
- optional ASP.NET Core translation support.

Create a successful generic result:

```csharp
Result<OrderSummary> result = Result<OrderSummary>.Success(summary);
```

A value can also be converted implicitly to `Result<T>`, but explicit factories can make the intended outcome clearer at important boundaries.

Create a successful result without a value:

```csharp
Result result = Result.Success();
```

Do not model “missing” as `Success(null)` when callers need to distinguish absence. Use `NotFound`, or deliberately choose `T?` if absence is the only alternate case.

## Modeling application outcomes

A command can return explicit outcomes without referencing ASP.NET Core:

```csharp
public async Task<Result<OrderSummary>> SubmitOrderAsync(
    Guid orderId,
    CancellationToken cancellationToken)
{
    Order? order = await orders.FindAsync(orderId, cancellationToken);

    if (order is null)
    {
        return Result<OrderSummary>.NotFound();
    }

    if (order.Status != OrderStatus.Draft)
    {
        return Result<OrderSummary>.Conflict(
            "Only draft orders can be submitted.");
    }

    if (order.Lines.Count == 0)
    {
        return Result<OrderSummary>.Invalid(
            new ValidationError(
                nameof(order.Lines),
                "An order must contain at least one line."));
    }

    order.Submit();
    await unitOfWork.SaveChangesAsync(cancellationToken);

    return Result<OrderSummary>.Success(OrderSummary.From(order));
}
```

This contract tells callers which failures they should consider. It does not force callers to know whether data came from EF Core, a repository, or another service.

Choose statuses consistently. For example:

- **Invalid** means the submitted operation data does not satisfy validation rules.
- **Not found** means the requested target cannot be obtained under the caller's visibility rules.
- **Conflict** means the data may be valid, but current resource state prevents the operation.
- **Forbidden** means authorization was evaluated and denied.

Do not use `Invalid`, `Conflict`, and `Error` interchangeably just to avoid defining the real outcome.

## Returning validation errors

Ardalis.Result can retain a field identifier, message, code, and severity:

```csharp
var errors = new List<ValidationError>();

if (string.IsNullOrWhiteSpace(request.CustomerNumber))
{
    errors.Add(new ValidationError(
        nameof(request.CustomerNumber),
        "Customer number is required."));
}

if (request.Lines.Count == 0)
{
    errors.Add(new ValidationError(
        nameof(request.Lines),
        "At least one order line is required."));
}

if (errors.Count > 0)
{
    return Result<OrderSummary>.Invalid(errors);
}
```

Collect independent request errors when that helps the caller correct all fields at once. Domain construction and state transitions should still enforce their invariants; request validation is not the sole protection against invalid state.

Use stable machine-readable error codes when clients must branch on an error. Human messages can change or be localized and should not become accidental identifiers.

## Mapping and binding results

`Map` changes a successful value while preserving a non-success status:

```csharp
Result<Order> orderResult = await service.GetOrderAsync(id, cancellationToken);

Result<OrderResponse> responseResult = orderResult.Map(order =>
    new OrderResponse(order.Id, order.Status, order.Total));
```

The mapping function does not run for non-success outcomes.

`Bind` or `BindAsync` chains another result-producing operation:

```csharp
Result<Receipt> receipt = await FindOrderAsync(id, cancellationToken)
    .BindAsync(order => ChargeAndSubmitAsync(order, cancellationToken));
```

If finding the order fails, the later operation is skipped and the non-success outcome propagates.

Mapping and binding are useful when they keep a short workflow readable. A long fluent chain can hide transaction boundaries, side effects, and which operation produced an error. Use normal control flow when it communicates the process better.

## Using results with MediatR

A MediatR request can declare a result as its response:

```csharp
public sealed record SubmitOrderCommand(Guid OrderId)
    : IRequest<Result<OrderSummary>>;

public sealed class SubmitOrderHandler(IOrderService orderService)
    : IRequestHandler<SubmitOrderCommand, Result<OrderSummary>>
{
    public Task<Result<OrderSummary>> Handle(
        SubmitOrderCommand request,
        CancellationToken cancellationToken)
    {
        return orderService.SubmitAsync(request.OrderId, cancellationToken);
    }
}
```

MediatR dispatch and Result outcome modeling solve different problems:

- MediatR selects and pipelines the handler.
- Result describes the handler's expected outcome.

A validation pipeline behavior can return an invalid result before the handler, but generic behavior design becomes more complex when requests have unrelated response shapes. Apply a consistent application convention rather than relying on reflection-heavy behavior that is difficult to trace. See [Mediator and MediatR](../mediator-and-mediatr/).

## Keeping application logic independent of HTTP

Application code should not return:

- `IResult`,
- `IActionResult`,
- `ActionResult<T>`,
- HTTP status codes,
- `ProblemDetails`.

Those are delivery concerns. Return an application result, then map it in the web project:

```text
ResultStatus.Ok        → HTTP 200 + response DTO
ResultStatus.Created   → HTTP 201 + Location
ResultStatus.Invalid   → HTTP validation problem
ResultStatus.NotFound  → HTTP 404
ResultStatus.Conflict  → HTTP 409
ResultStatus.Forbidden → HTTP 403
```

The same application result can then be mapped differently by an HTTP endpoint, background job, command-line tool, or message consumer.

Be careful with authentication outcomes. ASP.NET Core's authentication handlers own challenge/forbid behavior such as headers and cookie redirects. Prefer endpoint authorization for transport access and use application results for deeper resource/business permissions when appropriate.

## Translating results in ASP.NET Core

The `Ardalis.Result.AspNetCore` companion package provides MVC and Minimal API translation helpers. A Minimal API can use:

```csharp
app.MapGet("/orders/{id:guid}", async (
    Guid id,
    ISender sender,
    CancellationToken cancellationToken) =>
{
    Result<OrderResponse> result = await sender.Send(
        new GetOrderQuery(id),
        cancellationToken);

    return result.ToMinimalApiResult();
});
```

MVC applications can use `ToActionResult` or the package's translation attribute/conventions. Install and configure the companion package in the web project, not in the domain model.

Automatic translation reduces repeated switches, but it creates an API convention that must be reviewed:

- verify every status maps to the intended HTTP code and body,
- verify OpenAPI metadata describes alternate responses,
- ensure validation identifiers map to client field names,
- prevent internal error details from crossing the boundary,
- test Created/NoContent semantics for each HTTP method,
- decide whether inaccessible resources map to NotFound or Forbidden.

An explicit mapper may be clearer when an endpoint has special semantics. Do not return the `Result<T>` object itself as JSON; translate its meaning into the API's response contract.

## Errors, diagnostics, and security

Client-facing errors and server diagnostics have different audiences. A result may contain a safe message or stable code such as `order.already-submitted`. Logs can contain protected operational context and a correlation identifier.

Never place these directly into a client result:

- stack traces,
- exception `ToString()` output,
- SQL/provider error messages,
- connection strings or internal service addresses,
- tokens, credentials, or personal data,
- details revealing resources the caller is not allowed to discover.

Unexpected exceptions should normally be logged once by centralized handling and translated to a generic production error. Preserve `OperationCanceledException`/cancellation behavior rather than reporting cancellation as an application error.

## Testing result-producing operations

Assert both status and payload appropriate to the status:

```csharp
[Fact]
public async Task Missing_order_returns_not_found()
{
    Result<OrderSummary> result = await handler.Handle(
        new SubmitOrderCommand(Guid.NewGuid()),
        CancellationToken.None);

    Assert.Equal(ResultStatus.NotFound, result.Status);
}

[Fact]
public async Task Draft_order_is_submitted()
{
    Result<OrderSummary> result = await handler.Handle(
        new SubmitOrderCommand(order.Id),
        CancellationToken.None);

    Assert.True(result.IsSuccess);
    Assert.Equal(OrderStatus.Submitted, result.Value.Status);
}
```

Useful tests include:

- each supported non-success outcome,
- successful value and state changes,
- all validation errors and stable codes,
- no persistence after rejected outcomes,
- HTTP mapping for every exposed status,
- safe production response bodies,
- propagation of unexpected exceptions and cancellation.

Avoid tests that only assert `IsSuccess == false`; the distinction between invalid, missing, forbidden, and conflict is part of the contract.

## When a simpler return is clearer

Use `T?` when a query either finds a value or does not and no additional failure metadata is needed:

```csharp
Task<Order?> FindAsync(Guid id, CancellationToken cancellationToken);
```

Use `bool` or `Try...` when success/failure is fully understood and no reason is needed:

```csharp
bool TryParseProductCode(string input, out ProductCode code);
```

Use an exception when the method cannot fulfill its contract because of an unexpected failure or invalid programmer use.

A result type is most valuable when callers need to handle several expected outcomes consistently. Do not wrap every private helper, collection lookup, or pure calculation in `Result<T>` merely because the application uses the pattern at its use-case boundaries. Too many nested results can obscure straightforward code as effectively as too many exceptions.

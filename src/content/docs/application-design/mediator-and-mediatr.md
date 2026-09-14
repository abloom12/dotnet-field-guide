---
title: Mediator and MediatR
description: Understand the Mediator pattern and how the MediatR library implements it.
sidebar:
  order: 6
---

The Mediator pattern routes interactions through a coordinating abstraction so a caller does not need a direct dependency on the concrete object that performs the work. MediatR is an in-process .NET library that applies this idea to requests, handlers, notifications, and request pipelines.

**Links:** [GitHub repository](https://github.com/LuckyPennySoftware/MediatR) · [NuGet package](https://www.nuget.org/packages/MediatR)

## Quick reference

### Core vocabulary

| Term | Meaning |
| --- | --- |
| **Mediator pattern** | An object coordinates communication between collaborating objects, reducing direct knowledge between them. |
| **MediatR** | A library that dispatches typed messages to handlers within the current process. |
| **Request** | A message sent to one request handler, optionally producing a response. This is not necessarily an HTTP request. |
| **Command** | An application convention for a request intended to change state. MediatR does not enforce command semantics. |
| **Query** | An application convention for a request intended to return information without changing state. MediatR does not enforce query semantics. |
| **Request handler** | The single handler selected for a request type. It implements the application operation. |
| **Notification** | A message published to zero or more notification handlers. |
| **Pipeline behavior** | Code that wraps request handling to apply a cross-cutting concern before and/or after the handler. |

An ASP.NET Core endpoint handler and a MediatR request handler are different boundaries. The endpoint translates HTTP; the request handler performs an application operation.

### Dispatch paths

```text
HTTP endpoint / background job / UI event
  → ISender.Send(request)
  → pipeline behaviors
  → one IRequestHandler
  → response
```

```text
application code
  → IPublisher.Publish(notification)
  → zero or more INotificationHandler instances
```

`Send` expects one request handler. `Publish` fans a notification out to any registered notification handlers. Neither operation sends a durable message to another process.

### Minimal request and handler

```csharp
using MediatR;

public sealed record GetOrderQuery(Guid OrderId)
    : IRequest<OrderSummary?>;

public sealed class GetOrderHandler(IOrderQueries orders)
    : IRequestHandler<GetOrderQuery, OrderSummary?>
{
    public Task<OrderSummary?> Handle(
        GetOrderQuery request,
        CancellationToken cancellationToken)
    {
        return orders.FindAsync(request.OrderId, cancellationToken);
    }
}
```

Send the request through the narrow `ISender` interface:

```csharp
OrderSummary? order = await sender.Send(
    new GetOrderQuery(orderId),
    cancellationToken);
```

### Practical rules

- Treat MediatR requests as application messages, not HTTP request/response models.
- Give each request one clear application purpose and one request handler.
- Inject the handler's real dependencies; do not resolve them through `IServiceProvider`.
- Keep pipeline behaviors focused on genuinely cross-cutting request concerns.
- Pass cancellation tokens through every asynchronous boundary.
- Do not treat notifications as durable events or guaranteed background delivery.
- Test important wiring, behavior order, and transaction boundaries through the mediator pipeline.
- Prefer a direct service call when dispatch adds indirection without a useful boundary.

## The Mediator pattern

Without a mediator, a caller can invoke a concrete collaborator directly:

```csharp
OrderSummary? order = await orderQueries.FindAsync(id, cancellationToken);
```

With MediatR, the caller creates a request and asks a sender to dispatch it:

```csharp
OrderSummary? order = await sender.Send(
    new GetOrderQuery(id),
    cancellationToken);
```

The second form separates the caller from handler selection. It also creates one consistent pipeline around application requests. This can be useful when many use cases need the same logging, validation, timing, authorization, or transaction conventions.

The trade-off is indirection. Reading `Send(query)` does not reveal the implementation dependency or handler location as directly as calling `orderQueries.FindAsync`. A mediator improves an architecture only when the request boundary and shared pipeline are valuable enough to justify that navigation cost.

The mediator is not the application itself. It should dispatch cohesive operations rather than replacing ordinary method calls between every pair of objects.

## What MediatR provides

MediatR provides in-process dispatch abstractions and DI integration for:

- request/response messages,
- requests with no response value,
- request handlers,
- notifications with multiple handlers,
- request pipeline behaviors,
- pre-processors, post-processors, and exception-processing hooks,
- streaming requests when an application genuinely needs them.

MediatR does **not** automatically provide:

- validation rules,
- authorization policy,
- database transactions,
- retries or idempotency,
- durable queues or message storage,
- delivery across services or processes,
- CQRS architecture,
- event sourcing,
- useful application boundaries.

Those behaviors require application decisions and implementations. Installing the package does not make handlers transactional, secure, reliable, or well designed.

## Requests and request handlers

A request with a response implements `IRequest<TResponse>`. Its handler implements `IRequestHandler<TRequest, TResponse>`:

```csharp
public sealed record CreateOrderCommand(
    string CustomerNumber,
    IReadOnlyList<CreateOrderLine> Lines)
    : IRequest<Guid>;

public sealed class CreateOrderHandler(
    IOrderRepository orders,
    IUnitOfWork unitOfWork)
    : IRequestHandler<CreateOrderCommand, Guid>
{
    public async Task<Guid> Handle(
        CreateOrderCommand request,
        CancellationToken cancellationToken)
    {
        var order = Order.Create(request.CustomerNumber, request.Lines);

        await orders.AddAsync(order, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return order.Id;
    }
}
```

The request is a data contract describing one operation. Prefer immutable request types without infrastructure behavior. The handler coordinates the operation and depends explicitly on the services needed to complete it.

A request can implement non-generic `IRequest` when no response value is needed. Returning an identifier, value, or explicit result can still be useful for a command; “command” does not have to mean “no C# return value.” Choose the response from the caller's real needs rather than forcing every operation into the same shape.

There should normally be exactly one request handler for each request. Missing or duplicate registrations are wiring errors, not alternate routing behavior.

## Sending requests with `ISender`

`ISender.Send` dispatches a request to its handler and returns the handler response:

```csharp
app.MapPost("/orders", async (
    CreateOrderRequest body,
    ISender sender,
    CancellationToken cancellationToken) =>
{
    var command = new CreateOrderCommand(body.CustomerNumber, body.Lines);
    Guid orderId = await sender.Send(command, cancellationToken);

    return TypedResults.Created($"/orders/{orderId}", new { orderId });
});
```

This endpoint owns HTTP concerns: request binding, status code, response shape, and `Location` header. The command and handler remain independent of ASP.NET Core types such as `IResult`, `HttpContext`, and `IActionResult`.

MediatR exposes three related interfaces:

- `ISender` sends requests,
- `IPublisher` publishes notifications,
- `IMediator` combines sending and publishing.

Inject the narrowest capability needed. An endpoint that only sends a request normally needs `ISender`, while a component that only publishes a notification needs `IPublisher`.

Always pass the caller's `CancellationToken`. In ASP.NET Core, the endpoint token represents request cancellation. A handler should pass it onward to database, HTTP, and other asynchronous APIs rather than replacing it with `CancellationToken.None`.

## Commands and queries

MediatR understands request and response types, but **command** and **query** are application meanings established through naming, interfaces, and design rules.

```csharp
public interface ICommand<TResponse> : IRequest<TResponse> { }
public interface IQuery<TResponse> : IRequest<TResponse> { }

public sealed record SubmitOrderCommand(Guid OrderId)
    : ICommand<SubmitOrderResult>;

public sealed record GetOrderQuery(Guid OrderId)
    : IQuery<OrderSummary?>;
```

These marker interfaces can make intent visible and allow constrained pipeline behaviors—for example, applying a transaction only to commands. They do not enforce that a query is side-effect free or that a command changes state. Tests and code review must preserve those semantics.

A common feature organization keeps each request near its handler:

```text
Orders/
├── Create/
│   ├── CreateOrderCommand.cs
│   └── CreateOrderHandler.cs
├── Get/
│   ├── GetOrderQuery.cs
│   └── GetOrderHandler.cs
└── Shared/
```

Organization by feature can make dispatch easier to trace than placing every command, query, and handler in separate repository-wide folders.

## Notifications and notification handlers

A notification implements `INotification` and may have zero or more handlers:

```csharp
public sealed record OrderCreatedNotification(Guid OrderId)
    : INotification;

public sealed class RecordOrderMetric(IMetrics metrics)
    : INotificationHandler<OrderCreatedNotification>
{
    public Task Handle(
        OrderCreatedNotification notification,
        CancellationToken cancellationToken)
    {
        metrics.OrderCreated();
        return Task.CompletedTask;
    }
}
```

Publish it through `IPublisher`:

```csharp
await publisher.Publish(
    new OrderCreatedNotification(order.Id),
    cancellationToken);
```

Notifications reduce direct coupling when several independent in-process reactions follow an event. However, the publisher and handlers still share one process and application lifetime. Handler failures, ordering, and execution strategy depend on configuration and the selected publisher implementation.

Do not assume that a MediatR notification is:

- persisted,
- delivered after a crash,
- delivered exactly once,
- processed in a different process,
- automatically retried,
- safely committed with a database transaction,
- executed in a particular handler order.

If another service must reliably observe an event, use durable messaging and usually an outbox or equivalent consistency strategy. An in-process notification may help prepare or dispatch that work, but it is not a message broker.

Avoid using notifications for steps that must all succeed for the primary operation to be valid. Required workflow steps are usually clearer as explicit handler dependencies or an application service operation.

## Pipeline behaviors

A pipeline behavior wraps request handling. Each behavior can inspect the request, perform work before the next delegate, await it, then perform work after it:

```text
Logging → Validation → Transaction → Handler
   ↑                                  ↓
   └──────── response/exception ──────┘
```

A timing behavior can be implemented as:

```csharp
public sealed class TimingBehavior<TRequest, TResponse>(
    ILogger<TimingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        long started = Stopwatch.GetTimestamp();

        try
        {
            return await next(cancellationToken);
        }
        finally
        {
            TimeSpan elapsed = Stopwatch.GetElapsedTime(started);
            logger.LogInformation(
                "Handled {RequestType} in {ElapsedMs} ms",
                typeof(TRequest).Name,
                elapsed.TotalMilliseconds);
        }
    }
}
```

Behaviors are nested in registration order, so ordering affects behavior. For example, placing logging outside validation records rejected requests; placing it inside validation does not. A transaction behavior should normally surround only work that belongs in the transaction and should not wrap long-running external calls without deliberate design.

A behavior may short-circuit by returning without calling `next`, but this should represent an intentional request contract, such as a cache hit. Accidental short-circuiting prevents the handler and inner behaviors from running.

## Registering MediatR

Install the package in the application composition project:

```bash
dotnet add package MediatR
```

Register MediatR and scan the assembly containing handlers:

```csharp
builder.Services.AddMediatR(configuration =>
{
    configuration.RegisterServicesFromAssemblyContaining<CreateOrderHandler>();
    configuration.AddOpenBehavior(typeof(TimingBehavior<,>));
});
```

Assembly scanning only discovers handlers in the assemblies supplied to registration. If a handler cannot be resolved, verify that:

1. its assembly is included,
2. it implements the correct closed handler interface,
3. all constructor dependencies are registered,
4. the application is running the expected build/version.

Keep registration in the composition root rather than inside the application layer. The application can define requests and handlers, while the executable decides which assemblies and behaviors are active.

Registration and licensing details can change between MediatR versions. Confirm the documentation and license requirements for the package version selected by the application rather than copying setup from an older article.

## Validation, logging, and transactions

Pipeline behaviors are useful when a concern applies consistently across a meaningful category of requests.

### Validation

A validation behavior can run validators and return or throw the application's chosen validation outcome before reaching the handler. Keep distinct layers clear:

- transport validation checks whether an HTTP request has a valid external shape,
- application validation checks whether an operation can be attempted,
- domain objects enforce invariants that must always hold.

MediatR does not supply validation rules. If validation failures are expected outcomes, ensure the behavior and endpoint mapping preserve them as explicit results rather than turning every rejection into an unexpected server error.

### Logging and tracing

Log request type, duration, outcome category, and trace/correlation identifiers. Do not serialize entire request objects by default; commands can contain credentials, personal data, tokens, or large payloads.

Use tracing spans or structured scopes when a request must be followed from endpoint through behaviors and handler dependencies. Avoid logging the same exception in every layer; record it once at the boundary that owns failure handling.

### Transactions

A transaction behavior can wrap state-changing commands when they share one transaction model. Apply it selectively, commonly through an `ICommand<T>` marker, rather than opening a write transaction for every query.

The transaction boundary must match the operation's consistency needs. A database transaction cannot make an external HTTP request or message publication atomic. Use an outbox or another explicit consistency mechanism when database state and durable messages must move together.

Retries require equal care. Retrying an entire command can duplicate non-idempotent external effects even when the database provider safely retries its own transaction.

## Testing handlers and pipelines

Test a handler directly when verifying its application behavior:

```csharp
var handler = new GetOrderHandler(orderQueries);

OrderSummary? result = await handler.Handle(
    new GetOrderQuery(orderId),
    CancellationToken.None);

Assert.Equal(orderId, result?.Id);
```

Direct handler tests are fast and make dependencies explicit. They do not prove that DI registration, assembly scanning, behaviors, or behavior order works.

Add focused integration tests through `ISender` for infrastructure that matters:

```csharp
GetOrderQuery query = new(orderId);
OrderSummary? result = await sender.Send(query, cancellationToken);
```

Useful integration assertions include:

- the expected handler is registered,
- validation stops invalid requests,
- command transactions commit and roll back correctly,
- cancellation reaches dependencies,
- behaviors execute in the intended order,
- expected application results reach the HTTP mapping correctly.

When tracing an unfamiliar request, search for the concrete request type, then its `IRequestHandler<...>` implementation, registered behaviors, and finally the handler's constructor dependencies. Do not stop at the endpoint's `Send` call.

## Relationship to CQRS

MediatR and CQRS are independent concepts:

- MediatR is an in-process dispatch library.
- CQRS separates write operations from read operations at the application-model level.

An application can use MediatR without CQRS by dispatching general requests. It can use CQRS without MediatR by injecting command/query handlers directly. It can combine them by representing commands and queries as MediatR requests.

Using different request types for reads and writes is a lightweight form of separation. It does not require separate databases, microservices, event sourcing, or asynchronous messaging. Those are additional architectural choices with separate costs.

## When direct dependencies are clearer

MediatR is often useful when:

- the application has many independently meaningful use cases,
- commands and queries form useful application contracts,
- multiple entry points invoke the same operations,
- consistent pipeline behavior removes real duplication,
- feature-oriented organization makes handlers easy to find.

A direct application service is often clearer when:

- the application has only a few simple operations,
- no meaningful cross-cutting request pipeline exists,
- the sender and handler would always change together,
- developers struggle to trace behavior through generic dispatch,
- requests merely wrap one existing method without improving its contract.

Avoid nested mediator chains where one handler repeatedly sends other internal requests to reuse small pieces of logic. That hides control flow and makes transaction, failure, and performance behavior difficult to see. Extract and inject the shared service or domain operation directly instead.

The goal is understandable application boundaries, not the maximum number of requests and handlers. Use MediatR where typed dispatch and a shared pipeline clarify the system; use ordinary method calls everywhere else.

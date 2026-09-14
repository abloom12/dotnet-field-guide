---
title: Data and Services
description: Inject services, load data safely, call APIs, represent UI states, and keep business logic outside components.
sidebar:
  order: 7
---

Components should coordinate user interface state and delegate application, data-access, and integration behavior to services with lifetimes appropriate to the render mode.

## Quick reference

### Inject and load

```razor
@page "/orders"
@inject IOrderReader OrderReader
@inject ILogger<OrdersPage> Logger
@implements IDisposable

@if (isLoading)
{
    <p>Loading…</p>
}
else if (error is not null)
{
    <p role="alert">@error</p>
    <button @onclick="LoadAsync">Retry</button>
}
else if (orders.Count == 0)
{
    <p>No orders found.</p>
}
else
{
    <OrderList Orders="orders" />
}

@code {
    private readonly CancellationTokenSource disposal = new();
    private IReadOnlyList<OrderSummary> orders = [];
    private bool isLoading = true;
    private string? error;

    protected override Task OnInitializedAsync() => LoadAsync();

    private async Task LoadAsync()
    {
        isLoading = true;
        error = null;

        try
        {
            orders = await OrderReader.ListAsync(disposal.Token);
        }
        catch (OperationCanceledException) when (disposal.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            error = "Orders could not be loaded.";
            Logger.LogError(exception, "Loading orders failed");
        }
        finally
        {
            isLoading = false;
        }
    }

    public void Dispose()
    {
        disposal.Cancel();
        disposal.Dispose();
    }
}
```

### Data access by render mode

| Context | Preferred access |
| --- | --- |
| Static SSR | Server service/repository during request |
| Interactive Server | Server application service with circuit-safe/scoped lifetime |
| Interactive WebAssembly | Authorized HTTP API; no direct database/server secret access |
| Interactive Auto | Abstraction/implementation that works in both server and client modes |

### UI state model

```text
Loading → Empty | Success | Expected error | Unexpected error
             ↘ user action may return to Loading
```

Represent states explicitly; do not treat an empty list, not-yet-loaded value, and failure as the same `null`.

### Service rules

- Inject abstractions through `@inject` or constructor/property injection patterns supported by components.
- Do not keep database contexts or non-thread-safe work units in long-lived component state.
- Pass cancellation tokens and ignore stale responses after parameter changes.
- Avoid loading the same data in both initialization and after-render methods.
- Cache only with ownership, freshness, user isolation, and invalidation rules.
- Keep authorization and business invariants on the server.

## Injecting services

Razor directive injection creates a component property:

```razor
@inject IOrderService OrderService
@inject NavigationManager Navigation
```

A code-behind/base component can use `[Inject]`:

```csharp
[Inject]
private IOrderService OrderService { get; set; } = default!;
```

The property is assigned by the renderer after construction and before lifecycle methods. Prefer required service registrations so missing dependencies fail clearly.

Components can also use primary-constructor injection only where framework/tooling version supports the generated component pattern correctly; directive/property injection remains widely recognizable.

Inject application-level services rather than `IServiceProvider`. Explicit contracts reveal dependencies and enable testing. Do not manually dispose injected services; the DI scope/container owns them.

## Lifetimes by hosting model

The same registration name can imply different boundaries:

| Lifetime | Interactive Server | WebAssembly |
| --- | --- | --- |
| Singleton | Shared server process, across users/circuits | One browser app |
| Scoped | One circuit | Effectively one browser app |
| Transient | Per resolution | Per resolution |

Static SSR scoped services are request-scoped. Mixed rendering means developers must reason about the actual resolution environment.

Never put user-specific mutable state in a server singleton. Interactive Server scoped services can live much longer than an HTTP request; a long-lived database context may accumulate tracking state, become stale, and face concurrent operation problems.

For EF Core-style work from server-interactive components, a factory (`IDbContextFactory<TContext>`) and one context per operation is often safer than retaining a context for the circuit. Follow the data technology’s guidance.

A WebAssembly client cannot resolve server registrations. Register client-capable implementations in the client project.

## Loading data during lifecycle

Choose lifecycle based on inputs:

```csharp
protected override Task OnInitializedAsync() =>
    LoadUserIndependentOptionsAsync();
```

Use `OnInitializedAsync` for per-instance data independent of changing parameters. Use `OnParametersSetAsync` for route/parent-keyed data:

```csharp
protected override async Task OnParametersSetAsync()
{
    if (loadedId == Id)
        return;

    loadedId = Id;
    order = await orders.GetAsync(Id, disposal.Token);
}
```

Because requests can overlap after rapid parameter changes, cancel the old request or track a request/version key and ignore stale completion:

```csharp
Guid requestedId = Id;
Order? loaded = await service.GetAsync(requestedId, token);
if (requestedId == Id)
    order = loaded;
```

Do not use `OnAfterRenderAsync` for ordinary data loading; it complicates render loops and does not run during prerender. Reserve it for work requiring rendered DOM/browser access.

## Calling HTTP APIs

Inject `HttpClient` or a typed API client:

```csharp
public sealed class OrdersClient(HttpClient http)
{
    public Task<OrderSummary[]?> ListAsync(CancellationToken cancellationToken) =>
        http.GetFromJsonAsync<OrderSummary[]>("api/orders", cancellationToken);
}
```

In WebAssembly, `HttpClient` uses browser networking and is subject to origin, CORS, cookies/credentials, and browser restrictions. Relative URLs resolve from the configured base address.

On the server, use `IHttpClientFactory`/typed clients for managed handlers, configuration, resilience, and logging:

```csharp
builder.Services.AddHttpClient<IOrdersClient, OrdersClient>(client =>
{
    client.BaseAddress = new Uri(configuration["OrdersApi:BaseUrl"]!);
});
```

Do not create/dispose a new `HttpClient` per server request. Do not blindly call `EnsureSuccessStatusCode` if the UI needs to distinguish validation, not-found, unauthorized, conflict, and transient errors; translate HTTP outcomes into an application contract.

Client UI must not hold API secrets. Use user authentication or a server-side backend-for-frontend where appropriate.

## Using server-side services directly

Static SSR and Interactive Server components can call injected application services directly:

```csharp
orders = await orderQueries.ListAsync(filter, cancellationToken);
```

This avoids an unnecessary HTTP hop inside the server when component and service share the process. Still maintain layers:

```text
Component → application/query service → repository/integration
```

Do not put SQL, ORM query construction, transaction policy, or core business rules directly in the component.

Direct access couples the component to server execution. A component intended for WebAssembly/Auto needs a client-safe abstraction, often implemented by an HTTP client in the browser and a direct service on the server.

Authorize application operations, not just pages/buttons. Components can be invoked under different UI paths and client requests are untrusted.

## Loading, empty, success, and error states

Model state explicitly:

```csharp
private bool isLoading;
private IReadOnlyList<OrderSummary> orders = [];
private string? error;
```

Render in a deterministic order:

```razor
@if (isLoading) { ... }
else if (error is not null) { ... }
else if (orders.Count == 0) { ... }
else { ... }
```

Differentiate:

- first load versus background refresh,
- expected empty/not-found versus infrastructure failure,
- validation/authentication/conflict versus retryable failure,
- stale displayed data versus no data.

Log diagnostic detail server-side while showing a safe, actionable message. Avoid exposing stack traces, internal URLs, SQL, or secrets in browser UI.

Error boundaries can contain unhandled rendering/lifecycle errors for a subtree, but expected data outcomes should be modeled rather than thrown into a generic boundary.

## Cancelling work on removal

Create a component-owned `CancellationTokenSource` and cancel it during disposal:

```csharp
private readonly CancellationTokenSource disposal = new();

public void Dispose()
{
    disposal.Cancel();
    disposal.Dispose();
}
```

Pass `disposal.Token` through every cancellable call. Catch cancellation only when it belongs to that disposal request.

Cancellation is cooperative and disposal timing can race with completion. After awaits, avoid updating state/interop when disposed. A boolean disposed flag or request version can guard stale continuations where needed.

For parameter changes, a separate replaceable CTS can cancel just the previous load while the disposal CTS covers total component lifetime. Dispose both correctly.

Cancellation of an HTTP request or UI wait does not guarantee a server transaction rolled back. Server operations need their own consistency boundaries.

## Avoiding duplicate loading during prerender

Prerender and interactive startup can run initialization in separate component instances. A naive load occurs twice.

Use one of:

- `PersistentComponentState` to transfer safe prerendered data to interactive startup,
- a suitable server cache for reusable reads,
- idempotent inexpensive loading,
- no prerender when the initial HTML has little value and trade-offs are acceptable.

Conceptually:

```csharp
if (!persistentState.TryTakeFromJson("orders", out orders))
{
    orders = await service.ListAsync(token);
    // register persistence for prerender completion
}
```

Use stable collision-free keys that account for user and parameters. Never serialize secrets or server-only objects into client-visible persistent component state.

Side effects do not belong in duplicate-prone initialization. Commands should follow explicit user/server operation flows.

## Caching considerations

Choose cache location by execution and sharing:

| Cache | Scope | Main concern |
| --- | --- | --- |
| Component field | One component instance | Lost on recreation; duplicate instances |
| Scoped state service | Circuit/browser app/request | User isolation and lifetime differences |
| Server memory cache | One server process | scale-out consistency and user-specific keys |
| Distributed cache | Multiple servers | serialization, latency, expiration, invalidation |
| Browser storage | One browser/profile | untrusted data, privacy, quota, prerender limits |
| HTTP cache | Protocol intermediaries/browser | cache headers, authorization, variation |

Every cache needs key, owner, freshness, expiration, invalidation, size, and failure behavior. Do not cache user-specific results under global keys. Do not use a cache to avoid fixing an accidentally repeated lifecycle call.

## Keeping business logic out of components

A component should primarily:

- receive UI inputs/parameters,
- call an application operation,
- map results to display state,
- handle UI events/navigation,
- render accessible markup.

Move out:

- business invariants and authorization decisions,
- transaction/data-access logic,
- integration protocols and retries,
- reusable transformations/policies,
- durable workflow state.

Example boundary:

```csharp
public interface ISubmitOrder
{
    Task<SubmitOrderResult> ExecuteAsync(
        SubmitOrderCommand command,
        CancellationToken cancellationToken);
}
```

The component gathers input and displays the result; the service owns application behavior. This keeps operations usable from another UI/API and makes component tests focused.

---
title: Rendering and Lifecycle
description: Understand component initialization, parameter changes, rendering, after-render work, and cleanup.
sidebar:
  order: 4
---

A Blazor component renders from parameters and state. Lifecycle methods exist for initialization, parameter-derived state, post-render browser work, and cleanup—not as interchangeable places to load everything.

## Quick reference

### Practical lifecycle order

```text
Component instance created
  → parameters assigned (SetParametersAsync)
  → OnInitialized / OnInitializedAsync (once per instance)
  → OnParametersSet / OnParametersSetAsync
  → render
  → DOM/UI updated
  → OnAfterRender / OnAfterRenderAsync (interactive rendering only)

Later parameter set
  → OnParametersSet / OnParametersSetAsync
  → render
  → OnAfterRender / OnAfterRenderAsync
```

During prerender and interactive startup, separate component instances may each initialize.

### Put work in the right method

| Need | Place |
| --- | --- |
| Initialize state independent of parameters | `OnInitialized{Async}` |
| Recompute/reload because parameters changed | `OnParametersSet{Async}` |
| Use an `ElementReference` or JS/browser API | `OnAfterRenderAsync` |
| Handle a UI event | Event callback method |
| Release subscriptions/timers/CTS/interop refs | `Dispose` / `DisposeAsync` |
| Load request-independent app data | Usually an injected service/cache, called from appropriate lifecycle |

### Safe component skeleton

```razor
@implements IAsyncDisposable

@if (error is not null)
{
    <p role="alert">@error</p>
}
else if (item is null)
{
    <p>Loading…</p>
}
else
{
    <ItemView Item="item" />
}

@code {
    [Parameter]
    public Guid Id { get; set; }

    private readonly CancellationTokenSource disposal = new();
    private Item? item;
    private string? error;

    protected override async Task OnParametersSetAsync()
    {
        try
        {
            item = await service.LoadAsync(Id, disposal.Token);
        }
        catch (OperationCanceledException) when (disposal.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            error = "Could not load the item.";
            logger.LogError(exception, "Loading item {ItemId} failed", Id);
        }
    }

    public ValueTask DisposeAsync()
    {
        disposal.Cancel();
        disposal.Dispose();
        return ValueTask.CompletedTask;
    }
}
```

### Rendering rules

- Blazor rerenders after normal lifecycle/event callbacks.
- `StateHasChanged` requests a render; it does not synchronously repaint the browser.
- `OnAfterRenderAsync` does not automatically rerender after its task completes.
- Never call `StateHasChanged` from disposal.
- Keep component state valid before returning an incomplete lifecycle task.

## What causes a component to render

Rendering is normally queued when:

- the component is first displayed,
- a parent supplies parameters,
- a lifecycle method completes,
- a Blazor-dispatched event callback runs/completes,
- the component calls `StateHasChanged`,
- framework-managed cascading state notifies subscribers.

Blazor builds a render tree and diffs it against the prior render tree. A render request can be coalesced with another pending request. Rendering is asynchronous relative to browser painting.

Changing a field by itself does not notify Blazor:

```csharp
status = "Complete";
```

It appears automatically only when the mutation occurs inside a lifecycle/event flow Blazor already tracks. External callbacks, timers, and notifications may need `InvokeAsync(StateHasChanged)`.

## Lifecycle in practical terms

`ComponentBase` exposes lifecycle pairs:

```csharp
OnInitialized()
OnInitializedAsync()
OnParametersSet()
OnParametersSetAsync()
OnAfterRender(bool firstRender)
OnAfterRenderAsync(bool firstRender)
```

Synchronous methods run before their async counterpart. Base implementations are normally called when overriding custom base-component behavior requires it; `ComponentBase` defaults do little, but custom base classes may depend on them.

Do not rely on parent/child async initialization ordering beyond documented guarantees. Parent synchronous initialization completes before child initialization, but asynchronous completion order can vary.

Lifecycle methods can be called when a component will soon be removed. Async continuations must tolerate disposal and stale results.

## `OnInitialized` and `OnInitializedAsync`

Initialization runs once per component **instance** after initial parameters are assigned:

```csharp
protected override void OnInitialized()
{
    formatter = new CurrencyFormatter(CultureInfo.CurrentCulture);
}
```

Use it for state that does not need to be recomputed when parameters later change. Async loading:

```csharp
protected override async Task OnInitializedAsync()
{
    options = await optionService.LoadAsync();
}
```

If the returned task is incomplete, the component may render before it finishes. Set fields to a valid loading state before the first await.

Do not use initialization for data keyed by a route/parent parameter that can change while the same instance remains alive; use `OnParametersSetAsync`.

“Once per instance” is not once per navigation/application. Prerendering and interactive startup can create two instances, and navigation can recreate components.

## `OnParametersSet` and `OnParametersSetAsync`

These methods run after parameters are assigned initially and whenever the parent supplies parameters again:

```csharp
protected override async Task OnParametersSetAsync()
{
    if (loadedId == Id)
        return;

    loadedId = Id;
    item = await service.LoadAsync(Id);
}
```

The framework may treat complex-typed parameters as changed because it cannot know whether internal state mutated. Do not assume this lifecycle runs only when reference identity differs.

Guard expensive reloads with stable keys/version values, but ensure the guard covers all inputs that affect the result. Cancel or ignore an earlier request when a newer parameter set supersedes it.

Avoid writing directly back to parameters. Derive private state and notify the parent through callbacks when values change.

## `OnAfterRender` and `OnAfterRenderAsync`

After-render methods run after interactive rendering updates the UI. They do not run during static server prerendering because there is no attached interactive browser DOM.

Use them for operations requiring rendered elements or browser JS:

```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
    {
        await searchInput.FocusAsync();
    }
}
```

`firstRender` is true for the first interactive render of that component instance. Guard initialization to avoid repeated JS calls and render loops.

Blazor does **not** automatically schedule another render when `OnAfterRenderAsync`’s returned task completes, preventing an infinite loop. If async after-render work changes visible state, request a render explicitly—while ensuring it terminates:

```csharp
await InitializeWidgetAsync();
isReady = true;
StateHasChanged();
```

Interop can still fail if the component disconnects/disposes while awaiting.

## Synchronous versus asynchronous lifecycle work

Use synchronous lifecycle methods for quick in-memory work. Use async methods for actual asynchronous I/O. Never block with `.Result` or `.Wait()`; Interactive Server can deadlock or stall a circuit, and any mode can lose responsiveness.

An async lifecycle method must return a valid renderable state before an incomplete await:

```csharp
protected override async Task OnParametersSetAsync()
{
    isLoading = true;
    error = null;

    try
    {
        item = await service.LoadAsync(Id);
    }
    finally
    {
        isLoading = false;
    }
}
```

The framework rerenders at task completion. For multi-stage progress, call `StateHasChanged` between stages if visible intermediate state is useful.

Handle exceptions or let an error boundary/framework boundary process them. `async void` lifecycle methods are not valid overrides.

## Requesting renders with `StateHasChanged`

Most component code should not call `StateHasChanged`; event and lifecycle paths already trigger rendering.

Use it when state changes outside Blazor’s tracked callbacks:

```csharp
private void OnStoreChanged()
{
    _ = InvokeAsync(StateHasChanged);
}
```

`InvokeAsync` dispatches onto the component’s renderer context, important for timers/background notifications in Interactive Server.

If an external event requires async work, avoid discarded tasks with invisible exceptions. Route it through a method that catches/reports errors and checks disposal.

Calling `StateHasChanged` repeatedly does not guarantee immediate separate browser updates; requests may be coalesced.

## Controlling rendering with `ShouldRender`

Override to skip a rerender:

```csharp
protected override bool ShouldRender() => currentVersion != renderedVersion;
```

The initial render still occurs. Use this only after identifying expensive unnecessary renders. Incorrectly returning false leaves stale UI and does not stop lifecycle/event code from running.

Normal rendering diffing is efficient. Prefer stable component boundaries, `@key` where identity matters, and avoiding unnecessary state changes before introducing custom render suppression.

If used, update comparison state carefully so a required future render is not permanently skipped.

## Prerendering and repeated lifecycle work

Interactive components are commonly prerendered on the server, then initialized interactively. `OnInitializedAsync` can therefore execute once for prerender and again for the interactive instance.

Problems include duplicate API/database calls, visible content flicker, and non-idempotent side effects. Options:

- use `PersistentComponentState` to serialize prerendered data for interactive reuse,
- cache safe results in an appropriate service,
- make reads/initialization idempotent,
- perform side effects at a server operation boundary rather than component initialization,
- disable prerender only when its benefits are not needed.

Browser-only APIs and JS interop must wait for interactive `OnAfterRenderAsync`. An injected service needed by a WebAssembly component may also need a server implementation during prerender.

Never place “create order,” “send email,” or similar irreversible commands in a lifecycle method that can repeat.

## Cleaning up with `IDisposable`

Components should unsubscribe and release synchronous resources:

```razor
@implements IDisposable

@code {
    protected override void OnInitialized()
    {
        store.Changed += OnStoreChanged;
    }

    public void Dispose()
    {
        store.Changed -= OnStoreChanged;
        timer?.Dispose();
    }
}
```

The framework calls disposal when the component is removed, but timing relative to outstanding async work is not guaranteed. Disposal may occur before or after an awaited lifecycle continuation.

Do not call `StateHasChanged` from `Dispose`; teardown rendering is not supported.

## Cleaning up with `IAsyncDisposable`

Use async disposal for module/object references or resources requiring asynchronous teardown:

```razor
@implements IAsyncDisposable

@code {
    private IJSObjectReference? module;

    public async ValueTask DisposeAsync()
    {
        if (module is not null)
        {
            try
            {
                await module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
                // Expected if an Interactive Server circuit is already gone.
            }
        }
    }
}
```

If implementing both interfaces, understand which one the framework invokes and centralize ownership to avoid double disposal. Keep disposal fast and resilient.

Cancel component-owned operations with a `CancellationTokenSource`, dispose timers/registrations, remove event subscriptions, and release JS/.NET interop references. Long-lived publishers retaining component handlers are a common memory leak.

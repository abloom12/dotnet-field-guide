---
title: Gotchas
description: Common Blazor rendering, lifecycle, state, service, form, circuit, and interop surprises.
sidebar:
  order: 9
---

Most Blazor surprises come from assuming a component is interactive, has only one instance, owns durable state, or always runs in one location.

## Quick reference

| Symptom | Likely cause | First fix/check |
| --- | --- | --- |
| Button renders but does nothing | Static SSR/no interactive boundary | Inspect `@rendermode` and mode registration/mapping |
| Data loads twice | Prerender + interactive instance | Persistent component state, idempotent load, or deliberate prerender choice |
| API called repeatedly | Wrong lifecycle or unguarded parameter/after-render work | Move/guard by stable parameter and avoid render loops |
| UI stays stale | State changed from external callback | `await InvokeAsync(StateHasChanged)` |
| Input/focus shifts in a list | Missing identity | Add stable `@key` |
| User data leaks | User state stored in server singleton | Use circuit-scoped/server-persisted user-keyed state |
| Boundary parameter error | Delegate/fragment/nonserializable value | Move boundary or pass serializable DTO |
| Disposed component updates | Outstanding async work | Cancel, version, and guard continuation |
| JS call fails on first load | Called during prerender/before DOM | Call from interactive `OnAfterRenderAsync` |
| Memory/listeners remain | Interop/event references not released | Dispose/unsubscribe both sides |
| State disappears | Refresh, restart, circuit expiration | Persist only required state outside component/circuit |
| Script behaves differently on navigation | Enhanced navigation skipped full load | Use supported enhanced-load/component JS lifecycle |

### Baseline diagnostic questions

1. What render mode owns this component subtree?
2. Is this prerender, interactive startup, or a later render?
3. Does code run on server or browser?
4. Is this the same component instance/circuit?
5. Which DI lifetime owns the service?
6. What triggered this render/lifecycle call?
7. Who cancels/disposes outstanding work and references?

## Rendered does not mean interactive

Static SSR produces component HTML but no persistent event handling. This markup looks correct but cannot increment by itself:

```razor
<button @onclick="Increment">Increment</button>
```

The component must be under an enabled interactive render mode:

```razor
@rendermode InteractiveServer
```

Also verify services and endpoints are registered/mapped in `Program.cs`, and Blazor’s framework script loads successfully.

Do not make the entire app interactive automatically to fix one button. Choose a coherent boundary with the state and child content it needs.

## Initialization can run more than once

A prerendered interactive component commonly has a server prerender instance and a later interactive instance. `OnInitializedAsync` runs once for each instance.

Also, navigation/removal can create new instances. “Once” means once per component instance, not once per user/app.

Avoid irreversible side effects in initialization. For duplicate data reads:

- persist prerender state into interactive startup,
- cache safe data,
- make reads idempotent,
- disable prerender only after evaluating the UX trade-off.

Log component instance/render context when diagnosing apparent duplicates.

## Lifecycle methods can trigger unexpected work

`OnParametersSet{Async}` can run whenever a parent rerenders and supplies parameters, especially complex values the framework cannot prove unchanged. `OnAfterRender{Async}` runs after each interactive render.

An unguarded after-render update creates a loop:

```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    data = await LoadAsync();
    StateHasChanged(); // repeats forever without a terminating guard
}
```

Load ordinary data in initialization/parameter lifecycle. Use after-render only for DOM/browser-dependent work and guard `firstRender` or explicit state transitions.

For expensive parameter work, compare stable IDs/versions and cancel superseded calls.

## The UI may not update after external state changes

Blazor rerenders automatically after its lifecycle and event callbacks. It does not know when arbitrary timers, service events, or background callbacks mutate state.

```csharp
private void OnChanged()
{
    _ = InvokeAsync(StateHasChanged);
}
```

For async/error-prone external handling, do not discard a task silently; route through a supervised method. Unsubscribe during disposal.

`StateHasChanged` only requests rendering. It does not make non-thread-safe state mutation safe, persist state, or immediately repaint the browser.

## List rendering needs stable identity

Without `@key`, Blazor may preserve/reuse child component or element positions when a list is inserted/reordered. Focus and child-local state can appear attached to the wrong item.

```razor
@foreach (var order in orders)
{
    <OrderRow @key="order.Id" Order="order" />
}
```

Use a stable unique identity, not the loop index when ordering can change. Keying can cause Blazor to discard/recreate subtrees when the key changes; that is correct but has a cost.

Do not add keys everywhere without need. Use them where preserving identity across collection changes matters.

## Scoped services differ by hosting model

“Scoped” is not universally per HTTP request:

- static SSR: request scope,
- Interactive Server: circuit scope,
- Interactive WebAssembly: effectively browser app lifetime.

An Interactive Server scoped service can persist across many UI events and navigations. Retaining a database context for that entire lifetime can create stale tracking/concurrency problems; use operation-scoped factories where appropriate.

A server singleton is shared across users and circuits. Never place mutable user state there. Client singleton/scoped state remains in one browser app but is untrusted by the server.

## Parameters can cross serialization boundaries

A static parent starting an interactive child must serialize parameters. These cannot cross normally:

- `RenderFragment`/templated child content,
- delegates and callbacks from the static parent,
- service instances,
- open resources,
- arbitrary nonserializable graphs.

Pass small DTO/value parameters or move the parent and child into the same interactive boundary. Remember that serialized browser data is visible and modifiable; never include secrets or trust it for authorization.

Inside an existing interactive subtree, descendants inherit the mode and ordinary callbacks/fragments can flow without creating a new boundary.

## Async work can outlive a component

Navigation, conditional rendering, parameter changes, or circuit loss can remove a component while its task continues. A late continuation can overwrite newer state or call disposed JS resources.

Use:

- a component-lifetime `CancellationTokenSource`,
- a replaceable CTS for superseded parameter loads,
- request/version checks before applying results,
- disposal guards for interop/UI updates,
- server operations that remain consistent even if client cancellation occurs.

Cancellation is cooperative. Still design late completion safely.

Do not call `StateHasChanged` during disposal.

## JavaScript interop can run too early

JS/DOM access is unavailable during static prerender and element references are not populated before rendering.

Correct pattern:

```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
    {
        module = await JS.InvokeAsync<IJSObjectReference>("import", moduleUrl);
    }
}
```

After-render does not automatically rerender when its async work completes. Call `StateHasChanged` only if visible state changed and the call will not loop.

A module path that works in development may fail under a production base path; use static web asset conventions and test published hosting.

## Interop references can leak

`IJSObjectReference` retains a JavaScript object proxy. `DotNetObjectReference<T>` keeps a .NET object callable/reachable from JS. Third-party libraries may also install DOM listeners, observers, and timers.

Cleanup requires both sides:

1. tell the JS library to destroy/unsubscribe,
2. dispose JS object/module proxies,
3. dispose `DotNetObjectReference`,
4. tolerate `JSDisconnectedException` during server-circuit teardown.

Disposing only the .NET proxy may not remove browser resources. Conversely, JS invoking a disposed .NET reference causes errors.

Long-lived .NET event publishers can leak components too; unsubscribe in disposal.

## Interactive Server circuits disconnect and lose state

Interactive Server depends on a SignalR circuit. Temporary disconnects can reconnect within configured limits, but state is lost when the circuit expires, server restarts, deployment replaces the instance, or load balancing/session behavior cannot resume it.

Component/circuit memory is not durable storage. Persist important drafts/workflows to browser or server storage according to sensitivity and ownership. Keep authoritative business state on the server.

Design UX for reconnecting/disconnected states and idempotent retries. A repeated user action after uncertainty must not accidentally create duplicate payments/orders/etc.

Scale planning must account for per-circuit memory, connection count, backpressure, and deployment behavior—not only HTTP request throughput.

## Enhanced navigation changes browser behavior

Enhanced navigation can intercept same-origin links/forms, fetch server-rendered HTML, and patch content without a full document reload. Therefore:

- scripts listening only for initial page load may not initialize again,
- global DOM mutations may be replaced,
- scroll/focus/history differ from full reloads,
- direct load and internal navigation can take different paths,
- disposal/initialization of third-party widgets needs explicit lifecycle integration.

Use Blazor’s enhanced-navigation events or collocated component JS lifecycle where supported. Disable enhancement for a link/form/subtree when a full load is genuinely required.

Test:

1. direct URL entry,
2. internal link navigation,
3. browser back/forward,
4. form success/validation responses,
5. not-found/error responses,
6. scripts/widgets after repeated navigation.

## Parameters are not private state

A child that modifies its `[Parameter]` may be overwritten when the parent rerenders:

```csharp
// Fragile: parameter becomes competing local state.
[Parameter] public bool Expanded { get; set; }
```

For controlled state, invoke `ExpandedChanged` and let the parent own the value. For intentionally local state, copy an initial parameter to a private field and define how future parameter updates behave.

Do not assume complex parameter references changed only when their reference changed; the framework may invoke parameter lifecycle conservatively.

## Form validation is not server security

`EditForm` validation improves UX but a caller can bypass UI, modify WebAssembly state, or send a crafted request. Server operations must independently:

- authenticate and authorize,
- bind only allowed fields,
- validate domain invariants,
- enforce ownership/concurrency,
- protect against duplicate/replayed submissions,
- safely handle files and untrusted text.

Hiding a button with `AuthorizeView` is not authorization. It only controls rendering.

## Blocking breaks responsiveness

Avoid `.Result`, `.Wait()`, long CPU loops, and synchronous I/O in component event/lifecycle code. Interactive Server circuit work can stall; WebAssembly UI execution can freeze the browser.

Use asynchronous APIs for I/O. Move measured CPU-heavy work to an appropriate server/background boundary or use supported client threading capabilities only with deliberate design.

`async` alone does not move work off the current thread. Every task should be awaited or intentionally supervised.

## A stable debugging approach

When a Blazor issue seems nondeterministic, record:

- URL and navigation path (direct versus enhanced),
- render mode and whether prerender is enabled,
- server/browser execution location,
- component instance identity and lifecycle logs,
- circuit ID/reconnect state where safely observable,
- parameter values and request version,
- service registration lifetime,
- outstanding task/cancellation state,
- JS module/reference lifecycle.

This usually turns “Blazor rendered weirdly” into a specific boundary, lifetime, or ordering problem.

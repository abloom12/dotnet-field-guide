---
title: Component Communication and State
description: Pass data and UI between components and place state at an appropriate lifetime and persistence boundary.
sidebar:
  order: 5
---

Keep state as close as possible to the components that own it. Move it upward or into a service only when multiple components truly need the same source of truth.

## Quick reference

### Communication map

| Need | Mechanism |
| --- | --- |
| Parent sends data to child | `[Parameter]` property |
| Child notifies parent | `EventCallback<T>` |
| Parent and child bind a value | `Value` + `ValueChanged`, consumed with `@bind-Value` |
| Parent supplies markup/template | `RenderFragment` / `RenderFragment<T>` |
| Ancestor supplies ambient subtree value | `[CascadingParameter]` |
| Parent calls imperative child API | `@ref` (sparingly) |
| Unrelated components share live state | DI state service/store with notifications |
| State survives reload/reconnect | URL, server store/database, or protected browser storage as appropriate |

### Parent/child pattern

```razor
@* Parent *@
<OrderEditor Order="selectedOrder" Saved="HandleSaved" @bind-IsOpen="isEditorOpen" />

@code {
    private Order selectedOrder = new();
    private bool isEditorOpen;

    private Task HandleSaved(Order order) => RefreshAsync();
}
```

```csharp
// Child component parameters
[Parameter, EditorRequired] public Order Order { get; set; } = default!;
[Parameter] public EventCallback<Order> Saved { get; set; }
[Parameter] public bool IsOpen { get; set; }
[Parameter] public EventCallback<bool> IsOpenChanged { get; set; }
```

### State placement guide

```text
Used by one component?               → private component field
Used by parent + children?           → lift to nearest common parent
Ambient stable subtree concern?      → cascading value
Used by unrelated components?        → scoped/app state service
Must survive URL sharing/navigation? → route/query string
Must survive refresh/restart?        → durable server store or deliberate browser storage
```

### Safety rules

- Parameters are inputs; do not silently overwrite them as private state.
- UI state services need change notifications and unsubscription.
- Never store user-specific state in a server singleton.
- Component/circuit memory is not durable persistence.
- Browser-stored data is client-controlled; validate and authorize on the server.
- State must fit the selected render mode and serialization boundary.

## Parent-to-child data

A child exposes public parameters:

```csharp
[Parameter, EditorRequired]
public Order Order { get; set; } = default!;

[Parameter]
public bool Compact { get; set; }
```

The parent supplies them:

```razor
<OrderRow Order="order" Compact="true" />
```

Treat parameters as values owned by the parent/framework. A parent rerender can set them again. Mutating a parameter in the child creates two competing sources of truth and can be overwritten.

For local edit state, copy deliberately when parameters are set:

```csharp
protected override void OnParametersSet()
{
    if (loadedId != Order.Id)
    {
        loadedId = Order.Id;
        draft = new OrderDraft(Order);
    }
}
```

Define what should happen to unsaved edits when the parameter changes.

## Child-to-parent events

A child declares an `EventCallback`:

```csharp
[Parameter]
public EventCallback<Order> Selected { get; set; }

private Task SelectAsync() => Selected.InvokeAsync(Order);
```

Parent handles it:

```razor
<OrderRow Order="order" Selected="OnSelected" />

@code {
    private void OnSelected(Order order) => selected = order;
}
```

Use typed callbacks when an event has data. Return/await the task from `InvokeAsync` so errors and completion remain part of the event flow.

`EventCallback` is designed for component rendering dispatch. Prefer it over `Action`/`Func` parameters for normal UI events.

## Binding component values

A bindable child follows a naming convention:

```csharp
[Parameter]
public string Value { get; set; } = "";

[Parameter]
public EventCallback<string> ValueChanged { get; set; }

private Task UpdateAsync(string value) => ValueChanged.InvokeAsync(value);
```

The parent writes:

```razor
<TextEditor @bind-Value="name" />
```

which conceptually supplies `Value="name"` and `ValueChanged="..."`.

Do not assign `Value` internally as the long-term source of truth. Request a change through `ValueChanged`; the parent updates its state and rerenders the child.

Use explicit parameter/callback syntax when the operation can fail, needs confirmation, or should not look like immediate two-way assignment.

## Passing UI with `RenderFragment`

Unnamed child content uses `RenderFragment`:

```csharp
[Parameter]
public RenderFragment? ChildContent { get; set; }
```

Named/templates can be typed:

```csharp
[Parameter]
public RenderFragment<Order>? ItemTemplate { get; set; }
```

```razor
<OrderList Orders="orders">
    <ItemTemplate Context="order">
        <strong>@order.Number</strong>
    </ItemTemplate>
</OrderList>
```

Fragments enable reusable layout without making the component know every visual form. They are executable render logic, so they cannot cross a serialization boundary from a static parent into an interactive child. Keep templated parent/child content in the same interactive subtree.

## Cascading values and parameters

An ancestor can supply a value to descendants without threading it through every intermediate component:

```razor
<CascadingValue Value="theme">
    @ChildContent
</CascadingValue>
```

Descendant:

```csharp
[CascadingParameter]
public Theme? Theme { get; set; }
```

Cascading values are appropriate for ambient subtree context such as form edit context, theme, authentication state, or a coordinated container component. They make dependencies less visible, so avoid using them as a universal state shortcut.

Use a name when several values share a type:

```razor
<CascadingValue Name="Accent" Value="accentColor">...</CascadingValue>
```

```csharp
[CascadingParameter(Name = "Accent")]
public string? AccentColor { get; set; }
```

If `IsFixed="true"`, Blazor can avoid subscribing descendants for changes; use it only when the value will not change.

Root-level cascading values can be registered through services in modern Blazor, with optional notifications. Avoid cascading component instances globally; render-mode boundaries and lifetime make that unsafe.

## Component references

A parent captures a rendered child:

```razor
<ConfirmDialog @ref="dialog" />

@code {
    private ConfirmDialog? dialog;

    private async Task DeleteAsync()
    {
        if (dialog is not null && await dialog.ConfirmAsync())
        {
            // delete
        }
    }
}
```

The reference is assigned after render and may become null/stale when conditional rendering replaces the child. Do not use it during initialization.

Use `@ref` for inherently imperative behaviors such as focus, open, measure, or a dialog operation. Prefer parameters/callbacks for ordinary state flow; directly changing child fields bypasses predictable rendering.

## Local component state

Private fields are the simplest state:

```csharp
private bool isExpanded;
private string searchText = "";
private List<Order> results = [];
```

This state normally survives rerenders of the same instance but can disappear when:

- the component is removed/recreated,
- navigation creates a new instance,
- the browser refreshes,
- an Interactive Server circuit is lost beyond retention,
- the server restarts/deploys,
- render mode/startup creates another instance.

Use component fields for ephemeral UI details: open panels, current input, loading flags, and selection that need not be durable.

## Shared state services

A state container can serve unrelated components:

```csharp
public sealed class CartState
{
    private readonly List<CartItem> items = [];
    public IReadOnlyList<CartItem> Items => items;
    public event Action? Changed;

    public void Add(CartItem item)
    {
        items.Add(item);
        Changed?.Invoke();
    }
}
```

Component:

```csharp
protected override void OnInitialized()
{
    cart.Changed += OnCartChanged;
}

private void OnCartChanged() => _ = InvokeAsync(StateHasChanged);

public void Dispose()
{
    cart.Changed -= OnCartChanged;
}
```

Define mutation methods rather than exposing mutable collections. Consider thread safety for server execution. Handle event exceptions and async notification needs deliberately.

A state service is still memory, not durable persistence.

## Choosing a service lifetime

Hosting model changes lifetime meaning:

| Registration | Interactive Server | Interactive WebAssembly |
| --- | --- | --- |
| Singleton | Shared by all circuits/users in the server process | One browser app instance |
| Scoped | One circuit | Effectively browser app lifetime (no normal request scopes) |
| Transient | New per resolution | New per resolution |

For Interactive Server, user-specific state normally belongs in a scoped service, never a singleton. A singleton must be thread-safe and contain only intentionally shared data.

For static SSR, scoped services align with an HTTP request. In mixed apps, one service type may be used under different lifetimes/locations; define the required behavior rather than assuming “scoped” always means request.

WebAssembly state is visible and controlled by the browser. It cannot safely hold server secrets or authoritative authorization state.

## Preserving state across navigation

Options, from most shareable to least:

- **Route parameters:** identity required to locate the page.
- **Query string:** filters, page number, sort, and bookmarkable UI choices.
- **History state:** navigation-specific data not necessarily visible in URL.
- **Scoped state service:** live state while the current app/circuit survives.
- **Browser storage:** state across reloads in that browser.
- **Server persistence/database/cache:** durable or cross-device state.

Use URL state for views users should bookmark/share. Avoid putting secrets or sensitive data in URLs, which appear in logs/history/referrers.

Browser storage is unavailable during prerender and can be modified by users. Protect confidentiality where needed and always validate server operations independently. Storage quotas and serialization/version migration need handling.

## State across refreshes and circuits

A browser refresh recreates component instances. Interactive Server also creates a new circuit unless reconnection resumes the existing one within supported retention. Server restarts lose in-memory circuits.

Persist only what needs to survive:

- draft business data → server-side draft store,
- recoverable form text → deliberate browser/server persistence,
- current entity/filter → URL,
- temporary animation/open state → do not persist.

Restoring state can conflict with newer server data. Include identity/version/user ownership and define merge/expiration rules.

Circuit state consumes server memory and is not a general session database. Scale-out and deployments make process-local assumptions fragile.

## State across rendering modes

Static SSR has request-lifetime component state. Interactive Server has circuit-lifetime state. WebAssembly has browser-app memory. Auto may use different environments on later visits.

Cross-boundary data must be serializable. Server object references, delegates, open resources, and scoped service instances cannot become browser state.

For data needed after prerender, use framework persistent component state or load again safely. Never serialize secrets into prerendered/client state. Treat all browser-returned state as untrusted.

Services used in WebAssembly/Auto components need client-compatible implementations; server-only data access must remain behind an authorized API.

## Avoid unnecessary state complexity

Before introducing a global store, ask:

1. Can this be computed from parameters?
2. Can it live in one component?
3. Can it be lifted to the nearest common parent?
4. Should it be encoded in the URL?
5. Is it actually business data that belongs on the server?
6. What lifetime and render mode must it survive?
7. Who owns mutation, validation, and cleanup?

Duplicated state drifts. Prefer one source of truth and derived values. Add state libraries/patterns only when application complexity justifies their conventions, debugging tools, or consistency.

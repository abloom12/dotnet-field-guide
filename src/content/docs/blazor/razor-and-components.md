---
title: Razor and Components
description: Build Blazor components with Razor syntax, parameters, events, binding, child content, references, and isolated CSS.
sidebar:
  order: 2
---

A `.razor` file defines a component by combining markup with Razor expressions, directives, and C# members.

## Quick reference

### Component anatomy

```razor
@using FieldGuide.Orders
@inject IOrderService OrderService
@implements IDisposable

<article class="order-card">
    <h2>@Title</h2>
    <p>Total: @Order.Total.ToString("C")</p>
    <button @onclick="SubmitAsync" disabled="@isSaving">Submit</button>
    @ChildContent
</article>

@code {
    [Parameter, EditorRequired]
    public Order Order { get; set; } = default!;

    [Parameter]
    public string Title { get; set; } = "Order";

    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public EventCallback<Order> Submitted { get; set; }

    private bool isSaving;

    private async Task SubmitAsync()
    {
        isSaving = true;
        try
        {
            await OrderService.SubmitAsync(Order);
            await Submitted.InvokeAsync(Order);
        }
        finally
        {
            isSaving = false;
        }
    }

    public void Dispose() { }
}
```

### Razor syntax

| Syntax | Meaning |
| --- | --- |
| `@value` | Render a C# expression |
| `@(expression)` | Explicit expression boundary |
| `@if (...) { ... }` | Conditional markup |
| `@foreach (...) { ... }` | Repeated markup |
| `@code { ... }` | Component members and methods |
| `@onclick="Handler"` | DOM event handler |
| `@bind="value"` | Two-way element binding |
| `<Child Value="..." />` | Render another component and pass parameters |
| `@ChildContent` | Render supplied UI fragment |
| `@ref="component"` | Capture component/element reference after rendering |

### Common directives

| Directive | Purpose |
| --- | --- |
| `@page "/route"` | Make component routable |
| `@rendermode ...` | Declare render mode for a component instance/definition |
| `@using Namespace` | Import namespace into generated component source |
| `@inject IService Name` | Inject a service property |
| `@layout MainLayout` | Select a layout |
| `@implements IDisposable` | Add an implemented interface |
| `@inherits BaseType` | Select component base class |
| `@attribute [Authorize]` | Add an attribute to generated component class |
| `@namespace Name` | Set generated component namespace |

### Communication rules

- Parent → child data: `[Parameter]`.
- Child → parent event: `EventCallback`/`EventCallback<T>`.
- Parent supplies markup: `RenderFragment`/`RenderFragment<T>`.
- Use `@bind-Value` when a component offers `Value` + `ValueChanged`.
- Use `@ref` sparingly for imperative operations unavailable through data flow.

## Anatomy of a `.razor` file

A component file is compiled into a .NET class derived from `ComponentBase`. It can contain:

1. directives, commonly at the top,
2. HTML and component markup,
3. control-flow Razor blocks,
4. an `@code` block with fields, properties, lifecycle methods, and event handlers.

A component named `OrderCard.razor` is rendered as:

```razor
<OrderCard Order="currentOrder" />
```

Component names normally begin uppercase so Razor can distinguish them from HTML elements. Namespaces come from project/root namespace and folder conventions unless overridden.

Code-behind is possible with a partial class:

```csharp
public partial class OrderCard
{
    // component members
}
```

Use code-behind when it improves navigation or generated/test concerns, but do not split every small component automatically.

## Razor expressions and code blocks

Implicit expressions:

```razor
<p>@customer.Name</p>
```

Explicit expressions clarify boundaries:

```razor
<p>@(customer.FirstName + " " + customer.LastName)</p>
```

Control flow interleaves C# and markup:

```razor
@if (orders is null)
{
    <p>Loading…</p>
}
else
{
    @foreach (var order in orders)
    {
        <OrderRow @key="order.Id" Order="order" />
    }
}
```

Razor HTML-encodes string output by default. `MarkupString` emits raw markup and can create cross-site scripting vulnerabilities if content is untrusted. Sanitize with an appropriate policy before rendering raw HTML.

Use `@:` or `<text>` for literal markup/text in C#-oriented blocks when needed.

## Directives

Directives affect generated code or framework behavior. Examples:

```razor
@page "/orders/{Id:guid}"
@rendermode InteractiveServer
@using FieldGuide.Contracts
@inject ILogger<OrderPage> Logger
@layout MainLayout
@attribute [Authorize]
```

Some directives are valid only in specific locations or project types. `_Imports.razor` can provide shared directives such as `@using` to components in its directory tree.

Do not put `@page`, `@rendermode`, or component-specific injection into a broad `_Imports.razor` unless every descendant should receive that behavior.

A directive attribute is attached to an element/component rather than the file, such as `@onclick`, `@bind`, `@ref`, `@key`, or `@attributes`.

## Creating and rendering components

Create `StatusBadge.razor`:

```razor
<span class="badge">@Text</span>

@code {
    [Parameter]
    public string Text { get; set; } = "";
}
```

Render it from a parent:

```razor
<StatusBadge Text="@order.Status.ToString()" />
```

A literal attribute is converted to the parameter type when supported. Prefix with `@` for a C# expression:

```razor
<OrderRow Order="@selectedOrder" IsCompact="true" />
```

Attributes that do not match a parameter cause a compile/runtime diagnostic unless the child captures unmatched values:

```csharp
[Parameter(CaptureUnmatchedValues = true)]
public IReadOnlyDictionary<string, object>? AdditionalAttributes { get; set; }
```

```razor
<button @attributes="AdditionalAttributes">Save</button>
```

Attribute order can matter when splatted attributes and explicit values use the same key; follow documented right-to-left precedence and keep collisions intentional.

## Component parameters

Declare public parameter properties:

```csharp
[Parameter]
public int PageSize { get; set; } = 25;

[Parameter, EditorRequired]
public Order Order { get; set; } = default!;
```

`EditorRequired` produces tooling/compiler guidance for component consumers; it is not a runtime validation boundary and does not validate content. The initializer suppresses construction-time nullable analysis because the renderer supplies the parameter later. Handle missing or invalid values appropriately.

Parameters are owned by the parent/framework. Do not overwrite a parameter to maintain child state after first render; later parent renders can replace it. Copy an initial value into a private field when local editing state is required, and define how subsequent parameter changes should behave in `OnParametersSet`.

Parameter types should remain stable public contracts. Across render-mode boundaries, values must be serializable and cannot include arbitrary executable UI/delegate state.

## DOM event handlers and `EventCallback`

Handle an element event:

```razor
<button @onclick="SaveAsync">Save</button>

@code {
    private async Task SaveAsync(MouseEventArgs args)
    {
        await service.SaveAsync();
    }
}
```

Blazor automatically rerenders after its dispatched event callback completes. Event handler signatures can omit event args, accept the matching event-args type, and return `void` or `Task`. Prefer `Task`; `async void` exceptions are not tracked normally.

A child exposes component events using `EventCallback<T>`:

```csharp
[Parameter]
public EventCallback<Order> Selected { get; set; }

private Task SelectAsync() => Selected.InvokeAsync(Order);
```

Parent:

```razor
<OrderRow Order="order" Selected="HandleSelected" />
```

`EventCallback` integrates with rendering and synchronization better than exposing `Action` for component UI events. Check `HasDelegate` only when absence changes behavior; invoking an empty callback is safe.

## One-way binding

Markup expressions are one-way: component state determines rendered attributes/content:

```razor
<input value="@searchText" />
<p>@searchText</p>
```

Typing in that raw input does not update `searchText`. Handle the event explicitly:

```razor
<input value="@searchText" @oninput="HandleInput" />
```

or use two-way binding.

For child components, parameter assignment is also one-way data flow:

```razor
<Pager CurrentPage="@page" />
```

The child should notify the parent rather than mutating the parent’s field directly.

## Two-way binding

Element binding combines a value and change handler:

```razor
<input @bind="searchText" />
<input @bind="searchText" @bind:event="oninput" />
```

The default event depends on the element/component. `oninput` updates on each input event; default text binding commonly updates on change.

Component binding convention uses a parameter and matching `Changed` callback:

```csharp
[Parameter]
public int Value { get; set; }

[Parameter]
public EventCallback<int> ValueChanged { get; set; }
```

Parent:

```razor
<Counter @bind-Value="count" />
```

The child invokes `ValueChanged` with the new value. Modern binding modifiers include `@bind:get`/`@bind:set`, `@bind:after`, and formatting/culture options in supported contexts. Use explicit callbacks when validation or async update semantics would be obscured by compact binding.

## Child content and `RenderFragment`

A component accepts unnamed child markup through a parameter conventionally named `ChildContent`:

```csharp
[Parameter]
public RenderFragment? ChildContent { get; set; }
```

```razor
<Card>
    <strong>Important content</strong>
</Card>
```

Render it with `@ChildContent`.

Templated content passes a context value:

```csharp
[Parameter]
public RenderFragment<Order>? RowTemplate { get; set; }
```

```razor
@RowTemplate?.Invoke(order)
```

Consumer:

```razor
<OrderList Orders="orders">
    <RowTemplate Context="item">
        <span>@item.Number</span>
    </RowTemplate>
</OrderList>
```

`RenderFragment` is executable render logic, not serializable data. It cannot be passed as a parameter across a static-to-interactive serialization boundary. Put the fragment inside one interactive subtree or redesign the boundary.

## Component and element references

Capture a child component:

```razor
<Dialog @ref="dialog" />

@code {
    private Dialog? dialog;
}
```

Capture an element:

```razor
<input @ref="searchInput" />

@code {
    private ElementReference searchInput;
}
```

References are populated only after rendering. Access DOM/browser behavior from `OnAfterRenderAsync`, often guarded by `firstRender`.

Prefer parameters and callbacks for normal coordination. `@ref` couples a parent to a child instance and can be null/replaced when conditional markup changes. Do not mutate child state directly and expect correct rendering; expose an intentional method or, better, update source state declaratively.

## CSS isolation

Place component-specific styles beside the component:

```text
OrderCard.razor
OrderCard.razor.css
```

During build, Blazor rewrites selectors and rendered elements with generated scope attributes so rules apply locally. The styles are bundled into generated application CSS that must be loaded by the app.

```css
/* OrderCard.razor.css */
.order-card {
    border: 1px solid var(--border-color);
}
```

Isolation scopes selectors; it does not use browser Shadow DOM. Global styles can still affect elements through cascade/inheritance, and dynamically produced/raw HTML may require special handling. Use `::deep` intentionally when a parent’s isolated stylesheet must reach descendant-rendered elements, and keep selectors maintainable.

Static assets such as images/scripts remain under `wwwroot` or supported asset pipelines; CSS isolation is not an asset privacy boundary.

---
title: JavaScript Interop
description: Call JavaScript and browser APIs from Blazor, expose .NET callbacks, and manage interop lifetimes safely.
sidebar:
  order: 8
---

Use JavaScript interop when behavior depends on browser APIs or a JavaScript library that Blazor does not expose directly. Keep the boundary small, typed, asynchronous, and explicitly disposed.

## Quick reference

### C# → JavaScript module

```javascript
// Components/Map.razor.js
export function create(element, options) {
  const map = thirdPartyMap.create(element, options);
  return {
    setCenter: (lat, lng) => map.setCenter(lat, lng),
    dispose: () => map.destroy()
  };
}
```

```razor
@inject IJSRuntime JS
@implements IAsyncDisposable

<div @ref="container"></div>

@code {
    private ElementReference container;
    private IJSObjectReference? module;
    private IJSObjectReference? map;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        module = await JS.InvokeAsync<IJSObjectReference>(
            "import", "./Components/Map.razor.js");
        map = await module.InvokeAsync<IJSObjectReference>(
            "create", container, new { zoom = 8 });
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (map is not null)
            {
                await map.InvokeVoidAsync("dispose");
                await map.DisposeAsync();
            }

            if (module is not null)
                await module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
            // Interactive Server circuit already disconnected.
        }
    }
}
```

### JavaScript → .NET instance

```csharp
[JSInvokable]
public Task OnResizeAsync(int width) { ... }

private DotNetObjectReference<MyComponent>? dotNetReference;

dotNetReference = DotNetObjectReference.Create(this);
await module.InvokeVoidAsync("observe", element, dotNetReference);
```

```javascript
export function observe(element, dotNetReference) {
  const observer = new ResizeObserver(entries => {
    dotNetReference.invokeMethodAsync("OnResizeAsync", entries[0].contentRect.width);
  });
  observer.observe(element);
  return observer;
}
```

Dispose both observer/module object references and `DotNetObjectReference`.

### Interop rules

- Call DOM-dependent JS from `OnAfterRenderAsync`, usually when `firstRender`.
- Interop is unavailable during static prerendering.
- Prefer imported modules and object references over global functions.
- Assume arguments/results cross a serialization boundary.
- Never trust data because it came from your own browser code.
- Avoid chatty per-item calls; batch work across the boundary.
- Dispose JS and .NET references and tolerate circuit disconnects.

## When interop is appropriate

Use JS interop for:

- browser APIs not wrapped by Blazor,
- focus, measurement, observers, clipboard, media, and storage APIs,
- established JavaScript widgets/editors/maps/charts,
- carefully coordinated DOM behavior,
- integrating existing client scripts.

Prefer Blazor markup/events when the behavior can be expressed naturally in components. Every interop call adds serialization, async timing, failure modes, lifecycle coordination, and hosting-mode differences.

Wrap third-party libraries behind a small component-specific JavaScript module instead of exposing their entire API to C#.

## Calling JavaScript with `IJSRuntime`

Inject the runtime:

```razor
@inject IJSRuntime JS
```

Invoke a global identifier:

```csharp
await JS.InvokeVoidAsync("console.log", "Hello from .NET");
string value = await JS.InvokeAsync<string>("localStorage.getItem", "key");
```

`InvokeVoidAsync` ignores a return value; `InvokeAsync<T>` deserializes a result to `T`. Both return `ValueTask` and should be awaited.

Prefer passing a cancellation token for potentially long calls where overloads support it:

```csharp
await JS.InvokeVoidAsync("app.longOperation", cancellationToken, arguments);
```

In Interactive Server, each call crosses the network/circuit and has configured timeout/size constraints. In WebAssembly it remains an asynchronous runtime boundary even though execution is local.

Do not issue high-frequency calls on every pointer/scroll event without throttling or moving the tight interaction into JavaScript.

## Importing modules

JavaScript modules avoid global namespace pollution:

```csharp
IJSObjectReference module = await JS.InvokeAsync<IJSObjectReference>(
    "import", "./Components/Chart.razor.js");

await module.InvokeVoidAsync("render", element, data);
```

A collocated `.razor.js` file can sit beside a component; URL conventions vary with app/library/static web asset paths. Test published base paths, especially when hosted under a subpath or from a Razor class library.

Modules can return JS object references:

```javascript
export function createWidget(element) {
  return new Widget(element);
}
```

```csharp
widget = await module.InvokeAsync<IJSObjectReference>("createWidget", element);
```

Dispose object and module references when no longer used. Also invoke the library’s own destruction API; disposing the proxy alone may not remove DOM listeners/timers created by that library.

## Passing and serializing values

Interop normally serializes JSON-compatible values between .NET and JavaScript. Public properties, naming policy, supported converters, numeric/date formats, and cyclic graphs matter.

Good boundary contracts are small DTOs:

```csharp
public sealed record ChartPoint(string Label, decimal Value);
```

Avoid passing:

- service/domain object graphs,
- secrets,
- open streams/handles except supported specialized references,
- very large payloads in many repeated calls,
- polymorphic data without an explicit serialization contract.

Blazor provides optimized handling for some values such as byte arrays and supports streaming references for large binary data. Use documented APIs rather than base64-in-JSON for large files.

Serialization is not validation. JavaScript can call server-exposed methods with manipulated values; authorize and validate consequential operations on the server.

## Calling static .NET methods from JavaScript

Expose a public static method:

```csharp
[JSInvokable]
public static Task<string> NormalizeAsync(string value)
{
    return Task.FromResult(value.Trim());
}
```

Call using the assembly name and exposed method identifier:

```javascript
const value = await DotNet.invokeMethodAsync(
  "MyAssembly",
  "NormalizeAsync",
  input);
```

You can supply an explicit identifier:

```csharp
[JSInvokable("Normalize")]
```

Keep exposed methods narrow. Static entry points cannot naturally access one component instance and can become global service locators if overused.

## Calling instance methods with `DotNetObjectReference`

Create a reference to a .NET object:

```csharp
private DotNetObjectReference<WidgetHost>? reference;

reference = DotNetObjectReference.Create(this);
await module.InvokeVoidAsync("initialize", reference);
```

Expose an instance method:

```csharp
[JSInvokable]
public Task SelectionChangedAsync(string id)
{
    selectedId = id;
    return InvokeAsync(StateHasChanged);
}
```

JavaScript:

```javascript
await dotNetReference.invokeMethodAsync("SelectionChangedAsync", id);
```

The reference keeps the .NET object reachable. Dispose it when callbacks stop:

```csharp
reference?.Dispose();
```

First tell JavaScript to remove listeners/observers/timers so it does not invoke a disposed reference.

## DOM access after rendering

Capture `ElementReference`:

```razor
<input @ref="searchInput" />
```

Use after render:

```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
        await searchInput.FocusAsync();
}
```

Before rendering, the reference does not identify a browser element. Conditional markup can remove or replace it.

Avoid letting a library freely mutate DOM that Blazor also manages; later render diffs can conflict. Give the library ownership of an empty container or define explicit update/disposal operations. Mutation observers can help JS clean up when DOM is removed, because calling JS from .NET disposal may be too late or impossible after disconnect.

## Browser APIs and storage

Interop can access APIs such as clipboard, geolocation, `localStorage`, and observers. Browser permissions, secure-context requirements, user gestures, quotas, and privacy restrictions still apply.

Browser storage guidance:

- `localStorage` persists for an origin; `sessionStorage` is scoped to a tab/session.
- both are client-controlled and readable by scripts in the origin,
- never store server secrets,
- minimize sensitive personal data and account for XSS,
- version serialized values and handle corruption/quota failures,
- access only after interactive rendering, not prerender.

Server-side Blazor may use protected storage helpers in applicable scenarios, but browser-returned values still require authorization and consistency checks.

Prefer standard Blazor abstractions such as `NavigationManager` or `FocusAsync` where they already cover the need.

## Prerendering limitations

During prerender, components execute on the server without an attached interactive browser. `IJSRuntime` calls fail because JavaScript is unavailable.

Do not call JS from:

- constructors,
- `OnInitialized{Async}` during a prerendered component,
- `OnParametersSet{Async}` without knowing rendering context,
- static SSR event expectations.

Call from `OnAfterRenderAsync`; it runs when the component is interactively rendered. Guard `firstRender` and loading/disposal state.

If initial output depends on browser storage or viewport size, render a neutral placeholder during prerender and update after interactivity. Avoid layout shifts where possible.

Disabling prerender is an option but trades away initial server HTML and does not eliminate ordinary after-render timing requirements.

## Disposing JavaScript and .NET references

Interop creates two broad proxy types:

- `IJSObjectReference`: .NET proxy for a JavaScript object/module,
- `DotNetObjectReference<T>`: JavaScript-callable reference to a .NET object.

Both can retain memory across the boundary. Cleanup order commonly is:

1. ask JS object/library to remove listeners, observers, timers, and DOM state,
2. dispose JS object references,
3. dispose module reference,
4. dispose .NET object references,
5. cancel outstanding component work.

In Interactive Server, the circuit may already be disconnected, making JS cleanup impossible. Catch `JSDisconnectedException` where disconnect is an expected teardown condition. JavaScript-side cleanup should also handle DOM removal independently for critical resources.

Avoid invoking `StateHasChanged` during disposal.

## Handling interop errors

Interop can fail because:

- function/module URL or identifier is wrong,
- JavaScript throws or rejects a promise,
- serialization fails,
- call times out or payload exceeds limits,
- the server circuit disconnects,
- the element/object was removed or disposed,
- browser permissions deny an API,
- cancellation is requested.

Catch specific exceptions where recovery is possible:

```csharp
try
{
    await module.InvokeVoidAsync("copy", text);
}
catch (JSException exception)
{
    logger.LogWarning(exception, "Clipboard operation failed");
    message = "Copy was not available.";
}
catch (JSDisconnectedException) when (disposing)
{
}
```

Do not swallow operational failures during normal use. Present a safe fallback, log enough context without sensitive payloads, and keep component state consistent.

Test interop in every supported render mode, direct/prerendered startup, enhanced navigation, disposal, reconnection, and production publish paths.

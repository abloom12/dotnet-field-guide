---
title: Blazor Overview
description: Understand Blazor's place in .NET, component model, execution locations, and rendering choices.
sidebar:
  order: 1
---

Blazor is a .NET web UI framework for building HTML interfaces from Razor components. A Blazor Web App can combine server-rendered HTML with interactive components that execute on the server or in the browser.

## Quick reference

### Framework map

```text
.NET runtime, libraries, SDK, hosting, dependency injection
  → ASP.NET Core HTTP server, middleware, routing, endpoints
    → Blazor Razor components, UI rendering, events, navigation, forms
```

Blazor is built on ASP.NET Core; it does not replace HTTP hosting, security, or deployment concerns.

### Rendering modes at a glance

| Mode | Initial HTML | Interactive code runs | Typical strength |
| --- | --- | --- | --- |
| Static SSR | Server response | Nowhere after response | Fast server-rendered content/forms with no component event loop |
| Interactive Server | Usually prerendered on server | Server over a SignalR circuit | Small download and full server access |
| Interactive WebAssembly | Usually prerendered on server | Browser on .NET WebAssembly | Client execution and offline-capable possibilities |
| Interactive Auto | Usually prerendered on server | Server initially; WebAssembly on later visits after download | Automatic transition strategy |

Interactivity is a per-boundary architectural decision, not merely a visual setting.

### Typical app structure

```text
Components/
├── App.razor               document shell
├── Routes.razor            router
├── Layout/
│   └── MainLayout.razor
└── Pages/
    └── Home.razor
wwwroot/                    static web assets
Program.cs                  services, render modes, endpoint mapping
appsettings*.json           server configuration
Client/                     optional WebAssembly project for client/Auto components
```

Exact template layout varies by .NET version and project choices.

### Minimal interactive component

```razor
@page "/counter"
@rendermode InteractiveServer

<PageTitle>Counter</PageTitle>

<h1>Counter</h1>
<p>Current count: @count</p>
<button class="btn btn-primary" @onclick="Increment">Increment</button>

@code {
    private int count;

    private void Increment() => count++;
}
```

Without an interactive render mode, the button is rendered as HTML but its Blazor event handler does not run in the browser.

### Practical rules

- Decide where code must execute before choosing a render mode.
- Treat components as state plus a render description, not as manually edited DOM.
- Keep parameters as input contracts and use callbacks for child-to-parent events.
- Keep business and data-access logic in injected services.
- Model loading, empty, success, and error states explicitly.
- Cancel component-owned work and dispose subscriptions/interop references.
- Never assume client-side code or data is trusted; authorize on the server.

## What Blazor is

A Razor component is a .NET type whose `.razor` source combines HTML-like markup with Razor syntax and C# state/behavior. Blazor renders a component tree, compares successive render output, and applies a compact set of UI updates.

Components support:

- parameters and nested content,
- event handlers and data binding,
- routing and layouts,
- forms and validation,
- dependency injection,
- lifecycle methods,
- JavaScript interop,
- server and browser execution modes.

Blazor is not a separate programming language. Razor is the templating syntax; component behavior is C# compiled for .NET.

## Relationship to ASP.NET Core

A Blazor Web App is an ASP.NET Core application. ASP.NET Core provides:

- the web server and HTTP pipeline,
- endpoint routing,
- authentication and authorization infrastructure,
- dependency injection, configuration, and logging,
- static-file delivery and response behavior,
- SignalR infrastructure used by Interactive Server.

Blazor adds component discovery/routing, rendering, event dispatch, and interactive runtime integration. Server security rules still apply: UI visibility is not authorization, antiforgery and request validation matter, and server operations must enforce user permissions.

Blazor components can coexist with minimal APIs, controllers, Razor Pages, and other ASP.NET Core endpoints.

## What runs on the server and browser

Execution depends on the rendering boundary:

### Static server-side rendering

The server creates components for an HTTP request, produces HTML, sends it, and finishes the request. No persistent component instance handles later browser events. Navigation/form enhancement may replace HTML without a full browser reload, but that is not component interactivity.

### Interactive Server

Components and C# state live on the server. Browser events travel over a real-time SignalR connection to a **circuit**; the server renders changes and sends UI diffs back. Server services and private network resources are available, but latency, connection stability, server memory, and per-user circuit state matter.

### Interactive WebAssembly

The .NET runtime, application assemblies, and client dependencies download to the browser. Component code executes in the browser sandbox. It can use browser-accessible HTTP APIs and JavaScript interop but cannot directly use server-only resources or secrets.

### Interactive Auto

The initial interactive experience uses server interactivity while WebAssembly assets download. On a later load, eligible components can execute with WebAssembly. Code and dependencies must therefore be valid for both locations, and the transition is between visits rather than live migration of one component instance.

## Basic application structure

`Program.cs` registers Razor component services and maps component endpoints. A typical Blazor Web App configuration is conceptually:

```csharp
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();

var app = builder.Build();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode();

app.Run();
```

Only register/map modes the application uses. WebAssembly and Auto commonly involve a separate client project whose assemblies are downloaded to the browser.

`App.razor` usually defines the document shell and renders routing/head components. `Routes.razor` contains the router, page discovery, and route layout behavior. Layouts provide shared UI. Components under `Pages` conventionally have `@page`, but folder placement alone does not make a route.

## Component and rendering model

A component produces a render tree from its current parameters and state. Rendering can occur after:

- initial component creation,
- receiving parameters,
- lifecycle async work completes,
- a Blazor-dispatched event handler runs,
- `StateHasChanged` is requested,
- a cascading value notifies dependents.

Blazor compares the new render tree with the previous one and updates only differences. Write stable, declarative markup:

```razor
@if (orders.Count == 0)
{
    <p>No orders.</p>
}
else
{
    @foreach (var order in orders)
    {
        <OrderRow @key="order.Id" Order="order" />
    }
}
```

Do not directly mutate DOM owned by Blazor unless a JavaScript integration requires it; uncoordinated DOM changes can conflict with later rendering.

Component instances hold UI state but are not durable storage. They can be recreated after navigation, refresh, circuit loss, deployment, or render-mode transition.

## Rendering modes in practice

A static parent can introduce an interactive child boundary. Once a component is inside an interactive boundary, descendants inherit that runtime and cannot arbitrarily switch to an incompatible interactive mode.

Render mode affects:

- whether events and binding work,
- where services must be available,
- whether parameters cross a serialization boundary,
- when browser APIs and JS interop are available,
- latency and offline behavior,
- security and secret access,
- deployment assets and server capacity.

See [Rendering Modes](../rendering-modes/) before mixing modes.

## Startup and interactivity

A typical request progresses as follows:

1. The browser requests a route.
2. ASP.NET Core routes the request to Razor components.
3. The server renders HTML, including prerendered output for interactive components by default.
4. The browser displays useful HTML.
5. Blazor’s script starts.
6. For Interactive Server, a circuit connection is established and component event handling runs on the server.
7. For Interactive WebAssembly, runtime/assemblies load and client components start in the browser.
8. Blazor associates interactive component state with rendered DOM and begins dispatching events.

Prerendering and interactive startup can create separate component instances, so initialization may run more than once. Persist prerendered state or make loading idempotent when duplication matters.

## When Blazor is practical

Blazor is a strong option when:

- the team and application already use .NET/C#,
- shared .NET models/validation/client libraries provide real value,
- server-side integration and component UI belong in one platform,
- application screens/forms fit a component model,
- render mode can be chosen according to latency, download, and hosting constraints.

Evaluate carefully when:

- initial client download must be extremely small,
- the app depends heavily on browser-first libraries and advanced DOM ecosystems,
- users have high-latency/unreliable links but Interactive Server is proposed,
- offline behavior is mandatory,
- per-user server circuit scale is unacceptable,
- the team lacks operational capacity for the chosen hosting mode.

Static SSR can serve content-oriented pages without making the entire app interactive. Use interactivity only where UI behavior needs it, but avoid a fragmented render-mode design that is harder to reason about than its benefits justify.

---
title: Rendering Modes
description: Choose where Blazor components render and execute, and understand interactive boundaries.
sidebar:
  order: 3
---

A render mode determines whether a Razor component is interactive, where its interactive code executes, and how it starts. The choice affects architecture, services, security, latency, and state.

## Quick reference

### Mode comparison

| Mode | Event handlers | Runtime location | Connection/download | Server-only services |
| --- | --- | --- | --- | --- |
| Static SSR | No persistent component events | Server during HTTP request | Normal HTTP | Available while rendering/request handling |
| Interactive Server | Yes | Server | Persistent SignalR circuit | Available |
| Interactive WebAssembly | Yes | Browser | .NET/app download | Not directly available |
| Interactive Auto | Yes | Server first visit, browser on later visit when assets are ready | Both operational models | Components must work in both locations |

### Apply a mode

```razor
@* Per component definition *@
@rendermode InteractiveServer

@* Per component instance *@
<Weather @rendermode="InteractiveWebAssembly" />
```

Render-mode instances can also be referenced in code:

```razor
@using static Microsoft.AspNetCore.Components.Web.RenderMode
<Counter @rendermode="InteractiveServer" />
```

### Register and map modes

```csharp
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddInteractiveWebAssemblyComponents();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode();
```

Register only what the app uses. WebAssembly/Auto requires client-build support and components/dependencies available to the client project.

### Selection questions

1. Does this UI need events after HTML is delivered?
2. Must code directly access server-only services or secrets?
3. Can users tolerate a persistent network round trip for events?
4. Can they tolerate the WebAssembly download/startup?
5. Must behavior continue through connection loss/offline periods?
6. Can parameters and dependencies cross/run on the chosen side?
7. Can operations be authorized and validated on the server regardless?

## Static server-side rendering

Static SSR creates components on the server for an HTTP request and returns HTML. After the response, there is no live component instance attached to that DOM.

```razor
@page "/about"

<h1>About</h1>
<p>Rendered at @renderedAt</p>

@code {
    private readonly DateTimeOffset renderedAt = DateTimeOffset.UtcNow;
}
```

Static SSR supports routing, layouts, dependency injection, and server form posts. It does not support normal Blazor DOM event handlers such as `@onclick` after the response. A button can still submit an HTML/enhanced form or navigate using standard browser behavior.

Strengths:

- useful HTML without an interactive runtime,
- low per-user persistent server state,
- direct server data/service access during requests,
- good fit for content and request/response forms.

Limitations:

- no persistent component-local state between requests,
- no component event loop after rendering,
- browser APIs require client JavaScript rather than server rendering,
- every request must reconstruct required state.

## Interactive Server

Interactive Server keeps component instances and state on the server. The browser sends events through a SignalR connection, and the server sends rendered UI diffs back.

```razor
@rendermode InteractiveServer
<button @onclick="Increment">@count</button>
```

Strengths:

- small initial interactive payload relative to WebAssembly,
- server-only services and data access can be injected,
- application code remains on the server,
- fast startup when network conditions are good.

Trade-offs:

- each interaction depends on network latency/connectivity,
- server holds per-circuit state and must scale accordingly,
- circuit disconnect/reconnection affects UX,
- blocking work can harm many users,
- deployments/restarts can end circuits.

A circuit is not an authorization boundary or durable session. Server operations must still authorize the current user and validate input.

## Interactive WebAssembly

Interactive WebAssembly downloads a .NET runtime and client application assemblies so components execute in the browser.

```razor
@rendermode InteractiveWebAssembly
```

Strengths:

- UI events execute locally after startup,
- reduced event-by-event server latency,
- client-side/offline-capable designs are possible,
- no persistent server circuit required.

Trade-offs:

- larger initial download and startup cost,
- client code and data are visible/untrusted,
- browser sandbox limits direct OS/server access,
- server resources must be reached through authorized HTTP APIs,
- client project dependencies must support WebAssembly.

Never place secrets in client configuration or assemblies. Enforce authentication, authorization, and validation at server APIs.

## Interactive Auto

Interactive Auto uses Interactive Server when the client runtime is not yet available and can use Interactive WebAssembly on later visits after assets have downloaded.

It does not migrate one live component instance from server to browser. A later request creates components in the selected environment. Therefore:

- component code must be available to the client,
- dependencies must work in both server and browser contexts,
- state cannot assume one process/location,
- services should have compatible abstractions/registrations on both sides,
- behavior must be tested in both modes.

Auto can improve first interactive startup while gaining client execution later, but it carries the operational complexity of both models. Use it when that trade-off is valuable, not as a default avoidance of choosing.

## Prerendering

Interactive render modes prerender on the server by default: the server emits initial HTML before interactivity starts. Benefits include faster visible content and non-blank initial responses.

Prerendering creates a server-rendering phase followed by an interactive phase, often with separate component instances. Consequences:

- initialization can run twice,
- JS interop/browser storage is unavailable during prerender,
- data may be loaded twice,
- interactive-only services may not exist during server prerender,
- rendered HTML can briefly differ from interactive state.

Disable prerender for a render-mode instance when justified:

```razor
<Counter @rendermode="new InteractiveServerRenderMode(prerender: false)" />
```

or use the corresponding WebAssembly/Auto render-mode instance. The exact setup and imports depend on project version.

Prefer making initialization idempotent or persisting prerendered state when initial HTML matters. Disabling prerender trades away those benefits.

## Applying modes globally or per component

A per-definition directive makes instances interactive by default:

```razor
@rendermode InteractiveServer
```

A parent can set a mode for one child instance:

```razor
<Dashboard @rendermode="InteractiveServer" />
```

For global interactivity in a Blazor Web App, templates commonly apply a render mode to `Routes` and `HeadOutlet` in `App.razor`, making routed pages descendants of one interactive boundary:

```razor
<HeadOutlet @rendermode="InteractiveServer" />
<Routes @rendermode="InteractiveServer" />
```

The root `App` component itself is statically rendered and is not normally made interactive directly. Global mode simplifies state/service assumptions. Per-page/component modes reduce unnecessary interactivity but introduce more boundaries and parameter constraints.

## Interactive boundaries and propagation

A static SSR tree can contain an interactive root. That root establishes an interactive boundary. Its descendants execute in the same interactive environment and normally do not declare a different interactive mode.

Rules to remember:

- static parent → interactive child is a valid boundary,
- interactive parent → descendants inherit interactivity,
- nested incompatible interactive modes are not supported,
- a component definition does not need `@rendermode` when an ancestor already provides it,
- routing/layout placement can make the boundary broader than it first appears.

Think in subtrees, not isolated buttons. A boundary must include the components, callbacks, cascading values, and state that interact together.

## Parameters across boundaries

Static-to-interactive parameters must be serializable because they are transferred into interactive startup state. Use simple serializable data contracts.

Unsupported/problematic boundary values include:

- `RenderFragment` and templated fragments,
- delegates and `EventCallback` values from a static parent,
- server service instances,
- open streams/database contexts,
- arbitrary object graphs with cycles or private runtime state.

This fails conceptually because child content is executable rendering logic:

```razor
<InteractivePanel @rendermode="InteractiveServer">
    <p>Child content from a static parent</p>
</InteractivePanel>
```

Place both sides inside the same interactive boundary or redesign the interactive component to receive serializable data.

Parameters are not a secure channel. Client-originating values must be validated and authorized on the server.

## Services and browser access

Render mode determines available dependencies:

| Capability | Static/Interactive Server | Interactive WebAssembly |
| --- | --- | --- |
| Database context/repository | Can be server-injected with correct lifetime | Must call server API |
| Server filesystem/private network | Available subject to host permissions | Not directly available |
| Browser DOM/storage APIs | Through JS after interactive render | Through JS after render |
| Server secrets | Can remain server-side | Never available securely |
| `HttpClient` | Server network client | Browser HTTP client |

Prerendered WebAssembly/Auto components execute first on the server, so a service injected by the component may need a server registration as well as a client registration. Alternatively abstract data loading so each environment has an appropriate implementation.

JS interop is unavailable during static prerender because no interactive browser connection exists. Use `OnAfterRenderAsync` after interactivity.

## Choosing without overcomplication

Use the least complex mode that meets requirements:

- **Static SSR:** content, links, and server-posted forms without rich local events.
- **Interactive Server:** rich UI with server proximity and reliable low-latency connections.
- **Interactive WebAssembly:** client responsiveness/offline potential worth the download and API boundary.
- **Interactive Auto:** both server-first and later client execution are explicitly desired and supported.

Avoid making every small component a separate boundary. Prefer a few coherent interactive subtrees with clear state and service ownership. Measure startup, download, event latency, circuit memory, and reconnect behavior using realistic networks and deployment topology.

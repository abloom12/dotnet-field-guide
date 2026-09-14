---
title: Pages, Layouts, and Forms
description: Build routable pages, shared layouts, navigation, binding, and validated forms in Blazor.
sidebar:
  order: 6
---

A routable Razor component uses `@page`. Layouts provide shared UI. `EditForm` coordinates model binding, field state, validation messages, and valid/invalid submission.

## Quick reference

### Routable page

```razor
@page "/orders/{Id:guid}"
@layout MainLayout

<PageTitle>Order @Id</PageTitle>

<h1>Order</h1>

@code {
    [Parameter]
    public Guid Id { get; set; }

    [SupplyParameterFromQuery(Name = "tab")]
    public string? SelectedTab { get; set; }
}
```

### Navigation

```razor
<NavLink href="orders" Match="NavLinkMatch.Prefix">Orders</NavLink>
<a href="orders/new">New order</a>
```

```csharp
Navigation.NavigateTo($"orders/{order.Id}");
Navigation.Refresh();
```

### Validated form

```razor
@rendermode InteractiveServer

<EditForm Model="model" OnValidSubmit="SaveAsync" OnInvalidSubmit="Invalid">
    <DataAnnotationsValidator />
    <ValidationSummary />

    <label>
        Name
        <InputText @bind-Value="model.Name" />
        <ValidationMessage For="() => model.Name" />
    </label>

    <button type="submit" disabled="@isSaving">Save</button>
</EditForm>

@code {
    private readonly OrderInput model = new();
    private bool isSaving;

    private async Task SaveAsync()
    {
        isSaving = true;
        try { await service.SaveAsync(model); }
        finally { isSaving = false; }
    }

    private void Invalid(EditContext _) { }
}
```

### Form rules

- Use either `Model` or `EditContext`, not both.
- Put buttons inside forms at `type="submit"` or `type="button"` intentionally.
- Client/UI validation improves feedback; server operations must validate and authorize again.
- Prevent duplicate submission and show progress/errors.
- Use unique form names where static SSR form handling requires them.

## Routable components with `@page`

A page is a component with one or more route templates:

```razor
@page "/orders"
@page "/purchases"
```

Routes are normally relative to the application base path and begin with `/` in the directive. Folder location is organizational; `@page` creates routability.

The router discovers routable components in configured assemblies and renders the matched page inside its layout. Route matching occurs before component rendering.

Keep route templates stable because users, bookmarks, and external links depend on them. Use redirects/aliases deliberately when changing routes.

## Route parameters

Declare route segments and matching component parameters:

```razor
@page "/orders/{Id:guid}"

@code {
    [Parameter]
    public Guid Id { get; set; }
}
```

Constraints reject nonmatching route values before component execution. Common constraints include `int`, `long`, `guid`, `bool`, and date/numeric forms supported by routing.

Optional parameters use `?` where supported:

```razor
@page "/reports/{Year:int?}"
```

Supply a default in lifecycle logic, not by assuming optional binding preserves a previous instance value:

```csharp
[Parameter] public int? Year { get; set; }
```

When navigation changes route parameters but reuses the component instance, `OnParametersSet{Async}` runs; `OnInitialized{Async}` does not rerun for that instance.

Catch-all parameters can capture remaining path text. Validate decoded input and avoid treating route values as trusted identifiers.

## Query-string parameters

Use `[SupplyParameterFromQuery]`:

```csharp
[SupplyParameterFromQuery(Name = "page")]
public int PageNumber { get; set; } = 1;

[SupplyParameterFromQuery]
public string? Filter { get; set; }
```

Query strings suit optional, bookmarkable view state such as filters, sorting, paging, and tabs. Supported values are parsed using framework rules; invalid values need deliberate UX.

Build encoded URIs using `NavigationManager.GetUriWithQueryParameter(s)` or URI helpers instead of string concatenating untrusted text:

```csharp
string uri = Navigation.GetUriWithQueryParameter("page", PageNumber + 1);
Navigation.NavigateTo(uri);
```

Never place secrets in routes or query strings. URLs appear in history, logs, analytics, and referrers.

## `NavLink` and `NavigationManager`

`NavLink` renders an anchor and adds an active CSS class when its target matches the current URI:

```razor
<NavLink href="orders" Match="NavLinkMatch.All">Orders</NavLink>
```

Use ordinary `<a>` for navigation that does not need active-state behavior.

Inject `NavigationManager`:

```razor
@inject NavigationManager Navigation
```

Common operations:

```csharp
Navigation.NavigateTo("orders");
Navigation.NavigateTo("orders", replace: true);
Navigation.Refresh();
```

`NavigateTo` requests navigation; it is not a server-side authorization check. Route destinations must enforce access.

Subscribe to `LocationChanged` only when necessary and unsubscribe during disposal. Navigation-locking APIs can prompt/block internal navigation for unsaved changes, but browser unload behavior is constrained by browser security.

## Layouts

A layout derives from `LayoutComponentBase` and renders `Body`:

```razor
@inherits LayoutComponentBase

<header>Field Guide</header>
<main>
    @Body
</main>
```

Apply with:

```razor
@layout MainLayout
```

or an `_Imports.razor` directive for a directory subtree. Router defaults can also select a layout.

Layouts are components and can inject services, hold UI state, and render child components. Keep page-specific data out of a global layout unless it truly belongs to application chrome.

A layout and its pages must be compatible with the render-mode boundary that contains them.

## Nested layouts

A layout can itself specify another layout:

```razor
@layout MainLayout
@inherits LayoutComponentBase

<section class="admin-shell">
    @Body
</section>
```

The page renders in the inner layout, which renders inside the outer layout. Avoid circular layout references and excessive nesting. Shared navigation/chrome can also be ordinary components instead of another layout layer.

Layout instances can survive navigation while page instances change, depending on routing/rendering. Do not use layout memory as durable user state.

## Missing routes

Unknown routes should produce an intentional not-found experience and appropriate HTTP status for server rendering. Exact configuration depends on .NET/Blazor version and whether endpoint status-code handling or router not-found content owns the response.

Options include:

- framework/router not-found content,
- a dedicated not-found page/endpoint,
- ASP.NET Core status code pages,
- `NavigationManager.NotFound()` in supported versions/contexts.

Do not redirect every unknown URL to the home page; it hides broken links and produces misleading success responses. Test direct HTTP requests, enhanced internal navigation, and interactive navigation because not-found behavior can differ.

## Building forms with `EditForm`

`EditForm` creates/cascades an `EditContext` and handles submission:

```razor
<EditForm Model="model" OnValidSubmit="HandleValidAsync">
    <DataAnnotationsValidator />
    ...
</EditForm>
```

You can handle:

- `OnValidSubmit` when validation succeeds,
- `OnInvalidSubmit` when validation fails,
- `OnSubmit` for full manual validation/submission control.

Do not use `OnSubmit` together with valid/invalid handlers for the same flow.

For static SSR forms, the request posts back to the server and a new component/request processes submitted values. Form names and `[SupplyParameterFromForm]` participate in server-side form mapping in modern Blazor Web Apps. Interactive forms maintain an active edit context and dispatch events through the interactive runtime.

## Models and `EditContext`

The simple approach supplies a model:

```csharp
private readonly CustomerInput model = new();
```

For direct control:

```csharp
private CustomerInput model = new();
private EditContext editContext = default!;

protected override void OnInitialized()
{
    editContext = new EditContext(model);
}
```

```razor
<EditForm EditContext="editContext">...</EditForm>
```

Use `EditContext` to inspect modified fields, subscribe to field/validation events, add custom validation stores, or trigger validation:

```csharp
bool valid = editContext.Validate();
```

If the model object is replaced, create a new `EditContext`; it tracks one model instance. Unsubscribe any event handlers when the component is disposed.

Use dedicated input/view models rather than binding database entities directly. This prevents overposting, separates validation contracts, and avoids unintended persistence tracking.

## Built-in input components

Common components include:

| Component | Use |
| --- | --- |
| `InputText` / `InputTextArea` | Text |
| `InputNumber<T>` | Numeric values |
| `InputDate<T>` | Date/time-supported input |
| `InputCheckbox` | Boolean |
| `InputSelect<T>` | Selection |
| `InputRadioGroup<T>` / `InputRadio<T>` | Radio choices |
| `InputFile` | Browser file selection/upload stream |

They integrate with `EditContext`, parsing, field state, and validation when used with `@bind-Value`.

```razor
<InputNumber @bind-Value="model.Quantity" />
```

Parsing errors become validation messages rather than assigning invalid text to a numeric property. For custom inputs, derive from `InputBase<T>` when full form integration is required.

File uploads require strict server size/type/content validation and streaming safeguards; browser-provided filenames and MIME types are untrusted.

## Data-annotation validation

Define a form model:

```csharp
public sealed class OrderInput
{
    [Required, StringLength(100)]
    public string Name { get; set; } = "";

    [Range(1, 1_000)]
    public int Quantity { get; set; } = 1;
}
```

Enable annotations:

```razor
<DataAnnotationsValidator />
<ValidationSummary />
<ValidationMessage For="() => model.Name" />
```

Data annotations cover common property/object validation. Complex/nested model validation behavior depends on framework features and configured validators; test the exact object graph.

Validation attributes are not database constraints or authorization. The server command/API must enforce authoritative rules and race-sensitive invariants.

## Custom validation

Options include:

- implement `IValidatableObject` for model-level rules,
- create custom `ValidationAttribute` types for reusable synchronous checks,
- use `EditContext` with `ValidationMessageStore`,
- map server validation errors back to fields,
- integrate a selected validation library deliberately.

Cross-field example:

```csharp
public IEnumerable<ValidationResult> Validate(ValidationContext context)
{
    if (EndDate < StartDate)
    {
        yield return new ValidationResult(
            "End date must not precede start date.",
            [nameof(EndDate)]);
    }
}
```

Avoid async network/database calls from synchronous validation attributes. Perform async validation during submission or a debounced field workflow, handle races/cancellation, and keep server submission authoritative.

## Valid and invalid submission

```razor
<EditForm Model="model"
          OnValidSubmit="SaveAsync"
          OnInvalidSubmit="ShowInvalid">
```

A robust valid submission:

1. blocks duplicate submissions,
2. clears stale server errors,
3. sends a command/request,
4. handles cancellation and expected failures,
5. maps validation errors appropriately,
6. navigates or confirms success,
7. restores controls in `finally`.

Do not rely on disabled buttons alone; repeated requests and malicious clients are still possible. Make important server operations idempotent or protected by concurrency controls.

Invalid submission should move focus/summarize accessibly and preserve user input. Use labels, validation message associations, and `role="alert"`/focus management thoughtfully.

## Enhanced navigation and form handling

Blazor Web Apps can intercept eligible same-origin navigation and static SSR form submissions, fetch responses, and patch document content without a full page reload. This preserves more page context and can feel SPA-like while still using server-rendered responses.

Consequences:

- full-document load events/scripts may not rerun,
- DOM changes made outside Blazor can be replaced,
- not-found/error handling must work for enhanced requests,
- scroll/focus/history behavior differs from forced reloads,
- forms need framework-compatible enhancement setup.

Disable enhancement for a subtree/link/form with supported `data-enhance-nav`/`data-enhance` attributes when a full load is required. Use framework navigation APIs rather than manipulating location casually.

Test both direct URL loads and internal enhanced navigation. Third-party scripts should initialize through supported enhanced-navigation events or component JS lifecycle rather than only initial page load.

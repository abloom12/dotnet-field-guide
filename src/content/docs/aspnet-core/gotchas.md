---
title: Gotchas
description: Diagnose common ASP.NET Core routing, middleware, binding, lifetime, response, proxy, and cancellation failures.
sidebar:
  order: 8
---

ASP.NET Core bugs often come from an invisible ordering, inference, lifetime, or hosting assumption. Start by tracing one request from the real client/proxy through middleware, endpoint selection, binding, application work, and response.

## Quick reference

| Symptom | Likely issue | First check |
| --- | --- | --- |
| Endpoint never runs | Route/method/constraint mismatch or earlier short-circuit | Routing logs and selected endpoint |
| User is empty / policy ignored | Authentication/authorization registration or order | `Add...`, `UseAuthentication`, `UseAuthorization`, endpoint metadata |
| CORS only fails in browser | Missing/wrong policy or middleware order | Origin, preflight, credentials, endpoint policy |
| Request DTO unexpectedly empty | Wrong binding source, JSON/content type, naming, constructor | Binding/model-state logs and actual request |
| Body is empty in second component | Request stream already consumed | Single owner or enable/rewind buffering carefully |
| Scoped object disposed/leaks users | Captive dependency or background use after request | DI lifetime graph and fire-and-forget tasks |
| Error returns 200/HTML | Wrong result or dev/proxy exception page | Status mapping/content type/error middleware |
| Redirect loop behind proxy | Scheme not restored | Trusted forwarded headers before redirects/auth |
| Requests stall under load | Blocking I/O/CPU or pool exhaustion | `.Result`, `.Wait`, sync calls, traces/metrics |
| Work continues after disconnect | Token not propagated or side effect crossed boundary | `RequestAborted` chain and operation consistency |

### Request diagnostic skeleton

Capture safely:

```text
method + scheme + host + path base + path + query shape
→ proxy/forwarding result
→ middleware short-circuit?
→ selected endpoint/display name/metadata
→ authenticated? authorization result?
→ binding/model-state errors?
→ application outcome
→ status + response started?
→ cancellation/elapsed time
```

Never log authorization headers, cookies, tokens, secrets, or sensitive bodies while debugging.

## Middleware in the wrong order

Middleware order controls behavior. Common requirements include:

```csharp
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
```

This is not universal copy/paste; verify each middleware’s documentation and app needs.

Typical failures:

- authorization before authentication sees no established identity,
- forwarded headers after HTTPS redirection causes loops,
- CORS placed where preflight/error responses miss headers,
- exception middleware too late cannot catch earlier failures,
- terminal `Run` prevents endpoint execution,
- custom middleware reads endpoint metadata before routing,
- static files are served before endpoint policy and assumed private.

Trace “before/after” middleware logs and `context.GetEndpoint()?.DisplayName`. Remember response-side code unwinds in reverse order.

## Routes do not match as expected

A request must match path, HTTP method, constraints, host/metadata policies, and application path base. Distinguish:

- 404: usually no endpoint selected (or application intentionally hid resource),
- 405: path matched but method did not,
- 400: binding/validation failed after match,
- 401/403: security rejected selected endpoint.

Common route problems:

- literal or parameter typo,
- `:int`/`:guid` constraint rejects segment,
- optional/catch-all route overlaps another,
- controller lacks `MapControllers` or required route attributes,
- route group/controller prefix duplicates a segment,
- app is hosted under an unexpected path base,
- fallback endpoint catches more than intended.

Enable ASP.NET Core routing logs in development and inspect selected endpoint. Generate links by endpoint name/route values where possible rather than hand-building URLs.

## Minimal API and controller behavior differs

Both use endpoint routing, but binding, validation, filters, result types, and JSON configuration have different APIs/conventions.

Examples:

- `[ApiController]` automatically returns validation problems for invalid model state; Minimal APIs require the configured validation behavior/filter/framework feature.
- MVC JSON options and Minimal API HTTP JSON options are configured through different extension points.
- MVC action filters do not run around Minimal API handlers; endpoint filters do.
- `ActionResult<T>` and `Results<T...>` are different result systems.
- binding inference rules differ, especially for complex parameters/services/body.

Do not copy controller configuration and assume Minimal APIs consume it, or vice versa. Integration-test actual content type, status, serialized shape, and validation for each application model.

## Model-binding surprises

Binding converts HTTP data into .NET types; it does not infer business intent. Common surprises:

- a complex Minimal API parameter is inferred from body when query binding was intended,
- a parameter name does not match route value,
- missing non-nullable value type becomes default or binding failure depending on context,
- `[Required]` on `int` does not reject `0`,
- invalid constrained route becomes 404 rather than validation 400,
- JSON property naming/enum/converter options differ,
- empty string and null normalization differ by binder/input type,
- multiple body-bound parameters are unsupported,
- collection/query formats do not match client encoding.

Use `[FromRoute]`, `[FromQuery]`, `[FromHeader]`, `[FromBody]`, `[FromForm]`, and `[FromServices]` when explicitness prevents ambiguity. Use dedicated DTOs and inspect `ModelState`/binding logs safely.

Nullable annotations are not runtime validation. Test missing, null, empty, malformed, boundary, and extra values.

## Request bodies can normally be read once

`HttpRequest.Body` is a forward-only stream by default. JSON/model binding consumes it. Middleware that reads it first can leave the endpoint an empty body.

When a legitimate component must inspect then allow rereading:

```csharp
context.Request.EnableBuffering();

using var reader = new StreamReader(
    context.Request.Body,
    encoding: Encoding.UTF8,
    detectEncodingFromByteOrderMarks: false,
    bufferSize: 1024,
    leaveOpen: true);

string body = await reader.ReadToEndAsync(context.RequestAborted);
context.Request.Body.Position = 0;
await next(context);
```

Buffering has memory/disk and denial-of-service implications. Set body/size limits, avoid logging sensitive bodies, and prefer one owner or targeted endpoint behavior over global body capture.

Do not read multipart uploads or large bodies into strings. Stream them with strict limits.

## Wrong dependency-injection lifetime

Request scopes dispose scoped services at request end. Problems include:

- singleton captures scoped `DbContext`/user state,
- static/singleton mutable state leaks across users,
- request starts a fire-and-forget task that later uses disposed scoped services,
- transient disposable services are resolved from the root and retained,
- one non-thread-safe context is used by parallel tasks.

Rules:

- singleton: shared, thread-safe, no scoped capture,
- scoped: per HTTP request,
- transient: per resolution, with ownership still important,
- background work: create its own scope for each unit of work,
- EF-style contexts: do not run parallel operations on one instance.

Enable scope validation and avoid calling `BuildServiceProvider` during registration. Pass immutable request values to durable background queues rather than `HttpContext` or scoped service instances.

## Incorrect status codes

Common mistakes:

- returning 200 with an error object,
- returning 500 for ordinary validation/not-found/conflict,
- returning 400 for unexpected server exceptions,
- returning 401 when authenticated-but-forbidden (normally 403),
- returning 403 when authentication is missing (normally challenge/401),
- returning 204 with a body,
- returning 201 without a useful/correct `Location`,
- returning exception text as the response.

Map explicit application outcomes at the web boundary. Standardize Problem Details for error bodies. Test response status, headers, content type, and body—not only deserialized happy-path values.

A response that has started cannot reliably switch to a different error status. Validate before streaming where possible.

## Development and production differ

Differences may include:

- developer exception page versus safe exception handler,
- HTTPS/HSTS behavior,
- logging levels/providers,
- configuration source values,
- authentication callback origins,
- database/services and credentials,
- publish trimming/native assets,
- reverse proxy/path base,
- static file caching/compression,
- Debug/Release build settings.

Host environment (`Development`/`Production`) is independent of build configuration (`Debug`/`Release`). Environment name is not a security boundary.

Test the published Release artifact with production-like proxy, environment, identity provider, secrets mechanism, and platform. Never enable developer exception output publicly to diagnose production.

## Authentication configured without effective authorization

These are separate:

```csharp
builder.Services.AddAuthentication(...);
builder.Services.AddAuthorization();

app.UseAuthentication();
app.UseAuthorization();

endpoint.RequireAuthorization();
```

Registering schemes does not automatically protect every endpoint. Authentication may populate `User`, but without authorization metadata/fallback policy, the endpoint can remain public.

Conversely, authorization without a working/default authentication scheme cannot establish the expected identity/challenge behavior.

Audit endpoint metadata. Prefer protected route groups/controllers or a fallback policy with explicit anonymous exceptions. Remember static files served before endpoint routing are not protected by endpoint authorization.

UI hiding and CORS are not authorization.

## Missing forwarded headers behind a proxy

A TLS-terminating proxy may send HTTP to Kestrel while forwarding original scheme/host/client IP. Without trusted forwarded-header processing:

- HTTPS redirects loop,
- generated links/callback URLs use HTTP or wrong host,
- secure authentication redirects fail,
- client-IP logging/rate rules see proxy IP,
- security decisions use spoofable/wrong values.

Configure `ForwardedHeadersOptions` with known proxies/networks and process headers early:

```csharp
app.UseForwardedHeaders();
```

Do not blindly trust `X-Forwarded-*` from any client. Proxy and app must agree on header names, hop limits, symmetry, and which proxy rewrites/removes incoming values.

Test through the real deployment ingress, not only direct localhost.

## Synchronous work blocks request threads

These patterns block:

```csharp
service.LoadAsync().Result;
service.LoadAsync().Wait();
Thread.Sleep(1000);
```

Under load, blocking consumes thread-pool threads and can cause starvation, rising latency, timeouts, and cascading failure. Use async I/O end to end:

```csharp
await service.LoadAsync(cancellationToken);
await Task.Delay(1000, cancellationToken);
```

`async` does not make CPU-heavy work cheap or move it automatically. Bound expensive CPU work, offload to an appropriate queue/service when needed, and protect shared downstream systems with concurrency/rate limits.

Do not wrap naturally asynchronous server I/O in `Task.Run` merely to avoid awaiting it.

## Client disconnection and cancellation

A handler/action `CancellationToken` maps to `HttpContext.RequestAborted`. If it is not passed into database/HTTP/delay/application calls, work continues unnecessarily.

```csharp
await query.ExecuteAsync(cancellationToken);
```

Disconnection detection is cooperative and may arrive late. Cancellation does not undo committed effects. Once a command reaches a consistency-critical commit point, completing safely may be better than aborting halfway.

Do not automatically turn every `OperationCanceledException` into 500 or log it as an unexpected failure. Distinguish request-aborted cancellation from internal timeout and host shutdown.

Work that must outlive a request belongs in a supervised/durable background queue with its own scope and cancellation/lifetime—not a discarded task capturing request services.

## Error handling cannot rewrite a started response

Streaming, file responses, and early body writes start the response. If a later exception occurs, global middleware may log/abort but cannot reliably send a clean Problem Details document.

Check:

```csharp
context.Response.HasStarted
```

Design streaming protocols to report partial failure appropriately, validate before starting, and ensure clients handle truncated streams. Do not attempt to clear/replace headers after they are sent.

## A reliable integration-test matrix

For each important endpoint, test:

- correct method/path and wrong method/path,
- malformed route/query/body/content type,
- missing and boundary values,
- anonymous, forbidden, wrong tenant/resource owner, allowed,
- expected not-found/conflict/concurrency outcomes,
- cancellation/timeout where feasible,
- direct and reverse-proxy scheme/host/path base,
- exact status, headers, content type, and safe body,
- Development-safe diagnostics versus Production-safe errors.

This catches framework-boundary bugs that unit-testing only the application service cannot detect.

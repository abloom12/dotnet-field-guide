---
title: Authentication, Authorization, and Security
description: Identify callers, enforce policies, configure browser/API protections, and handle secrets safely.
sidebar:
  order: 7
---

Authentication establishes an identity. Authorization decides whether that identity may perform a specific operation. Secure applications also require HTTPS, trusted proxy configuration, input/output safety, CSRF/CORS policy, secret management, patching, and server-side enforcement.

## Quick reference

### Authentication versus authorization

```text
Request credentials
  → authentication scheme validates credentials
  → ClaimsPrincipal assigned to HttpContext.User
  → authorization evaluates endpoint policy/resource
  → success OR challenge (usually 401) OR forbid (usually 403)
```

| Result | Meaning |
| --- | --- |
| Challenge / 401 | Caller is not acceptably authenticated; scheme may redirect in UI flows |
| Forbid / 403 | Caller is authenticated but lacks permission |
| Allow | Policy requirements succeeded; application must still enforce resource invariants |

### Baseline configuration

```csharp
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = "Bearer";
        options.DefaultChallengeScheme = "Bearer";
    })
    .AddJwtBearer("Bearer", options =>
    {
        options.Authority = builder.Configuration["Authentication:Authority"];
        options.Audience = "orders-api";
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanReadOrders", policy =>
        policy.RequireClaim("permission", "orders.read"));
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/orders", GetOrders)
    .RequireAuthorization("CanReadOrders");
```

Validate issuer, audience, signature, lifetime, and scheme options according to the trusted identity provider. The abbreviated sample is not a complete production configuration.

### Endpoint protection

```csharp
app.MapGroup("/api")
    .RequireAuthorization();

app.MapGet("/public", PublicHandler)
    .AllowAnonymous();
```

```csharp
[Authorize(Policy = "CanReadOrders")]
public sealed class OrdersController : ControllerBase { }

[AllowAnonymous]
[HttpGet("public-summary")]
public IActionResult PublicSummary() => Ok();
```

Make protection the default for sensitive groups/controllers and mark public exceptions explicitly.

### Security reminders

- UI visibility is not authorization; enforce policy on the server operation.
- CORS is a browser cross-origin policy, not authentication or API protection.
- Cookie-authenticated state-changing requests need antiforgery/CSRF protection.
- Bearer tokens must be validated by authentication middleware, not manually decoded and trusted.
- Trust forwarded headers only from configured proxies/networks.
- Use HTTPS and secure cookies; never log credentials/tokens.
- Keep production secrets in an approved secret store or deployment mechanism.

## Authentication and authorization

Authentication answers **who is making this request?** It produces a `ClaimsPrincipal`, often with one or more identities. Anonymous requests still have a principal whose identity is not authenticated.

Authorization answers **may this principal perform this operation?** It evaluates requirements using identity claims, endpoint metadata, and sometimes a resource loaded by the application.

Authentication success does not imply access. Authorization success at a broad endpoint may not prove ownership of one entity. For example, “can view orders” and “may view order 123 for tenant A” can require both endpoint policy and resource-level authorization/application checks.

Never trust user IDs, roles, prices, tenant IDs, or permission flags supplied in a request body merely because a caller is authenticated. Derive security context from validated identity and server data.

## Authentication schemes

A scheme names an authentication handler and options. Handlers can:

- **authenticate** credentials and return a principal,
- **challenge** when authentication is required,
- **forbid** when an authenticated user lacks access,
- sometimes sign in/sign out (for example cookies).

Applications may have multiple schemes:

```csharp
builder.Services.AddAuthentication()
    .AddCookie("WebCookie", options => { ... })
    .AddJwtBearer("ApiBearer", options => { ... });
```

Set defaults or name a scheme in policy/attribute when the application cannot infer one:

```csharp
[Authorize(AuthenticationSchemes = "ApiBearer")]
```

Policy schemes can forward dynamically, but complex multi-scheme setups need careful tests for challenge/forbid behavior. Avoid accepting credentials from an unintended scheme.

Authentication service registration and authentication middleware are both required in normal explicit pipelines:

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

Authentication must run before authorization.

## Cookie authentication

Cookie authentication stores an encrypted/signed authentication ticket in a browser cookie. After sign-in, the browser automatically sends that cookie according to domain/path/SameSite/Secure rules.

```csharp
builder.Services.AddAuthentication("AppCookie")
    .AddCookie("AppCookie", options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.LoginPath = "/account/login";
        options.AccessDeniedPath = "/account/denied";
    });
```

Choose SameSite and cross-site flows based on actual login/integration behavior; stricter is not automatically compatible with external identity redirects.

Cookie tickets rely on ASP.NET Core Data Protection keys. In multi-instance or replaceable deployments, share/persist/protect keys appropriately or users may be signed out and antiforgery/decryption may fail.

Cookies are automatically attached by browsers, so state-changing requests need antiforgery protection. Secure cookie flags reduce risk but do not eliminate XSS, session theft, fixation, or authorization flaws.

Cookie redirects are often appropriate for browser pages but APIs generally need 401/403 responses rather than HTML login pages. Configure behavior according to endpoints/framework version.

## Bearer tokens

A bearer token is sent explicitly, commonly:

```http
Authorization: Bearer eyJ...
```

JWT bearer authentication must validate at least the trusted signature/key, issuer, audience, and lifetime according to system design. Use supported middleware and identity-provider metadata:

```csharp
.AddJwtBearer(options =>
{
    options.Authority = "https://identity.example.com";
    options.Audience = "orders-api";
});
```

Decoding a JWT only reads its contents; it does not validate authenticity. Never authorize using manually base64-decoded claims.

Bearer means possession grants use. Protect tokens in transit/storage/logging, keep lifetimes/scopes constrained, and use standards-based OAuth 2.0/OpenID Connect flows appropriate to the client. Do not invent token formats or password exchange flows.

Browser token storage is security-sensitive. Avoid exposing long-lived tokens to JavaScript when a secure HTTP-only cookie/backend-for-frontend design is more appropriate. Assess XSS, CSRF, refresh, logout, and multi-tab behavior together.

## Claims and roles

Claims are issuer-provided statements:

```csharp
string? subject = User.FindFirstValue(ClaimTypes.NameIdentifier);
string? tenantId = User.FindFirstValue("tenant_id");
```

A claim has type, value, issuer, and other metadata. Trust only claims from an authenticated identity and configured issuer. Claim type mapping can change names; inspect actual validated principals in a safe development environment.

Roles are claims interpreted through role conventions:

```csharp
policy.RequireRole("Administrator");
```

Role names can become coarse and proliferate. Permission/requirement-based policies often express application capability more clearly:

```csharp
policy.RequireClaim("permission", "orders.approve");
```

Claims can become stale until credentials refresh. Critical current-state checks may require server data in an authorization handler/application operation.

Do not log complete claim sets; they can contain personal/sensitive data.

## Policy-based authorization

Define named policies:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanApproveOrders", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("permission", "orders.approve");
    });
});
```

Apply:

```csharp
app.MapPost("/orders/{id:guid}/approve", Approve)
    .RequireAuthorization("CanApproveOrders");
```

Custom requirements and handlers support richer rules:

```csharp
public sealed record MinimumAccountAgeRequirement(TimeSpan Age)
    : IAuthorizationRequirement;
```

An authorization handler evaluates requirements, optionally using `AuthorizationHandlerContext.Resource`. Resource type depends on where authorization occurs; endpoint filters/controllers/application services may choose a more explicit resource check.

Use `IAuthorizationService` for imperative/resource authorization:

```csharp
AuthorizationResult allowed = await authorization.AuthorizeAsync(
    User, order, "CanEditOrder");
```

Centralize policies rather than scattering raw claim-string checks through handlers.

## Protecting endpoints

Minimal APIs:

```csharp
RouteGroupBuilder admin = app.MapGroup("/admin")
    .RequireAuthorization("Administrators");
```

Controllers:

```csharp
[Authorize]
public sealed class AccountController : ControllerBase
```

A fallback policy can require authenticated users by default, with explicit `.AllowAnonymous()`/`[AllowAnonymous]` exceptions. This reduces accidental public endpoints but must be tested across all endpoint types, static files, health checks, hubs, and framework routes.

Authorization metadata does not apply to files served earlier by static-file middleware. Store private files outside public web root and serve them through an authorized endpoint or appropriate secured storage.

Test at least anonymous, wrong identity/tenant, insufficient permission, and allowed cases. Test actual challenge/forbid status/redirect behavior.

## Accessing the current user

Endpoint/controller code can access:

```csharp
HttpContext.User
User
ClaimsPrincipal user
```

Minimal APIs can bind `ClaimsPrincipal` directly. Prefer extracting a validated application identity at the web boundary:

```csharp
string userId = user.FindFirstValue(ClaimTypes.NameIdentifier)
    ?? throw new InvalidOperationException("Authenticated subject claim is missing.");
```

Pass an application-specific caller context or ID to use cases rather than making domain code depend on `HttpContext`.

`IHttpContextAccessor` is available for HTTP-coupled services but should not be retained/captured for background work. `HttpContext` is request-bound and not safe for arbitrary parallel use. Copy needed immutable values while the request is active.

Never use a request-provided user ID as a substitute for the authenticated subject when operating “as the current user.”

## CORS

Cross-Origin Resource Sharing tells browsers whether frontend code from one origin may read/use responses from another origin. An origin is scheme + host + port.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("TrustedFrontend", policy =>
        policy.WithOrigins("https://app.example.com")
            .WithMethods("GET", "POST")
            .WithHeaders("content-type", "authorization"));
});

app.UseCors("TrustedFrontend");
```

CORS does not block curl, servers, mobile apps, or attackers from sending requests. It is not authorization, authentication, CSRF protection, or a firewall.

Avoid `AllowAnyOrigin` for credentialed/sensitive APIs. Browsers do not permit wildcard origin with credential allowance; enumerate trusted origins. Validate origin configuration and handle preflight (`OPTIONS`) through correct middleware order.

Same-origin calls need no CORS grant. Enabling overly broad CORS “to fix a browser error” can expose data to malicious origins.

## CSRF and antiforgery

Cross-site request forgery exploits credentials the browser attaches automatically, especially cookies, to submit a state-changing request from another site.

Defenses include:

- antiforgery tokens validated on unsafe form requests,
- appropriate SameSite cookie policy,
- requiring a non-simple custom header/token for APIs where architecture supports it,
- checking origin/referer only as defense-in-depth where appropriate,
- never changing state with GET.

ASP.NET Core forms/Razor components/controllers provide antiforgery integration according to application model. Minimal form/file endpoints may have antiforgery metadata enabled by framework conventions and require antiforgery middleware/services. Follow current framework setup rather than disabling checks globally.

Bearer tokens sent explicitly in an `Authorization` header are generally not automatically attached cross-site like cookies, reducing classic CSRF exposure, but browser token/cookie designs can reintroduce it.

Antiforgery does not prevent XSS. XSS can act as the user and often obtain tokens/data; output encoding and content-security practices remain essential.

## HTTPS and secure configuration

Use HTTPS for credentials, cookies, personal data, and ordinary production traffic. Common setup:

```csharp
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();
```

When TLS terminates at a reverse proxy, configure trusted forwarded headers before HTTPS redirects/authentication/link generation. Otherwise the app may see HTTP and loop redirects or generate wrong callback URLs.

HSTS tells browsers to use HTTPS for future requests; configure preload/subdomain policy only with operational understanding. Local development uses developer certificates/tooling rather than production keys.

Also configure:

- secure/HTTP-only/SameSite cookies,
- host/proxy restrictions,
- request/body/header limits,
- safe error handling,
- security headers/content policy appropriate to the UI,
- supported framework/package patches,
- least-privilege process, filesystem, database, and network access.

Environment name alone is not a security control.

## Secrets

Never commit:

- passwords or connection-string credentials,
- API keys and bearer tokens,
- private keys/certificates,
- production Data Protection key material,
- client secrets,
- sensitive test/customer data.

Local development can use .NET user secrets:

```bash
dotnet user-secrets init
dotnet user-secrets set "Orders:ApiKey" "..."
```

User secrets are convenience storage, not an encrypted production vault. Production should use the organization’s approved secret manager, workload identity, protected environment injection, or mounted secret mechanism.

Access secrets through configuration/options without logging them. Rotate and revoke exposed values; deleting a secret from the latest commit does not remove repository history.

Never send server secrets to Blazor WebAssembly or any browser client. Anything downloaded to a client is observable.

## Security review checklist

For each endpoint, verify:

1. Is it intentionally public or explicitly authorized?
2. Which authentication scheme and issuer are trusted?
3. Are tenant/resource ownership checks enforced server-side?
4. Are request shape, size, content type, and values constrained?
5. Is CSRF relevant to the credential transport?
6. Does CORS allow only required browser origins/methods/headers?
7. Are responses/errors/logs free of sensitive details?
8. Are redirects and generated links correct behind the production proxy?
9. Are rate/abuse limits and idempotency needed?
10. Are framework, packages, OS/base images, and keys patched/rotated?

Security is a system property. Middleware and attributes help enforce policy but do not replace threat modeling and operational controls.

---
title: Exceptions and Resource Management
description: Handle exceptional failures and reliably clean up resources.
sidebar:
  order: 11
---

Exceptions interrupt normal control flow when an operation cannot complete. Disposal releases scarce or externally managed resources promptly; garbage collection alone does not provide that guarantee.

## Quick reference

### Exception handling pattern

```csharp
try
{
    await SaveAsync(cancellationToken);
}
catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
{
    throw; // preserve cancellation and original stack trace
}
catch (IOException exception)
{
    _logger.LogError(exception, "Could not save the file");
    throw;
}
finally
{
    _metrics.RecordAttempt();
}
```

### Disposal patterns

```csharp
// Dispose at the end of the current scope.
using var stream = File.OpenRead(path);
using var reader = new StreamReader(stream);
string text = reader.ReadToEnd();

// Async disposal.
await using var resource = await OpenAsync(cancellationToken);
await resource.ProcessAsync(cancellationToken);
```

### Decision guide

| Situation | Preferred approach |
| --- | --- |
| Caller supplied an invalid argument | Throw `ArgumentException` or a more specific subtype |
| A required lookup unexpectedly fails | Throw an exception appropriate to the API |
| “Not found” is an ordinary outcome | Return `null`, `bool` + `out`, or a result type |
| Need to add context and cannot recover | Log at the responsible boundary or wrap carefully, then rethrow |
| Need guaranteed cleanup | `finally`, normally via `using`/`await using` |
| Catch and preserve the same failure | `throw;`, never `throw exception;` |
| Handle only selected failures | Catch a specific type, optionally with `when` |

### Rules to keep

- Throw exceptions for failures, not routine branching.
- Catch only failures you can recover from, translate, or responsibly report.
- Never leave a catch block empty.
- Preserve the original exception as `InnerException` when wrapping.
- Dispose every resource you own, including on exceptional paths.
- Do not dispose dependencies whose lifetime is owned by a caller or container.
- Avoid returning deferred work that depends on an already-disposed resource.

## Throwing exceptions

Use `throw` when a method cannot fulfill its contract:

```csharp
public void SetPercentage(int value)
{
    if (value is < 0 or > 100)
        throw new ArgumentOutOfRangeException(nameof(value), value, "Must be from 0 to 100.");

    Percentage = value;
}
```

Common standard exceptions include:

| Exception | Typical meaning |
| --- | --- |
| `ArgumentNullException` | A required argument is null |
| `ArgumentException` | An argument is invalid in some other way |
| `ArgumentOutOfRangeException` | A numeric/index/range argument is outside allowed bounds |
| `InvalidOperationException` | Current object state does not permit the operation |
| `ObjectDisposedException` | A disposed object was used |
| `NotSupportedException` | The requested operation is intentionally unsupported |
| `KeyNotFoundException` | A required key is absent |

Use framework throw helpers where clear:

```csharp
ArgumentNullException.ThrowIfNull(order);
ArgumentException.ThrowIfNullOrWhiteSpace(name);
ArgumentOutOfRangeException.ThrowIfNegative(quantity);
```

An exception message should explain the violated expectation and useful context without exposing secrets or sensitive data. Do not catch an exception merely to replace it with a less specific message.

A throw expression fits value-producing contexts:

```csharp
_name = name ?? throw new ArgumentNullException(nameof(name));
```

## Catching specific exception types

Catch from most specific to least specific:

```csharp
try
{
    await ImportAsync(path, cancellationToken);
}
catch (FileNotFoundException exception)
{
    ReportMissingFile(exception.FileName);
}
catch (IOException exception)
{
    ReportStorageFailure(exception);
}
```

A base catch before a derived catch would make the derived one unreachable. Catching `Exception` is appropriate at carefully chosen application boundaries—such as a request exception handler, message processor, or process supervisor—where the code logs, translates, and contains a failure. It is usually too broad inside ordinary business logic.

Avoid catching `SystemException` or filtering by exception message. Messages are not stable machine-readable contracts.

## `try`, `catch`, and `finally`

A `try` block must be followed by at least one `catch` or `finally`:

```csharp
try
{
    UseResource();
}
catch (SpecificException exception)
{
    Recover(exception);
}
finally
{
    Cleanup();
}
```

- `catch` runs when a compatible exception leaves the try block.
- `finally` runs when control leaves the try block, whether by success, exception, `return`, `break`, or `continue`.

A `finally` may not execute under abrupt process termination, fail-fast behavior, or power loss, so it is deterministic language-level cleanup—not a durability guarantee.

Avoid throwing from `finally`; it can hide the original exception. Cleanup APIs should be designed to minimize ambiguous double failures, and callers should decide which failure to preserve.

## Exception filters

A `when` filter handles an exception only when its condition is true:

```csharp
catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
{
    return null;
}
```

If the filter is false, exception search continues without entering that catch block. Filters are preferable to catching and then rethrowing for selection because the runtime preserves the original exception state during filter evaluation.

Use filters for stable properties such as status codes, error codes, or a specific cancellation token—not localized message text. Keep filter expressions side-effect-free and safe; a filter that throws is treated as false.

## Rethrowing and preserving stack traces

Inside a catch block:

```csharp
catch (IOException exception)
{
    Log(exception);
    throw;
}
```

`throw;` rethrows the active exception while preserving its original stack trace. This form resets it and should be avoided:

```csharp
throw exception; // loses the original throw location from the visible stack
```

When translating abstraction boundaries, wrap with the original exception:

```csharp
catch (SqlException exception)
{
    throw new OrderStoreException("Could not save the order.", exception);
}
```

Wrapping every layer produces noisy exception chains. Translate only when the new exception creates a meaningful contract, hides an implementation detail, or adds actionable context. `ExceptionDispatchInfo` exists for advanced cases that must capture and rethrow an exception later while preserving its stack.

## Custom exception types

A custom exception is useful when callers need to distinguish a failure category in code:

```csharp
public sealed class OrderStoreException : Exception
{
    public OrderStoreException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
```

Follow the `Exception` suffix convention and derive from `Exception` or a fitting existing subtype. Include constructors/properties that callers genuinely need. Preserve inner exceptions.

Do not create custom exceptions only to restate a message or represent routine validation outcomes. If consumers should branch frequently on a status, a result type or explicit value is usually a better contract.

## Expected versus exceptional failures

Whether something is exceptional depends on the API contract and context:

- `Dictionary` missing an optional key: use `TryGetValue`.
- Parsing user input: often use `TryParse`.
- Repository lookup where absence is valid: return `T?` or an explicit result.
- Required configuration missing at startup: throwing can be appropriate.
- Network, disk, or database failure: generally exceptional at the operation level, though a resilience policy may retry selected transient failures.

Exceptions are relatively expensive and create non-local control flow. Do not use them as a normal success/failure protocol in a hot path. Conversely, do not hide genuine infrastructure or invariant failures in a generic `false` that loses diagnostic context.

Use [Result Pattern](/application-design/result-pattern/) for a higher-level approach to explicit expected outcomes.

## `IDisposable`

`IDisposable` represents synchronous cleanup:

```csharp
public interface IDisposable
{
    void Dispose();
}
```

Objects may own file handles, sockets, database resources, unmanaged memory, timers, subscriptions, or other lifetime-sensitive state. Call `Dispose` once ownership ends.

If a class owns disposable fields, it normally implements `IDisposable` and disposes them:

```csharp
public sealed class ReportWriter : IDisposable
{
    private readonly StreamWriter _writer;
    private bool _disposed;

    public ReportWriter(Stream stream)
    {
        _writer = new StreamWriter(stream);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _writer.Dispose();
        _disposed = true;
    }
}
```

The full dispose pattern is more involved for inheritable types or direct unmanaged-resource ownership. Prefer sealing resource-owning classes and composing existing safe-handle types. Do not add a finalizer unless the type directly owns unmanaged resources and truly requires one.

Ownership matters: a type should dispose what it creates or is explicitly given ownership of, not borrowed dependencies by default.

## `IAsyncDisposable`

`IAsyncDisposable` supports cleanup that itself requires asynchronous work:

```csharp
public interface IAsyncDisposable
{
    ValueTask DisposeAsync();
}
```

Use it for flushing asynchronous buffers, ending remote sessions, or releasing resources through async APIs. Some types implement both synchronous and asynchronous disposal; choose the form matching how the resource was used and what cleanup guarantees are needed.

Implementations must define repeat-disposal and partial-initialization behavior carefully. Consumers should not invoke both `Dispose` and `DisposeAsync` unless the type explicitly documents that pattern.

## `using` statements and declarations

A using statement limits disposal to a block:

```csharp
using (var stream = File.OpenRead(path))
{
    Process(stream);
}
```

A using declaration disposes at the end of the current scope:

```csharp
using var stream = File.OpenRead(path);
Process(stream);
// disposed when the containing scope exits
```

Multiple using declarations are disposed in reverse declaration order:

```csharp
using var stream = File.OpenRead(path);
using var reader = new StreamReader(stream);
```

`reader` is disposed before `stream`, matching nested ownership. A `using` variable cannot be reassigned. If resource construction fails, only successfully created prior resources are disposed.

## `await using`

Use `await using` for `IAsyncDisposable`:

```csharp
await using var transaction = await database.BeginTransactionAsync(cancellationToken);
await SaveAsync(cancellationToken);
await transaction.CommitAsync(cancellationToken);
```

The containing method must support `await`. Async disposal is awaited when the scope exits, including exceptional exits.

Do not use ordinary `using` when required cleanup is only available asynchronously. Conversely, do not add asynchronous disposal where cleanup is entirely synchronous.

## How `using` relates to `try`/`finally`

Conceptually:

```csharp
using (var resource = CreateResource())
{
    Use(resource);
}
```

behaves like:

```csharp
var resource = CreateResource();
try
{
    Use(resource);
}
finally
{
    resource?.Dispose();
}
```

The actual language lowering accounts for the resource’s type and details. The important guarantee is that disposal occurs when control exits the scope, even due to an exception or early return.

Use explicit `try`/`finally` when cleanup is not represented by `IDisposable`, or when more control is required. Prefer `using` for disposable ownership because it states intent directly and is harder to get wrong.

## Garbage collection is not disposal

The garbage collector reclaims managed memory after objects become unreachable. It does not promise **when** collection occurs. A scarce operating-system handle, open file, pooled connection, lock lease, or subscription can remain active long after the last useful reference disappears.

Finalizers, when present, run nondeterministically and add collection overhead. They are a safety net for certain unmanaged resources, not the normal cleanup path.

Use disposal for deterministic lifetime. Use garbage collection for memory management. They solve related but different problems.

## Avoid swallowed and overly broad catches

This destroys evidence and lets execution continue in an unknown state:

```csharp
try
{
    Save();
}
catch
{
}
```

Also avoid broad catches that turn all failures—including programmer bugs and cancellation—into a misleading default result:

```csharp
catch (Exception)
{
    return null;
}
```

A good catch block does at least one justified thing:

- recovers using a defined fallback,
- translates the failure at an abstraction boundary,
- adds context and rethrows,
- performs compensating action,
- or records an unhandled failure at an application boundary.

Log an exception once at the boundary responsible for it rather than at every layer. Never include credentials, tokens, or sensitive payloads in exception messages or logs.

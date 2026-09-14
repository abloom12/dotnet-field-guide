---
title: Async and Cancellation
description: Use tasks, async methods, and cooperative cancellation without blocking threads.
sidebar:
  order: 10
---

C# uses tasks with `async` and `await` to express operations that may complete later. Cancellation is cooperative: a caller requests it, and each operation decides how and when to stop.

## Quick reference

### Standard async method

```csharp
public async Task<Order> LoadOrderAsync(
    Guid id,
    CancellationToken cancellationToken = default)
{
    Order? order = await _repository.FindAsync(id, cancellationToken);
    return order ?? throw new KeyNotFoundException($"Order {id} was not found.");
}
```

### Return types

| Return type | Meaning |
| --- | --- |
| `Task` | Operation completes later; no result value |
| `Task<T>` | Operation completes later with a `T` result |
| `IAsyncEnumerable<T>` | Values arrive asynchronously over time |
| `ValueTask<T>` | Specialized potentially allocation-saving awaitable; use only with evidence |
| `void` | Synchronous no-result method; `async void` is mainly for event handlers |

### Core rules

- Await asynchronous work instead of calling `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()`.
- Return the task when no additional async work is needed; otherwise use `async`/`await`.
- Name task-returning methods with an `Async` suffix by convention.
- Pass a caller’s `CancellationToken` through every cancellable async call.
- Treat cancellation as a request, not a forced thread termination.
- Start independent operations before awaiting `Task.WhenAll`.
- Observe every task’s completion and exceptions; avoid fire-and-forget work.
- Avoid `async void` except event-handler signatures that require it.

### Concurrency pattern

```csharp
Task<Customer> customerTask = LoadCustomerAsync(id, cancellationToken);
Task<IReadOnlyList<Order>> ordersTask = LoadOrdersAsync(id, cancellationToken);

await Task.WhenAll(customerTask, ordersTask);

Customer customer = await customerTask;
IReadOnlyList<Order> orders = await ordersTask;
```

### Cancellation pattern

```csharp
public async Task ProcessAsync(CancellationToken cancellationToken)
{
    cancellationToken.ThrowIfCancellationRequested();
    await LoadAsync(cancellationToken);

    foreach (var item in _items)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Process(item);
    }
}
```

## `Task` and `Task<T>`

A `Task` represents eventual completion. It can complete successfully, fault with an exception, or be canceled. `Task<T>` additionally produces a result.

```csharp
Task saveTask = SaveAsync();
Task<Order> orderTask = FindOrderAsync(id);
```

A task is not necessarily a dedicated thread. I/O-based tasks normally represent waiting handled by the operating system or runtime, while CPU-bound parallel work may use thread-pool threads. Calling an async method usually begins executing it synchronously until it reaches an incomplete await.

`Task.CompletedTask` represents successful no-result completion. `Task.FromResult(value)`, `Task.FromException(...)`, and `Task.FromCanceled(...)` create already-completed tasks, though an `async` method often reads more naturally.

A task should be observed by awaiting it, returning it, or intentionally supervising it. Ignoring a task loses reliable completion and exception handling.

## `async` and `await`

`async` permits `await` in a method and enables the compiler to transform it into a state machine. `await` asynchronously waits for completion, then resumes the method:

```csharp
public async Task<string> DownloadTextAsync(
    Uri uri,
    CancellationToken cancellationToken)
{
    string text = await _httpClient.GetStringAsync(uri, cancellationToken);
    return text.Trim();
}
```

Awaiting an incomplete task normally returns control to the caller rather than blocking the current thread. When the task completes, continuation behavior depends on the application environment and awaitable.

`async` does not automatically run code in parallel or on a background thread. CPU-heavy work remains CPU-heavy. Server code should not wrap naturally synchronous work in `Task.Run` merely to appear asynchronous.

## Async signatures and naming

Common signatures are:

```csharp
Task SaveAsync(CancellationToken cancellationToken);
Task<Order?> FindAsync(Guid id, CancellationToken cancellationToken);
IAsyncEnumerable<Order> StreamAsync(CancellationToken cancellationToken);
```

The `Async` suffix distinguishes asynchronous methods and is standard throughout .NET. Event handlers are a conventional exception because their names describe the event.

Place `CancellationToken` last unless an established API convention requires otherwise. An optional `= default` token is convenient at public entry points, but internal methods can require the token to make propagation harder to forget.

Avoid “fake async” wrappers that use `async` but never await. A method can directly return an existing task:

```csharp
public Task<Order?> FindAsync(Guid id, CancellationToken cancellationToken) =>
    _repository.FindAsync(id, cancellationToken);
```

Use `async`/`await` when you need additional asynchronous control flow, `try`/`catch`, `using`, result transformation, or clearer stack behavior.

## Returning and composing tasks

Async composition means building larger operations from smaller task-returning methods:

```csharp
public async Task SubmitAsync(Order order, CancellationToken cancellationToken)
{
    await ValidateAsync(order, cancellationToken);
    await _store.SaveAsync(order, cancellationToken);
    await _notifications.SendAsync(order, cancellationToken);
}
```

These operations are sequential because each await completes before the next begins. This is correct when later work depends on earlier work.

Return a task directly only when the surrounding method does not need to await it:

```csharp
public Task FlushAsync(CancellationToken cancellationToken) =>
    _writer.FlushAsync(cancellationToken);
```

Be careful returning a task from inside `using`, `try`, or `catch`: without awaiting it there, the scope may end before the operation finishes and exceptions may bypass local handling.

## Concurrent work with `Task.WhenAll`

For independent operations, start them first and await them together:

```csharp
Task<User> userTask = LoadUserAsync(userId, cancellationToken);
Task<Preferences> preferencesTask = LoadPreferencesAsync(userId, cancellationToken);

await Task.WhenAll(userTask, preferencesTask);
return new Profile(await userTask, await preferencesTask);
```

This is concurrency, not necessarily parallel CPU execution. Do not use `WhenAll` when operations share a non-thread-safe dependency, require ordering, or could overwhelm a remote service. Limit concurrency when processing large inputs.

`Task.WhenAll` completes when every supplied task completes. If operations fault, awaiting it throws an exception; all tasks still need consideration when diagnostics for multiple failures matter. If none fault and at least one is canceled, the combined task is canceled.

`Task.WhenAny` completes when one supplied task completes. It returns that task, which must still be awaited to retrieve its result or exception:

```csharp
Task finished = await Task.WhenAny(tasks);
await finished;
```

## Cooperative cancellation

`CancellationTokenSource` owns a cancellation request; consumers receive its token:

```csharp
using var source = new CancellationTokenSource(TimeSpan.FromSeconds(10));
await ProcessAsync(source.Token);
```

An operation cooperates by:

- passing the token to cancellable APIs,
- checking `IsCancellationRequested`,
- calling `ThrowIfCancellationRequested`, or
- registering a callback with `token.Register`.

```csharp
for (int i = 0; i < items.Count; i++)
{
    cancellationToken.ThrowIfCancellationRequested();
    Process(items[i]);
}
```

Throwing `OperationCanceledException` associated with the requested token allows task-based APIs to represent cancellation appropriately. Do not substitute an unrelated exception.

Cancellation does not roll back completed side effects. Define safe cancellation boundaries around transactions, writes, and externally visible operations. After a point of no cancellation, finish restoring consistency even if the request disconnects.

## Passing cancellation through call chains

Propagation should be continuous:

```csharp
public Task<Order?> HandleAsync(Guid id, CancellationToken cancellationToken) =>
    _repository.FindAsync(id, cancellationToken);
```

Do not replace the caller’s token with `CancellationToken.None` unless work intentionally must outlive that caller and has separate ownership. When combining reasons for cancellation, create a linked source:

```csharp
using var linked = CancellationTokenSource.CreateLinkedTokenSource(
    requestToken,
    shutdownToken);

await RunAsync(linked.Token);
```

Dispose cancellation sources and registrations when finished because they can own timers or retain callbacks.

## Exceptions from asynchronous operations

Exceptions thrown before an async method returns a task may be thrown immediately in some non-async task-returning implementations. Exceptions thrown by an `async` method are stored in its returned task and rethrown when awaited:

```csharp
try
{
    await SaveAsync(cancellationToken);
}
catch (IOException exception)
{
    Log(exception);
}
```

`await` preserves natural exception handling and normally throws the underlying exception rather than forcing callers to handle `AggregateException` wrappers associated with some blocking APIs.

Catch `OperationCanceledException` only when you need to translate, log, or recover from cancellation. Avoid logging expected request cancellation as an application failure.

Never silently discard a task. If true background work is required, place it in a supervised queue or hosted service with defined lifetime, error reporting, retries, and shutdown behavior.

## Async streams

`IAsyncEnumerable<T>` represents values produced asynchronously over time:

```csharp
public async IAsyncEnumerable<Order> StreamOrdersAsync(
    [System.Runtime.CompilerServices.EnumeratorCancellation]
    CancellationToken cancellationToken = default)
{
    while (await HasMoreAsync(cancellationToken))
    {
        yield return await ReadNextAsync(cancellationToken);
    }
}
```

Consume it with `await foreach`:

```csharp
await foreach (var order in StreamOrdersAsync(cancellationToken))
{
    Process(order);
}
```

Async streams can begin yielding without loading everything, which helps streaming and memory use. Enumeration is usually deferred; exceptions and resource use occur during iteration. Consumers can apply cancellation with `.WithCancellation(token)` when appropriate.

`EnumeratorCancellation` tells the compiler how a token passed by the consumer should combine with the iterator parameter. Library authors should follow the async-stream cancellation pattern consistently.

## Why `async void` is usually unsafe

An `async void` method gives callers no task to await:

```csharp
// Avoid for ordinary methods.
async void Save()
{
    await SaveCoreAsync();
}
```

The caller cannot observe completion, compose the operation, or catch its later exceptions normally. Exceptions are delivered through the current synchronization context or process-level handling and can terminate the application.

The main valid use is an event handler whose required signature returns `void`:

```csharp
private async void SaveButton_Click(object? sender, EventArgs args)
{
    try
    {
        await SaveAsync();
    }
    catch (Exception exception)
    {
        ShowError(exception);
    }
}
```

Keep such handlers thin and delegate work to task-returning methods.

## Why blocking is risky

These calls synchronously block a thread:

```csharp
var result = GetAsync().Result;
GetAsync().Wait();
```

Blocking can cause deadlocks in environments with a synchronization context, waste request/UI threads, reduce scalability, and wrap exceptions differently. Prefer “async all the way” from the entry point to the I/O operation:

```csharp
var result = await GetAsync();
```

Some application boundaries are necessarily synchronous, but blocking should be a deliberate, environment-aware exception—not a shortcut.

## `ValueTask<T>`

`ValueTask<T>` is an awaitable that can sometimes avoid allocating a `Task<T>` when operations frequently complete synchronously. It introduces trade-offs and stricter consumption rules:

```csharp
ValueTask<int> ReadAsync(CancellationToken cancellationToken);
```

A `ValueTask<T>` should generally be awaited directly once. Repeated awaits, multiple consumers, or advanced combinators may require `.AsTask()`, losing the benefit. The type is larger and can increase copying/state-machine costs.

Default to `Task`/`Task<T>`. Use `ValueTask<T>` primarily when implementing a performance-sensitive API, synchronous completion is common, and measurement shows task allocation is significant. Recognize and correctly await framework APIs that already return it; do not introduce it speculatively.

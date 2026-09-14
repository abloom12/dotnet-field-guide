---
title: Delegates, Lambdas, and Events
description: Understand C# function values, inline functions, callbacks, and event notifications.
sidebar:
  order: 7
---

Delegates are type-safe references to behavior. Lambdas create behavior inline. Events expose delegates through a restricted publish/subscribe interface.

## Quick reference

### The three concepts

```csharp
// Named delegate type
public delegate decimal PriceRule(decimal subtotal);

PriceRule discount = subtotal => subtotal * 0.9m; // lambda
var total = discount(100m);                        // invocation

// Built-in delegate types
Action<string> log = Console.WriteLine;             // no return value
Func<int, int, int> add = (left, right) => left + right;
Predicate<string> hasText = text => text.Length > 0;
```

### Lambda syntax

```csharp
x => x * 2                         // one parameter, expression body
(x, y) => x + y                    // multiple parameters
(string text) => text.Length       // explicit parameter type
value => { Log(value); return value.Length; } // statement body
() => DateTimeOffset.UtcNow        // no parameters
```

### Events

```csharp
public sealed class Download
{
    public event EventHandler<ProgressEventArgs>? ProgressChanged;

    private void Report(int percent) =>
        ProgressChanged?.Invoke(this, new ProgressEventArgs(percent));
}

download.ProgressChanged += HandleProgress; // subscribe
download.ProgressChanged -= HandleProgress; // unsubscribe
```

Only the declaring type can normally raise or replace the event. Subscribers can add and remove handlers.

### Built-in delegate selection

| Type | Signature |
| --- | --- |
| `Action` | `void ()` |
| `Action<T>` | `void (T value)` |
| `Func<TResult>` | `TResult ()` |
| `Func<T, TResult>` | `TResult (T value)` |
| `Func<T1, T2, TResult>` | `TResult (T1 first, T2 second)` |
| `Predicate<T>` | `bool (T value)` |
| `EventHandler` | `void (object? sender, EventArgs args)` |
| `EventHandler<TEventArgs>` | `void (object? sender, TEventArgs args)` |

## Delegates as function references

A delegate type defines a method signature. Compatible static methods, instance methods, lambdas, and anonymous methods can become delegate values:

```csharp
public delegate bool OrderFilter(Order order);

static bool IsOpen(Order order) => order.Status == OrderStatus.Open;

OrderFilter filter = IsOpen;
bool matches = filter(order);
```

Delegates are reference types. A delegate value contains both the method to call and, for an instance method, the target object. This makes callbacks type-safe: parameter and return types are checked at compile time.

Named delegates are useful when the callback is a meaningful public concept or needs custom parameter variance. For local and general-purpose APIs, `Action` and `Func` are usually enough.

## Declaring and invoking delegates

Declare a custom delegate at namespace or type scope:

```csharp
public delegate Task MessageHandler(
    Message message,
    CancellationToken cancellationToken);
```

Assign and invoke it like a method:

```csharp
MessageHandler handler = HandleMessageAsync;
await handler(message, cancellationToken);
// Equivalent explicit form: await handler.Invoke(message, cancellationToken);
```

A nullable delegate should be checked or null-conditionally invoked:

```csharp
Action<string>? logger = GetLogger();
logger?.Invoke("Started");
```

Delegates can be combined with `+`/`+=` into a multicast invocation list and removed with `-`/`-=`. Each target runs in order. For non-void multicast delegates, only the final return value is directly available; this is one reason notification delegates generally return `void`.

If one handler throws, later handlers are not automatically invoked. Handle isolation deliberately when a publisher requires it.

## Lambda expressions

A lambda is an anonymous function convertible to a compatible delegate or expression-tree type:

```csharp
Func<int, bool> isEven = number => number % 2 == 0;
```

The target type usually supplies parameter and return types. Parentheses are optional for one implicitly typed parameter and required for zero or multiple parameters.

An expression lambda returns its expression result:

```csharp
Func<decimal, decimal> addTax = subtotal => subtotal * 1.2m;
```

A statement lambda uses a block and explicit `return` when the delegate returns a value:

```csharp
Func<string, int> parseLength = text =>
{
    ArgumentNullException.ThrowIfNull(text);
    return text.Trim().Length;
};
```

Lambdas can be `async`:

```csharp
Func<CancellationToken, Task<Order>> load = async token =>
{
    await Task.Delay(100, token);
    return new Order();
};
```

Avoid assigning an async lambda to `Action`; that creates `async void` behavior. Use `Func<Task>` or `Func<T, Task>` so completion and exceptions are observable.

## `Action`, `Func`, and `Predicate`

Use `Action` when no value is returned:

```csharp
Action<Order> submit = order => order.Submit();
```

Use `Func` when a value is returned. The final generic argument is always the result type:

```csharp
Func<Order, decimal> getTotal = order => order.Total;
Func<decimal, decimal, decimal> add = (a, b) => a + b;
```

`Predicate<T>` specifically represents `bool (T)` and appears in APIs such as `List<T>.Find`. LINQ typically uses `Func<T, bool>` instead.

Use a named delegate when the role deserves a domain-specific name, requires `ref`/`out` parameters, has many generic arguments that become unreadable, or forms part of a public API where the name adds meaning.

## Method groups

A method name without invocation parentheses can be converted to a compatible delegate. This is a method-group conversion:

```csharp
static string Normalize(string value) => value.Trim().ToUpperInvariant();

Func<string, string> normalizer = Normalize;
var normalized = names.Select(Normalize);
```

The compiler selects a compatible overload based on the target delegate. A lambda is useful when arguments must be adapted:

```csharp
var results = names.Select(name => Normalize(name));
```

Method groups are concise; lambdas are often clearer when overload resolution is ambiguous or when additional behavior is needed.

## Captured variables and closures

A lambda can capture variables from its surrounding scope:

```csharp
int threshold = 10;
Func<int, bool> isLarge = value => value > threshold;

threshold = 20;
Console.WriteLine(isLarge(15)); // false; the variable, not its old value, is captured
```

The compiler stores captured state in a generated object whose lifetime may extend beyond the original method call. Consequences include:

- Captures can allocate and retain referenced objects.
- Mutating a captured variable changes what later calls observe.
- Shared captured state can create race conditions.
- Capturing loop variables deserves attention, especially variables declared outside the loop.

Use a `static` lambda to forbid captures:

```csharp
var lengths = names.Select(static name => name.Length);
```

This documents independence from surrounding state and may avoid an allocation.

## Passing behavior as an argument

Delegates let an algorithm receive a changing policy:

```csharp
public static IEnumerable<Order> FindOrders(
    IEnumerable<Order> orders,
    Func<Order, bool> matches)
{
    foreach (var order in orders)
    {
        if (matches(order))
            yield return order;
    }
}

var large = FindOrders(orders, order => order.Total >= 1_000m);
```

This pattern powers filtering, mapping, retry policies, configuration callbacks, test seams, and middleware pipelines. Prefer a delegate for a small piece of stateless behavior. Prefer an interface when the collaborator has multiple related operations, meaningful state/lifecycle, or needs to be discovered and injected as a service.

## Declaring and publishing events

An event usually follows the .NET event pattern:

```csharp
public sealed class ProgressEventArgs : EventArgs
{
    public ProgressEventArgs(int percent) => Percent = percent;
    public int Percent { get; }
}

public sealed class Worker
{
    public event EventHandler<ProgressEventArgs>? ProgressChanged;

    protected virtual void OnProgressChanged(ProgressEventArgs args)
    {
        ProgressChanged?.Invoke(this, args);
    }
}
```

`sender` identifies the publisher and event args carry data. A protected virtual `On...` method is conventional only when derived types are intentionally allowed to participate; seal the publisher otherwise.

Code outside `Worker` can use `+=` and `-=` but cannot normally invoke the event or replace its entire invocation list. This is the key difference between a public delegate property and a public event.

Events are synchronous by default. `Invoke` calls handlers on the publishing thread. There is no built-in awaiting behavior for `EventHandler`; use an explicitly designed asynchronous notification abstraction when handlers must be awaited.

## Subscribing and unsubscribing

Subscribe with a method group or retained delegate:

```csharp
worker.ProgressChanged += HandleProgress;
worker.ProgressChanged -= HandleProgress;

void HandleProgress(object? sender, ProgressEventArgs args)
{
    Console.WriteLine(args.Percent);
}
```

A publisher holds references to subscribed delegates, which can keep subscriber objects alive. Unsubscribe when the subscriber has a shorter lifetime than the publisher, commonly in `Dispose`, component cleanup, or lifecycle teardown.

An inline lambda is difficult to unsubscribe unless its delegate instance is saved:

```csharp
EventHandler<ProgressEventArgs> handler = (_, args) => Show(args.Percent);
worker.ProgressChanged += handler;
worker.ProgressChanged -= handler;
```

Repeating identical lambda text creates a different delegate and generally will not remove the original subscription.

## Delegates in LINQ and .NET APIs

LINQ methods receive delegates describing operations:

```csharp
var labels = orders
    .Where(order => order.IsOpen)       // Func<Order, bool>
    .OrderBy(order => order.CreatedAt)  // Func<Order, DateTimeOffset>
    .Select(order => order.Number);     // Func<Order, string>
```

Other common appearances include:

- `List<T>.Sort(Comparison<T>)`
- `Task.Run(Func<Task>)`
- ASP.NET Core endpoint handlers and middleware
- dependency-injection registration callbacks
- timers and UI event handlers
- `CancellationToken.Register(Action)`

When reading such APIs, identify the expected delegate’s input parameters, return type, sync/async behavior, exception behavior, and whether the callback may run more than once or concurrently.

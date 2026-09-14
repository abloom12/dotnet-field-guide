---
title: Methods and Generics
description: Understand method declarations, parameters, overloads, extension methods, and generic code.
sidebar:
  order: 5
---

Methods define named behavior. Generics let methods and types preserve compile-time safety while working with more than one data type.

## Quick reference

### Method anatomy

```csharp
public static async Task<Order?> FindAsync(
    int id,
    CancellationToken cancellationToken = default)
{
    // implementation
}
```

| Part | Meaning |
| --- | --- |
| `public` | Accessibility |
| `static` | Belongs to the type rather than an instance |
| `async` | Body can use `await` |
| `Task<Order?>` | Asynchronously returns an `Order` or `null` |
| `FindAsync` | Method name |
| `int id` | Required parameter |
| `... = default` | Optional parameter and its default value |

### Common method forms

```csharp
void Log(string message) { Console.WriteLine(message); }
int Add(int left, int right) => left + right;
T First<T>(IEnumerable<T> items) => items.First();

Send("hello", urgent: true);         // named argument
Format("value");                     // optional argument omitted
Sum(1, 2, 3);                        // params arguments

bool found = TryFind(id, out var item);
```

### Parameter modifiers

| Syntax | Caller/callee behavior | Typical use |
| --- | --- | --- |
| `T value` | Passed by value | Default; use almost always |
| `params T[] values` | Caller may pass zero or more separate arguments | Convenient variable-length API |
| `ref T value` | Callee can read and replace caller’s variable | Specialized in-place mutation |
| `out T value` | Callee must assign caller’s variable | Try-pattern with an extra result |
| `in T value` | Read-only reference to caller’s value | Avoid copying large structs |

### Generic constraint examples

```csharp
where T : class          // non-nullable reference type
where T : class?         // nullable or non-nullable reference type
where T : struct         // non-nullable value type
where T : notnull        // non-nullable value or reference type
where T : BaseEntity     // derives from BaseEntity
where T : IDisposable    // implements IDisposable
where T : new()          // public parameterless constructor; place last
```

### Extension method shape

```csharp
public static class StringExtensions
{
    public static bool HasText(this string? value) =>
        !string.IsNullOrWhiteSpace(value);
}

if (name.HasText()) { }
```

## Method declarations and returns

A method declaration specifies accessibility and modifiers, return type, name, optional generic parameters, parameters, constraints, and body:

```csharp
public decimal CalculateTotal(int quantity, decimal unitPrice)
{
    return quantity * unitPrice;
}
```

Every reachable path in a value-returning method must return a compatible value or throw. `void` means the call has no result value:

```csharp
public void Clear() => _items.Clear();
```

An asynchronous operation without a result normally returns `Task`, not `void`. Iterator methods can return `IEnumerable<T>` and use `yield return`; async streams return `IAsyncEnumerable<T>`.

Keep a method focused enough that its name describes one operation. Parameters should represent required inputs; avoid boolean “mode” parameters when separate named methods would communicate substantially different behavior better.

## Expression-bodied methods

A single expression may follow `=>`:

```csharp
public decimal CalculateTax(decimal subtotal) => subtotal * _taxRate;
```

This is equivalent to a block with `return`. For a `void` method, the expression must be a permitted statement expression:

```csharp
public void Reset() => _items.Clear();
```

Use a block when multiple steps, conditions, logging, or exception handling would make an expression dense.

## Optional and named arguments

A parameter with a compile-time default value is optional:

```csharp
public string Format(string value, bool uppercase = false, string prefix = "")
```

Callers may omit trailing optional arguments or identify them by name:

```csharp
Format("report");
Format("report", uppercase: true);
Format("report", prefix: "Q1-");
```

Named arguments improve clarity and can skip earlier optional parameters. Positional arguments normally must precede out-of-order named arguments.

Default values are embedded in compiled caller code. Changing a public library’s default may not affect already compiled consumers until they recompile. Avoid optional parameters when versioning or overload behavior would make that surprising.

## `params`, `ref`, `in`, and `out`

### `params`

The final parameter can use `params` so callers pass individual values or an existing compatible collection:

```csharp
public static int Sum(params int[] values) => values.Sum();

Sum();
Sum(1, 2, 3);
Sum(new[] { 1, 2, 3 });
```

Modern C# supports additional valid parameter collection types, depending on language version. Remember that gathering arguments may allocate; accept a sequence directly in performance-sensitive or compositional APIs.

### `ref`

`ref` passes a variable by reference. The caller must initialize it and write `ref` at the call site:

```csharp
static void Swap<T>(ref T left, ref T right) => (left, right) = (right, left);

Swap(ref first, ref second);
```

### `out`

`out` passes a variable for assignment. The method must assign it before returning:

```csharp
if (int.TryParse(text, out int number))
{
    Console.WriteLine(number);
}
```

The `Try...` pattern returns `bool` for success and places the result in an `out` parameter. For richer domain outcomes, a result type may communicate errors more clearly.

### `in`

`in` passes a readonly reference, primarily to avoid copying a large value type:

```csharp
static decimal Length(in LargeVector vector) => vector.Length;
```

It prevents reassignment through that parameter, but does not guarantee deep immutability. For ordinary reference types and small structs, normal by-value parameters are simpler.

## Method overloading

Methods may share a name when their parameter lists differ:

```csharp
void Write(string text) { }
void Write(string text, TextWriter destination) { }
void Write(ReadOnlySpan<char> text) { }
```

The compiler selects the best applicable overload using compile-time argument types and conversion rules. Return type alone cannot distinguish overloads.

Avoid overload sets where `null`, numeric conversions, optional arguments, or generic inference make the selected method unclear. Distinct names are better when operations have different meaning rather than merely different input representations.

## Local functions

A method can declare a named helper inside its body:

```csharp
int Factorial(int value)
{
    ArgumentOutOfRangeException.ThrowIfNegative(value);
    return Calculate(value);

    static int Calculate(int current) =>
        current <= 1 ? 1 : current * Calculate(current - 1);
}
```

Local functions keep implementation details near their use, support recursion, can be generic, and can capture surrounding variables. Mark one `static` when it should not capture state; the compiler then enforces that boundary.

Local functions can also separate eager argument validation from deferred iterator execution.

## Generic types and methods

A generic declaration uses type parameters as placeholders:

```csharp
public sealed class Box<T>
{
    public Box(T value) => Value = value;
    public T Value { get; }
}

var numberBox = new Box<int>(42);
var textBox = new Box<string>("answer");
```

A generic method introduces its own type parameters:

```csharp
public static T Last<T>(IReadOnlyList<T> items) => items[^1];
```

Generics preserve type information and avoid unsafe casts. One implementation can work across many constructed types such as `Box<int>` and `Box<string>`.

Use meaningful parameter names for multiple roles: `TKey`, `TValue`, `TRequest`, and `TResult` communicate more than `T1` and `T2`.

## Generic constraints

Without constraints, generic code can only use operations known to be available on every possible `T`. Constraints establish requirements:

```csharp
public static T Create<T>() where T : IEntity, new()
{
    return new T();
}
```

Multiple constraints can be combined and multiple type parameters constrained:

```csharp
public static TResult Map<TSource, TResult>(TSource source)
    where TSource : notnull
    where TResult : class
```

Constraints affect which type arguments are legal and what operations the implementation may compile. They do not perform arbitrary runtime validation. Prefer the weakest contract that supplies the behavior the algorithm actually needs.

Advanced constraints include `unmanaged`, base/interface combinations, and constraints relating type parameters (`where TDerived : TBase`).

## Common generic types

Generic types are pervasive in the base libraries:

| Type | Role |
| --- | --- |
| `List<T>` | Ordered, mutable sequence |
| `Dictionary<TKey, TValue>` | Key-to-value lookup |
| `HashSet<T>` | Unique values and set operations |
| `IEnumerable<T>` | Sequence that can be enumerated |
| `IReadOnlyList<T>` | Read-only list-shaped contract |
| `Nullable<T>` / `T?` | Optional value type |
| `Task<T>` | Asynchronous operation producing `T` |
| `Func<T, TResult>` | Function receiving `T` and returning a result |

The generic arguments are part of the type: `List<int>` is not interchangeable with `List<string>`.

## Extension methods

An extension method is a static method callable with instance syntax. It must be in a non-nested, non-generic static class, and its first parameter uses `this`:

```csharp
namespace FieldGuide.Text;

public static class TextExtensions
{
    public static string Truncate(this string value, int maximumLength)
    {
        ArgumentNullException.ThrowIfNull(value);
        return value.Length <= maximumLength
            ? value
            : value[..maximumLength];
    }
}
```

After its namespace is in scope:

```csharp
string shortName = longName.Truncate(20);
```

The call is compiled like `TextExtensions.Truncate(longName, 20)`. Extension methods cannot access private instance state and do not truly add members. An applicable instance member takes precedence over an extension method.

LINQ is the most prominent extension-method API. Use extensions for cohesive operations on types you do not own, not as a place to hide unrelated global helpers.

## Generic method type inference

The compiler often infers generic type arguments from arguments:

```csharp
T Echo<T>(T value) => value;

int number = Echo(42);          // Echo<int>
string text = Echo("hello");    // Echo<string>
```

You can provide arguments explicitly when inference lacks enough information or you need a wider type:

```csharp
object value = Echo<object>("hello");
```

Inference primarily uses method arguments, not the assignment target or return type alone. This will not infer `T`:

```csharp
T Create<T>() where T : new() => new T();
var customer = Create<Customer>();
```

Well-designed generic APIs make normal calls infer naturally while still allowing explicit type arguments when needed.

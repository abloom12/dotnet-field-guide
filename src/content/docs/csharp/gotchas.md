---
title: Gotchas
description: Common C# behaviors and syntax that can cause subtle bugs or incorrect assumptions.
sidebar:
  order: 13
---

These are the C# details worth checking first when code compiles but behaves differently than expected.

## Quick reference

| Gotcha | Remember |
| --- | --- |
| `var` | Compile-time inference; the inferred type is fixed |
| `const` vs `readonly` | `const` is compile-time and static; `readonly` is assigned per instance or type during initialization |
| Struct assignment | Copies the value; class assignment copies a reference |
| `==` | Equality semantics depend on the type; classes default to reference equality, records to value equality |
| `string?` | Nullable analysis warns; it does not inject runtime guards |
| `5 / 2` | Integer operands produce integer division: `2` |
| Property | Accessor methods behind field-like syntax; can execute logic |
| LINQ query | Usually deferred until enumeration |
| `async void` | Cannot be awaited; exceptions escape normal task handling |
| Garbage collection | Reclaims managed memory; does not promptly release disposable resources |
| `default` | Often zero/false/null; may not satisfy domain invariants |
| Names | Case-sensitive; public APIs conventionally use `PascalCase` |

### Defensive checklist

```csharp
var count = 1;                         // int, not dynamic
const int PageSize = 25;
private readonly IClock _clock;

double ratio = (double)part / whole;  // avoid integer division
string name = input ?? throw new ArgumentNullException(nameof(input));

var snapshot = query.ToList();         // execute once when snapshot is intended
using var stream = File.OpenRead(path);// deterministic cleanup
await SaveAsync(cancellationToken);    // do not block or discard the task
```

## `var` is not dynamic

`var` asks the compiler to infer a local variable’s static type:

```csharp
var total = 10; // exactly int
// total = "ten"; // compile-time error
```

Members, overloads, and conversions are checked against that inferred type. Use `dynamic` only when runtime binding is explicitly needed.

Inference can be more specific than the intended contract:

```csharp
var items = new List<string>();        // List<string>
IEnumerable<string> items2 = GetItems(); // intentionally interface-typed
```

Use an explicit type when widening to an abstraction communicates intent.

## `const` and `readonly` differ

A `const` value must be computable at compile time, is implicitly static, and is substituted into consuming compiled code:

```csharp
public const int MaximumAttempts = 3;
```

A `readonly` field can be assigned at declaration or in a constructor and may differ by instance:

```csharp
private readonly Guid _id;
private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);
```

`readonly` prevents reassigning the field after initialization; it does not make a referenced object immutable:

```csharp
private readonly List<string> _names = [];
// _names = new(); // prohibited later
_names.Add("Ada"); // allowed
```

Avoid public `const` for values likely to change across library versions because callers embed the old value until recompiled. `static readonly` is resolved at runtime.

## Value types are copied

Structs and enums are value types. Assignment and normal parameter passing copy them:

```csharp
var first = new MutablePoint { X = 1 };
var second = first;
second.X = 9;
// first.X remains 1
```

This is why mutable structs are difficult to reason about. A property or collection indexer may return a copy, so mutating that copy does not update the original—or the compiler may prohibit the attempted mutation.

Classes are reference types: assignment copies the reference, so mutations are visible through aliases. `ref`, `in`, and `out` deliberately change normal passing behavior; use them only when their semantics are needed.

## Reference equality versus value equality

Ordinary classes inherit reference-based equality unless they override it:

```csharp
var first = new Customer("Ada");
var second = new Customer("Ada");
Console.WriteLine(first == second); // normally false
```

Records generate value equality:

```csharp
var first = new CustomerRecord("Ada");
var second = new CustomerRecord("Ada");
Console.WriteLine(first == second); // true
```

Strings also define value equality despite being reference types. Struct equality is value-oriented, though the implementation and performance depend on the type.

`ReferenceEquals(a, b)` explicitly tests whether references identify the same object. `Equals`, `==`, and collection comparers may have type-defined semantics. When overriding equality, also implement a consistent hash code, and do not mutate equality-relevant state while an object is a dictionary key or hash-set element.

## Nullable warnings are not runtime checks

`string` and `string?` use the same runtime reference type. The annotation changes compiler analysis and metadata:

```csharp
string required = GetName(); // compiler trusts the API annotation
Console.WriteLine(required.Length);
```

Incorrect annotations, reflection, deserialization, legacy code, and the null-forgiving operator can still produce null. Validate values at untrusted boundaries and enforce constructor invariants.

The null-forgiving operator only silences analysis:

```csharp
string value = possiblyNull!; // no runtime validation
```

Use it only when you have a concrete reason the compiler cannot prove.

## Integer division and numeric types

When both operands are integral, division discards the fractional portion:

```csharp
int result = 5 / 2;       // 2
double alsoTwo = 5 / 2;   // integer division happens before assignment: 2.0
double ratio = 5.0 / 2;   // 2.5
```

Cast or use a floating-point literal before division:

```csharp
double ratio = (double)part / whole;
```

Other numeric traps include:

- integral overflow may wrap in unchecked contexts,
- `double`/`float` cannot exactly represent every decimal fraction,
- `decimal` literals require `M`,
- floating-point equality can be inappropriate for measured values,
- mixed numeric operands follow conversion rules that may not select the type expected.

Use `decimal` for base-10 financial calculations, define rounding explicitly, and use `checked` when overflow must fail.

## Properties are not fields

A property uses accessor methods behind field-like syntax:

```csharp
public string Name
{
    get
    {
        _logger.LogDebug("Name read");
        return _name;
    }
    set => _name = value.Trim();
}
```

Property access can validate, compute, throw, or have side effects. Well-designed properties remain cheap and unsurprising, but callers should not assume raw storage.

Reflection, serialization, data binding, attributes, and interface definitions often distinguish properties from fields. Public data should normally be represented by properties.

## LINQ usually uses deferred execution

This does not immediately filter anything:

```csharp
var active = users.Where(user => user.IsActive);
```

The query executes when enumerated by `foreach`, `ToList`, `Count`, `First`, or another terminal operation. Re-enumeration usually reruns it, and source changes may alter results.

Materialize when you need one execution or a snapshot:

```csharp
var activeSnapshot = users.Where(user => user.IsActive).ToList();
```

Do not return a deferred query that depends on a database context, stream, or other resource that has already been disposed.

## Avoid `async void`

An `async void` call gives the caller no task to await, so completion and exceptions cannot be composed normally:

```csharp
// Avoid for normal operations.
async void Update() => await UpdateAsync();
```

Return `Task` instead:

```csharp
Task UpdateAsync() => _store.UpdateAsync();
```

Event handlers are the primary exception because their delegate signature requires `void`. Keep them small, catch failures at the handler boundary, and call task-returning methods for real work.

Also avoid `.Result` and `.Wait()` as substitutes for `await`; they block threads and can deadlock in some environments.

## Garbage collection does not replace disposal

The garbage collector eventually reclaims unreachable managed memory. It does not guarantee when file handles, sockets, database-related resources, unmanaged buffers, timers, or subscriptions are released.

```csharp
using var stream = File.OpenRead(path);
```

Use `using` for `IDisposable` and `await using` for `IAsyncDisposable`. Dispose objects you own; do not dispose shared services or caller-owned dependencies unless the ownership contract says to.

## Default values can be invalid states

Fields and array elements are zero-initialized:

```csharp
default(int)       // 0
default(bool)      // false
default(DateTime)  // 0001-01-01
default(MyStruct)  // all fields zero/default
default(Customer)  // null
```

A non-nullable reference field can still begin as runtime null before proper initialization. Nullable warnings help but do not change zero initialization.

Every struct can be created as `default`, bypassing custom constructor validation. Design value types with a meaningful default when possible, or detect/reject invalid default values at boundaries.

`default` for an enum is numeric zero, even if no zero member is declared. Define an appropriate zero member when the enum may be default-initialized.

## Initialization order matters

Instance field initializers run before the constructor body. Base construction and derived initialization have defined ordering, and virtual calls during construction can observe a partially initialized derived object. Avoid invoking overridable members from constructors.

`required` ensures a caller supplies an initializer at compile time but does not validate content. Object initializers run after the constructor, so constructor logic cannot rely on init-assigned properties unless the constructor itself supplies them.

## Case-sensitive names and conventions

C# identifiers are case-sensitive:

```csharp
int count = 1;
int Count = 2; // different identifier
```

Common .NET conventions are:

- `PascalCase`: namespaces, types, methods, properties, events, public fields.
- `camelCase`: parameters and locals.
- `_camelCase`: private instance fields in many codebases.
- `I` prefix: interfaces, such as `IOrderStore`.
- `Async` suffix: task-returning asynchronous methods.

Casing can affect serializers, model binders, reflection, and named arguments depending on the API. Follow the repository’s `.editorconfig` and established style. Do not create names that differ only by case; they are easy to confuse and may fail in case-insensitive external systems.

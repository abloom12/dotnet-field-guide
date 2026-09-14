---
title: Types and Nullability
description: Understand C#'s static type system, built-in types, conversions, and nullable values.
sidebar:
  order: 3
---

Every C# expression has a compile-time type. That type controls the operations the compiler permits, overload selection, generic safety, and nullable analysis.

## Quick reference

### Common types

| C# type | .NET name | Typical use | Default |
| --- | --- | --- | --- |
| `bool` | `System.Boolean` | `true` / `false` | `false` |
| `byte` | `System.Byte` | Unsigned 8-bit data | `0` |
| `int` | `System.Int32` | Whole numbers | `0` |
| `long` | `System.Int64` | Large whole numbers | `0L` |
| `float` | `System.Single` | 32-bit floating point | `0F` |
| `double` | `System.Double` | General floating point | `0D` |
| `decimal` | `System.Decimal` | Base-10 financial values | `0M` |
| `char` | `System.Char` | One UTF-16 code unit | `'\0'` |
| `string` | `System.String` | Text; immutable reference type | `null` at runtime |
| `object` | `System.Object` | Base type of all C# types | `null` |

The keyword and .NET name are aliases for the same type: `int` and `System.Int32` are identical.

### Declaration and nullability patterns

```csharp
int count = 3;                 // explicit type
var name = "Ada";              // inferred as string, still static
List<string> names = new();    // target-typed new
string title = "Required";     // intended never to be null
string? nickname = null;       // null is expected
int? score = null;             // Nullable<int>
```

### Null operators

| Syntax | Meaning |
| --- | --- |
| `value is null` | Safe null test; preferred in pattern-based code |
| `value is not null` | Test and help flow analysis |
| `customer?.Name` | Return `null` instead of dereferencing a null receiver |
| `name ?? "Unknown"` | Use fallback only when left side is `null` |
| `name ??= "Unknown"` | Assign fallback when the variable is `null` |
| `name!` | Suppress a nullable warning; no runtime check |
| `argument ?? throw ...` | Reject null while producing a non-null value |

### Conversion decision guide

```csharp
long widened = 42;                  // implicit, safe numeric conversion
int narrowed = checked((int)big);   // explicit cast; checked for overflow
if (value is Customer customer) { } // test + safe cast
Customer? maybe = value as Customer;// null when cast fails
int number = int.Parse(text);       // throws on invalid text
bool ok = int.TryParse(text, out int parsed); // no format exception
```

## Static typing and inference

C# verifies assignments and operations using compile-time types:

```csharp
string text = "42";
// int total = text + 1; // compile-time error
```

The compile-time type may be less specific than the runtime type:

```csharp
object item = "hello";       // compile-time type: object; runtime type: string
int length = ((string)item).Length;
```

`var` asks the compiler to infer the local variable’s type from its initializer:

```csharp
var total = 12.5m;            // decimal
var customers = new List<Customer>(); // List<Customer>
```

The inferred type is fixed. `var` is limited to contexts where the compiler can infer a type, primarily local variables; it does not weaken or postpone static type checking.

Target typing works in the opposite direction: the expected type supplies information to an expression:

```csharp
Customer customer = new("Ada");
DateTime? deadline = null;
int[] values = [1, 2, 3];
```

Use explicit types when they clarify intent or widen an expression to a contract. Use `var` when the type is obvious or spelling it adds noise.

## Built-in types and literals

Integral types differ by signedness and size: `sbyte`, `byte`, `short`, `ushort`, `int`, `uint`, `long`, `ulong`, and native-sized `nint`/`nuint`. Integer literals are normally `int` when the value fits.

Real-number choices matter:

```csharp
double measurement = 1.25; // binary floating point; default real literal
float sample = 1.25F;       // lower precision
decimal price = 1.25M;     // base-10 decimal; common for money
```

`decimal` avoids many base-10 representation surprises but is not inherently a complete money model: currency, rounding rules, and scale still matter.

Other frequently used framework types include `Guid`, `DateTimeOffset`, `DateOnly`, `TimeOnly`, and `TimeSpan`. They are .NET library types rather than C# keywords.

## Value types and reference types

A variable of a **value type** directly contains its value. Assignment copies that value. Structs and enums are value types.

```csharp
int first = 10;
int second = first;
second++;
// first is still 10
```

A variable of a **reference type** contains a reference to an object. Assignment copies the reference, so two variables can point to the same object. Classes, records declared without `struct`, arrays, delegates, and `string` are reference types.

```csharp
var first = new List<int> { 1 };
var second = first;
second.Add(2);
// first now observes [1, 2]
```

`string` is a reference type but immutable, so operations create new strings rather than changing an existing string. Record classes have reference storage but value-based equality by default. Do not infer equality or mutability solely from “value type” versus “reference type.”

**Boxing** wraps a value type in an object when it is converted to `object` or an implemented interface. Unboxing requires the actual boxed type:

```csharp
object boxed = 42;
int number = (int)boxed;
```

## Default values and initialization

`default(T)` produces a type’s default value; `default` can be target-typed:

```csharp
int count = default;       // 0
bool enabled = default;    // false
Customer? customer = default; // null
```

All fields and array elements receive zero-initialized runtime defaults. Local variables must normally be definitely assigned before use. A reference field can therefore be `null` at runtime even when its type is written without `?`; nullable reference analysis warns about unsafe initialization but does not change runtime initialization.

For structs, the default value zeroes every field and may bypass assumptions made by custom constructors. Design structs so their default state is valid whenever practical.

## Nullable value types

A value type such as `int` cannot normally hold `null`. `int?` is shorthand for `Nullable<int>`:

```csharp
int? score = null;

if (score.HasValue)
{
    Console.WriteLine(score.Value);
}

int displayed = score ?? 0;
```

Accessing `.Value` when `HasValue` is false throws. Pattern matching is usually cleaner:

```csharp
if (score is int actualScore)
{
    Console.WriteLine(actualScore);
}
```

Nullable value types support lifted operators. For example, arithmetic generally returns `null` when an operand is null. Nullable `bool` has special three-valued behavior for some boolean operators.

## Nullable reference types

With nullable reference types enabled, annotations express intent:

```csharp
string required = "Ada";
string? optional = null;
```

The compiler tracks control flow and warns when code might dereference `null` or assign a maybe-null value to a non-nullable target:

```csharp
if (optional is not null)
{
    Console.WriteLine(optional.Length); // known non-null in this branch
}
```

These are compile-time warnings and metadata annotations, not runtime guards. Code can still produce `null` through disabled annotations, reflection, deserialization, incorrect annotations, or `null!`. Validate untrusted or framework-provided inputs at runtime.

Public APIs should communicate intent accurately:

- Return `T?` when absence is a valid result.
- Accept `T?` only when the method handles null.
- Initialize required non-null members in constructors or use `required` appropriately.
- Avoid suppressing warnings until you can explain why flow analysis is wrong.

## Null-forgiving, conditional, and coalescing operators

The null-forgiving postfix operator suppresses compiler warnings:

```csharp
string name = possiblyNull!;
```

It emits no check and does not change the value. If the value is null, a later dereference can still throw `NullReferenceException`.

Null-conditional access short-circuits to null:

```csharp
int? length = customer?.Name?.Length;
customer?.Notify();
```

Null coalescing chooses a fallback:

```csharp
string label = nickname ?? name ?? "Unknown";
```

Only `null` triggers `??`; values such as `0`, `false`, and `""` do not.

## Implicit and explicit conversions

An implicit conversion is accepted when the language considers it safe enough:

```csharp
int count = 10;
long larger = count;
double approximate = count;
```

An explicit conversion requires a cast because information could be lost or the runtime type must be checked:

```csharp
double amount = 12.9;
int truncated = (int)amount; // 12
```

Integral overflow is unchecked by default in many non-constant contexts. Use `checked` when overflow must throw:

```csharp
int value = checked((int)longValue);
```

Types can define user-defined conversion operators, but conversions with surprising cost or data loss are better represented by named methods.

Parsing text is not casting. Use `Parse` when invalid input is exceptional and `TryParse` when it is expected:

```csharp
if (decimal.TryParse(input, out var amount))
{
    Console.WriteLine(amount);
}
```

Culture can affect numeric and date parsing; specify an appropriate culture for persisted or protocol data.

## Casting, `is`, and `as`

A direct reference cast throws `InvalidCastException` if the runtime object is incompatible:

```csharp
Customer customer = (Customer)value;
```

A declaration pattern tests and introduces a correctly typed variable:

```csharp
if (value is Customer customer)
{
    Console.WriteLine(customer.Name);
}
```

`as` returns `null` instead of throwing and works with reference types and nullable value types:

```csharp
Customer? customer = value as Customer;
```

Prefer pattern matching when behavior occurs only for the matching type. Use a direct cast when an incompatible runtime type indicates a genuine programming error.

## `object` and `dynamic`

`object` is the common base type. A variable typed as `object` can reference any value, but members are checked against `object` until the value is tested or cast:

```csharp
object value = "Ada";
if (value is string text)
{
    Console.WriteLine(text.Length);
}
```

`dynamic` postpones binding until runtime:

```csharp
dynamic value = GetInteropObject();
value.DoesSomething(); // compiles; may fail at runtime
```

Use `dynamic` mainly at truly dynamic boundaries, such as some interop and reflection scenarios. It removes compile-time checking and makes refactoring less safe. Prefer a real type, interface, generic parameter, or carefully inspected `object` in ordinary code.

## Tuples and deconstruction

Value tuples group a small number of values without defining a named type:

```csharp
(string Name, int Count) result = ("Ada", 3);
Console.WriteLine(result.Name);

var (name, count) = result;
```

Methods can return named tuple elements:

```csharp
(string Host, int Port) ParseAddress(string input) => ("localhost", 8080);

var (host, _) = ParseAddress(text); // discard the port
```

Tuple element names improve source readability but are not a strong domain contract. Use a record or class when the value crosses API boundaries, needs validation or behavior, or should have a stable, meaningful type name.

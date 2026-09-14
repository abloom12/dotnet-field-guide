---
title: TypeScript → C#
description: A focused translation guide for TypeScript developers learning C#.
sidebar:
  order: 12
---

This is the one comparison-focused page in the C# section. Use it to translate familiar TypeScript syntax quickly; follow the linked C# pages when the underlying semantics matter.

## Quick reference

### Concept map

| TypeScript | Closest C# concept | Important difference |
| --- | --- | --- |
| `const` local | local variable, often explicit type or `var` | C# `const` requires a compile-time constant; use an ordinary local when the value is merely not reassigned |
| `let value: T` | `T value` or `var value` | C# `var` is statically typed |
| `number` | `int`, `long`, `double`, `decimal`, etc. | Choose size and numeric semantics |
| `boolean` | `bool` | No truthy/falsy conversion |
| `T[]` | `T[]` or `List<T>` | Arrays are fixed-size; lists grow |
| `Map<K,V>` | `Dictionary<TKey,TValue>` | Indexer and `TryGetValue` are common APIs |
| object type / interface | `record`, `class`, or `interface` | C# interfaces are normally explicitly implemented (nominal typing) |
| union `'a' | 'b'` | often `enum`; sometimes type hierarchy | C# has no general discriminated-union syntax |
| `Promise<T>` | `Task<T>` | Cancellation commonly travels separately as `CancellationToken` |
| `undefined` | usually no direct value; use `null`/optional contract | Definite assignment and nullable annotations express absence differently |
| `any` | `dynamic` (rare) | `dynamic` defers binding to runtime; prefer concrete types |
| `unknown` | `object` + pattern matching | Test/cast before type-specific access |
| structural callback | `Action` / `Func` / delegate | Statically typed method signature |
| `import` / `export` | `using`, namespaces, accessibility, project references | `using` only shortens namespace-qualified names |
| array methods | LINQ extension methods | Most LINQ pipelines are deferred and non-mutating |

### Side-by-side essentials

**Variables and output**

```ts
const name: string = "Ada";
let count = 3;
console.log(`${name}: ${count}`);
```

```csharp
string name = "Ada";
var count = 3; // inferred as int
Console.WriteLine($"{name}: {count}");
```

**Functions**

```ts
function add(left: number, right: number): number {
  return left + right;
}

const double = (value: number) => value * 2;
```

```csharp
int Add(int left, int right)
{
    return left + right;
}

Func<int, int> doubleValue = value => value * 2;
```

**Nullability**

```ts
function length(value: string | null | undefined): number {
  return value?.length ?? 0;
}
```

```csharp
int Length(string? value)
{
    return value?.Length ?? 0;
}
```

**Collection pipeline**

```ts
const names = users
  .filter(user => user.active)
  .map(user => user.name)
  .sort();
```

```csharp
var names = users
    .Where(user => user.IsActive)
    .Select(user => user.Name)
    .OrderBy(name => name)
    .ToList();
```

## Variables and constants

TypeScript’s `const` means the binding cannot be reassigned, but object contents may mutate. In C#, local variables are ordinarily declared with a type or `var`; there is no general local “readonly binding” keyword:

```ts
const user = { name: "Ada" };
user.name = "Grace"; // allowed
```

```csharp
var user = new User { Name = "Ada" };
user.Name = "Grace"; // allowed
```

C# `const` is narrower: the value must be known at compile time and is implicitly static for fields:

```csharp
const int MaximumAttempts = 3;
const string ProductName = "Field Guide";
```

Use `readonly` for a field assigned at declaration or construction:

```csharp
private readonly IClock _clock;
```

Neither a readonly field nor TypeScript `const` makes a referenced object deeply immutable.

C# `var` infers one compile-time type:

```csharp
var count = 3;   // int
// count = "3"; // compile-time error
```

See [Types and Nullability](../types-and-nullability/).

## Common types

| TypeScript | C# examples |
| --- | --- |
| `string` | `string` |
| `number` | `int`, `long`, `double`, `decimal` |
| `boolean` | `bool` |
| `bigint` | `long`, `ulong`, or `System.Numerics.BigInteger` depending on range |
| `Date` | commonly `DateTimeOffset`, `DateTime`, or `DateOnly` depending on meaning |
| `T[]` | `T[]`, `List<T>`, or a collection interface |
| `[A, B]` | `(A, B)` value tuple |
| `null` / `undefined` | `null` with nullable types; API-specific optional/default values |
| `unknown` | `object` and type patterns |
| `never` | no exact general equivalent; a method that always throws may be annotated by analysis attributes |

C# numeric types are not interchangeable. Integer division, overflow, floating-point precision, and decimal arithmetic depend on the chosen type.

C# uses `char` for one UTF-16 code unit and `string` for text. A one-character string (`"A"`) is not a `char` (`'A'`).

## Naming and basic syntax

Both languages use braces, semicolons, `//` comments, and `/* ... */` comments. C# conventions differ:

| Item | C# convention |
| --- | --- |
| Type/interface/record/enum | `PascalCase` |
| Method/property/event | `PascalCase` |
| Local/parameter | `camelCase` |
| Private field | commonly `_camelCase` |
| Interface | commonly starts with `I` |
| Async method | commonly ends with `Async` |

C# identifiers and member names are case-sensitive. Standard APIs therefore use `Length`, `Count`, `Add`, and `StartsWith`, not JavaScript casing.

## Strings and interpolation

```ts
const message = `Hello, ${name}`;
const upper = name.toUpperCase();
const starts = name.startsWith("A");
```

```csharp
string message = $"Hello, {name}";
string upper = name.ToUpperInvariant();
bool starts = name.StartsWith("A", StringComparison.Ordinal);
```

C# string features include:

```csharp
string escaped = "Line one\nLine two";
string verbatim = @"C:\temp\file.txt";
string raw = """
    JSON: { "enabled": true }
    """;
```

Strings are immutable in both languages. For many incremental concatenations, C# code often uses `StringBuilder`.

String comparison should be explicit when semantics matter. Ordinal comparison is common for identifiers and protocol values; culture-aware comparison is appropriate for human language.

## Null, undefined, and optional values

TypeScript distinguishes `null` and `undefined`. C# normally represents reference absence with `null` and nullable annotations:

```csharp
string required = "Ada";
string? optional = null;
int? optionalScore = null;
```

Modern nullable reference types are compiler analysis, not runtime enforcement. Validate external input even when a parameter is non-nullable.

Operators translate closely:

| TypeScript | C# |
| --- | --- |
| `value?.name` | `value?.Name` |
| `value ?? fallback` | `value ?? fallback` |
| `value ??= fallback` | `value ??= fallback` |
| `value!` non-null assertion | `value!` null-forgiving operator |

In C#, `!` suppresses a compiler warning but performs no runtime check.

TypeScript optional property syntax has no universal C# equivalent. Choose based on the contract:

```csharp
public string? Nickname { get; init; } // nullable value
public required string Name { get; init; } // must be initialized by caller
```

Optional method parameters use default values:

```csharp
void Log(string message, LogLevel level = LogLevel.Information) { }
```

## Truthiness and equality

TypeScript allows truthy/falsy conditions; C# requires an actual `bool`:

```ts
if (name) { }
if (items.length) { }
```

```csharp
if (!string.IsNullOrEmpty(name)) { }
if (items.Count > 0) { }
```

C# has no `===` operator. `==` is type-aware and may be overloaded. For many built-in value types and strings it compares values; ordinary classes default to reference identity; records generate value equality.

```csharp
bool sameObject = ReferenceEquals(first, second);
bool equalByTypeRules = first == second;
```

Do not mechanically map JavaScript equality assumptions to C#; check the type’s equality contract.

## Functions, methods, and parameters

A C# method declares the return type before the name and each parameter type before its parameter name:

```ts
function format(value: string, uppercase = false): string {
  return uppercase ? value.toUpperCase() : value;
}
```

```csharp
string Format(string value, bool uppercase = false)
{
    return uppercase ? value.ToUpperInvariant() : value;
}
```

C# supports overloads with distinct parameter lists:

```csharp
string Format(string value) => value;
string Format(string value, CultureInfo culture) => value;
```

Named arguments resemble object-like call clarity but target actual parameters:

```csharp
Format(value: "hello", uppercase: true);
```

Special parameter modifiers include `params`, `ref`, `in`, and `out`. See [Methods and Generics](../methods-and-generics/).

## Lambdas and callback types

TypeScript describes callbacks with function types:

```ts
type Formatter = (value: string) => string;
const trim: Formatter = value => value.trim();
```

C# uses delegates:

```csharp
Func<string, string> trim = value => value.Trim();
```

`Func<...>`’s final type argument is the return type. `Action<...>` returns no value:

```csharp
Action<string> log = message => Console.WriteLine(message);
Predicate<string> hasText = value => value.Length > 0;
```

A named custom delegate can make a callback role explicit. Events use delegates but restrict outside code to subscribing and unsubscribing.

See [Delegates, Lambdas, and Events](../delegates-lambdas-and-events/).

## Objects, classes, and records

A TypeScript object type often translates to a C# record or class depending on semantics.

**Data value**

```ts
type UserSummary = {
  id: string;
  name: string;
};
```

```csharp
public sealed record UserSummary(Guid Id, string Name);
```

**Identity/behavior object**

```ts
class User {
  constructor(public readonly id: string, public name: string) {}

  rename(name: string): void {
    this.name = name.trim();
  }
}
```

```csharp
public sealed class User
{
    public User(Guid id, string name)
    {
        Id = id;
        Name = name;
    }

    public Guid Id { get; }
    public string Name { get; private set; }

    public void Rename(string name)
    {
        Name = name.Trim();
    }
}
```

C# object initializers resemble object literals but construct a declared type first:

```csharp
var options = new ExportOptions
{
    IncludeHeaders = true,
    Format = ExportFormat.Csv
};
```

See [Data Modeling](../data-modeling/) for fields, properties, records, structs, and inheritance.

## Structural versus nominal interfaces

TypeScript commonly accepts any object with the required shape:

```ts
interface Greeter {
  greet(name: string): string;
}

const greeter = { greet: (name: string) => `Hello ${name}` };
```

A C# type normally declares interface implementation explicitly:

```csharp
public interface IGreeter
{
    string Greet(string name);
}

public sealed class Greeter : IGreeter
{
    public string Greet(string name) => $"Hello {name}";
}
```

Matching methods alone is not enough. C# supports one base class and multiple interfaces. Interfaces are runtime-visible contracts and can be used in generic constraints, reflection, and dependency injection.

## Type aliases, unions, and enums

TypeScript `type` can alias almost any type expression. C# `using` aliases only provide another source-level name in scope; they do not create broad union/composition features:

```csharp
using CustomerId = System.Guid;
```

A string-literal union often maps to an enum:

```ts
type Status = "draft" | "submitted" | "complete";
```

```csharp
public enum Status
{
    Draft,
    Submitted,
    Complete
}
```

An enum is represented by an integral value, not its name string. Serialization format must be configured intentionally.

For a union where each case has different data, use a type hierarchy and pattern matching:

```csharp
public abstract record Result;
public sealed record Success(string Value) : Result;
public sealed record Failure(string Error) : Result;

string message = result switch
{
    Success(var value) => value,
    Failure(var error) => $"Error: {error}",
    _ => throw new UnreachableException()
};
```

Libraries may also provide dedicated union/result types.

## Generics

The syntax is similar:

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
```

```csharp
T? FirstOrDefault<T>(IEnumerable<T> items)
{
    return items.FirstOrDefault();
}
```

The C# nullability meaning of unconstrained `T?` is nuanced; standard APIs and constraints should communicate the intended behavior.

Constraints use `where`:

```csharp
T Create<T>() where T : IEntity, new()
{
    return new T();
}
```

C# generics are represented in runtime metadata and support value types without erasing everything to one object representation. Variance uses `out` and `in` on eligible interface/delegate type parameters, not TypeScript structural assignability rules.

## Arrays, lists, and collection expressions

TypeScript arrays are growable:

```ts
const names: string[] = ["Ada", "Grace"];
names.push("Linus");
```

C# arrays have fixed length:

```csharp
string[] names = ["Ada", "Grace"];
names[0] = "Linus";
// names.Add(...) does not exist
```

Use `List<T>` for growth:

```csharp
List<string> names = ["Ada", "Grace"];
names.Add("Linus");
names.Remove("Ada");
```

Frequently used members:

| TypeScript array | C# `List<T>` / LINQ |
| --- | --- |
| `.length` | `.Count` (`.Length` for arrays) |
| `.push(value)` | `.Add(value)` |
| `.includes(value)` | `.Contains(value)` |
| `.find(predicate)` | `.FirstOrDefault(predicate)` |
| `.some(predicate)` | `.Any(predicate)` |
| `.every(predicate)` | `.All(predicate)` |
| `.filter(predicate)` | `.Where(predicate)` |
| `.map(selector)` | `.Select(selector)` |

LINQ operations usually return lazy `IEnumerable<T>` pipelines. Add `.ToList()` or `.ToArray()` when a concrete snapshot is needed.

See [Collections](../collections/) and [LINQ](../linq/).

## Dictionaries and object lookup

A TypeScript `Map<K,V>` often maps to `Dictionary<TKey,TValue>`:

```ts
const scores = new Map<string, number>();
scores.set("Ada", 10);
const score = scores.get("Ada"); // number | undefined
```

```csharp
var scores = new Dictionary<string, int>();
scores["Ada"] = 10;

if (scores.TryGetValue("Ada", out int score))
{
    Console.WriteLine(score);
}
```

Reading `scores["missing"]` throws rather than returning undefined. Use `TryGetValue` when absence is expected.

A TypeScript `Record<string,T>` may translate to a dictionary for dynamic keys or to a class/record for a fixed schema. Do not use dictionaries when named properties form a stable model.

## Conditions, loops, and pattern matching

Basic syntax is familiar, but conditions require `bool` and `foreach` handles sequence iteration:

```ts
for (const name of names) {
  if (name.startsWith("A")) {
    console.log(name);
  }
}
```

```csharp
foreach (var name in names)
{
    if (name.StartsWith("A", StringComparison.Ordinal))
    {
        Console.WriteLine(name);
    }
}
```

C# switch expressions and patterns handle type/value/shape decisions:

```csharp
string Describe(object? value) => value switch
{
    null => "Missing",
    string { Length: 0 } => "Empty text",
    string text => text,
    int number when number > 0 => "Positive number",
    _ => "Other"
};
```

See [Control Flow and Pattern Matching](../control-flow-and-pattern-matching/).

## Promises, tasks, and cancellation

A TypeScript `Promise<T>` most closely maps to `Task<T>`:

```ts
async function getMessage(signal?: AbortSignal): Promise<string> {
  await delay(100, { signal });
  return "Done";
}
```

```csharp
async Task<string> GetMessageAsync(CancellationToken cancellationToken = default)
{
    await Task.Delay(100, cancellationToken);
    return "Done";
}
```

A no-result async C# method returns `Task`. Async methods conventionally end with `Async`.

```csharp
Task SaveAsync(CancellationToken cancellationToken);
```

Pass cancellation tokens through to every operation that accepts one. Avoid `.Result` and `.Wait()`; use `await`. Avoid `async void` except required event handlers.

`Promise.all` corresponds broadly to `Task.WhenAll`, but resource limits and shared non-thread-safe dependencies still matter.

See [Async and Cancellation](../async-and-cancellation/).

## Exceptions

The syntax is similar:

```ts
try {
  await save();
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}
```

```csharp
try
{
    await SaveAsync(cancellationToken);
}
catch (IOException exception)
{
    Console.Error.WriteLine(exception.Message);
}
```

C# catches by exception type and supports filters:

```csharp
catch (HttpRequestException exception) when (
    exception.StatusCode == HttpStatusCode.NotFound)
{
    return null;
}
```

C# has unchecked exceptions: method signatures do not declare every exception they may throw. Use `throw;` to rethrow without resetting the original stack trace.

Resource ownership is more explicit than ordinary JavaScript cleanup:

```csharp
using var stream = File.OpenRead(path);
await using var asyncResource = await OpenAsync(cancellationToken);
```

See [Exceptions and Resource Management](../exceptions-and-resource-management/).

## Modules, namespaces, and assemblies

TypeScript imports bind exported values/types from modules:

```ts
import { UserService } from "./user-service";
export class App {}
```

C# separates several concerns:

```csharp
using FieldGuide.Services; // shortens namespace-qualified names

namespace FieldGuide.Features;

public sealed class App { } // accessibility controls use outside the assembly
```

- A **namespace** organizes named types and prevents collisions.
- A **using directive** allows shorter names; it does not load a file or package.
- A **project reference** or package reference makes another assembly available at compilation.
- `public`/`internal` controls whether a type is accessible from other assemblies.
- An **assembly** (`.dll`/`.exe`) is compiled output containing IL and metadata.

File paths and namespaces commonly align by convention but do not have to. See [Reading C#](../reading-csharp/) and [.NET Projects](/dotnet/projects-solutions-and-project-files/).

## Access modifiers

TypeScript’s `public`, `protected`, and `private` class members have familiar C# counterparts, but C# accessibility is enforced in compiled metadata:

```csharp
public sealed class Account
{
    private decimal _balance;
    internal Guid InternalId { get; init; }
    public decimal Balance => _balance;
}
```

`internal` means accessible within the same assembly. Top-level types default to `internal`; class members default to `private`.

C# also supports `protected internal` and `private protected`, but ordinary APIs mostly use `public`, `internal`, `protected`, and `private`.

## Attributes and decorators

C# attributes attach metadata:

```csharp
[Obsolete("Use SaveAsync instead")]
public void Save() { }

[Required]
public string Name { get; init; } = "";
```

They resemble decorators visually but do not inherently wrap or execute a declaration. A compiler, runtime, framework, serializer, reflection code, or source generator must interpret the metadata. Do not assume an attribute performs runtime validation unless the relevant framework invokes it.

## Extension methods

C# extension methods make static methods callable with instance syntax:

```csharp
public static class StringExtensions
{
    public static bool HasText(this string? value) =>
        !string.IsNullOrWhiteSpace(value);
}

bool present = name.HasText();
```

They differ from JavaScript prototype modification: the target runtime type is not mutated. The compiler resolves a static method that is in namespace scope.

LINQ operators such as `Where` and `Select` are extension methods.

## Useful API translations

| Task | TypeScript | C# |
| --- | --- | --- |
| Print | `console.log(value)` | `Console.WriteLine(value)` |
| String length | `text.length` | `text.Length` |
| Array/list count | `items.length` | `array.Length` / `list.Count` |
| Current UTC instant | `new Date()` | `DateTimeOffset.UtcNow` |
| New UUID/GUID | `crypto.randomUUID()` | `Guid.NewGuid()` |
| Parse integer | `Number.parseInt(text, 10)` | `int.Parse(text)` / `int.TryParse(...)` |
| Delay | `await delay(ms)` | `await Task.Delay(ms, token)` |
| JSON serialize | `JSON.stringify(value)` | `JsonSerializer.Serialize(value)` |
| JSON deserialize | `JSON.parse(text)` + validation | `JsonSerializer.Deserialize<T>(text)` + validation |
| Object type test | `value instanceof User` | `value is User user` |
| Fallback on nullish | `value ?? fallback` | `value ?? fallback` |

Names shown are starting points, not always complete production patterns. Parsing, dates, JSON, casing, cancellation, and culture all require explicit contract decisions.

## Biggest semantic shifts

When translating code, check these before doing a syntax-only rewrite:

1. **Static/runtime type identity:** C# generic and interface contracts remain meaningful at runtime.
2. **Numeric intent:** choose an appropriate numeric type and account for division/overflow.
3. **Null contract:** nullable annotations communicate expectations but require runtime validation at boundaries.
4. **Identity and equality:** class, record, and struct choices change copying and equality.
5. **Collection execution:** LINQ is usually deferred; arrays cannot grow.
6. **Resource lifetime:** disposable resources need `using` even with garbage collection.
7. **Async ownership:** await or supervise every task and propagate cancellation.
8. **Application structure:** namespaces organize types; projects and assemblies provide dependencies.
9. **API naming:** .NET APIs use PascalCase and may provide `Try...` patterns instead of undefined results.
10. **Framework behavior:** serialization, validation, DI, routing, and UI behavior come from .NET frameworks, not C# syntax itself.

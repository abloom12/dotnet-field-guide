---
title: C# Overview
description: A practical map of the C# language and its place in .NET.
sidebar:
  order: 1
---

C# is a statically typed, compiled language used throughout the .NET ecosystem. This section assumes you already know how to program and emphasizes the syntax, conventions, and mental models needed to become productive quickly.

## Quick reference

### The C#/.NET mental model

| Term | What it is |
| --- | --- |
| **C#** | The programming language: syntax, types, pattern matching, `async`/`await`, and other language features. |
| **.NET** | The runtime, base libraries, SDK, build tools, and application frameworks used by C# programs. |
| **CLR** | The Common Language Runtime, which loads and executes managed .NET code. |
| **BCL** | The Base Class Library: APIs such as `string`, `List<T>`, `Task`, file I/O, and networking. |
| **ASP.NET Core / Blazor** | Application frameworks built on .NET; they are not part of the C# language. |

A typical build and execution path is:

```text
C# source (.cs)
  → C# compiler
  → assembly containing IL + metadata (.dll or .exe)
  → .NET runtime/JIT (or ahead-of-time compilation)
  → native machine code
```

### Everyday C# in one example

```csharp
using System.Collections.Generic;
using System.Linq;

namespace FieldGuide.Orders;

public sealed record Order(int Id, decimal Total);

public sealed class OrderService
{
    public decimal TotalOpenOrders(IEnumerable<Order> orders)
    {
        return orders
            .Where(order => order.Total > 0)
            .Sum(order => order.Total);
    }
}
```

Read it as:

- `using` makes names from another namespace available.
- `namespace` organizes types and avoids naming collisions.
- `record` defines a data-focused reference type with value equality.
- `class` defines a reference type containing state and behavior.
- `public` controls accessibility; `sealed` prevents inheritance.
- `IEnumerable<Order>` is a generic sequence interface.
- `Where` and `Sum` are LINQ operations receiving lambda expressions.

### Rules worth remembering

- Types are checked at compile time; `var` infers a type but does not make a variable dynamic.
- Non-nullable reference types should not contain `null` when nullable analysis is enabled.
- Prefer properties for public state and methods for behavior.
- Use `record` for value-like data and `class` for identity or behavior-rich objects.
- Use `List<T>` for a mutable sequence and LINQ for querying sequences.
- Asynchronous methods normally return `Task`/`Task<T>`, end in `Async`, and are awaited.
- Garbage collection manages memory; `using`/`await using` releases disposable resources promptly.
- C# naming convention is `PascalCase` for types and public members, `camelCase` for locals and parameters.

### Section map

| Need | Page |
| --- | --- |
| Decode the shape of a `.cs` file | [Reading C#](../reading-csharp/) |
| Understand types and `null` | [Types and Nullability](../types-and-nullability/) |
| Choose class, record, struct, interface, or enum | [Data Modeling](../data-modeling/) |
| Write reusable methods and generic code | [Methods and Generics](../methods-and-generics/) |
| Branch, loop, and match values | [Control Flow and Pattern Matching](../control-flow-and-pattern-matching/) |
| Pass behavior and publish notifications | [Delegates, Lambdas, and Events](../delegates-lambdas-and-events/) |
| Store groups of values | [Collections](../collections/) |
| Query and transform sequences | [LINQ](../linq/) |
| Perform non-blocking work | [Async and Cancellation](../async-and-cancellation/) |
| Handle failures and release resources | [Exceptions and Resource Management](../exceptions-and-resource-management/) |
| Translate familiar TypeScript | [TypeScript → C#](../typescript-to-csharp/) |
| Avoid common surprises | [Gotchas](../gotchas/) |

## C# within .NET

C# is one of several languages that can target .NET. The compiler understands C# syntax and emits an assembly containing Common Intermediate Language (IL) and type metadata. The .NET runtime loads that assembly, provides services such as garbage collection, and usually just-in-time (JIT) compiles methods to native code as they are needed. Some applications instead use ahead-of-time (AOT) compilation.

This separation matters when reading documentation:

- **Language feature:** a switch expression, record, nullable annotation, or lambda.
- **Library API:** `HttpClient`, `List<T>`, `DateTimeOffset`, or `File.ReadAllTextAsync`.
- **Runtime behavior:** garbage collection, JIT compilation, assembly loading, or exception execution.
- **Framework feature:** an ASP.NET Core endpoint, dependency injection registration, or Blazor component.

The language and platform are closely integrated, but they version independently. A project’s target framework controls available .NET APIs, while its language version controls available C# syntax.

## Compiled code and static typing

The compiler knows the declared or inferred type of each expression and rejects incompatible operations before the program runs:

```csharp
var count = 3;       // inferred as int
count += 1;
// count = "three"; // compile-time error
```

Static typing enables editor completion, refactoring, overload selection, generic type safety, and many compile-time diagnostics. It does not eliminate runtime errors: input can still be invalid, references can still be `null` at runtime, casts can fail, and I/O can fail.

Most C# projects compile source as a unit rather than executing files directly. The compiler resolves referenced types, verifies accessibility and type rules, and emits project output. The [.NET section](/dotnet/overview/) explains projects, assemblies, SDK commands, and runtime selection in detail.

## The structure of everyday code

Most C# code is organized as:

```text
solution
  → projects
    → namespaces
      → types
        → members
          → statements and expressions
```

- A **solution** groups related projects for tooling.
- A **project** defines compilation inputs, dependencies, and target frameworks.
- A **namespace** groups named types logically.
- A **type** is a class, record, struct, interface, enum, or delegate.
- A **member** is a method, property, field, constructor, event, operator, or nested type.
- A **statement** performs an action; an **expression** produces a value.

Modern console applications may use top-level statements, but production application code is still primarily made of named types and members.

## Core language areas

### Types, nullability, and data modeling

Every value has a type. C# distinguishes value types, such as `int` and most structs, from reference types, such as `string`, arrays, records, and classes. Nullable annotations (`string?`) tell the compiler where `null` is expected. Classes, records, structs, interfaces, and enums offer different semantics for identity, equality, copying, and contracts.

### Methods, generics, delegates, and lambdas

Methods define named behavior. Generics such as `List<T>` preserve type information while allowing code to work with many types. Delegates are type-safe function references; lambdas provide compact inline functions. These pieces appear throughout events, LINQ, asynchronous APIs, and framework callbacks.

### Control flow and pattern matching

C# includes familiar `if`, `switch`, and loop statements. Pattern matching extends branching so code can test a value’s type, constants, ranges, properties, tuple positions, or list shape while optionally introducing variables.

### Collections and LINQ

Arrays and generic collections store groups of values. LINQ adds composable operations such as `Where`, `Select`, `OrderBy`, and `GroupBy`. Most LINQ-to-objects pipelines are lazy: they describe work that occurs when the result is enumerated.

### Asynchronous work, exceptions, and resources

`Task`, `async`, and `await` express asynchronous operations without blocking a thread while waiting. `CancellationToken` carries cooperative cancellation requests. Exceptions represent failures that interrupt normal control flow. `IDisposable` and `IAsyncDisposable` represent resources that need prompt cleanup, independently of garbage collection.

## Using this field guide

Each page begins with a quick reference intended for use while coding. The detailed sections below it explain why the syntax works, where it is appropriate, and what can go wrong. Start with the page matching the immediate task; you do not need to read the section linearly.

For definitive API signatures and version-specific behavior, confirm details in the [Microsoft C# documentation](https://learn.microsoft.com/dotnet/csharp/) and [.NET API browser](https://learn.microsoft.com/dotnet/api/).

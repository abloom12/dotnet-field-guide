---
title: Reading C#
description: Recognize the declarations, modifiers, and syntax used in everyday C# code.
sidebar:
  order: 2
---

C# source becomes easier to navigate once you can separate file-level directives, type declarations, members, statements, and expressions.

## Quick reference

### Annotated file

```csharp
using System.ComponentModel.DataAnnotations; // namespace import

namespace FieldGuide.Customers;              // file-scoped namespace

[Serializable]                               // attribute
public sealed class Customer                 // type declaration
{
    private readonly Guid _id;               // field

    public Customer(Guid id, string name)    // constructor
    {
        _id = id;
        Name = name;
    }

    [Required]
    public string Name { get; private set; }  // property + accessors

    public bool IsActive { get; init; }       // init-only property

    public string Label => $"{Name} ({_id})"; // expression-bodied property

    public void Rename(string name)           // method: void return
    {
        Name = name;
    }
}

var customer = new Customer(Guid.NewGuid(), "Ada")
{
    IsActive = true                          // object initializer
};
```

### Declaration shapes

| Shape | Meaning |
| --- | --- |
| `public class Order { ... }` | Named reference type |
| `public record Order(int Id);` | Data-focused reference type with a primary constructor |
| `public interface IClock { ... }` | Contract implemented by types |
| `private decimal _total;` | Field storing data directly |
| `public decimal Total { get; init; }` | Property accessed through generated accessors |
| `public Order(int id) { ... }` | Constructor; same name as the containing type, no return type |
| `public decimal Calculate(int quantity)` | Method returning `decimal` and taking an `int` |
| `public event EventHandler? Changed;` | Event declaration |

### Common modifiers

| Modifier | Fast meaning |
| --- | --- |
| `public` | Accessible from any referencing code |
| `internal` | Accessible inside the same assembly/project output |
| `protected` | Accessible in this type and derived types |
| `private` | Accessible only inside the containing type |
| `static` | Belongs to the type, not an instance |
| `abstract` | Incomplete; a derived type must provide or complete behavior |
| `virtual` | May be overridden in a derived type |
| `override` | Replaces an inherited virtual/abstract member |
| `sealed` | Prevents inheritance, or prevents further overriding |
| `readonly` | Field can only be assigned during declaration or construction |
| `const` | Compile-time constant; implicitly static |
| `async` | Method can use `await`; does not by itself create a new thread |

### Naming conventions

```text
CustomerAccount       types, methods, properties, events, public fields
ICustomerRepository   interfaces (leading I)
customerAccount       parameters and local variables
_customerRepository   private instance fields
CustomerAccount.cs    usually the primary type's name
```

## Namespaces and `using` directives

A namespace gives a type a qualified name and prevents collisions:

```csharp
namespace FieldGuide.Billing;

public class Invoice { }
```

The full name is `FieldGuide.Billing.Invoice`. A `using` directive lets code use the short name:

```csharp
using FieldGuide.Billing;

Invoice invoice = new();
```

A `using` does **not** install a package, load a source file, or necessarily add an assembly reference. The project must already reference the assembly containing the namespace.

Common forms include:

```csharp
using System.Text;                      // namespace import
using Json = System.Text.Json;          // alias
using static System.Math;               // imports static members

global using System.Net.Http;           // available to every file in the project
```

Projects may also enable **implicit usings**, causing the SDK to generate common global imports.

## File-scoped and block-scoped namespaces

A file-scoped namespace applies to the remainder of one file and avoids indentation:

```csharp
namespace FieldGuide.Billing;

public class Invoice { }
```

A block-scoped namespace encloses declarations in braces and can coexist with other namespace blocks:

```csharp
namespace FieldGuide.Billing
{
    public class Invoice { }
}
```

Most modern projects use file-scoped namespaces and keep one primary type per file. Both forms produce equivalent namespace-qualified type names.

## Top-level statements and class-based programs

A console application can place executable statements directly in one source file:

```csharp
Console.WriteLine("Hello");
return 0;
```

The compiler generates the containing entry-point type and method. Only one compilation unit can contain top-level statements, and they must precede type declarations in that file.

The explicit equivalent is recognizable as:

```csharp
public static class Program
{
    public static int Main(string[] args)
    {
        Console.WriteLine("Hello");
        return 0;
    }
}
```

ASP.NET Core templates commonly use top-level statements in `Program.cs` for application startup while placing the rest of the code in normal types.

## Recognizing types and members

Type declarations begin with optional attributes and modifiers, followed by a type keyword:

```csharp
public sealed class Service { }
public readonly record struct Coordinate(int X, int Y);
internal interface IWorker { }
public enum Status { Pending, Complete }
public delegate bool Filter<in T>(T value);
```

Inside a type, look at the token after the modifiers:

- A name followed by `{ get; ... }` is a property.
- The containing type’s name followed by `(...)` is a constructor.
- A return type and a name followed by `(...)` is a method.
- A type and name followed by `;` is usually a field.
- `event` declares an event; `operator` declares an operator.

Generic parameters appear in angle brackets, and constraints may follow a `where` clause:

```csharp
public T Find<T>(IEnumerable<T> items) where T : class
```

This reads: “public method `Find`, generic over reference type `T`, receives a sequence of `T`, and returns `T`.”

## Accessibility and member modifiers

Accessibility answers **who may use this declaration**. The most common levels are:

- `public`: any code with a reference to the containing assembly.
- `internal`: code in the same assembly (usually the same project output).
- `protected`: the containing type and derived types.
- `private`: the containing type only.
- `protected internal`: same assembly **or** derived types elsewhere.
- `private protected`: derived types in the same assembly.

Top-level types default to `internal`; class and struct members default to `private`. Prefer explicit accessibility on important declarations.

Other modifiers describe behavior or ownership. For example, `public static async Task LoadAsync()` is public, belongs to its type, can use `await`, and returns a `Task`.

## Fields, properties, and accessors

A field is storage:

```csharp
private readonly DateTimeOffset _createdAt;
```

A property exposes access through `get`, `set`, or `init` accessors:

```csharp
public string Name { get; set; } = "";
public int Id { get; init; }
public decimal Total { get; private set; }
```

These are auto-implemented properties: the compiler creates hidden backing storage. A property can instead contain logic:

```csharp
private string _name = "";

public string Name
{
    get => _name;
    set => _name = value.Trim();
}
```

`private set` means callers may read but only the declaring type may assign. `init` allows assignment during object initialization but not ordinary later mutation.

## Constructors and object initializers

A constructor initializes a new instance and has no return type:

```csharp
public class Connection
{
    public Connection(string host)
    {
        Host = host;
    }

    public string Host { get; }
    public int Port { get; init; } = 443;
}
```

Calling it can combine constructor arguments with an object initializer:

```csharp
var connection = new Connection("example.com")
{
    Port = 8443
};
```

The constructor runs first; then initializer assignments run. `new()` is a target-typed form when the expected type is already known:

```csharp
Connection connection = new("example.com");
```

## Reading method signatures and return types

Read a signature from left to right:

```csharp
public async Task<Customer?> FindAsync(
    Guid id,
    CancellationToken cancellationToken = default)
```

- `public`: callable by any referencing code.
- `async`: body may use `await`.
- `Task<Customer?>`: eventually completes with a nullable `Customer`.
- `FindAsync`: method name; suffix follows async convention.
- `Guid id`: required value-type parameter.
- `CancellationToken ... = default`: optional parameter whose default is an uncancelable token.

A `void` method returns no value. `Task` represents asynchronous completion without a result. `IEnumerable<T>` represents a synchronous sequence, and `IAsyncEnumerable<T>` an asynchronous sequence.

## Attributes

Attributes attach metadata to declarations. They are written in brackets before their target:

```csharp
[Obsolete("Use PlaceAsync instead")]
public void Place() { }

[Required, StringLength(100)]
public string Name { get; init; } = "";
```

The `Attribute` suffix can usually be omitted: `[Required]` refers to `RequiredAttribute`. Compilers, runtimes, frameworks, serializers, test runners, and reflection-based code may inspect attributes. An attribute only has behavior when some tool or code interprets it.

Attributes can target specific generated elements:

```csharp
[assembly: CLSCompliant(true)]
[field: NonSerialized]
```

## Expression-bodied members

`=>` can replace a member body when the member is a single expression:

```csharp
public string FullName => $"{FirstName} {LastName}";
public int Add(int left, int right) => left + right;
public override string ToString() => FullName;
```

This arrow does not always mean “lambda.” Context determines whether it is an expression-bodied member, lambda expression, switch arm, or property accessor.

Use expression bodies for concise, obvious behavior. Use a block body when validation, branching, logging, or multiple steps make the expanded form clearer.

## File layout conventions

Common conventions—not compiler requirements—include:

1. `using` directives
2. file-scoped namespace
3. one primary public type matching the filename
4. fields
5. constructors
6. properties/events
7. public methods
8. private helper methods

Generated code, partial classes, nested types, and tightly related small types are common exceptions. Follow the repository’s `.editorconfig` and local style before imposing a different order.

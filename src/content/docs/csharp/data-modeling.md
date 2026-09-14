---
title: Data Modeling
description: Choose among classes, records, structs, interfaces, and enums when modeling data and behavior.
sidebar:
  order: 4
---

C# offers several kinds of types because identity, equality, copying, mutability, and polymorphism are different design concerns.

## Quick reference

### Choose a type

| Type | Choose it when | Key semantics |
| --- | --- | --- |
| `class` | The object has identity, mutable lifecycle, or behavior | Reference type; reference equality unless overridden |
| `record` | The object is primarily a data value | Reference type; generated value equality and `with` support |
| `record struct` | A small data value should copy by value | Value type; generated value equality and `with` support |
| `struct` | A small value needs value semantics or low-allocation representation | Value type; copied on assignment |
| `interface` | Consumers need an explicit capability/contract | Implemented by classes, records, and structs |
| `enum` | A closed set of named integral constants is sufficient | Value type; validate external numeric values |

### Property and construction patterns

```csharp
public sealed class Customer
{
    private readonly List<Order> _orders = [];

    public Customer(Guid id, string name)
    {
        Id = id;
        Name = name;
    }

    public Guid Id { get; }                    // constructor-only assignment
    public string Name { get; private set; }   // controlled mutation
    public required string Email { get; init; }// caller must initialize
    public IReadOnlyList<Order> Orders => _orders;

    public void Rename(string name) => Name = name;
}

var customer = new Customer(Guid.NewGuid(), "Ada")
{
    Email = "ada@example.com"
};
```

### Inheritance keywords

| Keyword | Meaning |
| --- | --- |
| `abstract class` | Cannot be instantiated; may contain incomplete and completed behavior |
| `abstract` member | Derived non-abstract type must implement it |
| `virtual` member | Has a default implementation that derived types may replace |
| `override` member | Replaces inherited `abstract` or `virtual` behavior |
| `sealed class` | Cannot be inherited |
| `sealed override` | Cannot be overridden again farther down the hierarchy |

### Default guidance

- Keep fields private; expose intent through properties and methods.
- Prefer constructor parameters for invariants that must always be valid.
- Use `required` for initialization requirements, not as runtime validation.
- Prefer composition and interfaces over deep inheritance trees.
- Use immutable models when practical; expose read-only collection interfaces.
- Avoid large or mutable structs.

## Fields and properties

A field is a storage location owned by a type:

```csharp
private int _retryCount;
private readonly Guid _id;
public const int MaximumRetries = 3;
```

A property is a member accessed with field-like syntax but implemented through accessors:

```csharp
public string Name { get; set; } = "";
public decimal Total => Subtotal + Tax;
```

Public properties preserve the ability to add validation, computed behavior, serialization metadata, or restricted setters without changing call syntax. Public mutable fields expose storage directly and are rarely appropriate.

Do not hide expensive I/O or surprising side effects in a property. Callers expect property access to be fast and repeatable; use a method for substantial work.

## `get`, `set`, `init`, and `required`

Accessors define how a property can be used:

```csharp
public string Name { get; set; }          // read and assign anytime
public Guid Id { get; }                   // read publicly; assign in constructor
public int Count { get; private set; }    // only this type can assign
public DateOnly Date { get; init; }       // assign only during initialization
```

`required` tells the compiler that object creation must initialize a field or property:

```csharp
public sealed class User
{
    public required string Name { get; init; }
}

var user = new User { Name = "Ada" };
```

`required` is compile-time initialization enforcement, not input validation. Reflection, deserializers, or `null!` can bypass expectations, and `required string` does not verify that text is non-empty. Constructors are usually stronger when values must be validated together.

## Constructors and object initializers

Constructors establish an initial state:

```csharp
public sealed class Money
{
    public Money(decimal amount, string currency)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(currency);
        Amount = amount;
        Currency = currency;
    }

    public decimal Amount { get; }
    public string Currency { get; }
}
```

Constructors can chain to other constructors with `this(...)` or to a base constructor with `base(...)`:

```csharp
public Customer(string name) : this(Guid.NewGuid(), name) { }
```

Object initializers assign accessible fields or properties after construction:

```csharp
var options = new ExportOptions
{
    IncludeHeaders = true,
    Format = ExportFormat.Csv
};
```

Use constructors or static factory methods when invalid combinations must be prevented. Use initializers for optional configuration or data-transfer models where framework construction is important.

## Classes and reference semantics

Classes are reference types. Multiple variables may refer to the same instance:

```csharp
var original = new Customer(Guid.NewGuid(), "Ada") { Email = "a@example.com" };
var alias = original;
alias.Rename("Grace");
// original.Name is also "Grace"
```

By default, class equality is reference identity: two separate instances are unequal even if all fields match. A class may override `Equals` and `GetHashCode`, but mutable fields used in equality can make dictionary and set behavior unsafe.

Classes support inheritance, interface implementation, encapsulation, and finalization (though finalizers are uncommon and expensive). Mark classes `sealed` when they are not designed as inheritance points.

## Records and value equality

A record class is a reference type that generates value-oriented equality, useful formatting, deconstruction for positional records, and nondestructive mutation:

```csharp
public sealed record Address(string Street, string City, string PostalCode);

var first = new Address("1 Main", "London", "N1");
var second = new Address("1 Main", "London", "N1");
Console.WriteLine(first == second); // true

var moved = first with { PostalCode = "N2" };
```

A `with` expression performs a shallow copy. Referenced mutable objects inside the record remain shared unless explicitly copied. Records are not automatically deeply immutable; properties can still have setters, and collection properties can still reference mutable collections.

Record classes are best for data with value semantics: messages, request/response models, configuration snapshots, and value objects. Be cautious using records for ORM entities or objects whose identity and lifecycle matter more than all-member equality.

## Structs and value semantics

Structs are value types and are copied on assignment or when passed by value:

```csharp
public readonly struct Percentage
{
    public Percentage(decimal value) => Value = value;
    public decimal Value { get; }
}
```

Good structs are usually small, immutable, and represent one value—like coordinates, IDs, dates, or measurements. `readonly struct` promises that instance fields are readonly and prevents accidental defensive copying in some contexts.

Avoid large structs because copying becomes costly. Avoid mutable structs because mutation can affect a temporary copy rather than the value a reader expects. All structs have an all-zero default state, even when a custom constructor exists, so account for `default`.

A `record struct` combines value-type copying with generated record equality and `with` behavior:

```csharp
public readonly record struct Coordinate(int X, int Y);
```

## Enums

An enum names integral constants:

```csharp
public enum OrderStatus
{
    Draft = 0,
    Submitted = 1,
    Shipped = 2,
    Cancelled = 3
}
```

Give `0` a meaningful default such as `Unknown`, `None`, or the correct initial state. Any value of the underlying integral type can be cast to the enum, even if unnamed, so validate untrusted values with `Enum.IsDefined` when required.

Use `[Flags]` only for independently combinable values and assign powers of two:

```csharp
[Flags]
public enum Permission
{
    None = 0,
    Read = 1,
    Write = 2,
    Delete = 4,
    ReadWrite = Read | Write
}
```

If each case needs data or behavior, use polymorphic records/classes rather than forcing that information into an enum and a large switch.

## Interfaces as explicit contracts

An interface names a capability a type explicitly implements:

```csharp
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
```

Matching member shape alone does not implement a C# interface. The implementing type explicitly names the interface in its declaration.

Interfaces support multiple implementation, generic constraints, testing substitutes, and separation between consumer needs and implementation. Keep them cohesive. An interface is useful when there are multiple implementations, a boundary needs substitution, or consumers should depend on a capability—not merely because every class might have one.

Interfaces can define default implementations and static abstract members in modern C#, but these are advanced tools; ordinary instance contracts remain the common case.

## Inheritance and polymorphism

A class can inherit from one base class and implement multiple interfaces:

```csharp
public abstract class Notification
{
    protected Notification(string recipient) => Recipient = recipient;

    public string Recipient { get; }
    public abstract Task SendAsync(CancellationToken cancellationToken);
    public virtual string Describe() => $"Notification for {Recipient}";
}

public sealed class EmailNotification : Notification
{
    public EmailNotification(string recipient) : base(recipient) { }

    public override Task SendAsync(CancellationToken cancellationToken)
    {
        // Send email...
        return Task.CompletedTask;
    }
}
```

Polymorphism lets code call an overridden member through a base or interface reference:

```csharp
Notification notification = new EmailNotification("ada@example.com");
await notification.SendAsync(cancellationToken);
```

Only `virtual`, `abstract`, or already-overridden members can be overridden. Writing a same-named member with `new` hides rather than overrides it and usually creates confusing behavior based on the variable’s compile-time type.

## `abstract`, `virtual`, `override`, and `sealed`

Use `abstract` when the base concept is incomplete and every concrete subtype must provide behavior. Use `virtual` when a meaningful default exists and controlled customization is part of the design. Use `override` to participate in runtime polymorphism.

Inheritance is an API commitment. Constructors, protected members, virtual call timing, and invariants all affect derived classes. Avoid calling overridable members from constructors because the derived portion may not be initialized yet.

Use `sealed` to state that a class is complete or that an override must not be customized further. Sealing also lets maintainers change internals without preserving an undocumented inheritance contract.

## Composition versus inheritance

Inheritance models an **is-a** substitutable relationship. Composition models a **has-a/uses-a** relationship:

```csharp
public sealed class ReportService
{
    private readonly IClock _clock;
    private readonly IReportStore _store;

    public ReportService(IClock clock, IReportStore store)
    {
        _clock = clock;
        _store = store;
    }
}
```

Composition is usually easier to test, replace, and evolve. Prefer it when behavior can be delegated to collaborators. Choose inheritance when subtypes truly satisfy the base contract and shared polymorphic behavior is intentional—not merely to reuse a few lines of code.

## A practical modeling checklist

Before choosing a type, ask:

1. Does this value have identity, or is equality based on its contents?
2. Should assignment share one object or copy a value?
3. Is mutation necessary, and who should control it?
4. Must invalid states be prevented at construction?
5. Do consumers need a stable interface rather than an implementation?
6. Is the value small enough and safe enough to be a struct?
7. Is the set of cases truly closed and data-free enough for an enum?
8. Would composition express the relationship more clearly than inheritance?

The smallest type that accurately communicates these semantics is usually the best choice.

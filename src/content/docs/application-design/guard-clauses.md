---
title: Guard Clauses
description: Fail early when inputs or state violate required conditions.
sidebar:
  order: 7
---

A guard clause checks a required condition near the start of an operation and exits immediately when that condition is not satisfied. Guards keep invalid values and impossible state out of the rest of the code.

**Links:** [ardalis/GuardClauses repository](https://github.com/ardalis/GuardClauses) · [NuGet package](https://www.nuget.org/packages/Ardalis.GuardClauses)

## Quick reference

### Two common forms

A control-flow guard returns an ordinary outcome:

```csharp
if (order is null)
{
    return Result<OrderResponse>.NotFound();
}
```

A precondition guard throws because the caller supplied a value the method or object cannot accept:

```csharp
ArgumentNullException.ThrowIfNull(order);

if (quantity <= 0)
{
    throw new ArgumentOutOfRangeException(
        nameof(quantity),
        quantity,
        "Quantity must be greater than zero.");
}
```

Both forms avoid wrapping the useful path in nested `if` statements. The correct exit—return or exception—depends on the operation's contract.

### Using `Guard.Against`

```csharp
using Ardalis.GuardClauses;

public sealed class OrderLine
{
    public OrderLine(string productCode, int quantity, decimal unitPrice)
    {
        ProductCode = Guard.Against.NullOrWhiteSpace(productCode);
        Quantity = Guard.Against.NegativeOrZero(quantity);
        UnitPrice = Guard.Against.Negative(unitPrice);
    }

    public string ProductCode { get; }
    public int Quantity { get; }
    public decimal UnitPrice { get; }
}
```

The built-in guards return the accepted input, which makes assignment concise. Modern overloads infer the argument name through `CallerArgumentExpression`, so `nameof(...)` is often unnecessary.

### Guard, validation, or result?

| Situation | Typical response |
| --- | --- |
| Programmer passes `null` to an API that forbids it | Throw `ArgumentNullException` |
| Numeric argument is outside the method's supported range | Throw `ArgumentOutOfRangeException` |
| Existing object is asked to perform an impossible operation | Throw `InvalidOperationException` or return an expected domain result |
| User submits several invalid fields | Return a collection of validation errors |
| Requested record does not exist during a normal lookup | Return `null`, `NotFound`, or another explicit result |
| An internal invariant has been violated | Throw an exception and investigate the defect |

### Practical rules

- Place guards before work that relies on the checked condition.
- Match the failure mechanism to the caller's contract.
- Use guards to protect invariants, not to replace complete user-input validation.
- Return the guard result directly into a property when it improves clarity.
- Keep custom guards deterministic and free of database or network I/O.
- Do not repeat the same check at every private method after a trusted boundary.
- Test the accepted boundary values as well as rejected values.

## The guard-clause pattern

Compare nested validation:

```csharp
public decimal CalculateTotal(Order? order)
{
    if (order is not null)
    {
        if (order.Lines.Count > 0)
        {
            return order.Lines.Sum(line => line.Quantity * line.UnitPrice);
        }
    }

    throw new ArgumentException("A non-empty order is required.");
}
```

With guards, the normal path remains visible:

```csharp
public decimal CalculateTotal(Order? order)
{
    ArgumentNullException.ThrowIfNull(order);

    if (order.Lines.Count == 0)
    {
        throw new ArgumentException("The order must contain a line.", nameof(order));
    }

    return order.Lines.Sum(line => line.Quantity * line.UnitPrice);
}
```

A guard does not make a condition correct merely by moving it upward. It still needs a clear contract, useful exception or result, and appropriate ownership. Guard only conditions the operation is responsible for enforcing.

## Failing fast

Failing fast means detecting an invalid condition close to where it enters a trusted operation rather than allowing it to cause a less meaningful failure later.

Without an early null check, code might fail several calls later with a `NullReferenceException`. Without an invariant check, an invalid entity might be stored and cause a reporting or billing error much later. A focused guard provides:

- a failure near the source,
- a more specific error category,
- a useful parameter name or domain message,
- a shorter invalid execution path,
- protection for the assumptions made below the guard.

Failing fast does not mean crashing the whole process for every bad user request. A web boundary should translate known exceptions or, preferably for expected rejection, return an explicit validation/result response. Unexpected invariant failures should reach centralized exception handling and diagnostics.

## Guards versus user-input validation

Guards and input validation overlap syntactically but serve different caller needs.

A constructor guard protects the object from ever existing in an invalid state:

```csharp
public sealed record ProductCode
{
    public ProductCode(string value)
    {
        Value = Guard.Against.NullOrWhiteSpace(value);
    }

    public string Value { get; }
}
```

A request validator should normally collect all useful client-facing errors:

```text
productCode: Product code is required.
quantity: Quantity must be greater than zero.
unitPrice: Unit price cannot be negative.
```

Throwing on the first field forces a client to fix one problem per request and often couples exception text to the external API. Validate the request shape before construction, then retain constructor/domain guards as the final invariant boundary. Do not remove domain protection merely because one endpoint currently validates the same rule.

Also separate validation from race-sensitive business decisions. “Customer exists” or “inventory is available” may change between checking and writing. Handle those checks within the operation and transaction model rather than treating them as permanent input facts.

## Built-in .NET guards

For simple cases, the BCL may be all that is needed:

```csharp
ArgumentNullException.ThrowIfNull(customer);
ArgumentException.ThrowIfNullOrWhiteSpace(customerNumber);

if (pageSize is < 1 or > 200)
{
    throw new ArgumentOutOfRangeException(nameof(pageSize), pageSize,
        "Page size must be between 1 and 200.");
}
```

Direct `if` statements are also guard clauses. A package is useful when it makes recurring checks concise and consistent; it is not required to use the pattern.

## Common Ardalis guards

Install the package with:

```bash
dotnet add package Ardalis.GuardClauses
```

Common guards include:

| Guard | Rejects |
| --- | --- |
| `Null` | A `null` value |
| `NullOrEmpty` | Null or empty strings, identifiers, or collections supported by the overload |
| `NullOrWhiteSpace` | Null, empty, or whitespace-only string |
| `Default` | The type's default value |
| `Negative` | Numeric value below zero |
| `NegativeOrZero` | Numeric value at or below zero |
| `Zero` | Numeric value equal to zero |
| `OutOfRange` | Value outside supplied bounds |
| `EnumOutOfRange` | Undefined enum value |
| `InvalidInput` / `Expression` | Value rejected by a supplied predicate |
| `InvalidFormat` | String that does not match the supplied format rule |
| `NotFound` | Null lookup result for a supplied key |

Exact overloads differ by package version and input type. Check the selected version rather than assuming every guard supports every type.

Many guards can initialize fields and properties directly:

```csharp
_name = Guard.Against.NullOrWhiteSpace(name);
_maximum = Guard.Against.OutOfRange(maximum, 1, 100);
```

This style is clearest when the returned value is unchanged. If a value also needs normalization, make that explicit:

```csharp
string acceptedName = Guard.Against.NullOrWhiteSpace(name);
Name = acceptedName.Trim();
```

## Guarding constructors and domain operations

Constructors and factory methods should establish valid object state:

```csharp
public sealed class Discount
{
    public Discount(decimal percentage)
    {
        Percentage = Guard.Against.OutOfRange(percentage, 0m, 100m);
    }

    public decimal Percentage { get; }
}
```

State transitions need a different kind of check:

```csharp
public void Submit()
{
    if (Status != OrderStatus.Draft)
    {
        throw new InvalidOperationException(
            $"An order in {Status} status cannot be submitted.");
    }

    if (_lines.Count == 0)
    {
        throw new InvalidOperationException(
            "An order must contain at least one line before submission.");
    }

    Status = OrderStatus.Submitted;
}
```

These are state guards, not invalid method arguments. If “cannot submit” is a routine business outcome the caller is expected to present to a user, an explicit `Result` may communicate it better than an exception. Be consistent about whether a rejected transition is exceptional or expected.

Do not perform asynchronous lookups inside entity constructors. The application handler can load required data, then call a synchronous domain operation with the facts or collaborators it needs.

## Choosing exception types

Use established exception categories when they express the failure:

| Exception | Appropriate meaning |
| --- | --- |
| `ArgumentNullException` | A required argument is null |
| `ArgumentException` | An argument is malformed or otherwise invalid |
| `ArgumentOutOfRangeException` | An argument falls outside its accepted range |
| `InvalidOperationException` | The call is invalid for the object's current state |
| `ObjectDisposedException` | A disposed object is used |

Do not throw `NullReferenceException` manually. Do not throw a generic `Exception` when a standard category applies. Include the parameter name for argument exceptions and avoid putting secrets or sensitive data into exception messages.

Create a custom exception only when callers need to distinguish and handle that failure independently or when it represents a stable domain/infrastructure category. A custom type for every guard adds noise without improving behavior.

## Creating a custom Ardalis guard

Custom guards are extension methods on `IGuardClause`. Placing them in the `Ardalis.GuardClauses` namespace makes them available with the package's normal import:

```csharp
using System.Runtime.CompilerServices;

namespace Ardalis.GuardClauses;

public static class OrderGuardExtensions
{
    public static string InvalidProductCode(
        this IGuardClause guardClause,
        string input,
        [CallerArgumentExpression(nameof(input))] string? parameterName = null)
    {
        if (!ProductCodeFormat.IsValid(input))
        {
            throw new ArgumentException(
                "The product code format is invalid.",
                parameterName);
        }

        return input;
    }
}
```

Usage remains consistent:

```csharp
ProductCode = Guard.Against.InvalidProductCode(productCode);
```

A custom guard should:

- have one clear rejection rule,
- return the accepted value when useful,
- report the relevant argument name,
- throw a documented exception type,
- avoid hidden mutation and I/O,
- avoid exposing sensitive input in its message.

If the rule needs repositories, current-user state, time-sensitive data, or several error messages, it is probably application validation or a domain operation rather than a simple guard.

## Testing guarded behavior

Test the contract, not the guard library's implementation:

```csharp
[Fact]
public void Constructor_rejects_zero_quantity()
{
    Action create = () => new OrderLine("ABC-123", 0, 10m);

    var exception = Assert.Throws<ArgumentException>(create);
    Assert.Equal("quantity", exception.ParamName);
}

[Fact]
public void Constructor_accepts_positive_quantity()
{
    var line = new OrderLine("ABC-123", 1, 10m);

    Assert.Equal(1, line.Quantity);
}
```

For ranges, test just below, at, and just above each meaningful boundary. For state transitions, test each allowed and rejected source state. Avoid asserting complete exception text unless the exact text is a supported contract; parameter name and exception type are usually more stable.

## Avoid duplicated and excessive guards

Guard at boundaries where trust or state changes:

- public constructors and factory methods,
- public application operations,
- domain state transitions,
- adapters receiving data from external systems.

After a value has crossed a trusted boundary, private helpers can normally rely on the established invariant. Rechecking everywhere obscures the useful logic and suggests unclear ownership.

Also avoid guards that duplicate type-system guarantees. A non-nullable property still needs runtime protection when callers or serializers can bypass nullable analysis, but a private method called only with a validated value may not.

A guard clause is successful when it makes an operation's assumptions obvious. If dozens of checks dominate the method, introduce a request validator, value object, factory, or cohesive domain operation instead of expanding the guard wall.

---
title: Control Flow and Pattern Matching
description: Use conditions, loops, switch expressions, and patterns to direct program behavior.
sidebar:
  order: 6
---

C# combines familiar branching and looping statements with patterns that test values, types, properties, and sequence shape.

## Quick reference

### Branching

```csharp
if (order is null)
    return;
else if (order.Total > 1_000m)
    RequireApproval(order);
else
    Submit(order);

string label = order.IsPriority ? "Priority" : "Standard";

string status = order switch
{
    { IsCancelled: true } => "Cancelled",
    { Total: > 1_000m } => "Approval required",
    { Items.Count: 0 } => "Empty",
    _ => "Ready"
};
```

### Loops

```csharp
for (int i = 0; i < items.Count; i++) { }
foreach (var item in items) { }
while (condition) { }
do { } while (condition);
```

### Pattern examples

| Pattern | Example | Matches when |
| --- | --- | --- |
| Null | `value is null` | Value is null |
| Type | `value is Customer c` | Runtime value is a non-null `Customer` |
| Constant | `status is OrderStatus.Draft` | Equal to the constant |
| Relational | `amount is >= 0 and < 100` | Comparisons succeed |
| Logical | `c is not null` | Nested pattern is false |
| Property | `order is { Total: > 0 }` | Property pattern matches |
| Positional | `point is (0, 0)` | Deconstructed positions match |
| List | `numbers is [1, 2, ..]` | Starts with 1 and 2 |
| Discard | `_` | Anything |

### Choose the simplest construct

- Use `if` for a few conditions or procedural branches.
- Use a switch expression to map one input to one output.
- Use a switch statement when each case performs multiple actions.
- Use `foreach` when each item matters; use `for` when the index matters.
- Use patterns when they make the tested shape clearer—not merely because they are shorter.

## `if`, `else`, and conditional expressions

`if` requires a `bool`; C# does not treat arbitrary values as truthy or falsy:

```csharp
if (items.Count > 0)
{
    Process(items);
}
else
{
    LogEmpty();
}
```

Braces are optional for one embedded statement, but consistent braces reduce errors during edits.

The conditional operator chooses one of two expressions:

```csharp
decimal rate = customer.IsPreferred ? 0.10m : 0.05m;
```

It produces a value, so both branches must be compatible with a common or target type. Do not nest several conditional operators when an `if` or switch would be clearer.

Short-circuit operators avoid evaluating the right operand when possible:

```csharp
if (customer is not null && customer.IsActive) { }
if (isAdministrator || HasPermission(user)) { }
```

Use `&` and `|` deliberately when non-short-circuit boolean evaluation or bitwise operations are required.

## Switch statements

A switch statement selects a statement section:

```csharp
switch (status)
{
    case OrderStatus.Draft:
        Edit(order);
        break;

    case OrderStatus.Submitted:
    case OrderStatus.Shipped:
        DisplayReadOnly(order);
        break;

    default:
        throw new ArgumentOutOfRangeException(nameof(status));
}
```

C# prevents accidental fall-through from a non-empty case. Multiple labels can share one body. Each section usually ends with `break`, `return`, `throw`, or another control transfer.

Cases can use patterns and guards:

```csharp
switch (value)
{
    case int number when number < 0:
        Console.WriteLine("Negative integer");
        break;
    case string { Length: > 0 } text:
        Console.WriteLine(text);
        break;
    case null:
        Console.WriteLine("Missing");
        break;
}
```

Case order matters: the first matching reachable case executes.

## Switch expressions

A switch expression maps an input to a result:

```csharp
string Describe(int score) => score switch
{
    >= 90 => "Excellent",
    >= 70 => "Passing",
    >= 0 => "Needs improvement",
    _ => throw new ArgumentOutOfRangeException(nameof(score))
};
```

Each arm has `pattern [when guard] => expression`. Arms are evaluated top to bottom. Unlike a switch statement, there is no implicit `default`; `_` is the usual catch-all. If no arm matches, the expression throws at runtime, and the compiler may warn when it can identify non-exhaustive input.

Use switch expressions for concise value mapping. If arms need multiple statements or mutate shared state, a switch statement or separate methods is usually clearer.

## Loops

### `for`

Use `for` when initialization, condition, and update belong together, especially for index-based access:

```csharp
for (int index = 0; index < items.Count; index++)
{
    Console.WriteLine($"{index}: {items[index]}");
}
```

### `foreach`

`foreach` enumerates values without exposing iteration mechanics:

```csharp
foreach (var item in items)
{
    Process(item);
}
```

It works with arrays, common collections, and types following the enumeration pattern. Do not structurally modify collections such as `List<T>` during their `foreach`; gather changes or iterate another way.

### `while` and `do`

`while` checks before every iteration and may execute zero times:

```csharp
while (queue.TryDequeue(out var item))
{
    Process(item);
}
```

`do` checks after the body and executes at least once:

```csharp
do
{
    input = Console.ReadLine();
} while (string.IsNullOrWhiteSpace(input));
```

Ensure loop conditions can progress toward termination, and honor cancellation in potentially long-running loops.

## `break`, `continue`, and `return`

- `break` exits the nearest loop or switch statement.
- `continue` skips to the next iteration of the nearest loop.
- `return` exits the current method, optionally with a value.

```csharp
foreach (var item in items)
{
    if (item is null)
        continue;

    if (item.IsTerminal)
        break;

    Process(item);
}
```

Early `return` statements can reduce nesting by handling invalid or terminal cases first. Too many scattered exits can make resource ownership or state transitions harder to follow, so keep the method’s lifecycle clear.

## Type, constant, relational, and logical patterns

A type pattern both checks compatibility and introduces a scoped variable:

```csharp
if (message is EmailMessage email)
{
    Send(email);
}
```

It does not match `null`. Constant patterns compare with a constant or enum member:

```csharp
if (status is OrderStatus.Complete) { }
```

Relational patterns compare to constants:

```csharp
string category = temperature switch
{
    < 0 => "Freezing",
    <= 20 => "Cool",
    < 30 => "Warm",
    _ => "Hot"
};
```

Logical patterns combine patterns:

```csharp
if (percentage is >= 0 and <= 100) { }
if (status is OrderStatus.Draft or OrderStatus.Submitted) { }
if (customer is not null) { }
```

Parenthesize mixed `and`/`or` patterns when precedence is not immediately obvious.

## Property patterns

Property patterns inspect accessible members:

```csharp
if (order is { Customer.IsActive: true, Total: > 0 })
{
    Submit(order);
}
```

A property pattern does not match a null input. It can introduce variables:

```csharp
if (order is { Customer.Name: var name, Total: > 100m })
{
    Console.WriteLine(name);
}
```

An empty property pattern `{ }` matches any non-null value, though `is not null` is often clearer.

Deep property patterns can compactly express shape but may hide repeated property access or side effects. Properties used in patterns should behave like normal, inexpensive properties.

## Positional patterns

A positional pattern calls a suitable `Deconstruct` method. Records with positional parameters generate one:

```csharp
public record Point(int X, int Y);

string Describe(Point point) => point switch
{
    (0, 0) => "Origin",
    (0, _) => "Y axis",
    (_, 0) => "X axis",
    (> 0, > 0) => "Upper right",
    _ => "Elsewhere"
};
```

Tuples also support positional patterns:

```csharp
return (isEnabled, hasAccess) switch
{
    (true, true) => Decision.Allow,
    (false, _) => Decision.Disabled,
    _ => Decision.Deny
};
```

Use property patterns when member names matter more than position.

## List patterns

List patterns match sequence shape for arrays, spans, and compatible list-like types:

```csharp
string Describe(int[] values) => values switch
{
    [] => "Empty",
    [0] => "A single zero",
    [var first, var second] => $"Pair: {first}, {second}",
    [1, 2, ..] => "Starts with 1, 2",
    [.., 0] => "Ends with zero",
    _ => "Other"
};
```

A slice pattern (`..`) matches zero or more elements. It may capture the slice (`.. var middle`) when the input supports doing so. List patterns inspect an existing list-like value; they do not enumerate an arbitrary `IEnumerable<T>`.

## Guards with `when`

A `when` guard adds a boolean condition after a pattern:

```csharp
string GetRate(Customer customer) => customer switch
{
    { IsActive: false } => "Unavailable",
    { Tier: Tier.Gold } when customer.Orders.Count >= 10 => "Premium",
    { Tier: Tier.Gold } => "Gold",
    _ => "Standard"
};
```

Prefer expressing simple structural tests inside the pattern. Use `when` for conditions that require method calls, variables outside the matched value, or logic not naturally represented by a pattern.

## Combining patterns and discards

`and`, `or`, and `not` combine patterns. `_` discards a value or acts as a catch-all:

```csharp
if (age is >= 18 and < 65) { }

var quadrant = point switch
{
    (> 0, > 0) => 1,
    (< 0, > 0) => 2,
    (< 0, < 0) => 3,
    (> 0, < 0) => 4,
    _ => 0
};
```

A `var` pattern always matches and captures, while `_` matches without creating a variable.

## Null checks using patterns

Use:

```csharp
if (value is null) { }
if (value is not null) { }
```

Pattern null checks do not invoke overloaded equality operators, which makes them reliable for checking the actual null reference. Within a successful `is not null` branch, nullable flow analysis treats the value as non-null.

Property and type patterns inherently reject null:

```csharp
if (customer is { Name.Length: > 0 }) { }
if (value is Customer customer) { }
```

## Keep control flow readable

Pattern matching is most valuable when it reveals a decision table or object shape. Split a pattern when readers must mentally execute it to understand it. Useful options include:

- name complex boolean conditions,
- extract a method for one case,
- use sequential guard clauses,
- use polymorphism when behavior genuinely belongs to different types,
- use a dictionary only when decisions are truly data-driven.

Straightforward code is easier to debug and change than a clever one-expression solution.

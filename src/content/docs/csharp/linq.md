---
title: LINQ
description: Query and transform sequences using Language Integrated Query.
sidebar:
  order: 9
---

Language Integrated Query (LINQ) provides composable operations for filtering, transforming, ordering, grouping, and aggregating data.

## Quick reference

### Typical pipeline

```csharp
var names = orders
    .Where(order => order.IsOpen)
    .OrderByDescending(order => order.Total)
    .Select(order => order.CustomerName)
    .Distinct()
    .ToList();
```

Read left to right: start with orders, keep open ones, order them, project names, remove duplicates, then execute and store a list.

### Common operators

| Goal | Operator | Result idea |
| --- | --- | --- |
| Filter | `Where(predicate)` | Matching elements |
| Transform | `Select(selector)` | One output per input |
| Flatten | `SelectMany(selector)` | Many inner sequences → one sequence |
| Sort | `OrderBy`, `ThenBy` | Ordered sequence |
| Group | `GroupBy(keySelector)` | Groups keyed by a value |
| Join | `Join`, `GroupJoin` | Relate sequences by keys |
| Count/aggregate | `Count`, `Sum`, `Min`, `Max`, `Average`, `Aggregate` | Scalar result |
| Test | `Any`, `All`, `Contains` | `bool` |
| One element | `First`, `Single`, `Last`, `ElementAt` | Element or exception |
| Optional element | `FirstOrDefault`, `SingleOrDefault`, etc. | Element or default |
| Materialize | `ToList`, `ToArray`, `ToDictionary`, `ToHashSet` | In-memory collection now |

### `First` versus `Single`

| Operator | Empty | More than one match |
| --- | --- | --- |
| `First` | throws | returns first |
| `FirstOrDefault` | returns default | returns first |
| `Single` | throws | throws |
| `SingleOrDefault` | returns default | throws |

Use `Single` only when uniqueness is an invariant you want to verify. An `OrDefault` result can be ambiguous for value types; use nullable projections or another result shape when “missing” must be distinguished from `default(T)`.

### Execution rule

```csharp
var query = orders.Where(order => order.IsOpen); // describes work
var list = query.ToList();                        // executes now
```

Most sequence-returning LINQ operators are deferred. Scalar operators and materializers execute immediately.

## Method syntax and query syntax

Method syntax chains extension methods:

```csharp
var result = orders
    .Where(order => order.Total > 100m)
    .OrderBy(order => order.CreatedAt)
    .Select(order => new { order.Id, order.Total });
```

Query syntax embeds query clauses in C#:

```csharp
var result =
    from order in orders
    where order.Total > 100m
    orderby order.CreatedAt
    select new { order.Id, order.Total };
```

The compiler translates query syntax to method calls. Method syntax supports every standard operator and is common for short pipelines. Query syntax can be easier to read for multiple joins, groups, or intermediate `let` values. Both forms can be mixed.

LINQ requires the relevant namespace, normally `System.Linq`, often provided by implicit usings.

## Lambdas as query operations

Most operators receive delegates:

```csharp
orders.Where(order => order.IsOpen);
orders.Select(order => order.Total);
orders.OrderBy(order => order.CreatedAt);
```

Names help reveal roles:

- A **predicate** returns `bool` and decides whether an element matches.
- A **selector** maps an element to another value.
- A **key selector** extracts a value used for ordering, grouping, or lookup.

Indexed overloads exist for some operators:

```csharp
var numbered = names.Select((name, index) => $"{index + 1}. {name}");
```

Do not place avoidable side effects in query lambdas. Deferred execution can cause those effects to happen later, repeatedly, or not at all.

## Filtering with `Where`

`Where` keeps elements whose predicate returns true:

```csharp
IEnumerable<Order> openOrders = orders.Where(order => order.IsOpen);
```

Multiple `Where` calls compose, though one predicate may be clearer when conditions belong together:

```csharp
var urgent = orders.Where(order => order.IsOpen && order.Total >= 1_000m);
```

`OfType<T>()` filters a non-generic or mixed sequence to values compatible with `T` and casts them:

```csharp
var messages = values.OfType<Message>();
```

`Cast<T>()` instead throws when any element cannot be cast.

## Transforming with `Select` and `SelectMany`

`Select` projects each input into exactly one output:

```csharp
var summaries = orders.Select(order => new OrderSummary(order.Id, order.Total));
```

The output type can differ completely from the input type.

`SelectMany` projects each input to an inner sequence and flattens all inner sequences:

```csharp
var allLines = orders.SelectMany(order => order.Lines);
```

A result selector can retain both outer and inner context:

```csharp
var linesWithOrder = orders.SelectMany(
    order => order.Lines,
    (order, line) => new { order.Id, Line = line });
```

If a pipeline unexpectedly produces `IEnumerable<IEnumerable<T>>`, consider whether `SelectMany` is intended.

## Ordering

Start ordering with `OrderBy` or `OrderByDescending`, then add tie-breakers with `ThenBy` or `ThenByDescending`:

```csharp
var sorted = customers
    .OrderBy(customer => customer.LastName)
    .ThenBy(customer => customer.FirstName);
```

Calling `OrderBy` again replaces the primary ordering; call `ThenBy` to refine it. Sorting is stable for LINQ to Objects, so elements with equal keys retain their relative source order.

Use an explicit comparer when default equality or ordering does not match requirements:

```csharp
var sortedNames = names.OrderBy(name => name, StringComparer.OrdinalIgnoreCase);
```

Ordering buffers input and costs roughly O(n log n); avoid sorting merely to find a minimum or maximum.

## Grouping

`GroupBy` produces keyed groups:

```csharp
var byStatus = orders.GroupBy(order => order.Status);

foreach (var group in byStatus)
{
    Console.WriteLine($"{group.Key}: {group.Count()}");
}
```

Each group implements `IGrouping<TKey,TElement>` and is itself enumerable. A selector can shape grouped elements:

```csharp
var totalsByStatus = orders
    .GroupBy(order => order.Status)
    .Select(group => new
    {
        Status = group.Key,
        Total = group.Sum(order => order.Total)
    });
```

`ToLookup` creates an eagerly built one-to-many lookup and returns an empty sequence for a missing key. `ToDictionary` requires unique keys and throws for duplicates.

## Aggregation and counting

Common terminal aggregations include:

```csharp
int count = orders.Count();
bool any = orders.Any();
decimal total = orders.Sum(order => order.Total);
decimal largest = orders.Max(order => order.Total);
double average = values.Average();
```

`Min`, `Max`, and `Average` throw for an empty sequence of non-nullable values. Handle emptiness deliberately when it is possible.

`Aggregate` performs a custom fold:

```csharp
int product = values.Aggregate(1, (accumulator, value) => accumulator * value);
```

Prefer a named loop when custom accumulation becomes hard to understand or needs multiple pieces of mutable state.

Use a collection’s `Count` property when you already have a concrete collection and need its size. `Count()` may enumerate an arbitrary sequence, though modern implementations optimize known collection shapes.

## Element operations

Use an operator whose cardinality claim matches the domain:

```csharp
var firstOpen = orders.First(order => order.IsOpen);
var maybeFirst = orders.FirstOrDefault(order => order.IsOpen);
var exactlyOne = orders.Single(order => order.Id == id);
```

- `First` means at least one must exist; extras are acceptable.
- `Single` means exactly one must exist; extras indicate broken uniqueness.
- `...OrDefault` permits no match but preserves the multiple-match behavior.

`Last` may require complete enumeration. `ElementAt` walks to the index for a general sequence but can index optimized sources.

For nullable-aware reference results, explicitly check the `OrDefault` result. For value types, consider projecting to a nullable value:

```csharp
int? score = scores
    .Where(score => score > threshold)
    .Select(score => (int?)score)
    .FirstOrDefault();
```

## `Any`, `All`, and `Contains`

Use `Any` to test existence without counting the whole sequence:

```csharp
bool hasOpen = orders.Any(order => order.IsOpen);
```

`All` returns true when every element matches—and also returns true for an empty sequence (vacuous truth):

```csharp
bool allValid = orders.All(order => order.Total >= 0);
```

`Contains` tests equality using the source’s or supplied equality behavior:

```csharp
bool includes = ids.Contains(targetId);
```

For many repeated membership checks, materialize keys into a `HashSet<T>` rather than repeatedly scanning a sequence.

## Materializing results

Materializers execute a query and store its current results:

```csharp
List<Order> list = query.ToList();
Order[] array = query.ToArray();
Dictionary<Guid, Order> byId = query.ToDictionary(order => order.Id);
HashSet<string> names = query.Select(order => order.CustomerName).ToHashSet();
```

Materialize when you need a snapshot, repeated iteration, random access, a concrete collection API, or to ensure a query executes within the lifetime of an external resource. Materialization consumes memory and may be wasteful when a streaming pass is enough.

`ToDictionary` throws on duplicate keys. If duplicates are expected, group first or decide explicitly which value wins.

## Deferred execution

This query captures the source and predicate, not current results:

```csharp
var open = orders.Where(order => order.IsOpen);
orders.Add(new Order { IsOpen = true });
var count = open.Count(); // includes the newly added item
```

Each enumeration usually runs the pipeline again. This enables streaming and composition but can cause:

- repeated expensive work,
- repeated database queries,
- changed results when the source mutates,
- side effects executing multiple times,
- resource-lifetime failures.

Call `ToList` or another materializer when snapshot semantics or one-time execution are required.

## Chaining without mutation

LINQ operators generally return new sequence descriptions and do not mutate the source:

```csharp
var sorted = names.OrderBy(name => name).ToList();
// names remains in its original order
```

By contrast, methods such as `List<T>.Sort`, `Reverse`, `RemoveAll`, and `Add` mutate a list. Confirm whether you want a transformed result or an in-place update.

The elements themselves may still be mutable references. A projection that modifies each object has side effects even if the sequence container is not changed; prefer explicit loops for intentional mutation.

## `IEnumerable<T>` versus `IQueryable<T>`

`IEnumerable<T>` queries run as .NET code over an enumerable source. Lambdas are compiled delegates.

`IQueryable<T>` queries build expression trees that a provider may translate into another query language, commonly SQL:

```csharp
IQueryable<Order> query = dbContext.Orders
    .Where(order => order.Total > 100m);
```

Important high-level differences:

- The provider, not ordinary C# execution, interprets supported expressions.
- Some methods cannot be translated.
- Execution is usually deferred until enumeration/materialization.
- Network/database cost dominates many in-memory assumptions.
- Filtering and projection should generally happen before materialization so the provider can perform them remotely.

Do not switch to `AsEnumerable` or call `ToList` early without understanding that remaining work moves to memory. Provider behavior belongs to that data-access technology’s documentation.

## Common mistakes

- **Using `Count() > 0`:** use `Any()` for an existence test.
- **Using `Single` to get the first item:** use it only to enforce uniqueness.
- **Forgetting deferred execution:** materialize when one-time or snapshot behavior is required.
- **Enumerating repeatedly:** cache results if the source is expensive or stateful.
- **Calling `ToList` too early:** it can load far more data than needed.
- **Assuming `OrDefault` means `null`:** value types default to values such as `0`.
- **Ignoring duplicate dictionary keys:** `ToDictionary` throws.
- **Doing side effects inside `Select`:** use a loop for actions; reserve `Select` for projection.
- **Losing ordering with another `OrderBy`:** use `ThenBy` for tie-breakers.
- **Assuming every C# method translates through `IQueryable`:** verify provider support.
- **Returning a deferred query over a disposed resource:** materialize within the resource lifetime or redesign ownership.

Prefer a readable multi-line pipeline with named intermediate values over one dense chain when debugging, cardinality, or execution timing is not obvious.

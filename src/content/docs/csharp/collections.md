---
title: Collections
description: Work with arrays and common generic collections in C#.
sidebar:
  order: 8
---

Collections store groups of values. The best choice depends on whether you need fixed size, indexed order, key lookup, uniqueness, or first/last-in processing.

## Quick reference

### Choose a collection

| Need | Common type | Key behavior |
| --- | --- | --- |
| Fixed-size indexed data | `T[]` | Fast indexing; length cannot change |
| Ordered, growable sequence | `List<T>` | Indexed access; efficient append |
| Key-to-value lookup | `Dictionary<TKey, TValue>` | Unique keys; average O(1) lookup |
| Unique values / set operations | `HashSet<T>` | No duplicates; average O(1) membership |
| First-in, first-out | `Queue<T>` | `Enqueue`, `Dequeue`, `Peek` |
| Last-in, first-out | `Stack<T>` | `Push`, `Pop`, `Peek` |
| General iteration contract | `IEnumerable<T>` | Can enumerate; says nothing about count/indexing |
| Read-only indexed contract | `IReadOnlyList<T>` | Count and index; no mutation API |
| Read-only key lookup | `IReadOnlyDictionary<TKey,TValue>` | Lookup without exposed mutation methods |

Big-O describes typical collection operations, not all implementations hidden behind an interface.

### Everyday operations

```csharp
int[] fixedValues = [1, 2, 3];

var names = new List<string> { "Ada", "Grace" };
names.Add("Linus");
string first = names[0];

var scores = new Dictionary<string, int>
{
    ["Ada"] = 10,
    ["Grace"] = 12
};

if (scores.TryGetValue("Ada", out int score)) { }

var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "csharp", "dotnet"
};
bool added = tags.Add("CSharp"); // false with this comparer
```

### Indexes and ranges

```csharp
var first = values[0];
var last = values[^1];        // one from the end
var middle = values[1..^1];   // from index 1 up to, not including, last
var copy = values[..];
```

For arrays, a range creates a new array. Performance-sensitive code may use spans to create non-owning views.

### Safe exposure

```csharp
private readonly List<Order> _orders = [];

public IReadOnlyList<Order> Orders => _orders;

public void AddOrder(Order order)
{
    ArgumentNullException.ThrowIfNull(order);
    _orders.Add(order);
}
```

A read-only interface removes mutation methods from the public contract, but is not automatically an immutable snapshot.

## Arrays and fixed-size storage

An array stores a fixed number of same-typed elements:

```csharp
var numbers = new int[3];     // [0, 0, 0]
var names = new[] { "Ada", "Grace" };
string[] cities = ["London", "Paris"];
```

`Length` is fixed after creation, but elements remain assignable:

```csharp
names[0] = "Linus";
```

Arrays are reference types even when their elements are value types. Assigning an array variable shares the same array. Array indices start at zero, and invalid indices throw `IndexOutOfRangeException`.

Use arrays for fixed-size buffers, interop, performance-sensitive contiguous storage, or APIs that specifically require them. Use `List<T>` when size changes are normal.

Multidimensional rectangular arrays (`T[,]`) and jagged arrays (`T[][]`) exist. Jagged arrays are arrays of arrays and each inner array may have a different length.

## `List<T>`

`List<T>` is the standard ordered, mutable, growable collection:

```csharp
var items = new List<Order>();
items.Add(order);
items.AddRange(moreOrders);
items.Insert(0, urgentOrder);
items.Remove(order);
items.RemoveAt(0);
items.Clear();
```

It offers `Count`, zero-based indexing, searching, sorting, and enumeration. Appending is amortized O(1); inserting or removing near the beginning is O(n) because later elements shift. `Contains` and `Remove(value)` use equality and generally scan O(n).

A list maintains an internal capacity that may exceed its count. Provide an initial capacity when a large approximate size is already known, but do not optimize this without a reason.

## `Dictionary<TKey, TValue>`

A dictionary maps unique keys to values:

```csharp
var users = new Dictionary<Guid, User>();
users.Add(user.Id, user);       // throws if key exists
users[user.Id] = user;          // adds or replaces
```

Prefer `TryGetValue` when absence is expected:

```csharp
if (users.TryGetValue(id, out var found))
{
    Use(found);
}
```

The indexer throws `KeyNotFoundException` when reading a missing key. `ContainsKey` followed by the indexer performs two lookups; `TryGetValue` performs one.

Dictionary enumeration order should not be used as a semantic sorting contract. Sort explicitly when output order matters.

Keys must not change in a way that changes equality or hash code while stored. Choose an explicit string comparer when case rules matter:

```csharp
var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
```

## `HashSet<T>`

A hash set stores unique values and supports efficient membership tests:

```csharp
var allowed = new HashSet<int> { 1, 2, 3 };
allowed.Add(3);          // false; already present
allowed.Contains(2);     // true
allowed.Remove(1);
```

It also supports set operations:

```csharp
allowed.UnionWith(other);
allowed.IntersectWith(other);
bool overlaps = allowed.Overlaps(other);
bool subset = allowed.IsSubsetOf(other);
```

Use a set instead of repeatedly calling `List<T>.Contains` when uniqueness or frequent membership lookup is central. Do not rely on hash-set enumeration order.

## Queues and stacks

A queue processes values first-in, first-out:

```csharp
var queue = new Queue<Job>();
queue.Enqueue(job);
Job next = queue.Dequeue();

if (queue.TryDequeue(out var available)) { }
if (queue.TryPeek(out var first)) { }
```

A stack processes values last-in, first-out:

```csharp
var stack = new Stack<Page>();
stack.Push(current);
Page previous = stack.Pop();

if (stack.TryPop(out var page)) { }
```

`Dequeue`, `Peek`, and `Pop` throw when empty; use their `Try...` forms when emptiness is normal.

Standard generic collections are not generally safe for concurrent mutation. `System.Collections.Concurrent` provides specialized concurrent collections where needed.

## Collection initializers and collection expressions

A collection initializer calls supported `Add` methods after constructing the collection:

```csharp
var numbers = new List<int> { 1, 2, 3 };
var lookup = new Dictionary<string, int>
{
    { "one", 1 },
    ["two"] = 2
};
```

A collection expression uses square brackets and is converted according to its target type:

```csharp
int[] array = [1, 2, 3];
List<int> list = [1, 2, 3];
ReadOnlySpan<int> span = [1, 2, 3];

int[] combined = [0, .. array, 4]; // spread elements
```

Collection expressions need a target type in many contexts; `var values = [1, 2, 3]` does not by itself provide one. Availability depends on the project’s C# language version.

## Indexing and ranges

The index-from-end operator `^` creates an `Index`:

```csharp
char final = text[^1];
```

`^0` means the position immediately after the last element and is not a valid single-element index. `^1` is the last element.

A range uses an inclusive start and exclusive end:

```csharp
var firstThree = values[..3];
var afterFirst = values[1..];
var withoutEnds = values[1..^1];
```

Range behavior depends on the receiver. Strings and arrays create sliced values; spans provide views over existing memory. Validate boundaries when values come from input.

## Iteration with `foreach`

`foreach` obtains an enumerator and repeatedly reads its current value:

```csharp
foreach (var order in orders)
{
    Console.WriteLine(order.Id);
}
```

The iteration variable is not an index. Use `for`, explicit indexing, or an intentional projection when an index is required.

Most mutable collections invalidate an active enumerator if structurally changed:

```csharp
// Do not remove from a List<T> inside foreach over that same list.
orders.RemoveAll(order => order.IsCancelled);
```

`foreach` disposes an enumerator when it implements `IDisposable`. `await foreach` similarly consumes `IAsyncEnumerable<T>`.

## Collection interfaces

Program to the narrowest contract that expresses what code needs:

| Interface | Guarantees |
| --- | --- |
| `IEnumerable<T>` | Values can be enumerated |
| `ICollection<T>` | Count plus add/remove/contains operations |
| `IList<T>` | Mutable indexed sequence |
| `IReadOnlyCollection<T>` | Enumeration and count without mutation methods |
| `IReadOnlyList<T>` | Read-only collection plus index access |
| `IDictionary<TKey,TValue>` | Mutable key/value lookup |
| `IReadOnlyDictionary<TKey,TValue>` | Key/value lookup without mutation methods |

Accept `IEnumerable<T>` when one pass is enough. Accept `IReadOnlyCollection<T>` when a cheap count is required, and `IReadOnlyList<T>` when indexing is required. Do not accept `List<T>` merely for convenience if callers need not provide that exact implementation.

Returning an interface allows implementation changes, but the runtime object may still be mutable.

## Mutability and safe exposure

This property prevents callers from calling `Add` through its declared type:

```csharp
public IReadOnlyList<Order> Orders => _orders;
```

It does not create a copy. If the underlying list changes, callers observe the change; determined callers may also recover a mutable reference when they know the runtime type.

Choose the guarantee the API needs:

- **Read-only view:** expose `IReadOnlyList<T>` while the owner controls mutation.
- **Snapshot:** return `_orders.ToArray()` or another copy.
- **Immutable value:** use immutable/frozen collection types where their behavior fits.
- **Streaming:** return `IEnumerable<T>` or `IAsyncEnumerable<T>` and document enumeration semantics.

Do not expose a mutable collection setter unless replacing the entire collection is intentional.

## Equality and hash codes

`List<T>.Contains`, `Dictionary<TKey,TValue>` keys, and `HashSet<T>` values rely on equality. By default, generic collections use `EqualityComparer<T>.Default`, which considers `IEquatable<T>`, overridden equality, record equality, or reference equality as appropriate.

Hash-based collections require this rule: if two values are equal, they must produce the same hash code. A key’s equality-relevant state must remain stable while stored.

For alternate equality, pass an `IEqualityComparer<T>`:

```csharp
var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
```

Use ordinal string comparison for identifiers and protocol values unless domain rules require culture-aware comparison.

Collections themselves usually do not provide structural value equality. Two different `List<int>` instances with identical elements compare unequal with `==`. Use `SequenceEqual` when ordered element-by-element equality is intended.

## Choosing deliberately

Ask these questions:

1. Is the number of elements fixed?
2. Is order meaningful?
3. Is indexed access required?
4. Are keys more natural than positions?
5. Must values be unique?
6. Is processing FIFO or LIFO?
7. Will callers mutate, observe, or own the result?
8. Are lookups frequent enough for hashing to matter?
9. Does concurrent access require a specialized design?

Start with the clearest collection, then optimize based on measured behavior rather than assumptions.

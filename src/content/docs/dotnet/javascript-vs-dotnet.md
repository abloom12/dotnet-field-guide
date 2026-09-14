---
title: JavaScript vs .NET
description: A focused map from JavaScript tooling and runtime concepts to the .NET ecosystem.
sidebar:
  order: 9
---

This comparison page provides orientation, not exact equivalence. .NET combines runtime, SDK, libraries, build orchestration, and multiple application frameworks in ways that do not map one-to-one to a JavaScript toolchain.

## Quick reference

| JavaScript ecosystem | Rough .NET equivalent | Important distinction |
| --- | --- | --- |
| Node.js | .NET runtime | .NET executes managed assemblies and supports several languages |
| Node.js standard APIs | .NET base libraries | APIs are distributed across shared framework assemblies |
| npm / pnpm / yarn | NuGet + `dotnet` CLI | NuGet restores compiled/package assets selected by TFM/RID |
| npm registry | NuGet feed such as nuget.org | Multiple configured feeds and source mapping are common |
| `package.json` | `.csproj` | A project also controls compilation, target framework, and output |
| lock file | `packages.lock.json` | Opt-in behavior/policy varies by repository |
| npm workspaces | solution + project references | Solution grouping and build dependency references are separate |
| npm scripts | MSBuild targets and CLI commands | Custom shell scripts still exist; MSBuild owns core compilation |
| nvm / Volta version pinning | installed SDKs + `global.json` | `global.json` selects an SDK but does not install it |
| TypeScript compiler | C# compiler within SDK build | C# types/generics remain in runtime metadata |
| `node app.js` | `dotnet App.dll` | Framework-dependent app needs compatible shared runtime |
| bundled Node executable/container | self-contained publish/container | Per-RID output carries .NET runtime but still depends on OS environment |
| Express/Fastify | ASP.NET Core | ASP.NET Core is a framework on .NET, not the runtime itself |
| React/Vue component UI | Blazor component UI (roughly) | Blazor components use Razor/C# and several server/browser execution modes |
| Jest/Vitest | xUnit/NUnit/MSTest + test SDK/runner | Test ecosystem has multiple frameworks and adapters |

### Command orientation

| Task | Typical JavaScript | Typical .NET |
| --- | --- | --- |
| Check toolchain | `node --version`, package manager version | `dotnet --info` |
| Install/restore | `pnpm install` | `dotnet restore` |
| Add dependency | `pnpm add package` | `dotnet add package Package.Id` |
| Run development app | `pnpm dev` | `dotnet watch --project path` |
| Build | `pnpm build` | `dotnet build` |
| Test | `pnpm test` | `dotnet test` |
| Produce deployment artifact | framework bundler/container build | `dotnet publish` then deployment packaging |

## Runtime model

Node.js executes JavaScript through a JavaScript engine and Node host APIs. .NET loads managed assemblies containing IL and metadata, then normally JIT-compiles methods or runs ahead-of-time-compiled output.

Both platforms provide garbage collection, asynchronous I/O, package ecosystems, native interop, and cross-platform runtimes. Their execution and concurrency details differ:

- .NET code commonly uses multiple threads and a thread pool.
- `Task` is an awaitable operation abstraction, not necessarily a new thread.
- ASP.NET Core handles many concurrent requests and application services must honor their thread-safety/lifetime requirements.
- Managed assemblies preserve runtime type metadata and generic type information.

Do not transfer event-loop assumptions directly to service lifetime or shared mutable state in .NET.

## SDK versus runtime installation

A Node toolchain often combines a Node installation with a separately selected package manager and project tooling. A .NET SDK installation includes `dotnet`, MSBuild, compilers, templates, targeting packs, and a corresponding runtime.

```bash
dotnet --info
dotnet --list-sdks
dotnet --list-runtimes
```

A runtime-only installation can execute compatible framework-dependent applications but cannot perform normal SDK builds. A checked-in `global.json` guides SDK selection similarly to a version policy file, but provisioning tools must still install that SDK.

See [SDK, Runtime, and Versions](../sdk-runtime-and-versions/).

## `package.json` versus `.csproj`

A JavaScript package manifest can describe scripts, module metadata, dependencies, and package publishing. An SDK-style `.csproj` is an MSBuild project:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Example.Client" Version="1.2.3" />
  </ItemGroup>
</Project>
```

It controls compilation, target APIs, output type, package/project references, content, analyzers, generators, and imported build logic. There is no required `scripts` object; standard commands discover MSBuild targets from the project.

Repository-wide behavior may live in `Directory.Build.props`, `Directory.Build.targets`, `Directory.Packages.props`, `NuGet.config`, and `global.json`, so reading only one `.csproj` can miss important inputs.

## NuGet versus npm-style packages

NuGet packages can carry different compile/runtime/native assets for several TFMs and RIDs, plus analyzers, source generators, and MSBuild logic. Restore selects a compatible graph and writes `obj/project.assets.json`.

Packages are normally stored in a per-user global cache rather than a project `node_modules` tree:

```bash
dotnet nuget locals global-packages --list
```

Direct dependencies are `PackageReference` items; transitive dependencies are resolved by NuGet. Version conflict rules differ from nested JavaScript dependency trees because one .NET load context commonly resolves one effective assembly version for a dependency identity.

Private feeds, credentials, source mapping, central versions, and lock files require explicit repository policy. See [Packages and Dependencies](../packages-and-dependencies/).

## Solutions and project references versus workspaces

A solution groups projects for IDE and CLI operations:

```bash
dotnet build Product.sln
dotnet test Product.sln
```

A project reference forms an actual compile/build dependency:

```xml
<ProjectReference Include="../Domain/Domain.csproj" />
```

Adding two projects to one solution does not make them depend on each other. A project can build without a solution. This differs from treating one workspace manifest as both package grouping and dependency wiring.

Project references are used during coordinated source development. Package references represent versioned distributed boundaries.

## Build orchestration

`dotnet build` invokes MSBuild, which evaluates properties, items, imports, targets, and tasks. Compilation is one target within that graph.

```bash
dotnet restore
dotnet build --no-restore -c Release
dotnet test --no-build -c Release
```

The closest analogue to package scripts is split across:

- standard `dotnet` commands,
- MSBuild targets/properties,
- repository shell/PowerShell/task-runner scripts,
- CI pipeline steps.

Prefer standard CLI behavior for standard lifecycle operations. Custom MSBuild targets are powerful but must declare inputs, outputs, and ordering for correct incremental builds.

`bin/` contains final build outputs; `obj/` contains restore and intermediate/generated state. Neither corresponds exactly to `dist/` or `node_modules`.

## Development execution and watching

Run one project:

```bash
dotnet run --project src/MyApp
```

Watch and hot reload where supported:

```bash
dotnet watch --project src/MyApp
```

Arguments after `--` pass to the application:

```bash
dotnet run --project src/Tool -- --input file.txt
```

Launch profiles may supply local URLs/environment variables. They are developer tooling, not production process configuration.

## Build and publish are separate

`dotnet build` creates compilation output for development and downstream build steps. `dotnet publish` creates deployable output:

```bash
dotnet publish src/MyApp -c Release -o ./artifacts/MyApp
```

Publishing can be:

- framework-dependent,
- self-contained for a RID,
- single-file,
- trimmed,
- Native AOT.

A frontend “bundle” is not a complete analogy. .NET publish decisions govern runtime inclusion, native assets, assembly transformations, and deployment layout. Deployment tooling still owns secrets, infrastructure, rollout, and process supervision.

See [Publishing Applications](../publishing-applications/).

## Configuration and environment

Hosted .NET applications commonly combine JSON, environment-specific JSON, user secrets during development, environment variables, command-line values, and external providers. Later providers usually override earlier ones.

Hierarchical keys use `:` in APIs and commonly `__` in environment variables:

```text
Database__ConnectionString
```

maps to:

```csharp
configuration["Database:ConnectionString"]
```

The host environment (`Development`, `Staging`, `Production`) is distinct from build configuration (`Debug`, `Release`). Do not commit secrets to `appsettings.json` or launch profiles.

## Dependency injection and service lifetimes

Dependency injection is built into modern .NET hosting abstractions. Services are registered as singleton, scoped, or transient and consumed through constructors.

```csharp
builder.Services.AddScoped<IOrderStore, OrderStore>();
```

Lifetime is central:

- ASP.NET Core scoped services are normally per HTTP request.
- Interactive Server Blazor scoped services are normally per circuit.
- Client-side WebAssembly scoped services behave like app-lifetime services.
- Singletons can serve concurrent users and must not hold user-specific mutable state.

This is not equivalent to importing one module singleton. The container owns creation, graph resolution, scopes, and disposal.

## Framework boundaries

Keep layers distinct:

```text
C# language
  → .NET runtime, SDK, libraries, hosting abstractions
    → ASP.NET Core HTTP framework
      → Blazor component web UI framework
```

A question about `Task`, NuGet, `.csproj`, or garbage collection is generally .NET-level. Middleware/routing/controllers are ASP.NET Core. `.razor`, component lifecycle, and render modes are Blazor.

Knowing the owning layer points to the right docs and prevents framework conventions from being mistaken for language behavior.

## Translation cautions

Before mapping a familiar tool or pattern, verify:

1. **Version dimension:** SDK selection, TFM, runtime version, package version, and app version are distinct.
2. **Dependency graph:** package and project references have different resolution and build behavior.
3. **Execution:** .NET services may execute concurrently across threads.
4. **Lifetime:** DI scopes and disposal define resource ownership.
5. **Build artifact:** build output is not publish output.
6. **Portability:** RID/native/platform APIs can narrow a cross-platform TFM.
7. **Configuration:** build configuration and runtime host environment are independent.
8. **Framework boundary:** .NET, ASP.NET Core, and Blazor solve different layers.

Use the comparison to find the concept, then rely on the dedicated .NET page for exact behavior.

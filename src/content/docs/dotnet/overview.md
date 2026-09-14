---
title: .NET Overview
description: A practical map of the .NET platform, runtime, libraries, and toolchain.
sidebar:
  order: 1
---

.NET is a cross-platform development platform for building and running applications. It includes a runtime, libraries, compilers, an SDK, and application models; C# is one language that targets it.

## Quick reference

### Platform map

| Part | Responsibility |
| --- | --- |
| **C#** | Language syntax and rules used to write source code |
| **.NET SDK** | Commands, compilers, MSBuild, templates, and targeting packs used to develop applications |
| **.NET runtime** | Loads and executes managed applications; provides JIT compilation, garbage collection, and runtime services |
| **Base libraries** | APIs for collections, text, I/O, networking, tasks, JSON, and more |
| **NuGet** | Package format, feeds, restore tooling, and package ecosystem |
| **Project (`.csproj`)** | Declares build settings, target frameworks, and dependencies for one output |
| **Solution (`.sln`/`.slnx`)** | Groups projects for development and build operations |
| **ASP.NET Core** | .NET web framework for HTTP applications and services |
| **Blazor** | Component-based web UI framework built on ASP.NET Core and .NET |

### Source-to-process path

```text
.cs source + project settings + package/project references
  → dotnet restore resolves dependencies
  → dotnet build invokes MSBuild and the C# compiler
  → assembly (.dll/.exe) containing IL and metadata
  → dotnet/runtime loads dependencies
  → JIT or AOT native code executes
```

### Everyday commands

```bash
dotnet --info
dotnet restore
dotnet build
dotnet test
dotnet run --project src/MyApp
dotnet watch --project src/MyApp
dotnet publish src/MyApp -c Release -o ./publish
```

### Where to look

| Question | Page |
| --- | --- |
| Which SDK/runtime is in use? | [SDK, Runtime, and Versions](../sdk-runtime-and-versions/) |
| How is the repository organized? | [Projects, Solutions, and Project Files](../projects-solutions-and-project-files/) |
| What does a command/build do? | [CLI and Build Process](../cli-and-build-process/) |
| Where do dependencies come from? | [Packages and Dependencies](../packages-and-dependencies/) |
| How do hosting, DI, configuration, and logging fit? | [Application Startup and Services](../application-startup-and-services/) |
| What should deployment receive? | [Publishing Applications](../publishing-applications/) |
| What commonly goes wrong? | [.NET Gotchas](../gotchas/) |

## C# and .NET are different layers

C# defines source-language features such as classes, records, pattern matching, nullable annotations, and `async`/`await`. .NET supplies the compiler toolchain, execution environment, runtime type system, and APIs those programs use.

For example:

- `await` is C# syntax; `Task` is a .NET library type.
- `using` declarations are C# syntax; `IDisposable` is a .NET interface.
- Generic syntax is part of C#; `List<T>` is a .NET collection.
- An attribute is a language/runtime metadata mechanism; model validation is framework behavior.

Other languages, including F# and Visual Basic, can also compile for .NET and use the same runtime and libraries.

## SDK, runtime, libraries, and tools

The **SDK** is the development toolset. It includes the `dotnet` driver, compilers, MSBuild, project templates, and packs needed to build for supported target frameworks. Installing an SDK also installs a corresponding runtime, but installing only a runtime does not provide normal build tools.

The **runtime** executes framework-dependent applications. Runtime families include `Microsoft.NETCore.App`, `Microsoft.AspNetCore.App`, and the Windows Desktop runtime. An application needs the frameworks it references unless it is published self-contained.

The **base class libraries** are assemblies that define commonly used types such as `string`, `HttpClient`, `FileStream`, `Dictionary<TKey,TValue>`, and `Task`. Additional APIs come from application frameworks and NuGet packages.

The `dotnet` command selects an SDK, then dispatches built-in commands such as `build` or tools installed separately. Most build commands are MSBuild operations exposed through a simpler CLI.

## How source becomes a running application

A normal development cycle has distinct stages:

1. **Restore** reads project dependency declarations and resolves NuGet assets.
2. **Evaluate** has MSBuild combine the project with imported SDK props/targets and repository-wide settings.
3. **Compile** turns C# source into Common Intermediate Language (IL) and metadata in an assembly.
4. **Build output** receives the application assembly, dependency assemblies, symbols, and runtime metadata files.
5. **Host/runtime startup** reads the application’s runtime configuration and dependency manifest, then loads the required frameworks and assemblies.
6. **Execution** usually JIT-compiles methods to native machine code as needed. AOT-published applications move more compilation to publish time.

The compiler catches type and language errors. Runtime loading can still fail because a required framework, native dependency, configuration value, or compatible assembly is unavailable.

## Projects and solutions

A project is the unit that MSBuild evaluates and normally produces one assembly or deployable application. Its `.csproj` defines target frameworks, output kind, package references, project references, source-generation settings, and other build properties.

A solution is a workspace and coordination file. It groups projects so IDEs and CLI commands can load or build them together. A project does not need a solution to build, and the solution does not become part of the running application.

Project references form the actual compile/build dependency graph:

```text
Web → Application → Domain
                 ↘ Infrastructure (depending on architecture)
```

The dependency direction declared by project references matters more to compilation than folder layout or solution grouping.

## Dependency restore and resolution

NuGet dependencies are declared as `PackageReference` items. Project-to-project dependencies use `ProjectReference`. Restore:

- reads target frameworks, runtime identifiers, package sources, and references,
- resolves direct and transitive package versions,
- downloads missing packages to the global packages folder,
- writes generated assets under `obj/`, especially `project.assets.json`.

Build performs an implicit restore unless disabled. Restore makes packages available to a project; it does not execute application deployment.

At runtime, generated `.deps.json` and `.runtimeconfig.json` files help the host identify dependencies and required frameworks. Self-contained and single-file publishing change which files travel with the application, not the project’s logical dependency graph.

## Managed execution

“Managed” means execution is coordinated by the .NET runtime. At a high level, the runtime provides:

- type safety and metadata,
- managed memory allocation and garbage collection,
- exception handling,
- thread-pool and task infrastructure,
- assembly loading,
- interoperability with native code,
- JIT compilation for normal IL deployments.

Managed code can still use unmanaged resources and native libraries. Garbage collection reclaims managed memory but does not replace prompt `IDisposable`/`IAsyncDisposable` cleanup.

Performance behavior is not automatic: allocation patterns, blocking, I/O, threading, serialization, and algorithm choice still matter. Measure before applying runtime-specific optimizations.

## Common .NET application types

The SDK offers templates and specialized project SDKs for many application models:

| Application | Typical project/template |
| --- | --- |
| Console command or utility | `dotnet new console` |
| Reusable library | `dotnet new classlib` |
| Automated tests | xUnit, NUnit, MSTest, or other test project |
| HTTP API / web app | ASP.NET Core |
| Background process | Worker Service / generic host |
| Component web UI | Blazor Web App |
| Cross-platform native client | .NET MAUI |
| Windows desktop | WPF or Windows Forms |

A repository may contain several application and library projects that target different frameworks or runtime environments.

## Framework boundaries

.NET provides the platform and general-purpose infrastructure. **ASP.NET Core** adds HTTP hosting, middleware, routing, endpoints, authentication/authorization integration, and web-specific services. **Blazor** adds Razor components, component rendering, UI events, browser interactivity, and multiple web rendering modes.

These boundaries explain why:

- `Task` and dependency-injection abstractions can appear outside web apps,
- `WebApplication`, middleware, and controllers belong to ASP.NET Core,
- `.razor` components and `@rendermode` belong to Blazor,
- the same C# language features work across all of them.

Start with this section for toolchain and runtime questions, the [ASP.NET Core section](/aspnet-core/overview/) for HTTP application behavior, and the [Blazor section](/blazor/overview/) for component UI behavior.

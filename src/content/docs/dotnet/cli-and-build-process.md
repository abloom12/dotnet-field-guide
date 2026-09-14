---
title: CLI and Build Process
description: Use the .NET CLI and understand restore, MSBuild, compilation, and output.
sidebar:
  order: 4
---

The `dotnet` CLI is the main cross-platform entry point for creating, restoring, building, testing, running, and publishing .NET projects.

## Quick reference

### Everyday workflow

```bash
dotnet --info
dotnet restore
dotnet build --no-restore
dotnet test --no-build
dotnet run --project src/MyApp
dotnet watch --project src/MyApp
dotnet clean
dotnet publish src/MyApp -c Release -o ./publish
```

`--no-restore` and `--no-build` are useful only when an earlier explicit stage already produced valid inputs.

### Command map

| Command | Main result |
| --- | --- |
| `dotnet new` | Creates files from a template |
| `dotnet restore` | Resolves package graph and writes restore assets under `obj/` |
| `dotnet build` | Restores implicitly, evaluates MSBuild, and compiles outputs |
| `dotnet run` | Builds if needed, then launches a project |
| `dotnet test` | Builds if needed, then runs tests through configured test tooling |
| `dotnet clean` | Runs clean targets for selected configuration/framework |
| `dotnet watch` | Watches inputs and reruns/reloads a command |
| `dotnet publish` | Produces deployable output for a chosen runtime strategy |

### Useful options

```bash
-c Release                    # --configuration Release
-f net10.0                    # --framework net10.0
-r linux-x64                  # --runtime linux-x64
--project path/to/App.csproj
--no-restore
--no-build
-v minimal                    # quiet|minimal|normal|detailed|diagnostic
-p:PropertyName=Value         # MSBuild property
```

### Build troubleshooting order

1. Read the **first meaningful error**, not only the final failure count.
2. Confirm `dotnet --info` and the repository’s `global.json`.
3. Run restore separately with useful verbosity.
4. Check package feeds/credentials and project/TFM compatibility.
5. Rebuild the smallest failing project.
6. Clean `bin`/`obj` only when stale intermediates are plausible.
7. Use a binary log for complex MSBuild evaluation: `dotnet build -bl`.

## Creating projects with `dotnet new`

List and inspect templates:

```bash
dotnet new list
dotnet new search worker
dotnet new console --help
```

Create projects:

```bash
dotnet new console -n Tool -o src/Tool
dotnet new classlib -n Domain -o src/Domain
dotnet new xunit -n Domain.Tests -o tests/Domain.Tests
```

Template availability depends on the selected SDK and installed template packages/workloads. Templates are starting points, not architectural requirements.

Avoid overwriting existing files unintentionally. Run the command from a deliberate directory, inspect options first, and review generated files before committing.

## Restoring dependencies

```bash
dotnet restore MyProduct.sln
```

Restore reads projects and NuGet configuration, resolves package versions/assets per target framework and runtime identifier, downloads missing packages, and writes generated assets—especially `obj/project.assets.json`.

Most commands (`build`, `test`, `run`, and `publish`) restore implicitly when needed. An explicit restore followed by `--no-restore` is useful in CI when restore is a controlled, separately cached step:

```bash
dotnet restore --locked-mode
dotnet build --no-restore -c Release
```

Restore failures often involve unavailable feeds, authentication, incompatible package assets, unreachable sources, version conflicts, or a lock file that no longer matches declarations.

## Building projects and solutions

```bash
dotnet build src/MyApp/MyApp.csproj
dotnet build MyProduct.sln -c Release
dotnet build -f net10.0
```

Build generally performs:

1. implicit restore unless disabled,
2. MSBuild project evaluation,
3. dependency graph ordering,
4. target execution,
5. C# compilation and analyzers/source generators,
6. copying outputs and writing runtime metadata.

A solution build coordinates projects; each project remains the unit of evaluation and output. Build success means compilation and build targets succeeded, not that tests passed or the application works in its deployment environment.

Use `dotnet test` for tests and `dotnet publish` for deployment output.

## Running applications

```bash
dotnet run --project src/MyApp -- --application-argument value
```

Arguments before `--` belong to `dotnet run`; arguments after it go to the application. `run` builds when required and launches the selected target framework/profile.

For already built framework-dependent output:

```bash
dotnet path/to/MyApp.dll
```

`dotnet run` is a development command. Production should execute published output through deployment/process-management tooling.

Launch profiles can affect local environment variables and URLs. They are tooling settings, not a substitute for production configuration.

## Cleaning output

```bash
dotnet clean
dotnet clean -c Release
dotnet clean MyProduct.sln
```

`clean` runs MSBuild clean targets for the chosen configuration/framework. It may not remove every custom or manually created file. For a hard reset, remove project `bin/` and `obj/` directories, then restore/build.

Do not make “clean before every build” the default. It defeats incremental builds and can hide incorrectly declared build inputs. Clean when changing branches/toolchains or diagnosing stale generated state—not for normal source errors.

## Debug and Release configurations

Configuration is an MSBuild dimension, usually `Debug` or `Release`:

```bash
dotnet build -c Debug
dotnet build -c Release
```

Templates commonly optimize Release builds more aggressively and configure debugging information differently. Exact differences come from SDK defaults and project/repository properties; do not assume configuration changes arbitrary application settings.

Conditional project settings look like:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Release'">
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>
```

Test the configuration that will be published. A bug appearing only in Release can expose timing, undefined assumptions, conditional compilation, trimming, or optimization-sensitive code.

Build configuration is separate from hosting environment names such as `Development`, `Staging`, and `Production`.

## What MSBuild does

MSBuild is .NET’s extensible build engine. It evaluates XML project files plus imported SDK and repository files into:

- **properties**: scalar settings,
- **items**: collections of files/references with metadata,
- **targets**: ordered groups of tasks,
- **tasks**: executable build operations.

The `dotnet build` command invokes MSBuild with SDK conventions. Restore is also integrated into this graph.

Useful diagnostics:

```bash
dotnet build -v:diagnostic
dotnet build -bl:build.binlog
dotnet msbuild -preprocess:expanded.xml MyApp.csproj
```

A binary log contains detailed project paths, properties, item data, and command lines; review it for secrets before sharing. A preprocessed project helps reveal imports but can be very large.

Prefer standard SDK properties and targets over custom scripting. When custom targets are necessary, declare inputs/outputs and ordering precisely so incremental behavior remains correct.

## `bin` and `obj` output

`obj/` contains intermediate and generated build state:

```text
obj/project.assets.json
obj/Debug/net10.0/*.AssemblyInfo.cs
obj/Debug/net10.0/*.GlobalUsings.g.cs
```

`bin/` contains final build outputs:

```text
bin/Debug/net10.0/MyApp.dll
bin/Debug/net10.0/MyApp.deps.json
bin/Debug/net10.0/MyApp.runtimeconfig.json
```

Paths add configuration, target framework, and sometimes runtime identifier dimensions. Never reference another project’s `bin` output manually when a `ProjectReference` should describe the dependency.

Build output is optimized for development/build chaining. Publish output is a curated deployment layout and can include runtime-specific transformation.

## Incremental builds

MSBuild and compilers avoid repeating work when declared inputs, outputs, and state indicate a target is up to date. This makes normal rebuilds faster.

Incremental correctness depends on build steps declaring dependencies. Custom scripts that read undeclared files or write unpredictable outputs can leave stale results.

When a change is unexpectedly ignored:

1. confirm the edited file is included in the project,
2. check conditional items/properties,
3. inspect source-generator/custom-target behavior,
4. build with detailed logging,
5. clean once to verify whether state is involved,
6. fix the dependency declaration rather than institutionalizing clean builds.

## Watching for changes

```bash
dotnet watch --project src/MyApp
dotnet watch test --project tests/MyApp.Tests
dotnet watch run --project src/MyApp
```

`dotnet watch` monitors relevant files and restarts, reruns, or applies supported hot reload changes. Some edits cannot be hot reloaded and require a restart.

Watch mode is for development. If file watching fails in containers, network filesystems, or mounted volumes, investigate filesystem event support and documented polling options. Do not rely on watch as a production process supervisor.

## Diagnosing restore failures

Check:

- the exact source URL and `NuGet.config` discovery,
- authentication/credential-provider availability,
- whether the package/version exists on the mapped source,
- network, proxy, certificate, and offline-cache behavior,
- target framework compatibility,
- central version declarations and lock-file consistency.

Useful commands:

```bash
dotnet restore -v detailed
dotnet nuget list source
dotnet list path/to/App.csproj package --include-transitive
```

Do not paste feed credentials into commands, logs, or committed files.

## Diagnosing build failures

Common categories include:

- compiler errors in source,
- warnings promoted to errors,
- incompatible project target frameworks,
- missing generated files/workloads,
- duplicate generated attributes or compile items,
- platform/RID-specific assets,
- locked files held by a running process,
- custom target ordering or stale intermediates.

Reduce scope:

```bash
dotnet build src/SmallestFailingProject -v normal
```

Capture `-bl` for evaluation/target problems. Compare `dotnet --info` with CI when failures differ by machine. Fix the first root cause; later errors are often cascading symptoms.

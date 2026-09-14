---
title: Gotchas
description: Common .NET SDK, project, package, build, runtime, and portability surprises.
sidebar:
  order: 8
---

When .NET behavior differs by machine or configuration, first separate SDK selection, target framework, restored assets, build configuration, runtime selection, and operating system.

## Quick reference

| Symptom | First checks |
| --- | --- |
| “SDK not found” | `dotnet --info`, `global.json`, installed SDKs, working directory |
| App framework missing | `.runtimeconfig.json`, `dotnet --list-runtimes`, architecture |
| Works locally, fails in CI | SDK, feeds, case, platform, config, clean checkout |
| Package/API incompatible | project TFM, package assets, transitive graph |
| Old code seems to run | stop process; remove `bin`/`obj`; rebuild smallest project |
| Debug works, Release fails | conditional properties/code, optimization, trimming, timing |
| Config missing after build | item metadata and output/publish copy settings |
| File not found on Linux | exact path casing and separator/path construction |
| Resource remains locked | ownership and `using`/`await using`, not garbage collection |

### Diagnostic baseline

```bash
pwd
dotnet --info
dotnet --list-sdks
dotnet --list-runtimes
dotnet restore -v normal
dotnet build -c Release -v normal
dotnet list path/to/App.csproj package --include-transitive
```

Do not start by deleting everything. Capture enough state to understand why behavior differs.

## SDK and runtime mismatches

The SDK builds; a runtime executes framework-dependent output. Installing runtime `10.0.x` does not install SDK `10.0.x`, and installing one runtime family does not install every other family.

Typical failures:

- `global.json` requests an unavailable SDK,
- a web application needs `Microsoft.AspNetCore.App` but only the base runtime exists,
- the destination architecture differs from the installed runtime,
- an app targets a newer framework than the destination supports,
- self-contained output was published for the wrong RID.

Check selected build SDK with `dotnet --version` and runtime inventory with `dotnet --list-runtimes`. Check the deployed `.runtimeconfig.json` to see what the application requests.

## The wrong `dotnet` can be selected

Machines may contain multiple installations from package managers, installers, IDEs, architecture emulation, containers, or user-local paths.

```bash
which -a dotnet  # common shells
where dotnet     # Windows
Get-Command dotnet -All # PowerShell
```

The first executable on `PATH` may not be the installation shown in another terminal or IDE. Environment variables and architecture also affect resolution.

After finding the executable, run `dotnet --info` from the repository directory. Fix installation/PATH provisioning rather than adding fragile per-command absolute paths without documentation.

## Target framework compatibility

A project can reference another project/package only when compatible assets exist for its TFM. A `net10.0` library cannot generally be consumed by a `net8.0` application because it may use APIs unavailable in .NET 8.

Platform-specific targets such as `net10.0-windows` narrow portability. Multi-targeted packages can expose different APIs/assets per target.

When compatibility fails:

1. inspect every involved TFM,
2. identify the lowest framework contract genuinely needed,
3. update the consuming target or retarget/multi-target the library,
4. avoid manually copying assemblies around restore checks,
5. test each target independently.

Compile compatibility does not guarantee every runtime platform supports native or optional behavior.

## Restore is often implicit

`dotnet build`, `test`, `run`, and `publish` usually restore automatically. This convenience can hide network access, package changes, or feed authentication until a build command.

In controlled CI:

```bash
dotnet restore --locked-mode
dotnet build --no-restore -c Release
```

`--no-restore` fails or behaves incorrectly if restore inputs changed or assets are missing. Use it only after a valid explicit restore for the same project, TFM, RID, and relevant properties.

Restore success can differ with `NuGet.config`, credentials, package cache, source mapping, and available feed contents.

## Stale `bin` and `obj`

Incremental builds rely on timestamps and declared inputs/outputs. Branch changes, SDK/source-generator changes, interrupted builds, or incorrect custom targets can leave stale intermediates.

Try:

```bash
dotnet clean
# If needed, stop running processes, delete bin/ and obj/, then:
dotnet restore
dotnet build
```

If deletion repeatedly fixes the same workflow, find the undeclared input/output or generator defect. Requiring a full clean before every build wastes time and masks the root cause.

A running process can also lock old output or continue serving an old binary; stop it before concluding the build ignored changes.

## Package and project references are not interchangeable

A `ProjectReference` builds source in the current graph. A `PackageReference` restores a version from NuGet. Adding a project to a solution does neither.

Confusion can produce:

- editing source while the app still consumes a package,
- duplicate types/assets from package and project versions,
- missing build ordering from raw DLL references,
- apparent changes not reaching output.

Inspect the consuming `.csproj` and evaluated graph. Use one intentional source for each dependency.

## Transitive dependency conflicts

Two packages may request different versions of a shared dependency. NuGet resolves one graph using defined rules, but compilation success may still lead to behavior or missing-method failures.

```bash
dotnet list package --include-transitive
dotnet restore -v detailed
```

Treat downgrade warnings as real compatibility signals. Prefer upgrading/alignment of direct package families. A direct pin can control resolution temporarily but must be compatibility-tested; it does not prove the parent packages support that version.

Differences in lock mode, feeds, central versions, and caches can produce machine-specific graphs.

## Debug and Release can differ

`Debug` and `Release` are MSBuild configurations, not just names. SDK/project settings may change optimization, symbols, constants, warnings, generated behavior, and publish transforms.

Common Release-only exposures include:

- timing/race assumptions,
- code under `#if DEBUG`,
- different configuration conditions,
- trimming/AOT incompatibility,
- reliance on debugger side effects,
- uninitialized/invalid state hidden by test paths.

Build, test, and smoke-test the exact published Release artifact. Do not “fix” Release by disabling optimization before understanding the bug.

Host environments (`Development`, `Production`) are separate from build configurations.

## Configuration files and build output

A file existing in the project directory does not ensure it is copied to `bin` or publish output. SDK defaults handle common files for some project types, but custom files need metadata:

```xml
<ItemGroup>
  <None Update="rules.json"
        CopyToOutputDirectory="PreserveNewest"
        CopyToPublishDirectory="PreserveNewest" />
</ItemGroup>
```

Choose `PreserveNewest` rather than `Always` unless every build must copy. Avoid copying secrets into artifacts.

Resolve content paths from an appropriate base such as `IHostEnvironment.ContentRootPath` or `AppContext.BaseDirectory`, depending on whether the file is application content or publish-adjacent content. The current working directory can differ under services, tests, IDEs, and containers.

## Case sensitivity across operating systems

Case-insensitive development filesystems can hide mismatches that fail on case-sensitive systems:

```text
Configured: Templates/Invoice.html
Actual:     templates/invoice.html
```

Problems can affect source includes, content files, embedded resources, routes, environment-variable conventions, and native library names.

Match exact casing in source control and code. Use `Path.Combine` rather than hard-coded separators. Test CI/deployment on the target OS family.

Case-only renames may require an intermediate filename for source control to record them reliably.

## Platform-specific APIs

A project targeting plain `net10.0` can still call behavior that is unsupported or different on another platform. Platform-specific TFMs and analyzer attributes help communicate constraints but cannot predict every native/environment dependency.

Look for:

- `[SupportedOSPlatform]`/`[UnsupportedOSPlatform]` diagnostics,
- `OperatingSystem.IsWindows()` and related checks,
- native library loading,
- path, permission, certificate, locale, and timezone differences,
- Windows-only project SDKs/TFMs.

Prefer cross-platform APIs when portability is required. Isolate platform code behind a tested abstraction and publish/test each supported RID.

## Garbage collection does not dispose resources

Garbage collection eventually reclaims unreachable managed memory. It does not promise timely closure of files, sockets, database resources, native handles, timers, or subscriptions.

```csharp
using var stream = File.OpenRead(path);
await using var transaction = await database.BeginTransactionAsync(cancellationToken);
```

Dispose resources you own and let dependency-injection containers dispose services they create. Do not rely on finalizers as ordinary cleanup.

Resource leaks often appear as locked files, exhausted connection pools/handles, callbacks to dead objects, or shutdown delays—not necessarily high managed memory.

## A reproducibility checklist

When behavior differs between environments, record:

- source commit and uncommitted/generated inputs,
- `dotnet --info`, SDK architecture, and `global.json`,
- target framework, configuration, and RID,
- restore sources, lock mode, and dependency graph,
- build/publish command and MSBuild properties,
- OS/container base and native dependencies,
- environment name and non-secret configuration keys,
- exact deployed artifact identity.

Compare dimensions systematically instead of labeling the issue “works on my machine.”

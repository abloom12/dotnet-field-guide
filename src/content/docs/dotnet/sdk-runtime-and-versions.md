---
title: SDK, Runtime, and Versions
description: Understand .NET installations, target frameworks, SDK selection, and runtime compatibility.
sidebar:
  order: 2
---

The SDK builds applications; the runtime executes them. A project’s target framework is a separate choice from both the SDK selected for a command and the runtime installed on a machine.

## Quick reference

### Inspect the machine

```bash
dotnet --info
dotnet --version
dotnet --list-sdks
dotnet --list-runtimes
dotnet --list-runtimes | sort
```

| Command | Answers |
| --- | --- |
| `dotnet --version` | Which SDK this directory selects |
| `dotnet --info` | Selected SDK, host, runtimes, architecture, paths, environment, and `global.json` information |
| `dotnet --list-sdks` | Which SDK versions and roots are installed |
| `dotnet --list-runtimes` | Which shared runtime frameworks are installed |

### Keep these versions separate

```text
SDK used to build       global.json / SDK resolver
Target framework        <TargetFramework>net10.0</TargetFramework>
Language version        defaults from TFM/SDK, optionally <LangVersion>
Runtime used to execute app     runtimeconfig + installed frameworks/roll-forward
Package version         <PackageReference Version="...">
```

### Minimal `global.json`

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestPatch",
    "allowPrerelease": false
  }
}
```

Run `dotnet --version` from the repository directory to verify the result.

### First diagnostics

```bash
which dotnet       # macOS/Linux
where dotnet       # Windows Command Prompt
Get-Command dotnet # PowerShell

dotnet --info
```

If local and CI behavior differs, compare all of: selected SDK, architecture, target framework, package sources, environment variables, and runtime identifier.

## SDK versus runtime

The **.NET SDK** contains what developers and build agents need:

- `dotnet` CLI commands,
- C# and other compilers,
- MSBuild,
- project templates,
- targeting/reference packs,
- a corresponding .NET runtime.

A **runtime** installation contains what a framework-dependent application needs to execute. It does not normally include project templates or the compiler.

Runtime families are listed independently:

```text
Microsoft.NETCore.App       base .NET runtime
Microsoft.AspNetCore.App    ASP.NET Core shared framework
Microsoft.WindowsDesktop.App Windows desktop shared framework
```

Installing an SDK usually covers local build and execution for its version. Production machines can install only the required runtime, or receive a self-contained publish that carries its own runtime.

## Target framework monikers

A target framework moniker (TFM) tells build tools which API surface and compatibility rules a project compiles against:

```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
</PropertyGroup>
```

Common shapes include:

| TFM | Meaning |
| --- | --- |
| `net10.0` | General .NET 10 target |
| `net10.0-windows` | .NET 10 plus Windows-specific API contract |
| `netstandard2.0` | .NET Standard contract for broad library compatibility |
| `net8.0;net10.0` | Multiple targets in one library project via `TargetFrameworks` |

A TFM is not an installed runtime version declaration and not a NuGet package version. It controls reference assemblies at compile time and influences restore and output paths.

Platform-specific TFMs may include a minimum platform version. Target the broadest platform that honestly provides the APIs the project needs; do not claim portability while relying on platform-specific behavior.

## Installed, selected, targeted, and requested versions

Four situations are often confused:

1. **Installed SDKs** are available for build selection.
2. **Selected SDK** is the one resolver chooses for the current working directory.
3. **Target framework** is the API/runtime contract in the project.
4. **Requested runtime framework** is written to the built application’s `.runtimeconfig.json`.

A newer SDK can commonly build projects targeting supported earlier .NET versions when the required targeting packs are available. Building successfully does not guarantee the destination has a compatible runtime.

Check from the same directory and environment used by the failing command. SDK resolution starts from the working directory, so running at the repository root versus a child directory can change which `global.json` applies.

## Inspecting an installation

`dotnet --info` is the best first report to capture. It shows:

- selected SDK and MSBuild version,
- workload information,
- runtime host version and architecture,
- SDK and runtime installation roots,
- operating system and RID,
- relevant environment variables,
- applicable `global.json` when detected.

`dotnet --list-sdks` and `--list-runtimes` include installation paths. Multiple roots or architectures can reveal why a shell, IDE, service account, or CI runner sees different installations.

Use `dotnet --version` in scripts only when the selected SDK is the intended measurement; it does not list every runtime the produced application might use.

## How .NET selects an SDK

When a command needs an SDK, the resolver looks for `global.json` beginning at the current working directory and walking upward. If one is found, its requested version and roll-forward policy guide selection. Without one, the resolver generally selects the highest available SDK according to resolver rules.

Important consequences:

- SDK selection is based on the **working directory**, not necessarily the project file’s directory.
- A parent directory’s `global.json` can affect a nested repository.
- An exact requested SDK may be unavailable even when a newer SDK is installed.
- IDE SDK support can differ from terminal support.
- Preview selection is affected by `allowPrerelease` and host/tooling context.

Always verify with `dotnet --version` rather than inferring from a project’s TFM.

## Pinning with `global.json`

Create a file with the CLI or by hand:

```bash
dotnet new globaljson --sdk-version 10.0.100 --roll-forward latestPatch
```

Example:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestPatch",
    "allowPrerelease": false
  }
}
```

A checked-in `global.json` aligns developer machines and CI, but it does not install the SDK. Provisioning still must install an allowed version.

Choose policy deliberately:

- stricter policies maximize consistency but require more frequent environment updates,
- feature-band or minor roll-forward policies improve availability but permit more SDK variation.

Update the pinned SDK as part of routine maintenance so security and servicing fixes are not missed.

## SDK feature bands

SDK versions use a form such as `10.0.101` or `10.0.200`. The hundreds position in the final component identifies a **feature band** (`1xx`, `2xx`, and so on). Feature bands can add SDK/tooling capabilities while servicing releases within a band provide patches.

This is why “same major/minor” does not always mean identical build tooling. A `global.json` roll-forward choice can constrain patches within one band or permit later feature bands.

Runtime versions use their own servicing sequence and should not be interpreted using SDK feature-band rules.

## LTS and STS releases

.NET ships major releases on a regular cadence. Releases are categorized as:

- **Long Term Support (LTS):** supported longer and often preferred where upgrade cadence is slower.
- **Standard Term Support (STS):** supported for a shorter period and useful when adopting newer platform features sooner.

Support policy, end dates, and patch requirements can change. Check the official [.NET support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core) rather than relying on memory.

LTS does not mean “never upgrade.” A supported deployment still needs current servicing patches, dependency updates, and migration before end of support.

## Compatibility and roll-forward

There are two distinct roll-forward decisions:

1. **SDK roll-forward** selects build tooling and is configured in `global.json`.
2. **Runtime roll-forward** selects an installed shared framework for a framework-dependent app and is configured through runtime settings/environment/host options.

Framework-dependent apps normally use compatible servicing updates rather than requiring one exact patch. Moving across minor or major runtime versions depends on roll-forward policy and compatibility availability; do not assume an arbitrary newer runtime will always be selected.

A higher target framework cannot be consumed by a project targeting a lower incompatible framework. NuGet restore chooses package assets compatible with each TFM, and project references must have a compatible target combination.

Before changing versions:

1. Read breaking-change and compatibility documentation.
2. Update CI and developer SDK provisioning.
3. Update `global.json` and TFMs intentionally.
4. Restore, build, and run the full test suite.
5. Publish for actual destination RIDs when relevant.
6. Validate deployment runtime availability or choose self-contained output.

Use official [.NET version selection documentation](https://learn.microsoft.com/dotnet/core/versions/selection) for exact resolver rules.

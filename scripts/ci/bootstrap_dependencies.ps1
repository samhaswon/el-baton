$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$DepsRoot = if ($env:EL_BATON_CI_DEPS_ROOT) {
    $env:EL_BATON_CI_DEPS_ROOT
} else {
    Join-Path $ProjectRoot ".ci-deps"
}
$QtPrefix = $env:QT_ROOT_DIR
if (-not $QtPrefix) {
    throw "QT_ROOT_DIR must point to the CI Qt installation"
}

$QScintillaVersion = "2.14.1"
$EcmVersion = "6.28.0"
$KSyntaxVersion = "6.28.1"
$PlantUmlVersion = "1.2026.3"
$SourceRoot = Join-Path $DepsRoot "sources"
$BuildRoot = Join-Path $DepsRoot "build"
$InstallRoot = Join-Path $DepsRoot "install"

function Write-CiDiagnostic {
    param([Parameter(Mandatory)] [string] $Message)

    $Timestamp = (Get-Date).ToUniversalTime().ToString("o")
    Write-Host "[el-baton-ci $Timestamp pid=$PID] $Message"
}

function Get-BuildProcessSummary {
    $BuildProcessNames = @(
        "cl"
        "cmake"
        "katehighlightingindexer"
        "link"
        "ninja"
        "nmake"
        "perl"
        "python"
        "rcc"
    )
    $BuildProcesses = @(
        Get-Process `
            -Name $BuildProcessNames `
            -ErrorAction SilentlyContinue
    )
    if ($BuildProcesses.Count -eq 0) {
        return "<none>"
    }
    return (
        $BuildProcesses |
            Sort-Object ProcessName, Id |
            ForEach-Object {
                $BuildProcess = $_
                try {
                    (
                        "{0}(pid={1},cpu={2:N1}s,mem={3:N1}MiB)" -f
                        $BuildProcess.ProcessName,
                        $BuildProcess.Id,
                        $BuildProcess.CPU,
                        ($BuildProcess.WorkingSet64 / 1MB)
                    )
                } catch {
                    (
                        "$($BuildProcess.ProcessName)" +
                        "(pid=$($BuildProcess.Id),exited)"
                    )
                }
            }
    ) -join ", "
}

function Invoke-MonitoredProcess {
    param(
        [Parameter(Mandatory)] [string] $Label,
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [string[]] $ArgumentList,
        [Parameter(Mandatory)] [string] $WorkingDirectory,
        [string[]] $Artifacts = @()
    )

    Write-CiDiagnostic (
        "Starting ${Label}: executable=$FilePath; " +
        "arguments=$($ArgumentList -join ' '); " +
        "workingDirectory=$WorkingDirectory"
    )
    $StartedAt = Get-Date
    $Process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow `
        -PassThru
    Write-CiDiagnostic "${Label} started with pid=$($Process.Id)"

    while (-not $Process.WaitForExit(60000)) {
        $Process.Refresh()
        $Elapsed = (Get-Date) - $StartedAt
        $CpuSeconds = $Process.TotalProcessorTime.TotalSeconds
        $WorkingSetMiB = $Process.WorkingSet64 / 1MB
        $BuildProcessSummary = Get-BuildProcessSummary

        $ArtifactSummary = if ($Artifacts.Count -eq 0) {
            "<none configured>"
        } else {
            (
                $Artifacts |
                    ForEach-Object {
                        $ArtifactName = Split-Path $_ -Leaf
                        if (Test-Path $_) {
                            $Artifact = Get-Item $_
                            (
                                "{0}: {1:N1} MiB, modified={2}" -f
                                $ArtifactName,
                                ($Artifact.Length / 1MB),
                                $Artifact.LastWriteTimeUtc.ToString("o")
                            )
                        } else {
                            "${ArtifactName}: <not created>"
                        }
                    }
            ) -join "; "
        }

        Write-CiDiagnostic (
            "${Label} heartbeat: elapsed=$($Elapsed.ToString()); " +
            "rootCpu=$("{0:N2}" -f $CpuSeconds)s; " +
            "rootWorkingSet=$("{0:N1}" -f $WorkingSetMiB) MiB; " +
            "buildProcesses=$BuildProcessSummary; artifacts=$ArtifactSummary"
        )
    }

    $Process.WaitForExit()
    $Elapsed = (Get-Date) - $StartedAt
    Write-CiDiagnostic (
        "${Label} exited with code $($Process.ExitCode) after " +
        $Elapsed.ToString()
    )
    if ($Process.ExitCode -ne 0) {
        throw "${Label} failed with exit code $($Process.ExitCode)"
    }
}

function Get-VerifiedFile {
    param(
        [Parameter(Mandatory)] [string] $Uri,
        [Parameter(Mandatory)] [string] $Destination,
        [Parameter(Mandatory)] [string] $Sha256
    )

    Write-CiDiagnostic "Checking download cache for $Destination"
    if ((Test-Path $Destination) -and
        ((Get-FileHash $Destination -Algorithm SHA256).Hash -eq $Sha256)) {
        $CachedFile = Get-Item $Destination
        Write-CiDiagnostic (
            "Using verified cached download $Destination " +
            "($("{0:N1}" -f ($CachedFile.Length / 1MB)) MiB)"
        )
        return
    }

    Write-CiDiagnostic "Downloading $Uri to $Destination"
    New-Item -ItemType Directory -Force (Split-Path $Destination) | Out-Null
    $Partial = "$Destination.part"
    Invoke-WebRequest -Uri $Uri -OutFile $Partial
    $DownloadedFile = Get-Item $Partial
    Write-CiDiagnostic (
        "Download completed for $Uri " +
        "($("{0:N1}" -f ($DownloadedFile.Length / 1MB)) MiB); verifying SHA-256"
    )
    $Actual = (Get-FileHash $Partial -Algorithm SHA256).Hash
    if ($Actual -ne $Sha256) {
        Remove-Item -Force $Partial
        throw "Checksum mismatch for $Uri"
    }
    Move-Item -Force $Partial $Destination
    Write-CiDiagnostic "Verified and stored $Destination"
}

New-Item -ItemType Directory -Force $SourceRoot, $BuildRoot, $InstallRoot | Out-Null

$QScintillaArchive = Join-Path $SourceRoot "QScintilla-$QScintillaVersion.tar.gz"
$QScintillaSource = Join-Path $SourceRoot "QScintilla_src-$QScintillaVersion"
$QScintillaBuild = Join-Path $BuildRoot "qscintilla-$QScintillaVersion"
Get-VerifiedFile `
    "https://www.riverbankcomputing.com/static/Downloads/QScintilla/$QScintillaVersion/QScintilla_src-$QScintillaVersion.tar.gz" `
    $QScintillaArchive `
    "dfe13c6acc9d85dfcba76ccc8061e71a223957a6c02f3c343b30a9d43a4cdd4d"
if (-not (Test-Path (Join-Path $QScintillaSource "src/qscintilla.pro"))) {
    tar -xzf $QScintillaArchive -C $SourceRoot
}
if (-not (Test-Path (Join-Path $QScintillaBuild ".complete"))) {
    if (Test-Path $QScintillaBuild) {
        Remove-Item -Recurse -Force $QScintillaBuild
    }
    New-Item -ItemType Directory -Force $QScintillaBuild | Out-Null
    Push-Location $QScintillaBuild
    try {
        # Both lib.exe and llvm-lib.exe have stalled for hours on QScintilla's
        # single large response file.  Feed the compatible LLVM archiver small
        # validated batches instead.
        $LlvmBin = Join-Path $env:ProgramFiles "LLVM/bin"
        $BundledLlvmAr = Join-Path $LlvmBin "llvm-ar.exe"
        if (Test-Path $BundledLlvmAr) {
            $env:PATH = "$LlvmBin;$env:PATH"
        }
        $LlvmAr = Get-Command llvm-ar.exe -ErrorAction SilentlyContinue
        if (-not $LlvmAr) {
            throw "llvm-ar.exe is required to archive QScintilla on Windows"
        }
        $env:LLVM_AR = $LlvmAr.Source
        $ArchiveHelper = (Resolve-Path (
            Join-Path $ProjectRoot "scripts/ci/archive_qscintilla.py"
        )).Path.Replace("\", "/")
        $QMakeArchiver = "QMAKE_LIB=python.exe $ArchiveHelper"
        & (Join-Path $QtPrefix "bin/qmake.exe") `
            (Join-Path $QScintillaSource "src/qscintilla.pro") `
            CONFIG+=release `
            CONFIG+=staticlib `
            $QMakeArchiver
        if ($LASTEXITCODE -ne 0) { throw "QScintilla configure failed" }
        $ReleaseMakefile = Join-Path $QScintillaBuild "Makefile.Release"
        if (-not (Test-Path $ReleaseMakefile) -or
            -not (Select-String `
                -Path $ReleaseMakefile `
                -SimpleMatch "archive_qscintilla.py" `
                -Quiet)) {
            throw "QScintilla makefile did not select the batched archive helper"
        }
        # jom hangs after the archive helper has successfully produced the
        # static library. Build the release makefile directly with MSVC's
        # sequential make implementation to avoid both jom's finalization bug
        # and qmake's recursive top-level make handoff.
        $NMake = Get-Command nmake.exe -ErrorAction SilentlyContinue
        if (-not $NMake) {
            throw "nmake.exe is required to build QScintilla"
        }
        $ExpectedLibrary = Join-Path `
            $QScintillaBuild `
            "release/qscintilla2_qt6.lib"
        $NMakeArguments = @(
            "/NOLOGO"
            "/S"
            "/F"
            "`"$ReleaseMakefile`""
        )
        Write-CiDiagnostic (
            "Starting QScintilla build: executable=$($NMake.Source); " +
            "arguments=$($NMakeArguments -join ' '); " +
            "workingDirectory=$QScintillaBuild; " +
            "archiver=$($LlvmAr.Source)"
        )
        $NMakeStartedAt = Get-Date
        $NMakeProcess = Start-Process `
            -FilePath $NMake.Source `
            -ArgumentList $NMakeArguments `
            -WorkingDirectory $QScintillaBuild `
            -NoNewWindow `
            -PassThru
        Write-CiDiagnostic "nmake started with pid=$($NMakeProcess.Id)"

        while (-not $NMakeProcess.WaitForExit(60000)) {
            $NMakeProcess.Refresh()
            $Elapsed = (Get-Date) - $NMakeStartedAt
            $CpuSeconds = $NMakeProcess.TotalProcessorTime.TotalSeconds
            $WorkingSetMiB = $NMakeProcess.WorkingSet64 / 1MB
            $BuildProcessSummary = Get-BuildProcessSummary
            $LibrarySummary = if (Test-Path $ExpectedLibrary) {
                $Library = Get-Item $ExpectedLibrary
                (
                    "size={0:N1} MiB, modified={1}" -f
                    ($Library.Length / 1MB),
                    $Library.LastWriteTimeUtc.ToString("o")
                )
            } else {
                "<not created>"
            }
            Write-CiDiagnostic (
                "nmake heartbeat: elapsed=$($Elapsed.ToString()); " +
                "cpu=$("{0:N2}" -f $CpuSeconds)s; " +
                "workingSet=$("{0:N1}" -f $WorkingSetMiB) MiB; " +
                "buildProcesses=$BuildProcessSummary; library=$LibrarySummary"
            )
        }
        $NMakeProcess.WaitForExit()
        $NMakeElapsed = (Get-Date) - $NMakeStartedAt
        Write-CiDiagnostic (
            "nmake exited with code $($NMakeProcess.ExitCode) after " +
            $NMakeElapsed.ToString()
        )
        if ($NMakeProcess.ExitCode -ne 0) {
            throw "QScintilla build failed"
        }
        Write-CiDiagnostic "Writing QScintilla completion stamp"
        New-Item -ItemType File (Join-Path $QScintillaBuild ".complete") | Out-Null
        Write-CiDiagnostic "QScintilla completion stamp written"
    } finally {
        Pop-Location
    }
}
Write-CiDiagnostic "Locating the generated QScintilla import/static library"
$QScintillaLibrary = Get-ChildItem $QScintillaBuild -Recurse -Filter "qscintilla2_qt6.lib" |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $QScintillaLibrary) {
    throw "QScintilla output was not found in $QScintillaBuild"
}
Write-CiDiagnostic "QScintilla library resolved to $QScintillaLibrary"

$EcmArchive = Join-Path $SourceRoot "extra-cmake-modules-$EcmVersion.tar.xz"
$EcmSource = Join-Path $SourceRoot "extra-cmake-modules-$EcmVersion"
$EcmBuild = Join-Path $BuildRoot "ecm-$EcmVersion"
$EcmPrefix = Join-Path $InstallRoot "ecm-$EcmVersion"
Write-CiDiagnostic "Beginning Extra CMake Modules $EcmVersion bootstrap"
Get-VerifiedFile `
    "https://download.kde.org/stable/frameworks/6.28/extra-cmake-modules-$EcmVersion.tar.xz" `
    $EcmArchive `
    "a32e24b267e8528d0253bc8df18bdc00e676560a43b796533e1b1406f4eef4db"
if (-not (Test-Path (Join-Path $EcmSource "CMakeLists.txt"))) {
    Write-CiDiagnostic "Extracting Extra CMake Modules to $EcmSource"
    tar -xJf $EcmArchive -C $SourceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Extra CMake Modules extraction failed"
    }
    Write-CiDiagnostic "Extra CMake Modules extraction completed"
} else {
    Write-CiDiagnostic "Extra CMake Modules source is already extracted"
}
$EcmConfig = Join-Path $EcmPrefix "share/ECM/cmake/ECMConfig.cmake"
if (-not (Test-Path $EcmConfig)) {
    $CMake = Get-Command cmake.exe -ErrorAction SilentlyContinue
    if (-not $CMake) {
        throw "cmake.exe is required to build Extra CMake Modules"
    }
    $EcmConfigureArguments = @(
        "-S"
        $EcmSource
        "-B"
        $EcmBuild
        "-G"
        "Ninja"
        "-DCMAKE_BUILD_TYPE=Release"
        "-DCMAKE_INSTALL_PREFIX=$EcmPrefix"
        "-DBUILD_TESTING=OFF"
    )
    Invoke-MonitoredProcess `
        -Label "Extra CMake Modules configure" `
        -FilePath $CMake.Source `
        -ArgumentList $EcmConfigureArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @((Join-Path $EcmBuild "CMakeCache.txt"))

    $EcmBuildArguments = @(
        "--build"
        $EcmBuild
        "--parallel"
    )
    Invoke-MonitoredProcess `
        -Label "Extra CMake Modules build" `
        -FilePath $CMake.Source `
        -ArgumentList $EcmBuildArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @((Join-Path $EcmBuild "build.ninja"))

    $EcmInstallArguments = @(
        "--install"
        $EcmBuild
    )
    Invoke-MonitoredProcess `
        -Label "Extra CMake Modules install" `
        -FilePath $CMake.Source `
        -ArgumentList $EcmInstallArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @($EcmConfig)
} else {
    Write-CiDiagnostic "Using installed Extra CMake Modules at $EcmPrefix"
}
Write-CiDiagnostic "Extra CMake Modules bootstrap completed"

$KSyntaxArchive = Join-Path $SourceRoot "syntax-highlighting-$KSyntaxVersion.tar.xz"
$KSyntaxSource = Join-Path $SourceRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxBuild = Join-Path $BuildRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxPrefix = Join-Path $InstallRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxConfig = Join-Path $KSyntaxPrefix "lib/cmake/KF6SyntaxHighlighting/KF6SyntaxHighlightingConfig.cmake"
Write-CiDiagnostic "Beginning KSyntaxHighlighting $KSyntaxVersion bootstrap"
Get-VerifiedFile `
    "https://download.kde.org/stable/frameworks/6.28/syntax-highlighting-$KSyntaxVersion.tar.xz" `
    $KSyntaxArchive `
    "fe0d4133af62c6b9c0cf7728928c64d2deb55fe808a264a5de871f4b6bc86f65"
if (-not (Test-Path (Join-Path $KSyntaxSource "CMakeLists.txt"))) {
    Write-CiDiagnostic "Extracting KSyntaxHighlighting to $KSyntaxSource"
    tar -xJf $KSyntaxArchive -C $SourceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "KSyntaxHighlighting extraction failed"
    }
    Write-CiDiagnostic "KSyntaxHighlighting extraction completed"
} else {
    Write-CiDiagnostic "KSyntaxHighlighting source is already extracted"
}
if (-not (Test-Path $KSyntaxConfig)) {
    $CMake = Get-Command cmake.exe -ErrorAction SilentlyContinue
    if (-not $CMake) {
        throw "cmake.exe is required to build KSyntaxHighlighting"
    }
    $KSyntaxCache = Join-Path $KSyntaxBuild "CMakeCache.txt"
    $KSyntaxIndex = Join-Path $KSyntaxBuild "data/index.katesyntax"
    $KSyntaxResource = Join-Path $KSyntaxBuild "data/qrc_syntax-data.cpp"
    $KSyntaxDll = Join-Path $KSyntaxBuild "bin/KF6SyntaxHighlighting.dll"
    $KSyntaxImportLibrary = Join-Path `
        $KSyntaxBuild `
        "lib/KF6SyntaxHighlighting.lib"

    $ConfigureArguments = @(
        "-S"
        $KSyntaxSource
        "-B"
        $KSyntaxBuild
        "-G"
        "Ninja"
        "-DCMAKE_BUILD_TYPE=Release"
        "-DCMAKE_INSTALL_PREFIX=$KSyntaxPrefix"
        "-DCMAKE_PREFIX_PATH=$QtPrefix;$EcmPrefix"
        "-DBUILD_TESTING=OFF"
        "-DCMAKE_DISABLE_FIND_PACKAGE_Qt6PrintSupport=ON"
        "-DCMAKE_DISABLE_FIND_PACKAGE_Qt6Quick=ON"
        "-DCMAKE_DISABLE_FIND_PACKAGE_Qt6Widgets=ON"
        "-DKDE_INSTALL_LIBDIR=lib"
        "-DKSYNTAXHIGHLIGHTING_USE_GUI=ON"
        "-DNO_STANDARD_PATHS=ON"
        "-DQRC_SYNTAX=ON"
    )
    Invoke-MonitoredProcess `
        -Label "KSyntaxHighlighting configure" `
        -FilePath $CMake.Source `
        -ArgumentList $ConfigureArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @($KSyntaxCache)

    $BuildArguments = @(
        "--build"
        $KSyntaxBuild
        "--parallel"
        "1"
    )
    Invoke-MonitoredProcess `
        -Label "KSyntaxHighlighting build" `
        -FilePath $CMake.Source `
        -ArgumentList $BuildArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @(
            $KSyntaxIndex
            $KSyntaxResource
            $KSyntaxDll
            $KSyntaxImportLibrary
        )

    $InstallArguments = @(
        "--install"
        $KSyntaxBuild
    )
    Invoke-MonitoredProcess `
        -Label "KSyntaxHighlighting install" `
        -FilePath $CMake.Source `
        -ArgumentList $InstallArguments `
        -WorkingDirectory $ProjectRoot `
        -Artifacts @($KSyntaxConfig)
}
Write-CiDiagnostic "KSyntaxHighlighting bootstrap completed"

$PlantUmlJar = Join-Path $InstallRoot "plantuml-$PlantUmlVersion.jar"
Get-VerifiedFile `
    "https://github.com/plantuml/plantuml/releases/download/v$PlantUmlVersion/plantuml-$PlantUmlVersion.jar" `
    $PlantUmlJar `
    "53af6760d96bb2737e5e4386e832b46339fc29dec74f412d7c12db7c30db8ec4"

$KSyntaxBin = Join-Path $KSyntaxPrefix "bin"
$Entries = @{
    QSCINTILLA_INCLUDE_DIR = (Join-Path $QScintillaSource "src")
    QSCINTILLA_LIBRARY = $QScintillaLibrary
    KF6SyntaxHighlighting_DIR = (Split-Path $KSyntaxConfig)
    PLANTUML_JAR = $PlantUmlJar
    EL_BATON_CI_RUNTIME_PATH = $KSyntaxBin
}
foreach ($Entry in $Entries.GetEnumerator()) {
    "$($Entry.Key)=$($Entry.Value)" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
}

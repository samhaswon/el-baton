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

function Get-VerifiedFile {
    param(
        [Parameter(Mandatory)] [string] $Uri,
        [Parameter(Mandatory)] [string] $Destination,
        [Parameter(Mandatory)] [string] $Sha256
    )

    if ((Test-Path $Destination) -and
        ((Get-FileHash $Destination -Algorithm SHA256).Hash -eq $Sha256)) {
        return
    }

    New-Item -ItemType Directory -Force (Split-Path $Destination) | Out-Null
    $Partial = "$Destination.part"
    Invoke-WebRequest -Uri $Uri -OutFile $Partial
    $Actual = (Get-FileHash $Partial -Algorithm SHA256).Hash
    if ($Actual -ne $Sha256) {
        Remove-Item -Force $Partial
        throw "Checksum mismatch for $Uri"
    }
    Move-Item -Force $Partial $Destination
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
        & $NMake.Source "/NOLOGO" "/F" $ReleaseMakefile
        if ($LASTEXITCODE -ne 0) { throw "QScintilla build failed" }
        New-Item -ItemType File (Join-Path $QScintillaBuild ".complete") | Out-Null
    } finally {
        Pop-Location
    }
}
$QScintillaLibrary = Get-ChildItem $QScintillaBuild -Recurse -Filter "qscintilla2_qt6.lib" |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $QScintillaLibrary) {
    throw "QScintilla output was not found in $QScintillaBuild"
}

$EcmArchive = Join-Path $SourceRoot "extra-cmake-modules-$EcmVersion.tar.xz"
$EcmSource = Join-Path $SourceRoot "extra-cmake-modules-$EcmVersion"
$EcmBuild = Join-Path $BuildRoot "ecm-$EcmVersion"
$EcmPrefix = Join-Path $InstallRoot "ecm-$EcmVersion"
Get-VerifiedFile `
    "https://download.kde.org/stable/frameworks/6.28/extra-cmake-modules-$EcmVersion.tar.xz" `
    $EcmArchive `
    "a32e24b267e8528d0253bc8df18bdc00e676560a43b796533e1b1406f4eef4db"
if (-not (Test-Path (Join-Path $EcmSource "CMakeLists.txt"))) {
    tar -xJf $EcmArchive -C $SourceRoot
}
if (-not (Test-Path (Join-Path $EcmPrefix "share/ECM/cmake/ECMConfig.cmake"))) {
    cmake -S $EcmSource -B $EcmBuild -G Ninja `
        -DCMAKE_BUILD_TYPE=Release `
        "-DCMAKE_INSTALL_PREFIX=$EcmPrefix" `
        -DBUILD_TESTING=OFF
    cmake --build $EcmBuild --parallel
    cmake --install $EcmBuild
}

$KSyntaxArchive = Join-Path $SourceRoot "syntax-highlighting-$KSyntaxVersion.tar.xz"
$KSyntaxSource = Join-Path $SourceRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxBuild = Join-Path $BuildRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxPrefix = Join-Path $InstallRoot "syntax-highlighting-$KSyntaxVersion"
$KSyntaxConfig = Join-Path $KSyntaxPrefix "lib/cmake/KF6SyntaxHighlighting/KF6SyntaxHighlightingConfig.cmake"
Get-VerifiedFile `
    "https://download.kde.org/stable/frameworks/6.28/syntax-highlighting-$KSyntaxVersion.tar.xz" `
    $KSyntaxArchive `
    "fe0d4133af62c6b9c0cf7728928c64d2deb55fe808a264a5de871f4b6bc86f65"
if (-not (Test-Path (Join-Path $KSyntaxSource "CMakeLists.txt"))) {
    tar -xJf $KSyntaxArchive -C $SourceRoot
}
if (-not (Test-Path $KSyntaxConfig)) {
    cmake -S $KSyntaxSource -B $KSyntaxBuild -G Ninja `
        -DCMAKE_BUILD_TYPE=Release `
        "-DCMAKE_INSTALL_PREFIX=$KSyntaxPrefix" `
        "-DCMAKE_PREFIX_PATH=$QtPrefix;$EcmPrefix" `
        -DBUILD_TESTING=OFF `
        -DCMAKE_DISABLE_FIND_PACKAGE_Qt6PrintSupport=ON `
        -DCMAKE_DISABLE_FIND_PACKAGE_Qt6Quick=ON `
        -DCMAKE_DISABLE_FIND_PACKAGE_Qt6Widgets=ON `
        -DKDE_INSTALL_LIBDIR=lib `
        -DKSYNTAXHIGHLIGHTING_USE_GUI=ON `
        -DNO_STANDARD_PATHS=ON `
        -DQRC_SYNTAX=ON
    cmake --build $KSyntaxBuild --parallel
    cmake --install $KSyntaxBuild
}

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

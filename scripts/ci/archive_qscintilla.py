#!/usr/bin/env python3
"""Create QScintilla's Windows static library without one giant archiver call."""

from __future__ import annotations

import locale
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from typing import TextIO

CHUNK_SIZE = 64
STARTED_AT = time.monotonic()


def log(message: str, *, stream: TextIO = sys.stdout) -> None:
    elapsed = time.monotonic() - STARTED_AT
    print(
        f"[qscintilla-archive +{elapsed:.3f}s pid={os.getpid()}] {message}",
        file=stream,
        flush=True,
    )


def run_archiver(label: str, command: list[str]) -> None:
    started_at = time.monotonic()
    process = subprocess.Popen(command)
    log(f"Started {label} subprocess pid={process.pid}")
    return_code = process.wait()
    elapsed = time.monotonic() - started_at
    log(
        f"Finished {label} subprocess pid={process.pid} "
        f"with exit code {return_code} after {elapsed:.3f}s"
    )
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)


def unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1]
    return value


def read_response_file(path: Path) -> list[str]:
    data = path.read_bytes()
    try:
        content = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = data.decode(locale.getpreferredencoding(False))
    return [unquote(token) for token in re.findall(r'"[^"]*"|\S+', content)]


def parse_arguments(arguments: list[str]) -> tuple[Path, list[Path]]:
    output: Path | None = None
    objects: list[Path] = []

    for argument in arguments:
        lowered = argument.lower()
        if lowered.startswith("/out:"):
            output = Path(unquote(argument[5:]))
        elif argument.startswith("@"):
            objects.extend(
                Path(token) for token in read_response_file(Path(unquote(argument[1:])))
            )
        elif lowered == "/nologo":
            continue
        elif lowered.startswith("/machine:"):
            continue
        elif lowered.endswith((".obj", ".o")):
            objects.append(Path(unquote(argument)))
        else:
            raise ValueError(f"unsupported archiver argument: {argument}")

    if output is None:
        raise ValueError("the archiver invocation did not provide /OUT:<library>")
    if not objects:
        raise ValueError("the archiver invocation did not provide any object files")
    return output, objects


def find_archiver() -> str:
    configured = os.environ.get("LLVM_AR")
    if configured:
        return configured
    discovered = shutil.which("llvm-ar.exe") or shutil.which("llvm-ar")
    if discovered:
        return discovered
    raise FileNotFoundError("llvm-ar was not found; set LLVM_AR to its full path")


def main() -> int:
    try:
        log(
            f"Starting with Python {sys.version.split()[0]} at "
            f"{sys.executable}; parent pid={os.getppid()}; "
            f"received {len(sys.argv) - 1} arguments"
        )
        output, objects = parse_arguments(sys.argv[1:])
        missing = [path for path in objects if not path.is_file()]
        if missing:
            preview = ", ".join(str(path) for path in missing[:5])
            raise FileNotFoundError(
                f"{len(missing)} QScintilla object files are missing: {preview}"
            )

        total_bytes = sum(path.stat().st_size for path in objects)
        archiver = find_archiver()
        format_arguments = (
            ["--format=coff"]
            if Path(archiver).name.lower().startswith("llvm-ar")
            else []
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.unlink(missing_ok=True)
        log(
            f"Archiving {len(objects)} QScintilla objects "
            f"({total_bytes / (1024 * 1024):.1f} MiB) in "
            f"{(len(objects) + CHUNK_SIZE - 1) // CHUNK_SIZE} batches with "
            f"{archiver}"
        )

        for start in range(0, len(objects), CHUNK_SIZE):
            batch = objects[start : start + CHUNK_SIZE]
            run_archiver(
                f"object batch {start + 1}-{start + len(batch)}",
                [
                    archiver,
                    "rc",
                    *format_arguments,
                    str(output),
                    *(str(path) for path in batch),
                ],
            )

        run_archiver(
            "symbol-table generation",
            [archiver, "s", *format_arguments, str(output)],
        )
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError(f"archiver did not produce {output}")
        log(f"Created {output} " f"({output.stat().st_size / (1024 * 1024):.1f} MiB)")
        return 0
    except (OSError, RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        log(f"QScintilla archive failed: {error}", stream=sys.stderr)
        return 1


def terminate_without_python_finalization(exit_code: int) -> None:
    active_threads = ", ".join(thread.name for thread in threading.enumerate())
    log(
        f"main returned exit code {exit_code}; active threads: "
        f"{active_threads or '<none>'}"
    )
    log("Flushing output and terminating with os._exit")
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    finally:
        # This is a one-shot qmake helper. Previous Windows CI runs produced a
        # valid archive and then remained inside the Python process for hours.
        # Avoid interpreter shutdown hooks and finalizers so the make process
        # receives the helper's exit status immediately.
        os._exit(exit_code)


if __name__ == "__main__":
    terminate_without_python_finalization(main())

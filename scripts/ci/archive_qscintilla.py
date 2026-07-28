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


CHUNK_SIZE = 64


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
                Path(token)
                for token in read_response_file(Path(unquote(argument[1:])))
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
        print(
            f"Archiving {len(objects)} QScintilla objects "
            f"({total_bytes / (1024 * 1024):.1f} MiB) in "
            f"{(len(objects) + CHUNK_SIZE - 1) // CHUNK_SIZE} batches with "
            f"{archiver}",
            flush=True,
        )

        for start in range(0, len(objects), CHUNK_SIZE):
            batch = objects[start : start + CHUNK_SIZE]
            subprocess.run(
                [
                    archiver,
                    "rc",
                    *format_arguments,
                    str(output),
                    *(str(path) for path in batch),
                ],
                check=True,
            )
            print(
                f"Archived objects {start + 1}-{start + len(batch)}",
                flush=True,
            )

        subprocess.run(
            [archiver, "s", *format_arguments, str(output)],
            check=True,
        )
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError(f"archiver did not produce {output}")
        print(
            f"Created {output} ({output.stat().st_size / (1024 * 1024):.1f} MiB)",
            flush=True,
        )
        return 0
    except (OSError, RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        print(f"QScintilla archive failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

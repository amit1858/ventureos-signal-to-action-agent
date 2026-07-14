"""Harness test package (Release 2.2).

Tests here are plain-Python assertion scripts (no pytest dependency), matching
the repository's zero-dependency eval philosophy in ``evals/``. Each module
exposes ``run()`` returning ``(passed, failed)`` and can also be executed
directly for a non-zero exit code on failure.
"""

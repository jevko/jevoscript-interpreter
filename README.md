# Jezyk

Interpreter for Jezyk aka [JevoScript](https://codeberg.org/jevko-org/JevoScript) which implements tail call optimization.

Syntax is based on [Jevko](https://jevko.org). It's Jevko minus digraphs plus a version of [multistrings](https://djedr.github.io/posts/multistrings-2023-05-25.html).

## Why?

To experiment with Uniform Call Syntax, tail call optimization, Jevko variants, and other programming language design and implementation ideas.

## Cool features

* Identifiers with spaces, e.g. `scale list` rather than `scale_list` or `scaleList` (all are fine though)
* Numbers with spaces, e.g. `1 000 000` rather than `1_000_000` or `1000000` (all are fine though)
* Shorthand syntax for simple zero-argument functions: `fn[x]` ~ `() => x`, `fn[ op[x] ]` ~ `() => op(x)`
* [Uniform Call Syntax](https://codeberg.org/jevko-org/JevoScript#uniform-call-syntax-and-the-dot-variable)
* tail call optimization
* [multistrings](https://djedr.github.io/posts/multistrings-2023-05-25.html)
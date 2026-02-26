# Code Documentation Standard

This document applies whenever creating or modifying comments and documentation in source code files.

---

## 1. Be Thorough

When documenting a file, be as thorough as possible. At minimum, this means:

- All functions, types, and interfaces are preceded by a docstring that describes their purpose. Applicable JSDoc tags should be included when relevant.

- All TypeScript type and interface properties are described.

- All function parameters are described.

- If a function throws errors, ensure the errors are captured in documentation with the `@throws` JSDoc tag.

- All modules include a `@module` JSDoc tag and description of the module at the top of the file.

## 2. Include Examples Where Possible

- When documenting functions, do your best to include an example of how the function should be used.

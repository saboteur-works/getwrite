---
name: code-documentation
description: Guide for documenting code. Use this when creating or updating documentation for source code files.
metadata:
    author: saboteur-labs
    version: 1.0
    last_updated: 2024-06-18
---

# Code Documentation Skill

## References

| Reference                                                                                 | When to load                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [JavaScript/TypeScript Code Documentation Standards](references/javascript-typescript.md) | Whenever creating or updating documentation for JavaScript or TypeScript source files |

---

When documenting code, follow these steps:

1. **Declare Skill Usage**: Immediately after the user prompt, declare that you will be using the code documentation skill to document the code, as well as what references you will be using.
2. **Understand the Code**: Read through the code to understand its functionality, purpose, and flow.
3. **Identify Key Components**: Determine the main functions, classes, and modules that need documentation.
4. **Determine If Documentation Is Needed**: Assess whether documentation needs to be created or updated based on the current state of the code. If you determine that documentation is **NOT** needed for one or more components, clearly state which components do not require documentation and explain why.
5. **Write Clear Descriptions**: Provide concise and clear descriptions for each component, explaining what it does and how it works.
6. **Use Docstrings**: For functions and classes, use docstrings to describe their purpose, parameters, return values, brief examples, and any exceptions they may raise.
7. **Add Comments**: Include inline comments to explain complex or non-obvious parts of the code.
8. **Create External Documentation**: If necessary, create external documentation (e.g., README files, wikis) to provide an overview and usage instructions.
9. **Clean Up Old Documentation**: Remove or update outdated comments and docstrings to prevent confusion.
10. **Review and Revise**: Review the documentation for accuracy, clarity, and completeness. Revise as needed to ensure it is helpful to others.
11. **Date Documentation Updates**: Keep track of when the documentation was last updated to ensure it remains current and relevant. Use the following format: `//Last Updated: YYYY-MM-DD`. This will be placed at the top of the file.

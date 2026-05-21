---
name: saboteur-pos
description: Enables Claude to use the sab-pos CLI tool to manage Saboteur software projects.
---

This skill allows Claude to use the `sab-pos` CLI tool to manage and interact with Saboteur software projects.

## The CLI Tool

You will primarily use for the `sab` command to manage tasks and notes within a Saboteur project. Below are the available commands and their descriptions.

**The commands listed in this skill are the only ones you should use. Do not attempt to use any other commands or access the filesystem directly.**

### Managing Tasks

Commands:

- Create a new task with `sab task add <title>`.
- List tasks with `sab task list`.
- View task details with `sab task view <id>`.
- Move tasks between states with `sab task move <id> <state>`.
- Mark tasks as done with `sab task done <id>`.
- Block tasks with `sab task block <id>`.
- Edit tasks with `sab task edit <id>`.
- Link notes to tasks with `sab task link <id> --note <note_id>` or create block dependencies with `sab task link <id> --blocks <other_task_id>`.

Tasks State Machine:

- backlog → active → review → done
- any non-done → blocked → active
- active → backlog

### Managing Notes

Commands:

- Create a new note with `sab note new <title> --body <text|@path>`.
- List notes with `sab note list`.
- View note details with `sab note view <id>`.
- Edit notes with `sab note edit <id> --body <text|@path>`.
- Find notes by tag or task with `sab note find`.

Wiki-links: [[note_id]] or [[title-slug]] — unresolved shows as [[broken: slug]].

`sab note edit <id> --body <text|@path>` always overwrites all content. When editing, you must provide the full content of the note, not just the changes. To append or modify specific sections, you should first retrieve the existing content with `sab note view <id>`, make your changes, and then submit the full updated content with the edit command.

## User Requests

When a user asks you to manage tasks or notes, respond with the appropriate `sab` command.

## Naming Conventions

- Use concise, descriptive titles for tasks and notes.
- Use tags to categorize notes and tasks when relevant.

## Best Practices

- Always confirm the project context before executing commands.
- Use the linking features to maintain clear relationships between tasks and notes.
- Regularly review and update task states to reflect current progress.
- Write all notes in Markdown format.
- Notes are not intended for information that belongs in the codebase or documentation; they are for project management, brainstorming, and non-code information.

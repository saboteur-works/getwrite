---
name: saboteur-pos
description: Enables Claude to use the sab-pos CLI tool to manage Saboteur software projects.
---

This skill allows Claude to use the `sab-pos` CLI tool to manage and interact with Saboteur software projects.

## The CLI Tool

You will primarily use the `sab` command to manage tasks and notes within a Saboteur project. Below are the available commands and their descriptions.

**The commands listed in this skill are the only ones you should use. Do not attempt to use any other commands or access the filesystem directly.**

### Managing Tasks

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

- Create a new note with `sab note new <title>`.
- List notes with `sab note list`.
- View note details with `sab note view <id>`.
- Edit notes with `sab note edit <id>`.
- Find notes by tag or task with `sab note find`.

Wiki-links: [[note_id]] or [[title-slug]] — unresolved shows as [[broken: slug]].

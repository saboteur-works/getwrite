# Experiments: finish saves before the desktop window closes

Script: `scripts/close-exp.mjs`. Logs: `logs/`. Run 2026-11-01 on a local unsigned packaged build (`electron-builder --mac dir --arm64 -c.mac.forceCodeSigning=false -c.mac.identity=null`), arm64 macOS, throwaway `--user-data-dir` with `workspace.json` pointing at a throwaway projects folder. Every trial is its own app launch: type one unique word, wait, act, read `content.txt`. Times are ms after the action; the script's listeners in the main process and `webRequest` give the event order.

Closes used `BrowserWindow.close()`. The quit event is an Apple event sent with `osascript`. Scripted Accessibility clicks on the real close button and Quit menu item failed (`logs/probe.txt`), so neither was run by the script.

## E1: before the fix

App code at `1a2660f1`, the same as 2.3.0.

| Time after typing | Action | Words saved | Log |
| --- | --- | ---: | --- |
| 100 ms | Close window | 0 of 8 | `probe.txt`, `conditions-100ms.txt` |
| 100 ms | Quit event | 0 of 4 | `conditions-100ms.txt` |
| 100 ms | `app.quit()` | 0 of 4 | `conditions-100ms.txt` |
| 100 ms | Close window, quit delayed 2 s | 2 of 6 | `conditions-100ms.txt` |
| 2 s | Close window | 0 of 3 | `conditions-2000ms.txt` |
| 2 s | Quit event | 0 of 2 | `conditions-2000ms.txt` |
| 2.6 s, 3.5 s | Close window, quit event | 10 of 10 | `conditions-2600ms.txt`, `conditions-3500ms.txt` |

Event order:

- **Quit:** `before-quit`, the server's port stops answering, then the window closes and the save starts. It ends `ERR_CONNECTION_REFUSED` in all 6 quit-event trials and `ERR_ABORTED` in all 4 `app.quit()` trials.
- **Close:** the save starts about 1 ms before `webContents` is destroyed, and ends `ERR_ABORTED` about 10 to 50 ms later.
- **Close with the quit delayed:** the server keeps answering for 2 s, and the request still ends `ERR_ABORTED` in all 6 trials. 2 of the 6 words reached the file.

What this discriminates: the window's teardown aborts the request whether or not the server is running, and on quit the server is gone first. Delaying only the server kill would not fix it, so the close itself has to wait.

The earlier dev-run numbers (`user-handbook/logs/rerun-g2/desk-quit.txt`, `desk-close-alone.txt`) lost 7 of 10 on close and 0 of 5 on a quit event. The difference from the packaged build is not explained.

## E2: after the fix

Same script and build method, with this branch's code.

| Condition | Words saved | Log |
| --- | ---: | --- |
| Close window, 100 ms | 6 of 6 | `fixed-100ms.txt` |
| `app.quit()`, 100 ms | 3 of 3 | `fixed-100ms.txt` |
| Quit event, 100 ms | 6 of 6 | `fixed-100ms.txt` |
| Markdown mode, close, 100 ms | 3 of 3 | `fixed-100ms.txt` |
| Save in progress (held 1.5 s), close | 2 of 2 | `fixed-100ms.txt` |
| Keep running on, close: window gone, app and port still up | 1 of 1 | `fixed-100ms.txt` |

The app exits about 130 to 240 ms after the action in the first three conditions. The save itself takes under 20 ms (`req-start` to `req-done`).

Failure paths, with the native dialog stubbed to record its text and give an answer:

| Condition | Result | Log |
| --- | --- | --- |
| Save refused, Keep Editing | Dialog; window stays. Writes restored, next close saves and exits | `fixed-100ms.txt`, `fixed-failures.txt` |
| Save refused, Close Anyway | Dialog; window closes, app exits, word not saved (as told) | `fixed-failures.txt` |
| Save refused on a quit, Keep Editing | Dialog; window stays, quit cancelled. Next close saves | `fixed-100ms.txt` |
| Page never answers | Dialog at 5004 ms and 5005 ms | `fixed-100ms.txt`, `fixed-failures.txt` |

Notes on the logs:

- In `fixed-100ms.txt` the trials after `keeprun` report `exited=false` because that trial left keep running on. `fixed-failures.txt` repeats them on a clean profile and reports `exited=true`. The save-refused-on-a-quit trial is the exception: in `fixed-failures.txt` my script threw on its last log line after the app had exited, so its evidence is the `fixed-100ms.txt` run.
- In the page-never-answers trials the word is saved by the ordinary autosave at about 2.4 s; the trial checks the time limit, not the save.

## E3: by hand

2026-11-01, the owner, on the E2 packaged build with a throwaway folder: typed words, then at once clicked the window's close button, and in a second try pressed Cmd+Q. After relaunching, the words were in the document both times. One run of each.

Not run: Windows and Linux. The native prompt itself was stubbed in E2 and has not been checked on screen.

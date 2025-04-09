# SETUP/MAINTENANCE PLUGIN

> ⚠️ **MANDATORY:**
> You **MUST ACTUALLY EDIT FILES** using the write_file, edit_file, or create_directory tools.
> **DO NOT just check boxes - you must use the file editing tools to make changes.**
> **Never** proceed to the next step or phase transition **without** actually editing files.

╔═══════════════════════════════════════════════╗
║              SETUP/MAINTENANCE                ║
║                                               ║
║  Initialize  -->  Identify  -->  Populate     ║
║  Core Files      Code Roots    Trackers       ║
╚═══════════════════════════════════════════════╝

## I. ENTERING/EXITING THIS PHASE

**Enter if**:
- `memorybankrules.md` shows `CURRENT_PHASE: Setup/Maintenance`
- `memorybankrules.md` is missing (initial setup)

**Exit when**:
- All core files exist and are initialized
- Code root directories are identified
- Dependency trackers are populated with no placeholders

**Exit action**:
You MUST use write_file or edit_file to update memorybankrules.md with:
```
<PHASE_MARKER>
CURRENT_PHASE: Setup/Maintenance
NEXT_PHASE: Strategy
LAST_ACTION: Completed Setup/Maintenance Phase
NEXT_ACTION: Transition to Strategy Phase
REQUIRED_BEFORE_TRANSITION: User Action Required
</PHASE_MARKER>

[CODE_ROOT_DIRECTORIES]
- src
- tests
- utils

[DOC_DIRECTORIES]
- docs
- documentation

[LEARNING_JOURNAL]
- Regularly updating {memory_dir} and any instruction files help me to remember what I have done and what still needs to be done so I don't lose track.
- 
```

## II. CORE FILE INITIALIZATION

**Required files**:
- `memorybankrules.md`: Phase management
- `memory-bank/projectbrief.md`: Project goals
- `memory-bank/activeContext.md`: Current state
- `memory-bank/dependency_tracker.md`: Module dependencies
- `memory-bank/changelog.md`: log tracking

**Creation procedure**:
1. Use read_file to check if each file exists
2. For missing files, use write_file or create_directory to create:
   - First create the memory-bank directory if needed:
     ```
     create_directory("memory-bank")
     ```
   
   - For `memorybankrules.md`, use write_file:
     ```
     write_file("memorybankrules.md", "<PHASE_MARKER>\nCURRENT_PHASE: Setup/Maintenance\nNEXT_PHASE: Setup/Maintenance\nLAST_ACTION: System Initialized\nNEXT_ACTION: Create/Update Core files\nREQUIRED_BEFORE_TRANSITION: Core Files Creation\n</PHASE_MARKER>\n\n<CODE_ROOT_DIRECTORIES>\n- [list to be populated]\n\n<LEARNING_JOURNAL>\n- Initial setup on [current date]")
     ```
   
   - For other files, use write_file to create with appropriate headers
   - After creating each file, use read_file to verify it was correctly created


## III. Identifying Code Root Directories

**Goal:** Identify top-level directories for project's source code, *excluding* documentation, third-party libraries, virtual environments, build directories, and configuration directories.

**Heuristics and Steps:**
1. **Initial Scan:** Read the contents of the project root directory (where `memorybankrules` is located).
2. **Candidate Identification:** Identify potential code root directories based on the following. Note that it is better to include a directory that is not a code root than to exclude one.
   - **Common Names:** Look for directories with names commonly used for source code, such as `src`, `lib`, `app`, `packages`, or the project name itself.
   - **Presence of Code Files:** Prioritize directories that *directly* contain Python files (`.py`) or other code files relevant to the project (e.g., `.js`, `.ts`, `.java`, `.cpp`, etc.).
   - **Absence of Non-Code Indicators:** *Exclude* directories that are clearly *not* for project code, such as:
     - `.git`, `.svn`, `.hg` (version control)
     - `docs`, `documentation` (documentation)
     - `venv`, `env`, `.venv` (virtual environments)
     - `node_modules`, `bower_components` (third-party JavaScript libraries)
     - `__pycache__` (Python bytecode)
     - `build`, `dist`, `target` (build output)
     - `.vscode`, `.idea` (IDE configuration)
     - `3rd_party_docs` (documentation for external libraries)
     - Directories containing primarily configuration files (`.ini`, `.yaml`, `.toml`, `.json`) *unless* those files are clearly part of your project's core logic.
   - **Structure**: If you see a nested structure, with files in folders inside the src folder, such as `src/module1/file1.py`, include `src` and not `src/module1`.
3. **Chain-of-Thought Reasoning:** For each potential directory, generate a chain of thought explaining *why* it is being considered (or rejected).
4. **Update `memorybankrules` with `<CODE_ROOT_DIRECTORIES>`.** Make sure `next_action` is specified, e.g., "Generate Keys", or another setup step if incomplete.
5. **MUP**: Follow the Mandatory Update Protocol.

**Example Chain of Thought:**
"Scanning the project root, I see directories: `.vscode`, `docs`, `cline_docs`, `src`, `cline_utils`, `venv`. `.vscode` and `venv` are excluded as they are IDE config and a virtual environment, respectively. `docs` and `cline_docs` are excluded as they are documentation. `src` contains Python files directly, so it's a strong candidate. `cline_utils` also contains `.py` files, but appears to be a parat of the CRCT system and not project-specific, so it’s excluded. Therefore, I will add `src` and not `cline_utils` to the `[CODE_ROOT_DIRECTORIES]` section of `memorybankrules`."

---

## IV. Identifying Documentation Directories

**Goal:** Identify directories containing project documentation, excluding source code, tests, build artifacts, and configuration.

**Heuristics and Steps:**
1. **Initial Scan:** Read the contents of the project root directory.
2. **Candidate Identification:** Identify potential documentation directories based on:
   - **Common Names:** Look for directories with names like `docs`, `documentation`, `wiki`, `manuals`, or project-specific documentation folders.
   - **Content Types:** Prioritize directories containing Markdown (`.md`), reStructuredText (`.rst`), HTML, or other documentation formats.
   - **Absence of Code Indicators:** Exclude directories that primarily contain code files.
3. **Chain-of-Thought Reasoning:** For each potential directory, explain why it's being considered.
4. **Update `memorybankrules` with `[DOC_DIRECTORIES]`.**
5. **MUP:** Follow the Mandatory Update Protocol.

**Example Chain of Thought:**
"Scanning the project root, I see directories: `docs`, `documentation`, `src`, `tests`. `docs` contains primarily Markdown files describing the project architecture and API. `documentation` contains user guides in HTML format. Both appear to be documentation directories. `src` and `tests` contain code and are already identified as code root directories. Therefore, I will add `docs` and `documentation` to the `[DOC_DIRECTORIES]` section of `memorybankrules`."

4. Use write_file or edit_file to update `memorybankrules.md`:
   ```
   <CODE_ROOT_DIRECTORIES>
   - src
   - utils
   - [other identified directories]
   ```

5. Verify the update by reading the file back:
   ```
   read_file("memorybankrules.md")
   ```

## V. DEPENDENCY TRACKER CREATION

1. Use write_file to create tracker structure:
   ```
   write_file("memory-bank/dependency_tracker.md", "<DEP_MATRIX_START>\n# KEY DEFINITIONS\nK1: src/module_a\nK2: src/module_b\n\n# MATRIX (Row depends on Column)\n# Symbols: > (depends on), < (depended by), x (mutual), - (none), d (doc)\n    | K1 | K2 |\nK1  | -  | -  |\nK2  | -  | -  |\n<DEP_MATRIX_END>")
   ```

2. Identify modules and files from code roots
3. Use edit_file to update KEY DEFINITIONS with identified modules
4. Analyze code to identify dependencies:
   - Imports between modules
   - Function calls between modules
   - Documentation references
5. Use edit_file to update MATRIX with appropriate symbols
6. Verify all updates using read_file

## VI. SETUP/MAINTENANCE MUP - REQUIRED FILE MODIFICATIONS

After EVERY significant action in the Setup/Maintenance phase, you MUST:

1. Use write_file or edit_file to update `memorybankrules.md` with:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Setup/Maintenance
   NEXT_PHASE: [appropriate next phase]
   LAST_ACTION: [description of what you just did]
   NEXT_ACTION: [description of what should be done next]
   REQUIRED_BEFORE_TRANSITION: [any requirements before transitioning]
   </PHASE_MARKER>
   ```

2. Use write_file or edit_file to update `memory-bank/activeContext.md` with:
   - What was just completed
   - Current state of the setup process
   - Next steps to be taken

3. Use write_file or edit_file to update `memory-bank/changelog.md` with:
   ```
   ## [YYYY-MM-DD]
   - Created: [file/directory name]
   - Updated: [file/directory name]
   - Reason: [purpose of the change]
   - Details: [relevant information]
   ```

4. After making all file modifications, verify they were applied correctly:
   ```
   read_file("memorybankrules.md")
   read_file("memory-bank/activeContext.md")
   read_file("memory-bank/changelog.md")
   ```

## VII. CHECKPOINTS BEFORE TRANSITION

Before transitioning to Strategy phase, use read_file to verify:
<TRANSITION_CHECKLIST>
[ ] Used write_file to create all required files
[ ] Used edit_file to update code roots in `memorybankrules.md`
[ ] Used write_file or edit_file to create `dependency_tracker.md` with dependencies
[ ] Used write_file or edit_file to create `doc_tracker.md` if needed
[ ] Used write_file or edit_file to update `memorybankrules.md` with NEXT_PHASE: Strategy
</TRANSITION_CHECKLIST>

## VIII. REQUIRED RESPONSE FORMAT

All responses after completing an action MUST end with verification of actual file modifications:

<MUP_COMPLETED_ACTIONS>
I have made the following file modifications:

1. EDITED `memorybankrules.md`: [Quote the exact text you added to the file]

2. EDITED `memory-bank/activeContext.md`: [Quote the exact text you added to the file]

3. EDITED `memory-bank/changelog.md`: [Quote the exact text you added to the file or "No significant changes to record"]

4. EDITED ADDITIONAL FILES:
   - [filename]: [Quote the relevant text you added/edited]
   - [filename]: [Quote the relevant text you added/edited]

5. VERIFICATION: I have confirmed all files were properly updated by reading them back.

6. NEXT ACTION: [Describe exactly what will be done next]
</MUP_COMPLETED_ACTIONS>

❗ **IMPORTANT:**
Every response **after completing a significant action** **MUST** include the **full MUP_COMPLETED_ACTIONS block** with actual quotes from the files you modified.
If you forget, **stop immediately** and perform the file edits **before** any further actions.
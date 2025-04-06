# SETUP/MAINTENANCE PLUGIN

╔═══════════════════════════════════════════════╗
║              SETUP/MAINTENANCE                ║
║                                               ║
║  Initialize  -->  Identify  -->  Populate     ║
║  Core Files      Code Roots    Trackers       ║
╚═══════════════════════════════════════════════╝

## ENTERING/EXITING THIS PHASE

**Enter if**:
- `memorybankrules.md` shows `CURRENT: Setup/Maintenance`
- `memorybankrules.md` is missing (initial setup)

**Exit when**:
- All core files exist and are initialized
- Code root directories are identified
- Dependency trackers are populated with no placeholders

**Exit action**:
```
[PHASE_MARKER]
CURRENT: Setup/Maintenance
NEXT: Strategy
LAST_ACTION: Completed Setup/Maintenance Phase
NEXT_ACTION: Transition to Strategy Phase
REQUIRED_BEFORE_TRANSITION: User Action Required
[/PHASE_MARKER]
```

## CORE FILE INITIALIZATION

**Required files**:
- `memorybankrules.md`: Phase management
- `memory-bank/projectbrief.md`: Project goals
- `memory-bank/productContext.md`: Product context
- `memory-bank/activeContext.md`: Current state
- `memory-bank/dependency_tracker.md`: Module dependencies
- `memory-bank/changelog.md`: Change log
- `memory-bank/progress.md`: Progress tracking
- `docs/doc_tracker.md`: Documentation dependencies

**Creation procedure**:
1. Check if each file exists
2. For missing files, create with basic templates[memory-bank/templates]:
   - For `memorybankrules.md`:
     ```
     [PHASE_MARKER]
     CURRENT_PHASE: Setup/Maintenance
     NEXT_PHASE: Setup/Maintenance
     LAST_ACTION: System Initialized
     NEXT_ACTION: Create/Update Core files
     REQUIRED_BEFORE_TRANSITION: Core Files Creation
     [/PHASE_MARKER]
     
     [CODE_ROOT_DIRECTORIES]
     - [list to be populated]
     
     [LEARNING_JOURNAL]
     - Initial setup on [current date]
     ```
   - For other files: Create with appropriate headers

## CODE ROOT IDENTIFICATION

1. Scan project root directory
2. **Include directories** with:
   - Source code files (.py, .js, etc.)
   - Project-specific logic
   
3. **Exclude directories** like:
   - `.git`, `.vscode` (configuration)
   - `venv`, `node_modules` (dependencies)
   - `build`, `dist` (outputs)
   - `docs` (documentation)

4. Update `memorybankrules.md`:
   ```
   [CODE_ROOT_DIRECTORIES]
   - src
   - utils
   - [other identified directories]
   ```

## DEPENDENCY TRACKER CREATION

1. Create tracker structure:
   ```
   [DEP_MATRIX_START]
   # KEY DEFINITIONS
   K1: src/module_a
   K2: src/module_b
   
   # MATRIX (Row depends on Column)
   # Symbols: > (depends on), < (depended by), x (mutual), - (none), d (doc)
       | K1 | K2 |
   K1  | -  | -  |
   K2  | -  | -  |
   [DEP_MATRIX_END]
   ```

2. Identify modules and files from code roots
3. Update KEY DEFINITIONS with identified modules
4. Analyze code to identify dependencies:
   - Imports between modules
   - Function calls between modules
   - Documentation references
5. Update MATRIX with appropriate symbols

## SETUP/MAINTENANCE MUP ADDITIONS

In addition to core MUP checklist, also verify:
[ ] 6. Code root directories identified (if applicable)
[ ] 7. Dependency trackers properly formatted
[ ] 8. Progress updated (if state changed)
[ ] 9. Core files correctly initialized

## CHECKPOINTS BEFORE TRANSITION

[TRANSITION_CHECKLIST]
[ ] All required files exist
[ ] Code roots identified and added to `memorybankrules.md`
[ ] `dependency_tracker.md` populated with dependencies
[ ] `doc_tracker.md` created and populated
[ ] `memorybankrules.md` updated with NEXT: Strategy
[/TRANSITION_CHECKLIST]

## REQUIRED RESPONSE FORMAT

All responses after an action MUST end with:

[MUP_VERIFICATION]
[X] 1. Updated activeContext.md with: [brief description]
[X] 2. Updated changelog.md: [Yes/No + reason]
[X] 3. Updated phase marker with last_action: [action description]
[X] 4. Verified next action is correct: [next action]
[X] 5. Checked if phase transition is needed: [Yes/No + reason]
[X] 6. Code root directories identified: [Yes/No/NA + details]
[X] 7. Dependency trackers formatted: [Yes/No/NA + details]
[X] 8. Progress updated: [Yes/No/NA + details]
[X] 9. Core files initialized: [Yes/No/NA + details]
[X] 10. `memorybankrules.md` updated with NEXT_ACTION action
[/MUP_VERIFICATION]
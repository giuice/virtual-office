# SETUP/MAINTENANCE PLUGIN

> ⚠️ **CRITICAL:** You MUST use `read_file`, `write_file`, `edit_file`, and `create_directory` for ALL operations. Never proceed without actually creating or modifying required files.

## SETUP SEQUENCE

1. **Check & Create Core Directory**
   ```
   create_directory memory-bank
   ```

2. **Initialize Core Files**
   ```
   read_file memorybankrules.md     # Check if exists
   write_file memorybankrules.md    # Create if missing
   
   read_file memory-bank/projectbrief.md
   write_file memory-bank/projectbrief.md
   
   read_file memory-bank/activeContext.md
   write_file memory-bank/activeContext.md
   
   read_file memory-bank/changelog.md
   write_file memory-bank/changelog.md
   
   read_file memory-bank/progress.md
   write_file memory-bank/progress.md
   ```

3. **Identify Code & Documentation Directories**

## CODE ROOT IDENTIFICATION

1. Use `list_directory` on project root
2. Evaluate directories using these criteria:
   - **INCLUDE**: `src`, `lib`, `app`, project-named directories with code files
   - **EXCLUDE**: `.git`, `docs`, `venv`, `node_modules`, `__pycache__`, `build`, `.vscode`
   - For nested structures (e.g., `src/module1/file.py`), include `src` not nested folders

3. Document reasoning for each directory decision
4. Update `memorybankrules.md`:
   ```
   edit_file memorybankrules.md
   ```
   Add:
   ```
   [CODE_ROOT_DIRECTORIES]
   - src
   - [other roots]
   
   [DOC_DIRECTORIES]
   - docs
   - [other doc dirs]
   ```

## DEPENDENCY TRACKER CREATION

1. Create basic tracker:
   ```
   write_file memory-bank/dependency_tracker.md
   ```
   
   Format:
   ```
   <DEP_MATRIX>
   # Key: > (depends on), < (depended by), x (mutual), - (none)
   
   Module1 - Module2: -  [No dependency]
   Module1 - Module3: >  [Module1 depends on Module3]
   </DEP_MATRIX>
   ```

2. Identify modules from code roots
3. Analyze dependencies between modules:
   - Look for imports
   - Check function references
   - Review documentation connections
4. Update the dependency matrix with all discovered modules

## INITIAL FILE TEMPLATES

1. **memorybankrules.md**:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Setup/Maintenance
   NEXT_PHASE: Setup/Maintenance
   LAST_ACTION: System Initialized
   NEXT_ACTION: Create Core Files
   REQUIRED_BEFORE_TRANSITION: Complete Core Setup
   </PHASE_MARKER>
   
   [CODE_ROOT_DIRECTORIES]
   - [to be populated]
   
   [DOC_DIRECTORIES]
   - [to be populated]
   
   [LEARNING_JOURNAL]
   - Initial setup on [current date]
   ```

2. **projectbrief.md**:
   ```
   # Project Brief
   
   ## Objectives
   [Project objectives]
   
   ## Requirements
   [Key requirements]
   
   ## Constraints
   [Project constraints]
   ```

3. **activeContext.md**:
   ```
   # Active Context
   
   ## Current State
   - Initial system setup in progress
   
   ## Recent Decisions
   - [To be populated]
   
   ## Next Steps
   - Complete setup phase
   - Identify code roots
   - Create dependency trackers
   ```

4. **progress.md**:
   ```
   # Project Progress
   
   ## Implementation Plans
   [To be populated]
   
   ## Task Tracking
   [To be populated]
   
   ### Task Priorities
   [To be populated]
   ```

## MANDATORY UPDATE PROTOCOL (MUP)

After EACH major action:

1. Update `memorybankrules.md`:
   ```
   edit_file memorybankrules.md
   ```
   Update phase marker with:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Setup/Maintenance
   NEXT_PHASE: [appropriate next phase]
   LAST_ACTION: [what you just did]
   NEXT_ACTION: [next action]
   REQUIRED_BEFORE_TRANSITION: [requirements]
   </PHASE_MARKER>
   ```

2. Update `memory-bank/activeContext.md` with:
   - What was completed
   - Current setup state
   - Next setup steps

3. Update `memory-bank/changelog.md` with:
   ```
   ## [YYYY-MM-DD]
   - Created: [file/directory]
   - Updated: [file/directory]
   - Reason: [purpose]
   ```

## PHASE TRANSITION

When setup is complete:

1. Verify all core files exist
2. Confirm code roots are identified
3. Ensure basic dependency tracking is established
4. Update `memorybankrules.md`:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: Setup/Maintenance
   NEXT_PHASE: Strategy
   LAST_ACTION: Completed Setup/Maintenance Phase
   NEXT_ACTION: Transition to Strategy Phase
   REQUIRED_BEFORE_TRANSITION: User Action Required
   </PHASE_MARKER>
   ```

## EVIDENCE REQUIRED

After each major setup action:
```
SETUP PROGRESS:
1. Completed: [action description]
2. Files created/modified:
   - [file1]: [content summary]
   - [file2]: [content summary]
3. Current status: [status description]
4. Next step: [next action]

USER VERIFICATION REQUIRED:
Please confirm these setup steps are correct before I proceed.
```
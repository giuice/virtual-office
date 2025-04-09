# Copilot MEMORY BANK CORE SYSTEM PROMPT
This outlines the fundamental principles, required files, workflow structure, and essential procedures that govern Copilot, the overarching framework within which all phases of operation function. Specific instructions and detailed procedures are provided in phase-specific plugin files in `memory-bank/prompts`.

**Important Clarification:** The Copilot system operates in distinct *phases* (Set-up/Maintenance, Strategy, Execution), controlled **exclusively** by the `current_phase` setting in `memorybankrules.md`. "Plan Mode" is independent of this system's *phases*. Plugin loading is *always* dictated by `current_phase`.

---

## I. Mandatory Initialization Procedure

**At initialization the LLM MUST perform the following steps, IN THIS ORDER:**

❗ **IMPORTANT**: If `memorybankrules.md` doesn't exist, assume phase is Setup/Maintenance
1. **FIRST**: Read `memorybankrules.md` to determine current phase
2. **SECOND**: IMPORTANT: You MUST read_file the plugin for the current phase (do NOT skip):
   - Setup/Maintenance → read_file `memory-bank/plugins/setup_plugin.md`: Initial setup, adding modules/docs, periodic maintenance
   - Strategy → read_file `memory-bank/plugins/strategy_plugin.md` : Task decomposition, instruction file creation, prioritization
   - Execution → read_file `memory-bank/plugins/execution_plugin.md` : Task execution, code/file modifications 
   - BEFORE PROCEED (if memorybankrules.md exists) **YOU MUST LOAD THE PLUGIN INSTRUCTIONS. DO NOT PROCEED WITHOUT DOING SO.**
3. **THIRD**: read_file core files: `memory-bank/projectbrief.md`, `memory-bank/productContext.md`, `memory-bank/activeContext.md`, `memory-bank/changelog.md`
**FAILURE TO COMPLETE THESE INITIALIZATION STEPS WILL RESULT IN ERRORS AND INVALID SYSTEM BEHAVIOR.**

## II. PHASE MANAGEMENT SYSTEM
You must read_file `{current phase name}_plugin.md`
<PHASE_MARKER>
CURRENT_PHASE: [current phase name] 
NEXT_PHASE: [next phase name]
LAST_ACTION: [description of last completed action]
NEXT_ACTION: [description of next planned action]
REQUIRED_BEFORE_TRANSITION: [conditions that must be met]
</PHASE_MARKER>

## III. PHASE TRANSITION DIAGRAM
<PHASE_DIAGRAM>
START
  |
  v
+----------------+      +----------------+      +----------------+
| SETUP/         |      | STRATEGY       |      | EXECUTION      |
| MAINTENANCE    +----->+ Create tasks   +----->+ Execute steps  |
| Initialize     |      | Plan approach  |      | Verify changes |
+----------------+      +----------------+      +----------------+
  ^                       |                        |
  |                       |                        |
  +-----------------------+------------------------+
            Project continues

CONDITIONS FOR TRANSITION:
* Setup → Strategy: All trackers populated, core files exist
* Strategy → Execution: All task instructions created with steps
* Execution → Strategy: All steps executed OR new planning needed
</PHASE_DIAGRAM>

## IV. DEPENDENCY TRACKING SYSTEM 
<DEP_MATRIX_START>
# KEY DEFINITIONS
K1: path/to/module_a
K2: path/to/module_b

# MATRIX (Row depends on Column)
# Symbols: > (depends on), < (depended by), x (mutual), - (none), d (doc)
    | K1 | K2 |
K1  | -  | >  |
K2  | <  | -  |
<DEP_MATRIX_END>

Tracker files:
- Module dependencies: `memory-bank/dependency_tracker.md`
- Documentation dependencies: `memory-bank/docs/doc_tracker.md`

## V. MANDATORY UPDATE PROTOCOL (MUP) - REQUIRED FILE MODIFICATIONS

❗ **CRITICAL RULE**: After EVERY state-changing action, you MUST IMMEDIATELY EDIT these FILES and aditional MUP `current_phase`:

1. **EDIT FILE - DO NOT JUST REPORT**: Use the write_file, edit_file, or create_file tools to update `memorybankrules.md` with:
   ```
   <PHASE_MARKER>
   CURRENT_PHASE: [current phase name]
   NEXT_PHASE: [next phase name]
   LAST_ACTION: [description of what you just did]
   NEXT_ACTION: [description of what needs to be done next]
   REQUIRED_BEFORE_TRANSITION: [conditions that must be met]
   </PHASE_MARKER>
   ```

2. **EDIT FILE - DO NOT JUST REPORT**: Use the write_file, edit_file, or create_file tools to update `memory-bank/activeContext.md` with:
   - What action was just completed
   - Current state of the project
   - Next steps or tasks

3. **EDIT FILE - DO NOT JUST REPORT**: Update `memory-bank/changelog.md` for significant changes with:
   - Date and time
   - Description of change
   - Reason for change
   - Files affected
4. **EDIT FILE - DO NOT JUST REPORT** Use the file tools to update plugin-specific MUP additions for the `current_phase`.

5. After completing steps 1-4, you MUST verify the files were updated by reading them back and confirming changes.

❌ **NEVER PROCEED** to the next task or response until you have ACTUALLY MODIFIED the files listed above using file editing tools.

## VI. Mandatory Periodic Documentation Updates

The LLM **MUST** perform a complete Mandatory Update Protocol (MUP) every 5 turns/interactions, regardless of task completion status. This periodic update requirement ensures:

1. Regular documentation of progress
2. Consistent state maintenance
3. Clean-up of completed tasks
4. Prevention of context drift

**Procedure for 5-Turn MUP:**
1. Count interactions since last MUP
2. On the 5th turn, pause current task execution
3. Perform full MUP as specified in Section VI:
   - Update `activeContext.md` with current progress
   - Update `changelog.md` with significant changes made to project files
   - Update `memorybankrules.md` [LAST_ACTION_STATE] and [LEARNING_JOURNAL]
   - Apply any plugin-specific MUP additions
4. Clean up completed tasks:
   - Mark completed steps in instruction files
   - Update dependency trackers to reflect new relationships
   - Archive or annotate completed task documentation
5. Resume task execution only after MUP completion

**Failure to perform the 5-turn MUP will result in system state inconsistency and is strictly prohibited.**


## VII. RECURSIVE TASK DECOMPOSITION
- When in Strategy Phase read_file `memory-bank/prompts/strategy_plugin.md`

## VIII. Pre-Action Verification Protocol (PAVP) (CRITICAL): 
Before file modifications (replace_in_file, write_to_file, etc.):   
   <VERIFICATION>
   - Re-read target file with `read_file`.
     - Generate "Pre-Action Verification" Chain-of-Thought:
       1. **Intended Change**: State the change (e.g., "Replace line X with line Y in file Z").
       2. **Expected Current State**: Describe expected state (e.g., "Line X is A").
       3. **Actual Current State**: Note actual state from `read_file` (e.g., "Line X is B").
       4. **Validation**: Compare; proceed if matching, otherwise re-evaluate.
     - Example:
       ```
       1. Intended Change: Replace line 10 with "process_data()" in `utils/data_utils.py`.
       2. Expected Current State: Line 10 is "clean_data()".
       3. Actual Current State: Line 10 is "clean_data()".
       4. Validation: Match confirmed; proceed.
       ```
   </VERIFICATION>

   ❗ **PROCEED ONLY IF STATES MATCH**

## IX. REQUIRED RESPONSE FORMAT
All responses after file modifications MUST end with:

<MUP_COMPLETED_ACTIONS>
I have made the following file modifications:
1. EDITED `memorybankrules.md`: [Quote the exact text you added to the file]
2. EDITED `memory-bank/activeContext.md`: [Quote the exact text you added to the file]
3. EDITED `memory-bank/changelog.md`: [Quote the exact text you added to the file or "No significant changes to record"]
4. VERIFICATION: I have confirmed all files were properly updated by reading them back.
5. NEXT ACTION: [Describe exactly what will be done next]
</MUP_COMPLETED_ACTIONS>

__Adhere to the "Don't Repeat Yourself" (DRY) and Separation of Concerns principles.__
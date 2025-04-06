# EXECUTION PLUGIN

╔═════════════════════════════════════════════════════════════╗
║                        EXECUTION                             ║
║                                                             ║
║  Verify  -->  Execute  -->  Document  -->  Update  -->  Next ║
║  State       Step         Results       Trackers      Step   ║
╚═════════════════════════════════════════════════════════════╝

## ENTERING/EXITING THIS PHASE

**Enter if**:
- `memorybankrules.md` shows `CURRENT: Execution`
- Transitioning from Strategy

**Exit when**:
- All steps in instruction files are executed
- Expected outputs are generated
- Results are documented

**Exit action**:
```
[PHASE_MARKER]
CURRENT_PHASE: Execution
NEXT_PHASE: Strategy
LAST_ACTION: Completed Execution Phase - Tasks Executed
NEXT_ACTION: Transition to Execution Phase Instructions
REQUIRED_BEFORE_TRANSITION: User Action Required
[/PHASE_MARKER]
```

## CONTEXT LOADING

1. Read core files:
   - `memorybankrules.md`
   - `memory-bank/projectbrief.md`
   - `memory-bank/productContext.md`
   - `memory-bank/activeContext.md`
   - `memory-bank/dependency_tracker.md`
   - `memory-bank/changelog.md`
   - `memory-bank/progress.md`
   - `docs/doc_tracker.md`

2. Load implementation plan:
   - Locate `IPx_name.md` in `memory-bank/implementation_plans`
   - Verify plan matches current task sequence
   - Follow plan's phasing and dependencies
3. Load the next task instruction file
4. Load all dependency files listed in the task instruction file

## STEP EXECUTION PROCESS

For each step in the instruction file:

1. **Pre-Action Verification** (CRITICAL)
   ```
   [VERIFICATION]
   - Intended change: [describe the change]
   - Expected state: [what you expect the file to contain]
   - Actual state: [what the file actually contains]
   - Validation: [MATCH/MISMATCH]
   [/VERIFICATION]
   ```
   ❗ **PROCEED ONLY IF STATES MATCH**

2. **Execute Step**
   - Perform the specified action
   - If an error occurs, document and resolve

3. **Document Results**
   ```
   [RESULTS]
   - Action completed: [description]
   - Outcome: [what changed]
   - Observations: [notable findings]
   - Issues encountered: [any problems]
   [/RESULTS]
   ```

4. **Update Step Status**
   - Mark step as completed in the instruction file:
     ```
     ## Steps
     1. ✅ [Step description]
     2. ⬜ [Step description]
     ```

5. **Apply MUP**
   - Complete all MUP checklist items
   - Update `memorybankrules.md` with progress

## ERROR HANDLING PROTOCOL

When encountering errors:
1. Document the error condition
   ```
   [ERROR]
   - Error message: [exact message]
   - Context: [what you were doing]
   - Probable cause: [your analysis]
   [/ERROR]
   ```

2. Determine resolution approach:
   - Retry with adjustments
   - Split into smaller steps
   - Revert and reconsider approach

3. Document resolution:
   ```
   [RESOLUTION]
   - Approach taken: [what you did]
   - Result: [outcome]
   - Preventative measures: [how to avoid this in future]
   [/RESOLUTION]
   ```

## SUBTASK HANDLING

When a step requires subtask execution:
1. Load subtask instruction file
2. Execute all steps in the subtask
3. Mark the parent task step as completed
4. Return to the parent task execution

## EXECUTION MUP ADDITIONS

In addition to core MUP checklist, also verify:
[ ] 6. Pre-action verification was completed
[ ] 7. Step results are documented
[ ] 8. Step status is updated in instruction file
[ ] 9. Progress.md updated with completion status

## CHECKPOINTS BEFORE TRANSITION

[TRANSITION_CHECKLIST]
[ ] All steps in the instruction file are executed
[ ] All expected outputs are generated
[ ] Results and observations are documented
[ ] Instruction file is updated with step status
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
[X] 6. Pre-action verification completed: [Yes/No + details]
[X] 7. Step results documented: [Yes/No + details]
[X] 8. Step status updated: [Yes/No + details]
[X] 9. Progress.md updated: [Yes/No + details]
[X] 10.`memorybankrules.md` updated with NEXT_ACTION: task 
[/MUP_VERIFICATION]
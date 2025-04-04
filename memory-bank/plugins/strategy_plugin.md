# STRATEGY PLUGIN

╔═══════════════════════════════════════════════════════════════════════════════════╗
║                                    STRATEGY                                        ║
║                                                                                   ║
║  Identify  -->  Create         -->  Create     -->  Prioritize  -->  Decompose     ║
║  Areas         Implementation      Tasks          Tasks          Complex Tasks     ║
║                Plans                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════════╝

## ENTERING/EXITING THIS PHASE

**Enter if**:
- `.memorybankrules` shows `CURRENT: Strategy`
- Transitioning from Setup/Maintenance

**Exit when**:
- All implementation plans are created
- All instruction files are created with complete steps
- Dependencies are clearly defined
- Tasks are prioritized and ready for execution

**Exit action**:
```
[PHASE_MARKER]
CURRENT: Strategy
NEXT: Execution
LAST_ACTION: Completed Strategy Phase - Plans and Tasks Created
REQUIRED_BEFORE_TRANSITION: User Action Required
[/PHASE_MARKER]
```

## CONTEXT LOADING

1. Read core files:
   - `.memorybankrules`
   - `memory-bank/projectbrief.md`
   - `memory-bank/productContext.md`
   - `memory-bank/activeContext.md`
   - `memory-bank/dependency_tracker.md`
   - `memory-bank/changelog.md`
   - `memory-bank/progress.md`
   - `docs/doc_tracker.md`
   
2. Review `activeContext.md` for current state and priorities
3. Check dependency trackers for module/file relationships
4. Review project objectives from `projectbrief.md`

## IMPLEMENTATION PLAN CREATION

❗ **PRE-IMPLEMENTATION PLAN CHECKLIST** - Complete before creating ANY implementation plan:
[IMPLEMENTATION_CHECKLIST]
[ ] 1. Plan name follows convention: IP{number}_{plan_name}
[ ] 2. Plan will be stored in memory-bank/implementation_plans/ directory
[ ] 3. Plan number is unique and sequential
[ ] 4. Plan name clearly describes the area of development
[ ] 5. All required sections are planned
[/IMPLEMENTATION_CHECKLIST]

1. Identify area for implementation based on:
   - `projectbrief.md` objectives
   - `activeContext.md` priorities
   - System architecture and components

2. Create implementation plan file with correct naming convention:
   ```
   memory-bank/implementation_plans/IP{number}_{plan_name}.md
   ```
   For example: `memory-bank/implementation_plans/IP1_UserDashboard.md`
   
   ❗ **CRITICAL**: ALL implementation plans MUST be stored in the `memory-bank/implementation_plans/` directory

3. Copy, fill out, and include this IMPLEMENTATION PLAN CREATION TEMPLATE in your response:

[IMPLEMENTATION_PLAN_TEMPLATE]
PLAN ID: IP{number}_{name}
PLAN LOCATION: memory-bank/implementation_plans/IP{number}_{name}.md
PLAN DESCRIPTION: [Brief description]
RELATED TASKS: [List of T{number}_{task_name} IDs]
FOLLOWS NAMING CONVENTION: [YES/NO]
[/IMPLEMENTATION_PLAN_TEMPLATE]

4. Copy template from `memory-bank/templates/implementation_plan_template.md` and populate with:
   ```
   # IP{number}_{plan_name}
   
   ## Overview
   [High-level description of implementation area]
   
   ## Goals
   - [Goal 1]
   - [Goal 2]
   
   ## Components
   - [Component 1]
   - [Component 2]
   
   ## Technical Approach
   [Description of technical approach]
   
   ## Related Tasks
   - T{number}_{task_name} - [Brief description]
   - T{number}_{task_name} - [Brief description]
   
   ## Timeline
   - [Phase 1]
   - [Phase 2]
   
   ## Risks and Mitigations
   - [Risk 1]: [Mitigation 1]
   - [Risk 2]: [Mitigation 2]
   ```

5. Update `progress.md` to include implementation plan:
   ```
   ## Implementation Plans
   - IP1_UserDashboard: 0% (not started)
   
   ## Related Tasks
   - T1_DashboardLayout: 0% (not started) - [IP1]
   - T2_DashboardWidgets: 0% (not started) - [IP1]
   ```

## TASK INSTRUCTION FILE CREATION

❗ **PRE-TASK CREATION CHECKLIST** - Complete before creating ANY task file:
[TASK_CHECKLIST]
[ ] 1. Task name follows convention: T{number}_{task_name}
[ ] 2. Task will be stored in memory-bank/tasks/ directory
[ ] 3. Task number is unique and sequential
[ ] 4. Task name clearly describes the purpose
[ ] 5. Implementation plan is referenced (if applicable)
[ ] 6. All required sections are planned
[/TASK_CHECKLIST]

1. Identify task/subtask based on:
   - `projectbrief.md` objectives
   - `activeContext.md` priorities
   - Dependencies from trackers
   - Implementation plans (reference parent plan)

2. Create file with correct naming convention in the dedicated tasks directory:
   ```
   memory-bank/tasks/T{number}_{task_name}_instructions.txt
   ```
   For example: `memory-bank/tasks/T1_DashboardLayout_instructions.txt`
   
   ❗ **CRITICAL**: ALL task files MUST be stored in the `memory-bank/tasks/` directory

3. Copy, fill out, and include this TASK CREATION TEMPLATE in your response:

[TASK_CREATION_TEMPLATE]
TASK ID: T{number}_{name}
TASK LOCATION: memory-bank/tasks/T{number}_{name}_instructions.txt
TASK DESCRIPTION: [Brief description]
PARENT IMPLEMENTATION PLAN: [IP{number}_{name}]
FOLLOWS NAMING CONVENTION: [YES/NO]
[/TASK_CREATION_TEMPLATE]

4. Copy template from `memory-bank/templates/task_template.md` and populate with:
   ```
   # T{number}_{task_name} Instructions
   
   ## Objective
   [Clear statement of purpose]
   
   ## Context
   [Background information]
   [Implementation Plan: IP{number}_{plan_name}]
   
   ## Dependencies
   [List of required modules/files with keys]
   
   ## Steps
   1. [First step]
   2. [Second step]
   ...
   
   ## Expected Output
   [Description of deliverables]
   
   ## Notes
   [Additional considerations]
   ```

5. Update `progress.md` with task:
   ```
   ## Task Completion
   - T1_DashboardLayout: 0% (not started) [IP1_UserDashboard]
   - T2_DashboardWidgets: 0% (not started) [IP1_UserDashboard]
   
   ## Next Major Milestones
   1. Begin execution of highest priority task
   ```

## TASK PRIORITIZATION

1. Review existing implementation plans and instruction files
2. Assess dependencies from trackers to identify prerequisite tasks
3. Align with project objectives from `projectbrief.md`
4. Consider recent priorities from `activeContext.md`
5. Document prioritization in `activeContext.md` AND update `progress.md`:
   ```
   ## Task Tracking
   
   ### Implementation Plan Locations
   - IP1_UserDashboard: memory-bank/implementation_plans/IP1_UserDashboard.md
   - IP2_UserProfile: memory-bank/implementation_plans/IP2_UserProfile.md
   
   ### Task Locations
   - T1_DashboardLayout: memory-bank/tasks/T1_DashboardLayout_instructions.txt [IP1]
   - T2_DashboardWidgets: memory-bank/tasks/T2_DashboardWidgets_instructions.txt [IP1]
   - T3_ProfileSettings: memory-bank/tasks/T3_ProfileSettings_instructions.txt [IP2]
   
   ### Task Priorities
   1. T1_DashboardLayout (Highest) - Required for all dashboard work [IP1]
   2. T3_ProfileSettings (High) - Security requirement [IP2]
   3. T2_DashboardWidgets (Medium) - Can be started after layout [IP1]
   ```

## RECURSIVE TASK DECOMPOSITION

For complex tasks:
1. Analyze complexity and scope
2. If too large, identify logical subtasks
3. Create instruction file for each subtask following naming convention:
   ```
   memory-bank/tasks/T{parent_number}_{parent_name}_ST{subtask_number}_{subtask_name}_instructions.txt
   ```
   For example: `memory-bank/tasks/T1_DashboardLayout_ST1_GridSystem_instructions.txt`

4. Define dependencies between subtasks
5. Update parent task to reference subtasks
6. Document decomposition in `activeContext.md` and reference parent implementation plan

## STRATEGY MUP ADDITIONS

In addition to core MUP checklist, also verify:
[ ] 6. Implementation plans follow naming convention
[ ] 7. Task instructions follow naming convention
[ ] 8. All implementation plans and task instructions have complete sections
[ ] 9. Tasks are linked to their implementation plans
[ ] 10. Task priorities are documented
[ ] 11. Progress.md updated with new implementation plans and tasks

## CHECKPOINTS BEFORE TRANSITION

[TRANSITION_CHECKLIST]
[ ] All identified implementation areas have implementation plans
[ ] All identified tasks have instruction files
[ ] All implementation plans and instruction files have complete sections
[ ] Tasks are linked to their implementation plans
[ ] Dependencies are clearly specified
[ ] Task priorities are documented
[ ] Complex tasks are decomposed if needed
[ ] `.memorybankrules` updated with NEXT: Execution
[/TRANSITION_CHECKLIST]

## REQUIRED RESPONSE FORMAT

All responses after an action MUST end with:

[MUP_VERIFICATION]
[X] 1. Updated activeContext.md with: [brief description]
[X] 2. Updated changelog.md: [Yes/No + reason]
[X] 3. Updated phase marker with last_action: [action description]
[X] 4. Verified next action is correct: [next action]
[X] 5. Checked if phase transition is needed: [Yes/No + reason]
[X] 6. Implementation plans follow IP{number}_{name} convention: [Yes/No + EXACT filename]
[X] 7. Implementation plan files saved in memory-bank/implementation_plans/ directory: [Yes/No + EXACT path]
[X] 8. Task instructions follow T{number}_{name} convention: [Yes/No + EXACT filename]
[X] 9. Task files saved in memory-bank/tasks/ directory: [Yes/No + EXACT path]
[X] 10. All implementation plans and task instructions have complete sections: [Yes/No + list any missing]
[X] 11. Tasks are linked to their implementation plans: [Yes/No + details]
[X] 12. Task priorities are documented: [Yes/No + details]
[X] 13. Progress.md updated with new implementation plans and tasks: [Yes/No + details]
[/MUP_VERIFICATION]
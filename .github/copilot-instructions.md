# Core System Instructions

You are an AI assistant working on a software development project. Follow these simple rules to stay organized and effective.

## 1. START HERE - Read Project Context
When you begin ANY session, first check if these files exist. If not, create them using the templates in the Setup phase:
- `memory-bank/product.md` - What we're building and why
- `memory-bank/structure.md` - Where files go in the project  
- `memory-bank/tech.md` - Technologies and tools we use

If they exist, read them to understand the project.

## 2. Check Current Phase
Read `memorybankrules.md` to see which phase the project is in:
- **Setup Phase**: Setting up the project, adding new features
- **Strategy Phase**: Planning tasks and breaking down work
- **Execution Phase**: Actually coding and implementing tasks

Based on the phase, load ONE additional instruction file:
- Setup → Read `memory-bank/plugins/setup_plugin.md`
- Strategy → Read `memory-bank/plugins/strategy_plugin.md`  
- Execution → Read `memory-bank/plugins/execution_plugin.md`

## 3. Track Your Work
After completing ANY action that changes the project:

### Update these tracking files:
1. **`memory-bank/activeContext.md`** - Add a brief note about:
   - What you just did
   - Current state of the project
   - What needs to be done next

2. **`memory-bank/dependencytracker.md`** - If you created or modified code that depends on other files:
   - List which files depend on which
   - Use simple format: `FileA → depends on → FileB`

3. **`tasks/[feature]_implementation.md`** - When working on tasks:
   - Mark tasks as complete `[x]` when done
   - Update progress notes in the file

### Phase Status (only if changing phases):
If moving to a different phase, update `memorybankrules.md`:
```
current_phase: [Setup/Strategy/Execution]
last_action: "What was just completed"
next_action: "What needs to be done next"
```

## 4. Simple Workflow Rules

### Before modifying any file:
1. Read the file first to see its current state
2. Make your changes
3. Verify the changes were saved correctly

### Every 5 interactions:
- Quick update to `activeContext.md` with current progress
- Clean up any completed tasks from tracking files

### When stuck or confused:
- Re-read the 3 core files (product.md, structure.md, tech.md)
- Check current phase in `memorybankrules.md`
- Look at `activeContext.md` to see what was done recently

## 5. Phase-Specific Work

**The phase-specific plugin you loaded will tell you exactly what to do.** Common patterns:

- **Setup Phase**: Initialize files, install dependencies, create folder structure
- **Strategy Phase**: Create task lists, break down features into steps
- **Execution Phase**: Write code, implement features, test functionality

## 6. Keep It Simple

Remember:
- One task at a time
- Update tracking files after significant changes (not every tiny edit)
- If something seems overly complex, break it into smaller steps
- Use the project's established patterns (found in `structure.md`)

---

**That's it!** The phase-specific plugin will have detailed instructions for your current phase. This core system just ensures you:
1. Know the project context
2. Track your work
3. Stay organized

No complex protocols or acronyms to remember - just read, work, track, repeat.
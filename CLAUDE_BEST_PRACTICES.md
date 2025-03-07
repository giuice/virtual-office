# Claude Code Best Practices

## Project Setup

### `.claude` Directory Structure
```
.claude/
├── metadata/          # Project-specific metadata
│   ├── architecture.md   # High-level architecture description
│   ├── conventions.md    # Code style and conventions
│   ├── workflows.md      # Common development workflows
├── docs/              # Relevant documentation snippets
├── snippets/          # Reusable code snippets
```

### CLAUDE.md Configuration
Place a `CLAUDE.md` file in your project root with:
- Common commands (build, test, lint)
- Code style guidelines
- Project structure overview
- Environment setup instructions

## Effective Interaction Patterns

### Commands
- Use `/compact` periodically to maintain context while reducing token usage
- Use `/help` to see available commands
- Use `-ea` flag to enable architect mode for complex architectural tasks

### Working with Code
- Provide clear, specific tasks with acceptance criteria
- Use Claude to search codebase with `dispatch_agent` for efficient navigation
- Ask Claude to explain its approach before making complex changes

### Documentation
- Have Claude document complex functions/components it creates
- Request inline comments for non-obvious code
- Ask Claude to update documentation when code changes

### Testing and Quality
- Always have Claude run linting and typechecks after changes
- Request test coverage for new functionality
- Use Claude to review changes before committing

## Security and Best Practices
- Don't store secrets or sensitive data in files Claude can access
- Verify generated code before executing potentially dangerous operations
- Review Claude-generated commits before pushing to shared repositories

## Advanced Usage
- Create task-specific prompts in your project documentation
- Use Claude to analyze and refactor complex code
- Leverage Claude for generating test cases and fixtures
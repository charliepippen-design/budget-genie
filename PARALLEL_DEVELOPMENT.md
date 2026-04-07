# Parallel Development: VS Code + Cursor Setup

This guide explains how to work on Budget Genie in both VS Code and Cursor simultaneously.

## ✅ Quick Start

### Option A: Use the batch script (Windows)
```bash
.\start-parallel.bat
```
This will:
- Install dependencies (if needed)
- Start the Vite dev server
- Open VS Code
- Open Cursor

### Option B: Manual setup
1. **Terminal 1** (Main dev server):
   ```bash
   npm run dev
   ```
   This starts the Vite server on `http://localhost:5174`

2. **Terminal 2** (Other tasks):
   ```bash
   npm run test:run    # or
   npm run lint        # or
   npm run build
   ```

3. **Open in both editors**:
   ```bash
   code .              # VS Code
   cursor .            # Cursor
   ```

## 🔄 Working in Parallel: Best Practices

### File Conflict Rules
- **VS Code**: Work on component files, pages, styling (`src/pages/`, `src/components/`)
- **Cursor**: Work on logic and utilities (`src/lib/`, `src/types/`, `src/hooks/`)

**Why?** Reduces simultaneous edits to the same file.

### Git Workflow
When working in parallel:

1. **Before switching editors**:
   ```bash
   git status  # Check what's staged
   git add -A  # Stage all changes
   ```

2. **Commit from one editor** (typically VS Code):
   ```bash
   git commit -m "feat: description"
   git push
   ```

3. **Pull in the other editor when you switch**:
   ```bash
   git pull origin main
   ```

### Dev Server Behavior
- **Hot Module Replacement (HMR)**: Both editors see changes instantly
- **Port**: Both editors connect to same dev server (`localhost:5174`)
- **Build output**: Shared — changes in either editor trigger recompile

### Testing Between Editors
Run tests in a shared terminal both editors can see:
```bash
npm run test:run      # Full test suite (102 tests)
npm run lint          # Check style
npx tsc -b --pretty   # Type check
```

## 📋 Recommended Split by Task

### VS Code (UI/UX Focus)
- Build new pages (`src/pages/`)
- Create components (`src/components/`)
- Style refinements (Tailwind classes)
- Theme/design system updates
- E2E test scenarios

### Cursor (Logic/API Focus)
- Calculation engines (`src/types/channel.ts`)
- Business logic (`src/lib/`)
- Custom hooks (`src/hooks/`)
- Test files (especially unit tests)
- Data validation and schemas

## ⚠️ Handling Merge Conflicts

If both editors edit the same file (unlikely with recommended split):

1. **In VS Code** (primary editor):
   ```bash
   git status  # See conflicts
   git diff    # View changes
   ```

2. **Use VS Code's merge conflict UI** to resolve

3. **Commit the resolution**:
   ```bash
   git add .
   git commit -m "resolve merge conflict in X"
   ```

4. **Cursor**: Pull the resolved version
   ```bash
   git pull
   ```

## 🛑 Avoiding Common Issues

### Issue: "File changed on disk"
- **Cause**: Other editor modified the file
- **Solution**: Click "reload" when prompted (automatic with proper setup)

### Issue: Two different versions of dependencies
- **Cause**: One editor has stale node_modules
- **Solution**: Run `npm install` once before starting both editors

### Issue: Different TypeScript versions
- **Cause**: Cursor and VS Code have different TS configs
- **Solution**: Both use `./tsconfig.json` from root — should match automatically

### Issue: ESLint disagreements
- **Cause**: One editor has different lint rules
- **Solution**: Both use `.eslintrc.js` from root — run `npm run lint` to sync

## 🧪 QA Workflow Example

**Scenario**: You want to add a new metric calculation + new UI to display it

1. **Cursor** (10 min):
   - Add calculation logic to `src/types/channel.ts`
   - Add tests to `src/types/channel.test.ts`
   - Run: `npm run test:run` ✓ (all pass)

2. **VS Code** (10 min):
   - Pull latest: `git pull`
   - Create component to display metric in `src/components/`
   - Test in browser (dev server running)

3. **Both editors**:
   - Run lint: `npm run lint` ✓
   - Run types: `npx tsc -b --pretty` ✓
   - Commit together: `git commit -m "feat: new metric"`

**Total time**: 20+ min with meaningful parallelization

## 🎯 Pro Tips

1. **Use `.cursorrules`** for consistent coding patterns in Cursor
2. **Keep dev server running** in background — both editors connect to same instance
3. **Stage changes separately** — each editor can work on different files
4. **Use git branches** if making larger parallel changes:
   ```bash
   # Terminal 1 (VS Code)
   git checkout -b feature/ui-update
   
   # Terminal 2 (Cursor)
   git checkout -b feature/calc-engine
   
   # Merge both when ready
   git merge feature/ui-update
   git merge feature/calc-engine
   ```

5. **Disable Prettier auto-format conflicts**:
   - Set same prettier config in both (it's in `package.json`)
   - Both run on save (automatic with extensions)

## 📊 Project Commands (use either editor's terminal)

```bash
npm run dev              # Start Vite server (usually run once in shared terminal)
npm run build           # Production build
npm run preview         # Preview production build
npm run test:run        # Run all tests
npm run lint            # Check style
npm run lint -- --fix   # Auto-fix style issues
npx tsc -b --pretty     # Type check
npm run perf:analyze    # Bundle analysis
```

## ✨ When to Sync

- **After every commit**: Pull in the other editor
- **Before major changes**: Pull to ensure you have latest
- **Any "file changed on disk" warning**: Reload the file

---

**You're all set!** Both editors are now configured for parallel development on Budget Genie.

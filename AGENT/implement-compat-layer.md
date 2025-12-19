````md
# Job: MV ↔ MZ Compatibility Patching (Method-Level “No-Compromise” Shims)

You are implementing a compatibility layer so **RPG Maker MV** code (`mv/rpg_*.js`) and **RPG Maker MZ** plugin expectations (`mz/rmmz_*.js`) can coexist.

We already have a diff report that lists changed/added/removed “methods” using keys like:

- `proto:Window_Selectable.drawAllItems`
- `function:Scene_Message`
- `assign:Graphics._createLoadingSpinner`
- `class:ColorManager.textColor`

Your job is to turn each diff entry into a **compat patch** that makes **both MV and MZ expectations work**, with **priority on MV behavior** (MV should remain correct and stable; MZ compatibility is additive and guarded).

---

## Core Rule

For each diff item (example `proto:Window_Selectable.drawAllItems`):

1. **Locate the implementation in both engines**
   - MV source: `mv/rpg_*.js` (ex: `mv/rpg_windows.js`)
   - MZ source: `mz/rmmz_*.js` (ex: `mz/rmmz_windows.js`)

2. **Compare the two method bodies**:
   - Identify **what MZ adds/changes**
   - Identify **what MV assumes**
   - Identify **new helpers referenced by MZ** (e.g. `maxVisibleItems`, `drawItemBackground`)

3. Write a **no-compromise merged implementation**:
   - Keep MV’s baseline algorithm and expectations
   - Add MZ behavior **only when relevant methods exist**
   - Use feature detection / optional calls:
     - `if (this.someMethod) this.someMethod(...)`
     - `const x = this.someGetter ? this.someGetter() : fallback`
   - Never break MV if MZ-only pieces are absent

4. Place the patch in the compat layer:
   - Prefer patch files grouped by domain: `MZCompat_Core.js`, `MZCompat_Windows.js`, etc.
   - Keep patches small and easy to audit

---

## Example (Gold Standard)

Diff shows:

- `proto:Window_Selectable.drawAllItems`

### MV version

```js
Window_Selectable.prototype.drawAllItems = function() {
    var topIndex = this.topIndex();
    for (var i = 0; i < this.maxPageItems(); i++) {
        var index = topIndex + i;
        if (index < this.maxItems()) {
            this.drawItem(index);
        }
    }
};
````

### MZ version

```js
Window_Selectable.prototype.drawAllItems = function() {
    const topIndex = this.topIndex();
    for (let i = 0; i < this.maxVisibleItems(); i++) {
        const index = topIndex + i;
        if (index < this.maxItems()) {
            this.drawItemBackground(index);
            this.drawItem(index);
        }
    }
};
```

### No-compromise merged patch (MV-first, MZ-additive)

```js
Window_Selectable.prototype.drawAllItems = function () {
  const topIndex = this.topIndex();

  // MV uses maxPageItems(); MZ uses maxVisibleItems()
  const max = this.maxVisibleItems ? this.maxVisibleItems() : this.maxPageItems();

  for (let i = 0; i < max; i++) {
    const index = topIndex + i;
    if (index < this.maxItems()) {
      // MZ addition: background draw if available
      if (this.drawItemBackground) {
        this.drawItemBackground(index);
      }
      this.drawItem(index);
    }
  }
};
```

This is the model you should follow for all diffs.

---

## Implementation Guidelines

### 1) MV-first behavior

* Preserve MV semantics as the “default”.
* Only adopt MZ behavior when it’s safe and supported by feature detection.
* Avoid introducing new assumptions into MV call sites.

### 2) Guard everything that may not exist

MZ often references methods/classes MV doesn’t have:

* `maxVisibleItems`, `drawItemBackground`, `ColorManager`, etc.

When porting differences:

* prefer: `if (this.drawItemBackground) this.drawItemBackground(index);`
* prefer: `const max = this.maxVisibleItems ? this.maxVisibleItems() : this.maxPageItems();`

### 3) Avoid breaking render trees (PIXI / Window internals)

Do **not** “replace MV internals wholesale” (e.g. window part creation, filtering, client areas) unless you fully understand rendering implications. Prefer:

* alias properties (getters/setters)
* add missing methods with minimal side effects
* do not add PIXI filters/clip behavior unless you correctly size and update their areas

### 4) Keep patches localized and reversible

* Patch one method at a time.
* Don’t refactor entire classes unless absolutely necessary.
* Add comments that cite the MV/MZ behavior being reconciled.

### 5) Prefer wrappers to rewriting (when possible)

If MV method is correct but MZ expects an extra call:

* wrap MV method and add behavior around it

Example pattern:

```js
const _mvFn = Window_Selectable.prototype.someMethod;
Window_Selectable.prototype.someMethod = function(...args) {
  // pre behavior (MZ)
  const r = _mvFn.apply(this, args);
  // post behavior (MZ)
  return r;
};
```

### 6) When “added in MZ” only

If a method exists in MZ but not MV, implement it **as a shim**:

* either map it to MV equivalent, or
* provide a reasonable noop fallback

Example:

* MZ expects `TouchInput.isHovered()` → return `false`

### 7) When “removed from MV” only

Often ignore unless MZ plugins reference it. If referenced:

* provide a stub or alias.

---

## Step-by-step Workflow (per diff report)

For each `*_patch.json` entry:

1. For each item in `changed`:

   * find method in MV + MZ
   * produce merged MV-first implementation
   * patch it via overwrite or wrapper in compat layer

2. For each item in `added`:

   * implement a shim method/class in compat layer
   * keep it minimal and MV-safe

3. For each item in `removed`:

   * only implement if you see it referenced by MZ plugins or compat needs
   * otherwise skip

---

## Output Requirements

For each major file pair:

* `rpg_core.js` ↔ `rmmz_core.js`
* `rpg_managers.js` ↔ `rmmz_managers.js`
* `rpg_objects.js` ↔ `rmmz_objects.js`
* `rpg_scenes.js` ↔ `rmmz_scenes.js`
* `rpg_sprites.js` ↔ `rmmz_sprites.js`
* `rpg_windows.js` ↔ `rmmz_windows.js`

Deliver:

1. A compat patch file (or edits to existing `MZCompat_*.js`) that includes:

   * merged “changed” methods
   * shims for “added” methods/classes
   * minimal/noop fallbacks where needed

2. A short note per patched method:

   * what MV does
   * what MZ adds/changes
   * how the merged version preserves MV + supports MZ

---

## Quality Bar

Your patch is correct if:

* MV game runs identically (menus, title, message windows, rendering, input)
* MZ plugins don’t crash due to missing APIs
* MZ feature expectations are met **only when safely supported**
* No rendering regressions from incorrect PIXI/window internals changes

Remember: **MV stability first**. MZ support is additive and guarded.

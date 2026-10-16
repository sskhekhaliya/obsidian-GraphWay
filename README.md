# ⚡ GraphWay (Obsidian Plugin)

> **Next-generation, auto-updating MOC and Graph hierarchy generator for Obsidian.**  
> Turn folder structures into connected Graph View nodes with one-click vault generation, flexible regex folder-note detection, and an interactive node-canvas GUI.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/sskhekhaliya)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-7C3AED?style=for-the-badge&logo=obsidian&logoColor=white)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

![GraphWay Canvas Preview](screenshots/GraphWay%20Canva.png)

---

## 🌟 Why GraphWay?

In Obsidian, **folders are filesystem containers, not graph nodes**. Without links, folders and subfolders remain invisible islands in Obsidian's native Graph View.

While plugins like **Waypoint** introduced MOC (Map of Content) lists inside folder notes, they require tedious manual setup across every folder, lack a visual overview, and don't provide flexibility for complex vaults.

**GraphWay** elevates this concept into a full-featured graph weaver:
1. **⚡ One-Click Vault Generation**: Traverses your entire vault hierarchy and auto-generates or updates folder notes and wikilinks in a single click.
2. **🔌 Blender / AI Workflow Node Canvas (GUI)**: An interactive visual node-graph interface where you can pan, zoom, view hierarchy cards, and drag bezier connection wires between notes and folders.
3. **🎯 Smart Hierarchy & Bubble-Up Logic**:
   - If folder `A` has subfolders `x` and `y`, and both have their own index notes, `A` links cleanly to `[[x]]` and `[[y]]`.
   - If a subfolder does **not** have an index note, its files automatically **bubble up** to the nearest ancestor index note—guaranteeing no files become graph orphans!
4. **🧩 Flexible Folder Note Matching (Regex & Presets)**:
   - Same name as folder (`Folder/Folder.md`)
   - Strip numeric prefixes (`01 - Work` matches `Work.md`)
   - Suffix notation (`Folder---.md`)
   - Standard index (`index.md`, `_index.md`, `readme.md`)
   - Custom Regex patterns with `{{folder}}` interpolation.
5. **🔄 Real-Time Vault Synchronizer**: Debounced background listener that seamlessly updates wikilinks when notes or folders are created, renamed, or moved.
6. **🛡️ Non-Destructive**: Replaces only the designated `%% Begin GraphWay %% ... %% End GraphWay %%` block, preserving all custom text, YAML frontmatter, and manual notes.

---

## 🚀 Getting Started

### 1. Open the GraphWay Canvas
- Click the **network** icon on the left ribbon, or run the command:  
  `GraphWay: Open GraphWay Canvas Manager`.
- In the Canvas, you'll see your folder tree laid out as cards.

### 2. One-Click Vault Generation
- Click **"⚡ Generate All Vault"** in the Canvas header (or use the command palette).
- GraphWay will scan all folders, auto-create missing index notes (if enabled), and populate the dynamic wikilink blocks.

### 3. Interactive Canvas & Multi-Selection (Blender / ComfyUI Style)
- **Pan & Zoom**: Click-drag on the canvas background to pan; mouse wheel to zoom.
- **Auto-Layout**: Click `📐 Auto-Layout` to automatically arrange cards into tidy columns by depth.
- **Multi-Node Selection & Bulk Move**:
  - **Marquee / Box Select**: Hold **Shift** and drag on the canvas background to drag out a selection rectangle.
  - **Shift + Click** (or **Ctrl + Click**): Toggle individual folder cards into/out of the multi-selection.
  - **Bulk Drag**: Drag any selected card header to move the entire group together in real time!
  - **Select All / Deselect**: Press **Ctrl+A** (or **Cmd+A**) to select all cards; press **Escape** (or click empty space) to deselect.
- **Custom Wiring & Disconnecting**:
  - **Folder ➔ Folder**: Drag from a folder's right socket to another folder's left socket to connect hierarchy.
  - **Folder ➔ File**: Drag from any folder's right socket to ANY note file's input socket! That file will immediately start rendering that folder's MOC between `%% Begin GraphWay %% ... %% End GraphWay %%`.
  - **Click to Disconnect**: Click any glowing wire (which highlights red on hover) to sever the connection instantly.

---

## ⚙️ Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Top-Level Homepage Note** | Central root/homepage note linking all top-level folders & anchoring canvas | *(empty)* |
| **Folder Note Strategy** | Naming rule (`same-name`, `strip-numbers`, `suffix`, `index`, `custom-regex`) | `same-name` |
| **Custom Regex** | Regex pattern tested against file names (supports `{{folder}}`) | `^(?:\d+[\s\-_]+)?(?<name>.+?)(?:---)?$` |
| **Suffix String** | Suffix for folder notes | `---` |
| **Folder Note Placement** | Place notes inside folder (`Folder/Folder.md`) or as sibling | `Inside folder` |
| **Auto-Create Notes** | Automatically create missing index notes during "Generate All" | `true` |
| **Bubble Up Orphans** | Files in subfolders without an index note bubble up to parent | `true` |
| **List Sorting** | How links are ordered (`folders-first`, `files-first`, `alphabetical`) | `folders-first` |
| **Excluded Folders** | Folders ignored during scanning (e.g. `.trash, templates, assets`) | `.trash, .obsidian, templates...` |
| **Excluded Tags** | Notes containing these tags are excluded (e.g. `#archive, #draft`) | `#archive, #draft` |
| **Auto-Update on Change** | Debounced auto-sync when files are moved or created | `true` |

---

## 📦 Commands

- **GraphWay: Open GraphWay Canvas Manager** — Reveals the visual node canvas.
- **GraphWay: Generate All Vault Folder Notes (MOCs)** — Bulk scan and update entire vault.
- **GraphWay: Update GraphWay Block for Current Note Folder** — Updates active folder note.
- **GraphWay: Create Missing Folder Note for Active Folder** — Creates folder note for current folder.

---

## 🛠️ Development

```bash
# Install dependencies (root workspace)
npm install

# Build production bundle
npm run build

# Watch mode during development
npm run dev

# TypeScript type check
npm run check
```

---

## ☕ Support

If you love **GraphWay** and find it helps bring clarity to your Obsidian Graph View, consider buying me a coffee to support continued development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/sskhekhaliya)

---

## 📄 License & Credits

- **Author**: [SSKhekhaliya](https://www.sskhekhaliya.in/)
- **Support**: [buymeacoffee.com/sskhekhaliya](https://buymeacoffee.com/sskhekhaliya)
- **License**: MIT License © [SSKhekhaliya](https://www.sskhekhaliya.in/)
- Inspired by the concept of folder MOCs and upgraded with visual graph computing. Built with ❤️ for the [Obsidian](https://obsidian.md) community.


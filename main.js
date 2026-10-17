"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GraphWayPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian9 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  folderNoteStrategy: "same-name",
  customRegex: "^(?:\\d+[\\s\\-_]+)?(?<name>.+?)(?:---)?$",
  suffixString: "---",
  createMissingFolderNotes: true,
  folderNoteInsideFolder: true,
  defaultTemplate: "# {{title}}\n\n%% Begin GraphWay %%\n%% End GraphWay %%\n",
  beginMarker: "%% Begin GraphWay %%",
  endMarker: "%% End GraphWay %%",
  bubbleUpOrphans: true,
  excludedFolders: [".trash", ".obsidian", "templates", "attachments", "assets"],
  excludedTags: ["#archive", "#draft"],
  autoUpdateOnVaultChange: true,
  debounceMs: 500,
  sortOrder: "folders-first",
  homepageNotePath: "",
  disconnectedEdges: [],
  customFolderEdges: [],
  folderToFileConnections: [],
  customLinkOverrides: {},
  foldersHidingDirectFiles: [],
  nodePositions: {}
};

// src/core/folderResolver.ts
var import_obsidian = require("obsidian");
var FolderResolver = class _FolderResolver {
  constructor(settings) {
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  /**
   * Cleans leading number prefixes like "01 - ", "001_", "1. " from a string
   */
  static stripLeadingNumbers(str) {
    return str.replace(/^(?:\d+[\s\-_.]+)+/, "").trim();
  }
  /**
   * Tests whether a given file matches the folder note criteria for the specified folder.
   */
  isFolderNoteFor(file, folder) {
    if (file.extension !== "md") return false;
    const folderName = folder.name;
    const fileBasename = file.basename;
    const isInside = file.parent?.path === folder.path;
    const isSibling = file.parent?.path === folder.parent?.path;
    if (this.settings.folderNoteInsideFolder && !isInside) {
      return false;
    }
    if (!this.settings.folderNoteInsideFolder && !isSibling) {
      return false;
    }
    switch (this.settings.folderNoteStrategy) {
      case "same-name":
        return fileBasename.toLowerCase() === folderName.toLowerCase();
      case "strip-numbers": {
        const cleanFolder = _FolderResolver.stripLeadingNumbers(folderName).toLowerCase();
        const cleanFile = _FolderResolver.stripLeadingNumbers(fileBasename).toLowerCase();
        return fileBasename.toLowerCase() === folderName.toLowerCase() || cleanFolder === cleanFile || cleanFolder === fileBasename.toLowerCase();
      }
      case "suffix": {
        const suffix = this.settings.suffixString || "---";
        const expectedWithSuffix = `${folderName}${suffix}`.toLowerCase();
        const cleanFolder = _FolderResolver.stripLeadingNumbers(folderName).toLowerCase();
        const cleanFile = _FolderResolver.stripLeadingNumbers(fileBasename).toLowerCase();
        const cleanExpectedWithSuffix = `${cleanFolder}${suffix}`.toLowerCase();
        return fileBasename.toLowerCase() === expectedWithSuffix || fileBasename.toLowerCase() === folderName.toLowerCase() || cleanFile === cleanExpectedWithSuffix || cleanFile === cleanFolder;
      }
      case "index": {
        const lower = fileBasename.toLowerCase();
        return lower === "index" || lower === "_index" || lower === "readme" || lower === folderName.toLowerCase();
      }
      case "custom-regex": {
        try {
          let patternStr = this.settings.customRegex;
          if (patternStr.includes("{{folder}}")) {
            const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            patternStr = patternStr.replace(/\{\{folder\}\}/g, escapedFolder);
          }
          const regex = new RegExp(patternStr, "i");
          return regex.test(fileBasename);
        } catch (e) {
          console.warn("GraphWay: Invalid custom regex pattern", e);
          return fileBasename.toLowerCase() === folderName.toLowerCase();
        }
      }
      default:
        return fileBasename.toLowerCase() === folderName.toLowerCase();
    }
  }
  /**
   * Finds the folder note for a given TFolder, if one exists.
   */
  findFolderNote(folder) {
    if (this.settings.folderNoteInsideFolder) {
      for (const child of folder.children) {
        if (child instanceof import_obsidian.TFile && this.isFolderNoteFor(child, folder)) {
          return child;
        }
      }
    } else {
      const parent = folder.parent;
      if (parent) {
        for (const sibling of parent.children) {
          if (sibling instanceof import_obsidian.TFile && this.isFolderNoteFor(sibling, folder)) {
            return sibling;
          }
        }
      }
    }
    return null;
  }
  /**
   * Computes the ideal file path for creating a new folder note for a folder.
   */
  computeDefaultFolderNotePath(folder) {
    let noteName = folder.name;
    switch (this.settings.folderNoteStrategy) {
      case "strip-numbers":
        noteName = _FolderResolver.stripLeadingNumbers(folder.name) || folder.name;
        break;
      case "suffix":
        noteName = `${folder.name}${this.settings.suffixString || "---"}`;
        break;
      case "index":
        noteName = "index";
        break;
      case "same-name":
      default:
        noteName = folder.name;
        break;
    }
    if (this.settings.folderNoteInsideFolder) {
      return folder.path ? `${folder.path}/${noteName}.md` : `${noteName}.md`;
    } else {
      const parentPath = folder.parent?.path ? `${folder.parent.path}/` : "";
      return `${parentPath}${noteName}.md`;
    }
  }
  /**
   * Checks if a folder path is in the excluded list.
   */
  isFolderExcluded(folderPath) {
    const segments = folderPath.split("/");
    for (const seg of segments) {
      if (this.settings.excludedFolders.some((ex) => ex.toLowerCase() === seg.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
};

// src/core/hierarchyBuilder.ts
var import_obsidian2 = require("obsidian");
var HierarchyBuilder = class {
  constructor(app, resolver, settings) {
    this.app = app;
    this.resolver = resolver;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
    this.resolver.updateSettings(settings);
  }
  /**
   * Scans the vault and builds a comprehensive hierarchy map of all folders
   */
  buildVaultHierarchy() {
    const hierarchy = /* @__PURE__ */ new Map();
    const rootFolder = this.app.vault.getRoot();
    this.processFolder(rootFolder, 0, hierarchy);
    return hierarchy;
  }
  isEdgeConnected(fromPath, toPath) {
    const edgeKey = `${fromPath}->${toPath}`;
    if (this.settings.disconnectedEdges && this.settings.disconnectedEdges.includes(edgeKey)) {
      return false;
    }
    return true;
  }
  /**
   * Recursively builds an unindexed subtree for a connected child folder without an index note
   */
  buildUnindexedFolderTree(folder) {
    const directFiles = [];
    const childTrees = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian2.TFile && child.extension === "md") {
        if (!this.hasExcludedTag(child)) {
          directFiles.push(child.path);
        }
      } else if (child instanceof import_obsidian2.TFolder) {
        if (!this.resolver.isFolderExcluded(child.path)) {
          if (this.isEdgeConnected(folder.path, child.path)) {
            const childIndex = this.resolver.findFolderNote(child);
            if (!childIndex) {
              childTrees.push(this.buildUnindexedFolderTree(child));
            }
          }
        }
      }
    }
    return {
      folderPath: folder.path,
      folderName: folder.name,
      files: directFiles,
      childTrees
    };
  }
  /**
   * Process a single folder and its direct children
   */
  processFolder(folder, depth, hierarchy) {
    if (this.resolver.isFolderExcluded(folder.path)) {
      return;
    }
    let folderNote = null;
    let folderDisplayName = folder.name || "Root";
    const isRoot = folder.path === "/" || folder.isRoot();
    if (isRoot) {
      if (this.settings.homepageNotePath) {
        const hp = this.app.vault.getAbstractFileByPath(this.settings.homepageNotePath);
        if (hp instanceof import_obsidian2.TFile) {
          folderNote = hp;
          folderDisplayName = hp.basename || "Homepage";
        }
      }
    } else {
      folderNote = this.resolver.findFolderNote(folder);
    }
    const directFiles = [];
    const childFolders = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian2.TFile) {
        if (child.extension === "md") {
          if (folderNote && child.path === folderNote.path) {
            continue;
          }
          if (this.hasExcludedTag(child)) {
            continue;
          }
          directFiles.push(child.path);
        }
      } else if (child instanceof import_obsidian2.TFolder) {
        if (!this.resolver.isFolderExcluded(child.path)) {
          childFolders.push(child);
        }
      }
    }
    const node = {
      folderPath: folder.path,
      folderName: isRoot ? folderNote ? `\u{1F3E0} ${folderDisplayName}` : "Root" : folder.name,
      depth,
      indexFilePath: folderNote ? folderNote.path : null,
      hasIndex: folderNote !== null,
      directFiles,
      indexedChildFolders: [],
      unindexedTrees: [],
      allConnectedChildPaths: [],
      disconnectedChildPaths: []
    };
    const allChildFolderCandidates = [...childFolders];
    if (this.settings.customFolderEdges) {
      for (const customEdge of this.settings.customFolderEdges) {
        if (customEdge.from === folder.path) {
          const target = this.app.vault.getAbstractFileByPath(customEdge.to);
          if (target instanceof import_obsidian2.TFolder && !allChildFolderCandidates.some((f) => f.path === target.path)) {
            allChildFolderCandidates.push(target);
          }
        }
      }
    }
    for (const childFolder of allChildFolderCandidates) {
      const connected = this.isEdgeConnected(folder.path, childFolder.path);
      if (!connected) {
        node.disconnectedChildPaths.push(childFolder.path);
        continue;
      }
      node.allConnectedChildPaths.push(childFolder.path);
      const childIndex = this.resolver.findFolderNote(childFolder);
      if (childIndex) {
        node.indexedChildFolders.push({
          folderPath: childFolder.path,
          indexFilePath: childIndex.path,
          folderName: childFolder.name
        });
      } else {
        node.unindexedTrees.push(this.buildUnindexedFolderTree(childFolder));
      }
    }
    hierarchy.set(folder.path, node);
    for (const childFolder of childFolders) {
      this.processFolder(childFolder, depth + 1, hierarchy);
    }
  }
  /**
   * Checks if a file contains any tag from the excludedTags setting
   */
  hasExcludedTag(file) {
    if (!this.settings.excludedTags || this.settings.excludedTags.length === 0) {
      return false;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;
    const fileTags = [];
    if (cache.tags) {
      for (const t of cache.tags) {
        fileTags.push(t.tag.toLowerCase());
      }
    }
    if (cache.frontmatter?.tags) {
      const fmTags = cache.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        for (const t of fmTags) {
          fileTags.push(String(t).toLowerCase());
        }
      } else if (typeof fmTags === "string") {
        fileTags.push(fmTags.toLowerCase());
      }
    }
    for (const ex of this.settings.excludedTags) {
      const cleanEx = ex.startsWith("#") ? ex.toLowerCase() : `#${ex.toLowerCase()}`;
      if (fileTags.some((t) => t === cleanEx || t.startsWith(`${cleanEx}/`))) {
        return true;
      }
    }
    return false;
  }
};

// src/core/markdownGenerator.ts
var import_obsidian3 = require("obsidian");
var MarkdownGenerator = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  /**
   * Recursively renders an unindexed folder tree with markdown hierarchy
   */
  renderUnindexedTree(tree, indentLevel, originFolderPath) {
    const indent = "  ".repeat(indentLevel);
    const childIndent = "  ".repeat(indentLevel + 1);
    const lines = [];
    lines.push(`${indent}- \u{1F4C1} ${tree.folderName}`);
    for (const filePath of tree.files) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof import_obsidian3.TFile) {
        const link = this.app.fileManager.generateMarkdownLink(file, originFolderPath);
        lines.push(`${childIndent}- \u{1F4C4} ${link}`);
      }
    }
    for (const subTree of tree.childTrees) {
      lines.push(...this.renderUnindexedTree(subTree, indentLevel + 1, originFolderPath));
    }
    return lines;
  }
  /**
   * Generates the inner markdown content for a folder's GraphWay block
   */
  generateBlockContent(node) {
    const lines = [];
    const folderLinks = [];
    for (const child of node.indexedChildFolders) {
      const childFile = this.app.vault.getAbstractFileByPath(child.indexFilePath);
      if (childFile instanceof import_obsidian3.TFile) {
        const link = this.app.fileManager.generateMarkdownLink(childFile, node.folderPath, "", child.folderName);
        folderLinks.push({ name: child.folderName, link });
      }
    }
    const fileLinks = [];
    const isFilesHidden = this.settings.foldersHidingDirectFiles && this.settings.foldersHidingDirectFiles.includes(node.folderPath);
    if (!isFilesHidden) {
      for (const filePath of node.directFiles) {
        const overrideTarget = this.settings.customLinkOverrides[filePath];
        if (overrideTarget && overrideTarget !== node.folderPath) {
          continue;
        }
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof import_obsidian3.TFile) {
          const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
          fileLinks.push({ name: file.basename, link });
        }
      }
      for (const [filePath, targetFolder] of Object.entries(this.settings.customLinkOverrides)) {
        if (targetFolder === node.folderPath && !node.directFiles.includes(filePath)) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof import_obsidian3.TFile) {
            const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
            fileLinks.push({ name: file.basename, link });
          }
        }
      }
    }
    const unindexedLines = [];
    if (this.settings.bubbleUpOrphans && node.unindexedTrees) {
      for (const tree of node.unindexedTrees) {
        unindexedLines.push(...this.renderUnindexedTree(tree, 0, node.folderPath));
      }
    }
    folderLinks.sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
    fileLinks.sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
    if (this.settings.sortOrder === "folders-first") {
      for (const f of folderLinks) lines.push(`- \u{1F4C1} ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
      for (const f of fileLinks) lines.push(`- \u{1F4C4} ${f.link}`);
    } else if (this.settings.sortOrder === "files-first") {
      for (const f of fileLinks) lines.push(`- \u{1F4C4} ${f.link}`);
      for (const f of folderLinks) lines.push(`- \u{1F4C1} ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
    } else {
      const combined = [
        ...folderLinks.map((f) => ({ name: f.name, line: `- \u{1F4C1} ${f.link}` })),
        ...fileLinks.map((f) => ({ name: f.name, line: `- \u{1F4C4} ${f.link}` }))
      ];
      combined.sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
      for (const item of combined) lines.push(item.line);
      for (const u of unindexedLines) lines.push(u);
    }
    if (lines.length === 0) {
      lines.push("*(No child notes or folders)*");
    }
    return lines.join("\n");
  }
  /**
   * Updates an existing note file with the new GraphWay block.
   * If the block already exists, only the text between Begin and End markers is updated.
   * If not, the block is appended or inserted cleanly.
   */
  async updateFileContent(file, node) {
    const currentContent = await this.app.vault.read(file);
    const beginMarker = this.settings.beginMarker;
    const endMarker = this.settings.endMarker;
    const newBlockContent = this.generateBlockContent(node);
    const fullBlock = `${beginMarker}
${newBlockContent}
${endMarker}`;
    const startIndex = currentContent.indexOf(beginMarker);
    const endIndex = currentContent.indexOf(endMarker);
    let updatedContent;
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      const before = currentContent.substring(0, startIndex);
      const after = currentContent.substring(endIndex + endMarker.length);
      updatedContent = `${before}${fullBlock}${after}`;
    } else {
      const fmMatch = currentContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      if (fmMatch) {
        const fmEnd = fmMatch[0].length;
        const frontmatter = currentContent.substring(0, fmEnd);
        const rest = currentContent.substring(fmEnd);
        updatedContent = `${frontmatter}
${fullBlock}

${rest.trimStart()}`;
      } else {
        if (currentContent.trim().length > 0) {
          updatedContent = `${fullBlock}

${currentContent}`;
        } else {
          updatedContent = `${fullBlock}
`;
        }
      }
    }
    if (updatedContent !== currentContent) {
      await this.app.vault.modify(file, updatedContent);
      return true;
    }
    return false;
  }
};

// src/core/vaultSynchronizer.ts
var import_obsidian4 = require("obsidian");
var VaultSynchronizer = class {
  constructor(app, settings, resolver, hierarchyBuilder, generator) {
    this.isSyncing = false;
    this.debounceTimer = null;
    this.onHierarchyUpdatedCallbacks = [];
    this.app = app;
    this.settings = settings;
    this.resolver = resolver;
    this.hierarchyBuilder = hierarchyBuilder;
    this.generator = generator;
  }
  updateSettings(settings) {
    this.settings = settings;
    this.resolver.updateSettings(settings);
    this.hierarchyBuilder.updateSettings(settings);
    this.generator.updateSettings(settings);
  }
  getHierarchyBuilder() {
    return this.hierarchyBuilder;
  }
  registerHierarchyCallback(cb) {
    this.onHierarchyUpdatedCallbacks.push(cb);
  }
  unregisterHierarchyCallback(cb) {
    this.onHierarchyUpdatedCallbacks = this.onHierarchyUpdatedCallbacks.filter((c) => c !== cb);
  }
  notifyHierarchyUpdated(hierarchy) {
    for (const cb of this.onHierarchyUpdatedCallbacks) {
      try {
        cb(hierarchy);
      } catch (err) {
        console.error("GraphWay: Error in hierarchy callback", err);
      }
    }
  }
  /**
   * One-click Vault Generator:
   * 1. Traverses all folders.
   * 2. Creates missing folder notes if enabled.
   * 3. Updates all folder notes with wikilinks conforming to the hierarchy rule.
   */
  async generateAll(showNotice = true) {
    if (this.isSyncing) {
      return { updatedCount: 0, createdCount: 0 };
    }
    this.isSyncing = true;
    let createdCount = 0;
    let updatedCount = 0;
    try {
      const allFolders = [];
      const collectFolders = (folder) => {
        if (this.resolver.isFolderExcluded(folder.path)) return;
        if (folder.path !== "/") allFolders.push(folder);
        for (const child of folder.children) {
          if (child instanceof import_obsidian4.TFolder) collectFolders(child);
        }
      };
      collectFolders(this.app.vault.getRoot());
      if (this.settings.createMissingFolderNotes) {
        if (this.settings.homepageNotePath) {
          const hpPath = (0, import_obsidian4.normalizePath)(this.settings.homepageNotePath);
          const existingHp = this.app.vault.getAbstractFileByPath(hpPath);
          if (!existingHp) {
            const title = hpPath.split("/").pop()?.replace(/\.md$/, "") || "Homepage";
            const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, title);
            await this.app.vault.create(hpPath, template);
            createdCount++;
          }
        }
        for (const folder of allFolders) {
          const existingNote = this.resolver.findFolderNote(folder);
          if (!existingNote) {
            const targetPath = (0, import_obsidian4.normalizePath)(this.resolver.computeDefaultFolderNotePath(folder));
            const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!existingFile) {
              const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, folder.name);
              await this.app.vault.create(targetPath, template);
              createdCount++;
            }
          }
        }
      }
      const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
      this.notifyHierarchyUpdated(hierarchy);
      for (const [, node] of hierarchy.entries()) {
        if (!node.indexFilePath) continue;
        const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
        if (file instanceof import_obsidian4.TFile) {
          const modified = await this.generator.updateFileContent(file, node);
          if (modified) updatedCount++;
        }
      }
      if (this.settings.folderToFileConnections) {
        for (const conn of this.settings.folderToFileConnections) {
          const folderNode = hierarchy.get(conn.folderPath);
          if (folderNode) {
            const targetFile = this.app.vault.getAbstractFileByPath(conn.filePath);
            if (targetFile instanceof import_obsidian4.TFile) {
              const modified = await this.generator.updateFileContent(targetFile, folderNode);
              if (modified) updatedCount++;
            }
          }
        }
      }
      if (showNotice) {
        new import_obsidian4.Notice(
          `GraphWay: Complete! Updated ${updatedCount} note(s)${createdCount > 0 ? `, created ${createdCount} new index note(s)` : ""}.`
        );
      }
    } catch (err) {
      console.error("GraphWay: Error during generateAll", err);
      new import_obsidian4.Notice(`GraphWay Error: Failed to generate links. Check console for details.`);
    } finally {
      this.isSyncing = false;
    }
    return { updatedCount, createdCount };
  }
  /**
   * Explicitly creates a missing folder note for a folder, populates it, and syncs
   */
  async createFolderNoteForFolder(folder) {
    const isRoot = folder.path === "/" || folder.isRoot();
    let targetPath = "";
    if (isRoot) {
      targetPath = this.settings.homepageNotePath || "Home.md";
      if (!targetPath.endsWith(".md")) targetPath += ".md";
    } else {
      targetPath = this.resolver.computeDefaultFolderNotePath(folder);
    }
    targetPath = (0, import_obsidian4.normalizePath)(targetPath);
    let file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!file) {
      const title = folder.name || (this.settings.homepageNotePath ? this.settings.homepageNotePath.replace(/\.md$/, "") : "Homepage");
      const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, title);
      try {
        file = await this.app.vault.create(targetPath, template);
        new import_obsidian4.Notice(`GraphWay: Created index note "${file.name}"`);
      } catch (err) {
        console.error("GraphWay: Failed to create index note", err);
        new import_obsidian4.Notice(`GraphWay: Failed to create "${targetPath}"`);
        return null;
      }
    }
    if (file instanceof import_obsidian4.TFile) {
      await this.syncExistingIndices();
      return file;
    }
    return null;
  }
  /**
   * Updates only a specific folder note
   */
  async updateFolder(folder, showNotice = false) {
    if (this.isSyncing) return false;
    const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
    const node = hierarchy.get(folder.path);
    if (!node || !node.indexFilePath) return false;
    const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
    if (file instanceof import_obsidian4.TFile) {
      this.isSyncing = true;
      try {
        const modified = await this.generator.updateFileContent(file, node);
        if (showNotice && modified) {
          new import_obsidian4.Notice(`GraphWay: Updated "${file.basename}".`);
        }
        return modified;
      } finally {
        this.isSyncing = false;
      }
    }
    return false;
  }
  /**
   * Debounced sync triggered by vault events (file create, delete, rename)
   */
  triggerDebouncedSync() {
    if (!this.settings.autoUpdateOnVaultChange) return;
    if (this.isSyncing) return;
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(async () => {
      this.debounceTimer = null;
      await this.syncExistingIndices();
    }, this.settings.debounceMs);
  }
  /**
   * Syncs existing indices without aggressively auto-creating new files on every keystroke
   */
  async syncExistingIndices() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
      this.notifyHierarchyUpdated(hierarchy);
      for (const [, node] of hierarchy.entries()) {
        if (!node.indexFilePath) continue;
        const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
        if (file instanceof import_obsidian4.TFile) {
          await this.generator.updateFileContent(file, node);
        }
      }
      if (this.settings.folderToFileConnections) {
        for (const conn of this.settings.folderToFileConnections) {
          const folderNode = hierarchy.get(conn.folderPath);
          if (folderNode) {
            const targetFile = this.app.vault.getAbstractFileByPath(conn.filePath);
            if (targetFile instanceof import_obsidian4.TFile) {
              await this.generator.updateFileContent(targetFile, folderNode);
            }
          }
        }
      }
    } catch (err) {
      console.error("GraphWay: Debounced sync error", err);
    } finally {
      this.isSyncing = false;
    }
  }
};

// src/settings/settingsTab.ts
var import_obsidian6 = require("obsidian");

// src/ui/fileSuggest.ts
var import_obsidian5 = require("obsidian");
var FileSuggest = class extends import_obsidian5.AbstractInputSuggest {
  constructor(app, textInputEl) {
    super(app, textInputEl);
    this.inputEl = textInputEl;
  }
  getSuggestions(query) {
    const lowerQuery = query.toLowerCase().trim();
    const markdownFiles = this.app.vault.getMarkdownFiles();
    if (!lowerQuery) {
      return markdownFiles.slice(0, 30);
    }
    return markdownFiles.filter((file) => file.path.toLowerCase().includes(lowerQuery)).slice(0, 30);
  }
  renderSuggestion(file, el) {
    el.createEl("div", { text: file.path, cls: "graphway-suggest-item" });
  }
  selectSuggestion(file) {
    this.setValue(file.path);
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.close();
  }
};

// src/settings/settingsTab.ts
var GraphWaySettingsTab = class extends import_obsidian6.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u26A1 GraphWay Settings" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Configure how folder notes are detected, structured, and automatically linked to build your Graph View hierarchy."
    });
    new import_obsidian6.Setting(containerEl).setName("Top-Level Homepage Note").setDesc('The central root/homepage note that links all top-level folders and appears as the Root node on the GraphWay Canvas (e.g. "Home.md", "Dashboard.md").').addText((text) => {
      text.setPlaceholder("Home.md").setValue(this.plugin.settings.homepageNotePath).onChange(async (val) => {
        this.plugin.settings.homepageNotePath = val.trim();
        await this.plugin.saveSettings();
      });
      new FileSuggest(this.app, text.inputEl);
    });
    new import_obsidian6.Setting(containerEl).setName("Folder Note Naming Strategy").setDesc("How GraphWay matches or creates index notes representing folders.").addDropdown((drop) => {
      drop.addOption("same-name", "Same name as folder (e.g. Projects/Projects.md)").addOption("strip-numbers", 'Strip numbers (e.g. "01 - Work" matches "Work.md")').addOption("suffix", "Suffix notation (e.g. Folder/Folder---.md)").addOption("index", "Standard index (e.g. Folder/index.md)").addOption("custom-regex", "Custom Regex pattern").setValue(this.plugin.settings.folderNoteStrategy).onChange(async (val) => {
        this.plugin.settings.folderNoteStrategy = val;
        await this.plugin.saveSettings();
        this.display();
      });
    });
    if (this.plugin.settings.folderNoteStrategy === "custom-regex") {
      new import_obsidian6.Setting(containerEl).setName("Custom Matching Regex").setDesc("Regex tested against note file names. You can use {{folder}} as a placeholder for the folder name.").addText((text) => {
        text.setPlaceholder("^(?:\\d+[\\s\\-_]+)?{{folder}}(?:---)?$").setValue(this.plugin.settings.customRegex).onChange(async (val) => {
          this.plugin.settings.customRegex = val.trim();
          await this.plugin.saveSettings();
        });
      });
    }
    if (this.plugin.settings.folderNoteStrategy === "suffix") {
      new import_obsidian6.Setting(containerEl).setName("Suffix String").setDesc('Suffix appended to folder name (e.g. "---").').addText((text) => {
        text.setPlaceholder("---").setValue(this.plugin.settings.suffixString).onChange(async (val) => {
          this.plugin.settings.suffixString = val.trim();
          await this.plugin.saveSettings();
        });
      });
    }
    new import_obsidian6.Setting(containerEl).setName("Folder Note Placement").setDesc("Place folder notes inside the folder (Folder/Folder.md) or as a sibling outside (Folder.md).").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.folderNoteInsideFolder).onChange(async (val) => {
        this.plugin.settings.folderNoteInsideFolder = val;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Auto-Create Missing Folder Notes").setDesc('When running "Generate All", automatically create missing index notes for folders that lack them.').addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.createMissingFolderNotes).onChange(async (val) => {
        this.plugin.settings.createMissingFolderNotes = val;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Bubble Up Unindexed Subfolder Notes").setDesc("If a subfolder does not have an index note, its files bubble up to the nearest parent index note.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.bubbleUpOrphans).onChange(async (val) => {
        this.plugin.settings.bubbleUpOrphans = val;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("List Item Sorting").setDesc("How links are grouped inside the generated GraphWay block.").addDropdown((drop) => {
      drop.addOption("folders-first", "Subfolders first, then files").addOption("files-first", "Files first, then subfolders").addOption("alphabetical", "Alphabetical (combined)").setValue(this.plugin.settings.sortOrder).onChange(async (val) => {
        this.plugin.settings.sortOrder = val;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "\u26A1 Exclusions & Triggers" });
    new import_obsidian6.Setting(containerEl).setName("Excluded Folders").setDesc("Comma-separated list of folder names to ignore (e.g. .trash, templates, assets).").addText((text) => {
      text.setPlaceholder(".trash, templates, assets").setValue(this.plugin.settings.excludedFolders.join(", ")).onChange(async (val) => {
        this.plugin.settings.excludedFolders = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Excluded Tags").setDesc("Notes with these tags will be omitted from generated MOCs (comma-separated, e.g. #archive, #draft).").addText((text) => {
      text.setPlaceholder("#archive, #draft").setValue(this.plugin.settings.excludedTags.join(", ")).onChange(async (val) => {
        this.plugin.settings.excludedTags = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("Auto-Update on Vault Changes").setDesc("Automatically update affected folder notes when files are created, renamed, or moved.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoUpdateOnVaultChange).onChange(async (val) => {
        this.plugin.settings.autoUpdateOnVaultChange = val;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "\u26A1 Block Markers" });
    new import_obsidian6.Setting(containerEl).setName("Begin Marker").setDesc("Markdown comment marking the start of the auto-generated section.").addText((text) => {
      text.setValue(this.plugin.settings.beginMarker).onChange(async (val) => {
        this.plugin.settings.beginMarker = val.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian6.Setting(containerEl).setName("End Marker").setDesc("Markdown comment marking the end of the auto-generated section.").addText((text) => {
      text.setValue(this.plugin.settings.endMarker).onChange(async (val) => {
        this.plugin.settings.endMarker = val.trim();
        await this.plugin.saveSettings();
      });
    });
  }
};

// src/canvas-ui/GraphWayView.ts
var import_obsidian8 = require("obsidian");

// src/canvas-ui/canvasRenderer.ts
var import_obsidian7 = require("obsidian");
var CanvasRenderer = class {
  constructor(containerEl, app, settings, synchronizer, onSettingsChange) {
    // Canvas State
    this.panX = 80;
    this.panY = 80;
    this.zoom = 1;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;
    // Multi-Node Selection State
    this.selectedNodeIds = /* @__PURE__ */ new Set();
    this.selectedInitialPositions = /* @__PURE__ */ new Map();
    this.isBoxSelecting = false;
    this.boxSelectStart = { x: 0, y: 0 };
    // Node Dragging State
    this.isDraggingNode = false;
    this.draggedNodeId = null;
    this.nodeDragStartX = 0;
    this.nodeDragStartY = 0;
    // Connecting Wires State
    this.isConnecting = false;
    this.connectionStart = null;
    this.tempMousePos = { x: 0, y: 0 };
    // Data cache
    this.hierarchy = /* @__PURE__ */ new Map();
    this.filterText = "";
    this.containerEl = containerEl;
    this.app = app;
    this.settings = settings;
    this.synchronizer = synchronizer;
    this.onSettingsChange = onSettingsChange;
    this.buildDOM();
    this.attachEvents();
  }
  updateData(hierarchy) {
    this.hierarchy = hierarchy;
    this.render();
  }
  buildDOM() {
    this.containerEl.empty();
    this.containerEl.addClass("graphway-canvas-root");
    const toolbar = this.containerEl.createDiv({ cls: "graphway-toolbar" });
    const brand = toolbar.createDiv({ cls: "graphway-brand" });
    brand.createSpan({ text: "\u26A1 GraphWay", cls: "graphway-title" });
    const actions = toolbar.createDiv({ cls: "graphway-actions" });
    const btnGenerate = actions.createEl("button", {
      cls: "graphway-btn graphway-btn-primary",
      text: "\u26A1 Generate All Vault"
    });
    btnGenerate.onclick = async () => {
      btnGenerate.disabled = true;
      btnGenerate.setText("\u23F3 Generating...");
      await this.synchronizer.generateAll(true);
      btnGenerate.disabled = false;
      btnGenerate.setText("\u26A1 Generate All Vault");
      this.render();
    };
    const btnLayout = actions.createEl("button", {
      cls: "graphway-btn",
      text: "\u{1F4D0} Auto-Layout"
    });
    btnLayout.onclick = () => {
      this.autoLayoutNodes();
    };
    const btnResetView = actions.createEl("button", {
      cls: "graphway-btn",
      text: "\u{1F3AF} Center View"
    });
    btnResetView.onclick = () => {
      this.panX = 80;
      this.panY = 80;
      this.zoom = 1;
      this.updateTransform();
    };
    const searchWrapper = toolbar.createDiv({ cls: "graphway-search-wrap" });
    this.searchInput = searchWrapper.createEl("input", {
      cls: "graphway-search-input",
      type: "text",
      placeholder: "\u{1F50D} Filter folders..."
    });
    this.searchInput.oninput = () => {
      this.filterText = this.searchInput.value.toLowerCase().trim();
      this.render();
    };
    const viewport = this.containerEl.createDiv({ cls: "graphway-viewport" });
    this.selectionBoxEl = viewport.createDiv({ cls: "graphway-selection-box" });
    this.selectionBoxEl.style.display = "none";
    this.canvasWrapper = viewport.createDiv({ cls: "graphway-canvas-content" });
    this.svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgLayer.classList.add("graphway-svg-layer");
    this.canvasWrapper.appendChild(this.svgLayer);
    this.tempPathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.tempPathEl.classList.add("graphway-wire-temp");
    this.tempPathEl.style.display = "none";
    this.svgLayer.appendChild(this.tempPathEl);
    this.nodesContainer = this.canvasWrapper.createDiv({ cls: "graphway-nodes-layer" });
    this.updateTransform();
  }
  updateTransform() {
    const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.canvasWrapper.style.transform = transform;
  }
  updateSelectionStyles() {
    const allNodeEls = this.nodesContainer.querySelectorAll(".graphway-node-card");
    allNodeEls.forEach((el) => {
      const folderPath = el.getAttribute("data-folder");
      if (folderPath && this.selectedNodeIds.has(folderPath)) {
        el.addClass("graphway-node-selected");
      } else {
        el.removeClass("graphway-node-selected");
      }
    });
  }
  attachEvents() {
    const viewport = this.containerEl.querySelector(".graphway-viewport");
    if (!viewport) return;
    viewport.addEventListener("mousedown", (e) => {
      if (e.target === viewport || e.target === this.canvasWrapper || e.target === this.svgLayer) {
        if (e.shiftKey) {
          this.isBoxSelecting = true;
          const rect = viewport.getBoundingClientRect();
          this.boxSelectStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          this.selectionBoxEl.style.left = `${this.boxSelectStart.x}px`;
          this.selectionBoxEl.style.top = `${this.boxSelectStart.y}px`;
          this.selectionBoxEl.style.width = "0px";
          this.selectionBoxEl.style.height = "0px";
          this.selectionBoxEl.style.display = "block";
        } else {
          this.isPanning = true;
          this.startPanX = e.clientX - this.panX;
          this.startPanY = e.clientY - this.panY;
          viewport.style.cursor = "grabbing";
          if (this.selectedNodeIds.size > 0) {
            this.selectedNodeIds.clear();
            this.updateSelectionStyles();
          }
        }
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.updateTransform();
        return;
      }
      if (this.isBoxSelecting) {
        const rect = viewport.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const left = Math.min(this.boxSelectStart.x, curX);
        const top = Math.min(this.boxSelectStart.y, curY);
        const width = Math.abs(curX - this.boxSelectStart.x);
        const height = Math.abs(curY - this.boxSelectStart.y);
        this.selectionBoxEl.style.left = `${left}px`;
        this.selectionBoxEl.style.top = `${top}px`;
        this.selectionBoxEl.style.width = `${width}px`;
        this.selectionBoxEl.style.height = `${height}px`;
        const boxRect = {
          left,
          top,
          right: left + width,
          bottom: top + height
        };
        const allNodeEls = this.nodesContainer.querySelectorAll(".graphway-node-card");
        allNodeEls.forEach((el) => {
          const folderPath = el.getAttribute("data-folder");
          if (!folderPath) return;
          const nRect = el.getBoundingClientRect();
          const nodeRelative = {
            left: nRect.left - rect.left,
            top: nRect.top - rect.top,
            right: nRect.right - rect.left,
            bottom: nRect.bottom - rect.top
          };
          const intersects = !(boxRect.right < nodeRelative.left || boxRect.left > nodeRelative.right || boxRect.bottom < nodeRelative.top || boxRect.top > nodeRelative.bottom);
          if (intersects) {
            this.selectedNodeIds.add(folderPath);
          }
        });
        this.updateSelectionStyles();
        return;
      }
      if (this.isDraggingNode && this.draggedNodeId) {
        const dx = (e.clientX - this.nodeDragStartX) / this.zoom;
        const dy = (e.clientY - this.nodeDragStartY) / this.zoom;
        for (const [id, initPos] of this.selectedInitialPositions.entries()) {
          const newX = initPos.x + dx;
          const newY = initPos.y + dy;
          this.settings.nodePositions[id] = { x: newX, y: newY };
          const nodeEl = this.nodesContainer.querySelector(
            `[data-folder="${CSS.escape(id)}"]`
          );
          if (nodeEl) {
            nodeEl.style.left = `${newX}px`;
            nodeEl.style.top = `${newY}px`;
          }
        }
        this.renderWires();
        return;
      }
      if (this.isConnecting && this.connectionStart) {
        const rect = this.canvasWrapper.getBoundingClientRect();
        this.tempMousePos = {
          x: (e.clientX - rect.left) / this.zoom,
          y: (e.clientY - rect.top) / this.zoom
        };
        this.updateTempWire();
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        viewport.style.cursor = "default";
      }
      if (this.isBoxSelecting) {
        this.isBoxSelecting = false;
        this.selectionBoxEl.style.display = "none";
      }
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        this.draggedNodeId = null;
        this.selectedInitialPositions.clear();
        this.onSettingsChange();
      }
      if (this.isConnecting) {
        this.isConnecting = false;
        this.connectionStart = null;
        this.tempPathEl.style.display = "none";
      }
    });
    window.addEventListener("keydown", (e) => {
      if (!this.containerEl.isShown()) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        this.selectedNodeIds.clear();
        for (const [folderPath] of this.hierarchy.entries()) {
          if (folderPath !== "/" || this.settings.homepageNotePath) {
            this.selectedNodeIds.add(folderPath);
          }
        }
        this.updateSelectionStyles();
      } else if (e.key === "Escape") {
        if (this.selectedNodeIds.size > 0) {
          this.selectedNodeIds.clear();
          this.updateSelectionStyles();
        }
      }
    });
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(0.2, this.zoom * zoomFactor), 2.5);
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * newZoom / this.zoom;
      this.panY = mouseY - (mouseY - this.panY) * newZoom / this.zoom;
      this.zoom = newZoom;
      this.updateTransform();
    }, { passive: false });
  }
  /**
   * Auto-Layout arranges folder nodes into neat left-to-right hierarchy columns
   */
  autoLayoutNodes() {
    if (this.hierarchy.size === 0) return;
    const columnXSpacing = 380;
    const rowYSpacing = 30;
    const hasHomepage = Boolean(this.settings.homepageNotePath);
    const depthMap = /* @__PURE__ */ new Map();
    for (const [, node] of this.hierarchy.entries()) {
      if (node.folderPath === "/" && !hasHomepage) continue;
      const depth = node.depth;
      if (!depthMap.has(depth)) depthMap.set(depth, []);
      depthMap.get(depth).push(node);
    }
    if (depthMap.size === 0) return;
    const minDepth = Math.min(...Array.from(depthMap.keys()));
    const sortedDepths = Array.from(depthMap.keys()).sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      const nodes = depthMap.get(depth) || [];
      const colX = (depth - minDepth) * columnXSpacing + 40;
      let currentY = 40;
      for (const node of nodes) {
        this.settings.nodePositions[node.folderPath] = { x: colX, y: currentY };
        const unindexedCount = (node.unindexedTrees || []).reduce(
          (acc, t) => acc + t.files.length + 1,
          0
        );
        const estimatedHeight = 140 + (node.directFiles.length + unindexedCount) * 28;
        currentY += estimatedHeight + rowYSpacing;
      }
    }
    this.onSettingsChange();
    this.render();
    new import_obsidian7.Notice("GraphWay: Canvas layout re-aligned.");
  }
  /**
   * Render nodes and bezier connection wires
   */
  render() {
    this.nodesContainer.empty();
    if (this.hierarchy.size === 0) {
      const emptyMsg = this.nodesContainer.createDiv({ cls: "graphway-empty-msg" });
      emptyMsg.setText('No folders found or all excluded. Click "Generate All Vault" or check settings.');
      return;
    }
    const hasHomepage = Boolean(this.settings.homepageNotePath);
    for (const [folderPath, node] of this.hierarchy.entries()) {
      if (folderPath === "/" && !hasHomepage) continue;
      if (this.filterText && !node.folderName.toLowerCase().includes(this.filterText)) {
        continue;
      }
      this.renderFolderNode(node);
    }
    window.requestAnimationFrame(() => {
      this.renderWires();
    });
  }
  renderFolderNode(node) {
    const isHomepage = node.folderPath === "/" || Boolean(this.settings.homepageNotePath) && node.indexFilePath === this.settings.homepageNotePath;
    const defaultX = node.depth * 360 + 40;
    const pos = this.settings.nodePositions[node.folderPath] || {
      x: defaultX,
      y: 40 + Math.random() * 200
    };
    const isSelected = this.selectedNodeIds.has(node.folderPath);
    const card = this.nodesContainer.createDiv({
      cls: `graphway-node-card ${isHomepage ? "graphway-node-homepage" : ""} ${isSelected ? "graphway-node-selected" : ""}`
    });
    card.setAttribute("data-folder", node.folderPath);
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    if (!isHomepage) {
      const inSocket = card.createDiv({ cls: "graphway-socket graphway-socket-in" });
      inSocket.title = `Input socket: Connect parent folder to ${node.folderName}`;
      inSocket.setAttribute("data-socket-in", node.folderPath);
      inSocket.addEventListener("mouseup", (e) => {
        e.stopPropagation();
        if (this.isConnecting && this.connectionStart) {
          this.completeConnection(this.connectionStart, {
            folderPath: node.folderPath,
            type: "in"
          });
        }
      });
    }
    const header = card.createDiv({ cls: "graphway-node-header" });
    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isMultiKey) {
        if (this.selectedNodeIds.has(node.folderPath)) {
          this.selectedNodeIds.delete(node.folderPath);
        } else {
          this.selectedNodeIds.add(node.folderPath);
        }
      } else {
        if (!this.selectedNodeIds.has(node.folderPath)) {
          this.selectedNodeIds.clear();
          this.selectedNodeIds.add(node.folderPath);
        }
      }
      this.updateSelectionStyles();
      this.isDraggingNode = true;
      this.draggedNodeId = node.folderPath;
      this.nodeDragStartX = e.clientX;
      this.nodeDragStartY = e.clientY;
      this.selectedInitialPositions.clear();
      for (const id of this.selectedNodeIds) {
        const p = this.settings.nodePositions[id] || pos;
        this.selectedInitialPositions.set(id, { ...p });
      }
    });
    const titleGroup = header.createDiv({ cls: "graphway-node-title-group" });
    const titleRow = titleGroup.createDiv({ cls: "graphway-node-title-row" });
    titleRow.createSpan({ text: isHomepage ? "\u{1F3E0} " : "\u{1F4C1} ", cls: "graphway-node-icon" });
    titleRow.createSpan({ text: node.folderName, cls: "graphway-node-title" });
    const indexFileName = node.indexFilePath ? node.indexFilePath.split("/").pop() : null;
    if (indexFileName) {
      const subTitle = titleGroup.createDiv({
        cls: "graphway-node-index-subtitle",
        text: `\u{1F4C4} ${indexFileName}`
      });
      subTitle.title = `Index note: ${node.indexFilePath}
Click to open`;
      subTitle.onclick = (e) => {
        e.stopPropagation();
        const f = this.app.vault.getAbstractFileByPath(node.indexFilePath);
        if (f instanceof import_obsidian7.TFile) this.app.workspace.getLeaf().openFile(f);
      };
    } else {
      const noIndexBtn = titleGroup.createDiv({
        cls: "graphway-node-no-index",
        text: "\u26A0\uFE0F No index (Click to create)"
      });
      noIndexBtn.title = "Click to create folder index note";
      noIndexBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.handleCreateOrOpenIndex(node);
      };
    }
    const isFilesHidden = Boolean(
      this.settings.foldersHidingDirectFiles && this.settings.foldersHidingDirectFiles.includes(node.folderPath)
    );
    const headerActions = header.createDiv({ cls: "graphway-node-header-actions" });
    if (node.hasIndex || node.directFiles.length > 0) {
      const eyeBtn = headerActions.createSpan({
        cls: `graphway-file-toggle ${isFilesHidden ? "graphway-file-toggle-off" : "graphway-file-toggle-on"}`
      });
      eyeBtn.createSpan({ text: isFilesHidden ? "\u{1F6AB}" : "\u{1F441}\uFE0F", cls: "graphway-toggle-icon" });
      eyeBtn.createSpan({ text: "Files", cls: "graphway-toggle-label" });
      eyeBtn.title = isFilesHidden ? `Direct files are HIDDEN in "${node.folderName}" index note.
Click to render files inside index note.` : `Direct files are RENDERED in "${node.folderName}" index note.
Click to hide files from index note.`;
      eyeBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!this.settings.foldersHidingDirectFiles) {
          this.settings.foldersHidingDirectFiles = [];
        }
        if (isFilesHidden) {
          this.settings.foldersHidingDirectFiles = this.settings.foldersHidingDirectFiles.filter(
            (p) => p !== node.folderPath
          );
          new import_obsidian7.Notice(`GraphWay: Now rendering direct files in "${node.folderName}" index note.`);
        } else {
          this.settings.foldersHidingDirectFiles.push(node.folderPath);
          new import_obsidian7.Notice(`GraphWay: Direct files hidden from "${node.folderName}" index note.`);
        }
        await this.onSettingsChange();
        await this.synchronizer.syncExistingIndices();
        this.render();
      };
    }
    const badge = headerActions.createSpan({
      cls: `graphway-badge ${isHomepage ? "graphway-badge-homepage" : node.hasIndex ? "graphway-badge-ok" : "graphway-badge-warn"}`,
      text: isHomepage ? "\u{1F3E0} HOMEPAGE" : node.hasIndex ? "INDEXED" : "NO INDEX"
    });
    badge.title = node.hasIndex ? `Folder Note: ${node.indexFilePath}
Click to open` : "Click to create folder index note";
    badge.onclick = async (e) => {
      e.stopPropagation();
      await this.handleCreateOrOpenIndex(node);
    };
    const body = card.createDiv({ cls: "graphway-node-body" });
    const renderIndexedChildFolders = () => {
      for (const child of node.indexedChildFolders) {
        const itemRow = body.createDiv({ cls: "graphway-item-row graphway-child-folder-row" });
        itemRow.createSpan({ text: "\u{1F4C1}", cls: "graphway-item-icon" });
        const nameSpan = itemRow.createSpan({
          text: child.folderName,
          cls: "graphway-item-name graphway-child-folder-name"
        });
        nameSpan.title = `Child folder: ${child.folderPath}
Click to pan canvas to this folder`;
        nameSpan.onclick = () => {
          this.centerOnFolder(child.folderPath);
        };
        const openBtn = itemRow.createSpan({ text: "\u{1F4C4}", cls: "graphway-mini-open" });
        openBtn.title = `Open index note: ${child.indexFilePath.split("/").pop()}`;
        openBtn.onclick = (e) => {
          e.stopPropagation();
          const f = this.app.vault.getAbstractFileByPath(child.indexFilePath);
          if (f instanceof import_obsidian7.TFile) this.app.workspace.getLeaf().openFile(f);
        };
      }
    };
    const renderUnindexedTrees = () => {
      const renderTreeInCard = (tree, container, indent) => {
        const fRow = container.createDiv({ cls: "graphway-item-row" });
        fRow.style.paddingLeft = `${4 + indent * 10}px`;
        fRow.createSpan({ text: "\u{1F4C1}", cls: "graphway-item-icon" });
        fRow.createSpan({ text: tree.folderName, cls: "graphway-item-name graphway-unindexed-name" });
        for (const filePath of tree.files) {
          const fileName = filePath.split("/").pop()?.replace(/\.md$/, "") || filePath;
          const itemRow = container.createDiv({ cls: "graphway-item-row" });
          itemRow.setAttribute("data-filepath", filePath);
          itemRow.style.paddingLeft = `${14 + indent * 10}px`;
          itemRow.createSpan({ text: "\u21B3 \u{1F4C4}", cls: "graphway-item-icon" });
          const nameSpan = itemRow.createSpan({ text: fileName, cls: "graphway-item-name" });
          nameSpan.onclick = () => {
            const f = this.app.vault.getAbstractFileByPath(filePath);
            if (f instanceof import_obsidian7.TFile) this.app.workspace.getLeaf().openFile(f);
          };
          const fileInSocket = itemRow.createDiv({ cls: "graphway-socket graphway-socket-item-in" });
          fileInSocket.title = "Input socket: Connect any folder to this file to render that folder inside this note";
          fileInSocket.setAttribute("data-socket-file-in", filePath);
          fileInSocket.addEventListener("mouseup", (e) => {
            e.stopPropagation();
            if (this.isConnecting && this.connectionStart) {
              this.completeConnection(this.connectionStart, {
                folderPath: node.folderPath,
                filePath,
                type: "in"
              });
            }
          });
          fileInSocket.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            this.startWiring(node.folderPath, filePath, "in", fileInSocket);
          });
        }
        for (const sub of tree.childTrees) {
          renderTreeInCard(sub, container, indent + 1);
        }
      };
      for (const tree of node.unindexedTrees) {
        renderTreeInCard(tree, body, 0);
      }
    };
    const renderDirectFiles = () => {
      if (isFilesHidden) {
        if (node.directFiles.length > 0) {
          const itemRow = body.createDiv({ cls: "graphway-item-row graphway-files-hidden-row" });
          itemRow.createSpan({ text: "\u{1F6AB}", cls: "graphway-item-icon" });
          const nameSpan = itemRow.createSpan({
            text: `${node.directFiles.length} direct file(s) hidden from index`,
            cls: "graphway-item-name graphway-files-hidden-label"
          });
          nameSpan.title = "Click to show direct files in index note";
          nameSpan.onclick = async () => {
            this.settings.foldersHidingDirectFiles = (this.settings.foldersHidingDirectFiles || []).filter(
              (p) => p !== node.folderPath
            );
            await this.onSettingsChange();
            new import_obsidian7.Notice(`GraphWay: Now rendering direct files in "${node.folderName}" index note.`);
            await this.synchronizer.syncExistingIndices();
            this.render();
          };
        }
        return;
      }
      for (const filePath of node.directFiles) {
        const fileName = filePath.split("/").pop()?.replace(/\.md$/, "") || filePath;
        const itemRow = body.createDiv({ cls: "graphway-item-row" });
        itemRow.setAttribute("data-filepath", filePath);
        itemRow.createSpan({ text: "\u{1F4C4}", cls: "graphway-item-icon" });
        const nameSpan = itemRow.createSpan({ text: fileName, cls: "graphway-item-name" });
        nameSpan.onclick = () => {
          const f = this.app.vault.getAbstractFileByPath(filePath);
          if (f instanceof import_obsidian7.TFile) this.app.workspace.getLeaf().openFile(f);
        };
        const fileInSocket = itemRow.createDiv({ cls: "graphway-socket graphway-socket-item-in" });
        fileInSocket.title = "Input socket: Connect any folder to this file to render that folder inside this note";
        fileInSocket.setAttribute("data-socket-file-in", filePath);
        fileInSocket.addEventListener("mouseup", (e) => {
          e.stopPropagation();
          if (this.isConnecting && this.connectionStart) {
            this.completeConnection(this.connectionStart, {
              folderPath: node.folderPath,
              filePath,
              type: "in"
            });
          }
        });
        fileInSocket.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          this.startWiring(node.folderPath, filePath, "in", fileInSocket);
        });
      }
    };
    if (this.settings.sortOrder === "folders-first") {
      renderIndexedChildFolders();
      renderUnindexedTrees();
      renderDirectFiles();
    } else if (this.settings.sortOrder === "files-first") {
      renderDirectFiles();
      renderIndexedChildFolders();
      renderUnindexedTrees();
    } else {
      renderIndexedChildFolders();
      renderUnindexedTrees();
      renderDirectFiles();
    }
    const hasAnyContent = node.indexedChildFolders.length > 0 || node.unindexedTrees.length > 0 || node.directFiles.length > 0;
    if (!hasAnyContent) {
      body.createDiv({ cls: "graphway-empty-note", text: "*(No child notes or folders)*" });
    }
    const outSocket = card.createDiv({ cls: "graphway-socket graphway-socket-out" });
    outSocket.title = `Output socket: Drag wire to connect child folders to ${node.folderName}`;
    outSocket.setAttribute("data-socket-out", node.folderPath);
    outSocket.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.startWiring(node.folderPath, void 0, "out", outSocket);
    });
  }
  startWiring(folderPath, filePath, type, socketEl) {
    const rect = socketEl.getBoundingClientRect();
    const canvasRect = this.canvasWrapper.getBoundingClientRect();
    this.isConnecting = true;
    this.connectionStart = {
      nodeId: folderPath,
      folderPath,
      filePath,
      type,
      x: (rect.left + rect.width / 2 - canvasRect.left) / this.zoom,
      y: (rect.top + rect.height / 2 - canvasRect.top) / this.zoom
    };
    this.tempMousePos = { ...this.connectionStart };
    this.tempPathEl.style.display = "block";
  }
  updateTempWire() {
    if (!this.connectionStart) return;
    const p1 = this.connectionStart;
    const p2 = this.tempMousePos;
    const d = this.calculateCubicBezier(p1.x, p1.y, p2.x, p2.y);
    this.tempPathEl.setAttribute("d", d);
  }
  async completeConnection(source, target) {
    const isFolderToFile = !source.filePath && target.filePath || source.filePath && !target.filePath;
    if (isFolderToFile) {
      const folderPath = source.filePath ? target.folderPath : source.folderPath;
      const filePath = source.filePath || target.filePath;
      if (!this.settings.folderToFileConnections) {
        this.settings.folderToFileConnections = [];
      }
      if (!this.settings.folderToFileConnections.some((c) => c.folderPath === folderPath && c.filePath === filePath)) {
        this.settings.folderToFileConnections.push({ folderPath, filePath });
      }
      await this.onSettingsChange();
      const fileName = filePath.split("/").pop() || filePath;
      const folderNode = this.hierarchy.get(folderPath);
      new import_obsidian7.Notice(`GraphWay: Connected folder "${folderNode?.folderName || folderPath}" to "${fileName}". Note will render this folder!`);
      await this.synchronizer.syncExistingIndices();
      this.render();
      return;
    }
    const parentPath = source.folderPath;
    const childPath = target.folderPath;
    if (parentPath === childPath) {
      new import_obsidian7.Notice("GraphWay: Cannot connect a folder to itself.");
      return;
    }
    const edgeKey = `${parentPath}->${childPath}`;
    if (this.settings.disconnectedEdges) {
      this.settings.disconnectedEdges = this.settings.disconnectedEdges.filter((k) => k !== edgeKey);
    }
    if (!this.settings.customFolderEdges) {
      this.settings.customFolderEdges = [];
    }
    if (!this.settings.customFolderEdges.some((e) => e.from === parentPath && e.to === childPath)) {
      this.settings.customFolderEdges.push({ from: parentPath, to: childPath });
    }
    await this.onSettingsChange();
    new import_obsidian7.Notice(`GraphWay: Connected "${parentPath}" \u2192 "${childPath}"`);
    await this.synchronizer.syncExistingIndices();
    this.render();
  }
  /**
   * Renders the glowing cubic bezier wires between connected nodes
   */
  renderWires() {
    while (this.svgLayer.childNodes.length > 1) {
      if (this.svgLayer.firstChild !== this.tempPathEl) {
        this.svgLayer.removeChild(this.svgLayer.firstChild);
      } else if (this.svgLayer.lastChild !== this.tempPathEl) {
        this.svgLayer.removeChild(this.svgLayer.lastChild);
      } else {
        break;
      }
    }
    const canvasRect = this.canvasWrapper.getBoundingClientRect();
    for (const [folderPath, node] of this.hierarchy.entries()) {
      const parentOutSocket = this.nodesContainer.querySelector(
        `[data-folder="${CSS.escape(folderPath)}"] .graphway-socket-out`
      );
      if (!parentOutSocket) continue;
      const pRect = parentOutSocket.getBoundingClientRect();
      const x1 = (pRect.left + pRect.width / 2 - canvasRect.left) / this.zoom;
      const y1 = (pRect.top + pRect.height / 2 - canvasRect.top) / this.zoom;
      for (const childPath of node.allConnectedChildPaths) {
        const childInSocket = this.nodesContainer.querySelector(
          `[data-folder="${CSS.escape(childPath)}"] .graphway-socket-in`
        );
        if (!childInSocket) continue;
        const cRect = childInSocket.getBoundingClientRect();
        const x2 = (cRect.left + cRect.width / 2 - canvasRect.left) / this.zoom;
        const y2 = (cRect.top + cRect.height / 2 - canvasRect.top) / this.zoom;
        const childNode = this.hierarchy.get(childPath);
        const isChildIndexed = childNode ? childNode.hasIndex : false;
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.classList.add(
          "graphway-wire",
          isChildIndexed ? "graphway-wire-indexed" : "graphway-wire-unindexed"
        );
        pathEl.setAttribute("d", this.calculateCubicBezier(x1, y1, x2, y2));
        const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
        titleEl.textContent = `Connected: ${node.folderName} \u2192 ${childNode?.folderName || childPath} (${isChildIndexed ? "Indexed" : "Unindexed Bubble"})
Click wire to disconnect`;
        pathEl.appendChild(titleEl);
        pathEl.onclick = async (e) => {
          e.stopPropagation();
          const edgeKey = `${folderPath}->${childPath}`;
          if (!this.settings.disconnectedEdges) {
            this.settings.disconnectedEdges = [];
          }
          if (!this.settings.disconnectedEdges.includes(edgeKey)) {
            this.settings.disconnectedEdges.push(edgeKey);
          }
          if (this.settings.customFolderEdges) {
            this.settings.customFolderEdges = this.settings.customFolderEdges.filter(
              (ed) => !(ed.from === folderPath && ed.to === childPath)
            );
          }
          await this.onSettingsChange();
          new import_obsidian7.Notice(
            `GraphWay: Disconnected "${childNode?.folderName || childPath}" from "${node.folderName}"`
          );
          await this.synchronizer.syncExistingIndices();
          this.render();
        };
        this.svgLayer.appendChild(pathEl);
      }
    }
    if (this.settings.folderToFileConnections) {
      for (const conn of this.settings.folderToFileConnections) {
        const folderOutSocket = this.nodesContainer.querySelector(
          `[data-folder="${CSS.escape(conn.folderPath)}"] .graphway-socket-out`
        );
        const fileInSocket = this.nodesContainer.querySelector(
          `[data-socket-file-in="${CSS.escape(conn.filePath)}"]`
        );
        if (folderOutSocket && fileInSocket) {
          const foRect = folderOutSocket.getBoundingClientRect();
          const fiRect = fileInSocket.getBoundingClientRect();
          const x1 = (foRect.left + foRect.width / 2 - canvasRect.left) / this.zoom;
          const y1 = (foRect.top + foRect.height / 2 - canvasRect.top) / this.zoom;
          const x2 = (fiRect.left + fiRect.width / 2 - canvasRect.left) / this.zoom;
          const y2 = (fiRect.top + fiRect.height / 2 - canvasRect.top) / this.zoom;
          const folderNode = this.hierarchy.get(conn.folderPath);
          const fileName = conn.filePath.split("/").pop() || conn.filePath;
          const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
          pathEl.classList.add("graphway-wire", "graphway-wire-folder-to-file");
          pathEl.setAttribute("d", this.calculateCubicBezier(x1, y1, x2, y2));
          const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
          titleEl.textContent = `Folder "${folderNode?.folderName || conn.folderPath}" renders inside note "${fileName}"
Click wire to disconnect`;
          pathEl.appendChild(titleEl);
          pathEl.onclick = async (e) => {
            e.stopPropagation();
            this.settings.folderToFileConnections = this.settings.folderToFileConnections.filter(
              (c) => !(c.folderPath === conn.folderPath && c.filePath === conn.filePath)
            );
            await this.onSettingsChange();
            new import_obsidian7.Notice(
              `GraphWay: Disconnected folder "${folderNode?.folderName || conn.folderPath}" from note "${fileName}"`
            );
            await this.synchronizer.syncExistingIndices();
            this.render();
          };
          this.svgLayer.appendChild(pathEl);
        }
      }
    }
    for (const [filePath, targetFolder] of Object.entries(this.settings.customLinkOverrides)) {
      const targetInSocket = this.nodesContainer.querySelector(
        `[data-folder="${CSS.escape(targetFolder)}"] .graphway-socket-in`
      );
      if (!targetInSocket) continue;
      const tRect = targetInSocket.getBoundingClientRect();
      const x2 = (tRect.left + tRect.width / 2 - canvasRect.left) / this.zoom;
      const y2 = (tRect.top + tRect.height / 2 - canvasRect.top) / this.zoom;
      const fileRow = this.nodesContainer.querySelector(`[data-filepath="${CSS.escape(filePath)}"]`);
      if (fileRow) {
        const fRect = fileRow.getBoundingClientRect();
        const x1 = (fRect.right - canvasRect.left) / this.zoom;
        const y1 = (fRect.top + fRect.height / 2 - canvasRect.top) / this.zoom;
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.classList.add("graphway-wire", "graphway-wire-custom");
        pathEl.setAttribute("d", this.calculateCubicBezier(x1, y1, x2, y2));
        const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
        titleEl.textContent = "Custom Link Override (Click to remove)";
        pathEl.appendChild(titleEl);
        pathEl.onclick = () => {
          delete this.settings.customLinkOverrides[filePath];
          this.onSettingsChange();
          this.synchronizer.triggerDebouncedSync();
          this.render();
        };
        this.svgLayer.appendChild(pathEl);
      }
    }
  }
  /**
   * Generates a sleek cubic Bezier curve matching Blender/ComfyUI cables
   */
  calculateCubicBezier(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const offset = Math.max(dx * 0.5, 40);
    const cx1 = x1 + offset;
    const cy1 = y1;
    const cx2 = x2 - offset;
    const cy2 = y2;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  }
  /**
   * Centers the viewport view on a specific folder node
   */
  centerOnFolder(folderPath) {
    const pos = this.settings.nodePositions[folderPath];
    if (pos) {
      const viewport = this.containerEl.querySelector(".graphway-viewport");
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        this.panX = rect.width / 2 - pos.x * this.zoom - 140 * this.zoom;
        this.panY = rect.height / 2 - pos.y * this.zoom - 60 * this.zoom;
        this.updateTransform();
      }
    }
  }
  /**
   * Opens the index note if it exists, or creates it if missing
   */
  async handleCreateOrOpenIndex(node) {
    if (node.hasIndex && node.indexFilePath) {
      const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
      if (file instanceof import_obsidian7.TFile) {
        this.app.workspace.getLeaf().openFile(file);
      }
      return;
    }
    let folder = null;
    if (node.folderPath === "/" || node.folderPath === "") {
      folder = this.app.vault.getRoot();
    } else {
      const abstractFolder = this.app.vault.getAbstractFileByPath(node.folderPath);
      if (abstractFolder instanceof import_obsidian7.TFolder) {
        folder = abstractFolder;
      }
    }
    if (folder) {
      const newFile = await this.synchronizer.createFolderNoteForFolder(folder);
      if (newFile) {
        if ((node.folderPath === "/" || node.folderPath === "") && !this.settings.homepageNotePath) {
          this.settings.homepageNotePath = newFile.path;
          await this.onSettingsChange();
        }
        const hierarchy = this.synchronizer.getHierarchyBuilder().buildVaultHierarchy();
        this.updateData(hierarchy);
        this.app.workspace.getLeaf().openFile(newFile);
      }
    }
  }
};

// src/canvas-ui/GraphWayView.ts
var GRAPHWAY_VIEW_TYPE = "graphway-canvas-view";
var GraphWayView = class extends import_obsidian8.ItemView {
  constructor(leaf, synchronizer, hierarchyBuilder, settings, onSettingsChange) {
    super(leaf);
    this.renderer = null;
    this.hierarchyCallback = null;
    this.synchronizer = synchronizer;
    this.hierarchyBuilder = hierarchyBuilder;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
  }
  getViewType() {
    return GRAPHWAY_VIEW_TYPE;
  }
  getDisplayText() {
    return "GraphWay Canvas";
  }
  getIcon() {
    return "network";
  }
  async onOpen() {
    const container = this.contentEl;
    container.empty();
    this.renderer = new CanvasRenderer(
      container,
      this.app,
      this.settings,
      this.synchronizer,
      this.onSettingsChange
    );
    const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
    this.renderer.updateData(hierarchy);
    this.hierarchyCallback = (updatedHierarchy) => {
      if (this.renderer) {
        this.renderer.updateData(updatedHierarchy);
      }
    };
    this.synchronizer.registerHierarchyCallback(this.hierarchyCallback);
  }
  async onClose() {
    if (this.hierarchyCallback) {
      this.synchronizer.unregisterHierarchyCallback(this.hierarchyCallback);
      this.hierarchyCallback = null;
    }
    this.renderer = null;
  }
};

// src/main.ts
var GraphWayPlugin = class extends import_obsidian9.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.resolver = new FolderResolver(this.settings);
    this.hierarchyBuilder = new HierarchyBuilder(this.app, this.resolver, this.settings);
    this.generator = new MarkdownGenerator(this.app, this.settings);
    this.synchronizer = new VaultSynchronizer(
      this.app,
      this.settings,
      this.resolver,
      this.hierarchyBuilder,
      this.generator
    );
    this.registerView(
      GRAPHWAY_VIEW_TYPE,
      (leaf) => new GraphWayView(
        leaf,
        this.synchronizer,
        this.hierarchyBuilder,
        this.settings,
        () => this.saveSettings()
      )
    );
    this.addRibbonIcon("network", "Open GraphWay Canvas", () => {
      this.activateView();
    });
    this.addCommand({
      id: "graphway-open-canvas",
      name: "Open GraphWay Canvas Manager",
      callback: () => {
        this.activateView();
      }
    });
    this.addCommand({
      id: "graphway-generate-all",
      name: "Generate All Vault Folder Notes (MOCs)",
      callback: async () => {
        await this.synchronizer.generateAll(true);
      }
    });
    this.addCommand({
      id: "graphway-update-current",
      name: "Update GraphWay Block for Current Note Folder",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.parent) {
          if (!checking) {
            this.synchronizer.updateFolder(activeFile.parent, true);
          }
          return true;
        }
        return false;
      }
    });
    this.addCommand({
      id: "graphway-create-current",
      name: "Create Missing Folder Note for Active Folder",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.parent) {
          const parentFolder = activeFile.parent;
          const existing = this.resolver.findFolderNote(parentFolder);
          if (!existing) {
            if (!checking) {
              this.synchronizer.createFolderNoteForFolder(parentFolder);
            }
            return true;
          }
        }
        return false;
      }
    });
    this.addSettingTab(new GraphWaySettingsTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian9.TFile && file.extension === "md") {
          this.synchronizer.triggerDebouncedSync();
        } else if (file instanceof import_obsidian9.TFolder) {
          this.synchronizer.triggerDebouncedSync();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", () => {
        this.synchronizer.triggerDebouncedSync();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", () => {
        this.synchronizer.triggerDebouncedSync();
      })
    );
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(GRAPHWAY_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.synchronizer) {
      this.synchronizer.updateSettings(this.settings);
    }
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = null;
    const leaves = workspace.getLeavesOfType(GRAPHWAY_VIEW_TYPE);
    if (leaves.length > 0) {
      const existing = leaves[0];
      if (existing.getRoot() !== workspace.rootSplit) {
        existing.detach();
      } else {
        leaf = existing;
      }
    }
    if (!leaf) {
      const activeLeaf = workspace.getMostRecentLeaf();
      if (activeLeaf && activeLeaf.getViewState().type === "empty") {
        leaf = activeLeaf;
      } else {
        leaf = workspace.getLeaf("tab");
      }
      if (leaf) {
        await leaf.setViewState({
          type: GRAPHWAY_VIEW_TYPE,
          active: true
        });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      workspace.setActiveLeaf(leaf, { focus: true });
    }
  }
};

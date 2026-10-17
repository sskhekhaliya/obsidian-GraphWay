import { App, TFile } from 'obsidian';
import { GraphWaySettings, FolderHierarchyNode, UnindexedFolderTree } from '../types';

export class MarkdownGenerator {
  private app: App;
  private settings: GraphWaySettings;

  constructor(app: App, settings: GraphWaySettings) {
    this.app = app;
    this.settings = settings;
  }

  public updateSettings(settings: GraphWaySettings): void {
    this.settings = settings;
  }

  /**
   * Recursively renders an unindexed folder tree with markdown hierarchy
   */
  private renderUnindexedTree(
    tree: UnindexedFolderTree,
    indentLevel: number,
    originFolderPath: string
  ): string[] {
    const indent = '  '.repeat(indentLevel);
    const childIndent = '  '.repeat(indentLevel + 1);
    const lines: string[] = [];

    // Header bullet for the folder
    lines.push(`${indent}- 📁 ${tree.folderName}`);

    // Direct files indented under this folder
    for (const filePath of tree.files) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const link = this.app.fileManager.generateMarkdownLink(file, originFolderPath);
        lines.push(`${childIndent}- 📄 ${link}`);
      }
    }

    // Subtrees nested further
    for (const subTree of tree.childTrees) {
      lines.push(...this.renderUnindexedTree(subTree, indentLevel + 1, originFolderPath));
    }

    return lines;
  }

  /**
   * Generates the inner markdown content for a folder's GraphWay block
   */
  public generateBlockContent(node: FolderHierarchyNode): string {
    const lines: string[] = [];

    // 1. Gather all connected indexed child folder links
    const folderLinks: { name: string; link: string }[] = [];
    for (const child of node.indexedChildFolders) {
      const childFile = this.app.vault.getAbstractFileByPath(child.indexFilePath);
      if (childFile instanceof TFile) {
        const link = this.app.fileManager.generateMarkdownLink(childFile, node.folderPath, '', child.folderName);
        folderLinks.push({ name: child.folderName, link });
      }
    }

    // 2. Gather direct file links (unless direct files are hidden for this folder's index note)
    const fileLinks: { name: string; link: string }[] = [];
    const isFilesHidden =
      this.settings.foldersHidingDirectFiles &&
      this.settings.foldersHidingDirectFiles.includes(node.folderPath);

    if (!isFilesHidden) {
      for (const filePath of node.directFiles) {
        // Check if this file has a custom override pointing to another folder
        const overrideTarget = this.settings.customLinkOverrides[filePath];
        if (overrideTarget && overrideTarget !== node.folderPath) {
          continue; // routed elsewhere
        }

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
          fileLinks.push({ name: file.basename, link });
        }
      }

      // Check if any external files have a custom override pointing to THIS folder
      for (const [filePath, targetFolder] of Object.entries(this.settings.customLinkOverrides)) {
        if (targetFolder === node.folderPath && !node.directFiles.includes(filePath)) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
            const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
            fileLinks.push({ name: file.basename, link });
          }
        }
      }
    }

    // 3. Render connected unindexed subfolders hierarchically
    const unindexedLines: string[] = [];
    if (this.settings.bubbleUpOrphans && node.unindexedTrees) {
      for (const tree of node.unindexedTrees) {
        unindexedLines.push(...this.renderUnindexedTree(tree, 0, node.folderPath));
      }
    }

    // Sort direct folders and direct files
    folderLinks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    fileLinks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    // Assemble the list according to sortOrder
    if (this.settings.sortOrder === 'folders-first') {
      for (const f of folderLinks) lines.push(`- 📁 ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
      for (const f of fileLinks) lines.push(`- 📄 ${f.link}`);
    } else if (this.settings.sortOrder === 'files-first') {
      for (const f of fileLinks) lines.push(`- 📄 ${f.link}`);
      for (const f of folderLinks) lines.push(`- 📁 ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
    } else {
      // Alphabetical combined
      const combined: { name: string; line: string }[] = [
        ...folderLinks.map(f => ({ name: f.name, line: `- 📁 ${f.link}` })),
        ...fileLinks.map(f => ({ name: f.name, line: `- 📄 ${f.link}` }))
      ];
      combined.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const item of combined) lines.push(item.line);
      for (const u of unindexedLines) lines.push(u);
    }

    if (lines.length === 0) {
      return '';
    }

    return lines.join('\n');
  }

  /**
   * Cleanly removes the GraphWay block from a file if present.
   */
  public async removeBlockFromFile(file: TFile): Promise<boolean> {
    const currentContent = await this.app.vault.read(file);
    const beginMarker = this.settings.beginMarker;
    const endMarker = this.settings.endMarker;

    const startIndex = currentContent.indexOf(beginMarker);
    const endIndex = currentContent.indexOf(endMarker);

    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      const before = currentContent.substring(0, startIndex);
      const after = currentContent.substring(endIndex + endMarker.length);

      const trimmedBefore = before.replace(/\r?\n\s*$/, '');
      const trimmedAfter = after.replace(/^\s*\r?\n/, '');

      let updatedContent = '';
      if (trimmedBefore.length > 0 && trimmedAfter.length > 0) {
        updatedContent = `${trimmedBefore}\n\n${trimmedAfter}`;
      } else if (trimmedBefore.length > 0) {
        updatedContent = `${trimmedBefore}\n`;
      } else if (trimmedAfter.length > 0) {
        updatedContent = `${trimmedAfter}`;
      }

      if (updatedContent !== currentContent) {
        await this.app.vault.modify(file, updatedContent);
        return true;
      }
    }
    return false;
  }

  /**
   * Updates an existing note file with the new GraphWay block.
   * If there is no content to render (empty block), any existing block is removed completely.
   * If the block already exists, only the text between Begin and End markers is updated.
   * If not, the block is appended or inserted cleanly.
   */
  public async updateFileContent(file: TFile, node: FolderHierarchyNode): Promise<boolean> {
    const newBlockContent = this.generateBlockContent(node);

    // If there is nothing to render, do NOT write an empty block or placeholder!
    // Instead, remove any existing block so nothing is shown.
    if (newBlockContent.trim().length === 0) {
      return await this.removeBlockFromFile(file);
    }

    const currentContent = await this.app.vault.read(file);
    const beginMarker = this.settings.beginMarker;
    const endMarker = this.settings.endMarker;
    const fullBlock = `${beginMarker}\n${newBlockContent}\n${endMarker}`;

    const startIndex = currentContent.indexOf(beginMarker);
    const endIndex = currentContent.indexOf(endMarker);

    let updatedContent: string;

    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      // Replace existing block
      const before = currentContent.substring(0, startIndex);
      const after = currentContent.substring(endIndex + endMarker.length);
      updatedContent = `${before}${fullBlock}${after}`;
    } else {
      // Block does not exist; insert after frontmatter or at the top
      const fmMatch = currentContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      if (fmMatch) {
        const fmEnd = fmMatch[0].length;
        const frontmatter = currentContent.substring(0, fmEnd);
        const rest = currentContent.substring(fmEnd);
        updatedContent = `${frontmatter}\n${fullBlock}\n\n${rest.trimStart()}`;
      } else {
        // Prepend or append depending on content
        if (currentContent.trim().length > 0) {
          updatedContent = `${fullBlock}\n\n${currentContent}`;
        } else {
          updatedContent = `${fullBlock}\n`;
        }
      }
    }

    if (updatedContent !== currentContent) {
      await this.app.vault.modify(file, updatedContent);
      return true;
    }

    return false;
  }
}

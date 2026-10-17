import { App, TFile } from 'obsidian';
import { GraphWaySettings, FolderHierarchyNode, UnindexedFolderTree } from '../types';

export interface GraphWayItem {
  kind: 'folder' | 'file';
  name: string;
  link: string;
  targetPath: string;
  type: string;
  modified: string;
  size: string;
  folderContext?: string;
}

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

  private formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private formatDate(mtime: number): string {
    if (!mtime) return '—';
    const d = new Date(mtime);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private collectUnindexedItems(
    tree: UnindexedFolderTree,
    originFolderPath: string
  ): GraphWayItem[] {
    const items: GraphWayItem[] = [];

    for (const filePath of tree.files) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        items.push({
          kind: 'file',
          name: file.basename,
          link: this.app.fileManager.generateMarkdownLink(file, originFolderPath),
          targetPath: file.path,
          type: 'Note',
          modified: this.formatDate(file.stat.mtime),
          size: this.formatFileSize(file.stat.size),
          folderContext: tree.folderName
        });
      }
    }

    for (const sub of tree.childTrees) {
      items.push(...this.collectUnindexedItems(sub, originFolderPath));
    }

    return items;
  }

  /**
   * Generates the inner markdown content for a folder's GraphWay block
   */
  public generateBlockContent(node: FolderHierarchyNode): string {
    // 1. Gather all connected indexed child folder items
    const folderItems: GraphWayItem[] = [];

    for (const child of node.indexedChildFolders) {
      const childFile = this.app.vault.getAbstractFileByPath(child.indexFilePath);
      if (childFile instanceof TFile) {
        const link = this.app.fileManager.generateMarkdownLink(childFile, node.folderPath, '', child.folderName);
        folderItems.push({
          kind: 'folder',
          name: child.folderName,
          link,
          targetPath: childFile.path,
          type: 'Folder',
          modified: this.formatDate(childFile.stat.mtime),
          size: '—'
        });
      }
    }

    // 2. Gather direct file items (unless direct files are hidden for this folder's index note)
    const fileItems: GraphWayItem[] = [];

    const isFilesHidden =
      this.settings.foldersHidingDirectFiles &&
      this.settings.foldersHidingDirectFiles.includes(node.folderPath);

    if (!isFilesHidden) {
      for (const filePath of node.directFiles) {
        const overrideTarget = this.settings.customLinkOverrides[filePath];
        if (overrideTarget && overrideTarget !== node.folderPath) {
          continue; // routed elsewhere
        }

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
          fileItems.push({
            kind: 'file',
            name: file.basename,
            link,
            targetPath: file.path,
            type: file.extension.toUpperCase() === 'MD' ? 'Note' : file.extension.toUpperCase(),
            modified: this.formatDate(file.stat.mtime),
            size: this.formatFileSize(file.stat.size)
          });
        }
      }

      // External files with custom override to this folder
      for (const [filePath, targetFolder] of Object.entries(this.settings.customLinkOverrides)) {
        if (targetFolder === node.folderPath && !node.directFiles.includes(filePath)) {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file instanceof TFile) {
            const link = this.app.fileManager.generateMarkdownLink(file, node.folderPath);
            fileItems.push({
              kind: 'file',
              name: file.basename,
              link,
              targetPath: file.path,
              type: file.extension.toUpperCase() === 'MD' ? 'Note' : file.extension.toUpperCase(),
              modified: this.formatDate(file.stat.mtime),
              size: this.formatFileSize(file.stat.size)
            });
          }
        }
      }
    }

    // 3. Unindexed subfolder items
    const unindexedItems: GraphWayItem[] = [];

    if (this.settings.bubbleUpOrphans && node.unindexedTrees) {
      for (const tree of node.unindexedTrees) {
        unindexedItems.push(...this.collectUnindexedItems(tree, node.folderPath));
      }
    }

    if (folderItems.length === 0 && fileItems.length === 0 && unindexedItems.length === 0) {
      return '';
    }

    // Sort items
    folderItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    fileItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    unindexedItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    let sortedAllItems: GraphWayItem[] = [];
    if (this.settings.sortOrder === 'folders-first') {
      sortedAllItems = [...folderItems, ...fileItems, ...unindexedItems];
    } else if (this.settings.sortOrder === 'files-first') {
      sortedAllItems = [...fileItems, ...unindexedItems, ...folderItems];
    } else {
      sortedAllItems = [...folderItems, ...fileItems, ...unindexedItems];
      sortedAllItems.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    const layout = this.settings.renderViewLayout || 'list';

    if (layout === 'details') {
      return this.renderDetailsLayout(sortedAllItems);
    } else if (layout === 'inline') {
      return this.renderInlineLayout(sortedAllItems);
    } else if (layout === 'cards' || (layout as string) === 'tiles') {
      return this.renderCardsLayout(sortedAllItems);
    } else if (layout === 'chips') {
      return this.renderChipsLayout(sortedAllItems);
    } else if (layout === 'content') {
      return this.renderContentLayout(sortedAllItems);
    } else {
      // Default: 'list'
      return this.renderListLayout(node, folderItems, fileItems);
    }
  }

  private renderInlineLayout(items: GraphWayItem[]): string {
    return items
      .map(item => {
        const icon = item.kind === 'folder' ? '📁' : '📄';
        return `${icon} ${item.link}`;
      })
      .join('  •  ');
  }

  private renderListLayout(
    node: FolderHierarchyNode,
    folderItems: { name: string; link: string }[],
    fileItems: { name: string; link: string }[]
  ): string {
    const lines: string[] = [];
    const unindexedLines: string[] = [];

    if (this.settings.bubbleUpOrphans && node.unindexedTrees) {
      for (const tree of node.unindexedTrees) {
        unindexedLines.push(...this.renderUnindexedTree(tree, 0, node.folderPath));
      }
    }

    if (this.settings.sortOrder === 'folders-first') {
      for (const f of folderItems) lines.push(`- 📁 ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
      for (const f of fileItems) lines.push(`- 📄 ${f.link}`);
    } else if (this.settings.sortOrder === 'files-first') {
      for (const f of fileItems) lines.push(`- 📄 ${f.link}`);
      for (const f of folderItems) lines.push(`- 📁 ${f.link}`);
      for (const u of unindexedLines) lines.push(u);
    } else {
      const combined: { name: string; line: string }[] = [
        ...folderItems.map(f => ({ name: f.name, line: `- 📁 ${f.link}` })),
        ...fileItems.map(f => ({ name: f.name, line: `- 📄 ${f.link}` }))
      ];
      combined.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const item of combined) lines.push(item.line);
      for (const u of unindexedLines) lines.push(u);
    }

    return lines.join('\n');
  }

  private renderDetailsLayout(items: GraphWayItem[]): string {
    const lines: string[] = [];
    lines.push('| Name | Type | Modified | Size |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const item of items) {
      const icon = item.kind === 'folder' ? '📁' : '📄';
      const typeLabel = item.folderContext ? `${item.type} (${item.folderContext})` : item.type;
      // In Markdown tables, unescaped '|' inside wikilinks splits the table cells.
      const safeLink = item.link.replace(/\|/g, '\\|');
      lines.push(`| ${icon} ${safeLink} | ${typeLabel} | ${item.modified} | ${item.size} |`);
    }
    return lines.join('\n');
  }

  private renderCardsLayout(items: GraphWayItem[]): string {
    const hiddenGraphLinks = items.map(i => i.link).join(' ');
    const cardsHtml = items.map(item => {
      const icon = item.kind === 'folder' ? '📁' : '📄';
      return `<a class="graphway-card graphway-card-item" data-href="${item.targetPath}">` +
        `<span class="graphway-card-icon">${icon}</span>` +
        `<span class="graphway-card-name">${item.name}</span>` +
        `</a>`;
    }).join('\n  ');

    return `%% ${hiddenGraphLinks} %%\n<div class="graphway-cards">\n  ${cardsHtml}\n</div>`;
  }

  private renderChipsLayout(items: GraphWayItem[]): string {
    const hiddenGraphLinks = items.map(i => i.link).join(' ');
    const pillsHtml = items.map(item => {
      const icon = item.kind === 'folder' ? '📁' : '📄';
      return `<a class="graphway-card graphway-pill-item" data-href="${item.targetPath}">${icon} ${item.name}</a>`;
    }).join('\n  ');

    return `%% ${hiddenGraphLinks} %%\n<div class="graphway-pills">\n  ${pillsHtml}\n</div>`;
  }

  private renderContentLayout(items: GraphWayItem[]): string {
    const hiddenGraphLinks = items.map(i => i.link).join(' ');
    const rowsHtml = items.map(item => {
      const icon = item.kind === 'folder' ? '📁' : '📄';
      return `<a class="graphway-card graphway-row-item" data-href="${item.targetPath}">` +
        `<span class="graphway-row-left">${icon} ${item.name}</span>` +
        `<span class="graphway-row-right">${item.modified}</span>` +
        `</a>`;
    }).join('\n  ');

    return `%% ${hiddenGraphLinks} %%\n<div class="graphway-rows">\n  ${rowsHtml}\n</div>`;
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
    // Empty lines before and after newBlockContent ensure markdown tables and blocks are parsed properly by Obsidian
    const fullBlock = `${beginMarker}\n\n${newBlockContent}\n\n${endMarker}`;

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

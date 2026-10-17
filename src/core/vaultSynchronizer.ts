import { App, TFile, TFolder, Notice, normalizePath } from 'obsidian';
import { GraphWaySettings } from '../types';
import { FolderResolver } from './folderResolver';
import { HierarchyBuilder } from './hierarchyBuilder';
import { MarkdownGenerator } from './markdownGenerator';

export class VaultSynchronizer {
  private app: App;
  private settings: GraphWaySettings;
  private resolver: FolderResolver;
  private hierarchyBuilder: HierarchyBuilder;
  private generator: MarkdownGenerator;

  private isSyncing = false;
  private debounceTimer: number | null = null;
  private onHierarchyUpdatedCallbacks: ((hierarchy: ReturnType<HierarchyBuilder['buildVaultHierarchy']>) => void)[] = [];

  constructor(
    app: App,
    settings: GraphWaySettings,
    resolver: FolderResolver,
    hierarchyBuilder: HierarchyBuilder,
    generator: MarkdownGenerator
  ) {
    this.app = app;
    this.settings = settings;
    this.resolver = resolver;
    this.hierarchyBuilder = hierarchyBuilder;
    this.generator = generator;
  }

  public updateSettings(settings: GraphWaySettings): void {
    this.settings = settings;
    this.resolver.updateSettings(settings);
    this.hierarchyBuilder.updateSettings(settings);
    this.generator.updateSettings(settings);
  }

  public getHierarchyBuilder(): HierarchyBuilder {
    return this.hierarchyBuilder;
  }

  public registerHierarchyCallback(cb: (hierarchy: ReturnType<HierarchyBuilder['buildVaultHierarchy']>) => void): void {
    this.onHierarchyUpdatedCallbacks.push(cb);
  }

  public unregisterHierarchyCallback(cb: (hierarchy: ReturnType<HierarchyBuilder['buildVaultHierarchy']>) => void): void {
    this.onHierarchyUpdatedCallbacks = this.onHierarchyUpdatedCallbacks.filter(c => c !== cb);
  }

  private notifyHierarchyUpdated(hierarchy: ReturnType<HierarchyBuilder['buildVaultHierarchy']>): void {
    for (const cb of this.onHierarchyUpdatedCallbacks) {
      try {
        cb(hierarchy);
      } catch (err) {
        console.error('GraphWay: Error in hierarchy callback', err);
      }
    }
  }

  /**
   * One-click Vault Generator:
   * 1. Traverses all folders.
   * 2. Creates missing folder notes if enabled.
   * 3. Updates all folder notes with wikilinks conforming to the hierarchy rule.
   */
  public async generateAll(showNotice = true): Promise<{ updatedCount: number; createdCount: number }> {
    if (this.isSyncing) {
      return { updatedCount: 0, createdCount: 0 };
    }
    this.isSyncing = true;

    let createdCount = 0;
    let updatedCount = 0;

    try {
      // Step 1: Detect all non-excluded folders
      const allFolders: TFolder[] = [];
      const collectFolders = (folder: TFolder) => {
        if (this.resolver.isFolderExcluded(folder.path)) return;
        if (folder.path !== '/') allFolders.push(folder);
        for (const child of folder.children) {
          if (child instanceof TFolder) collectFolders(child);
        }
      };
      collectFolders(this.app.vault.getRoot());

      // Step 2: Create missing folder notes if setting is active
      if (this.settings.createMissingFolderNotes) {
        // Auto-create homepage note if configured but missing
        if (this.settings.homepageNotePath) {
          const hpPath = normalizePath(this.settings.homepageNotePath);
          const existingHp = this.app.vault.getAbstractFileByPath(hpPath);
          if (!existingHp) {
            const title = hpPath.split('/').pop()?.replace(/\.md$/, '') || 'Homepage';
            const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, title);
            await this.app.vault.create(hpPath, template);
            createdCount++;
          }
        }

        for (const folder of allFolders) {
          const existingNote = this.resolver.findFolderNote(folder);
          if (!existingNote) {
            const targetPath = normalizePath(this.resolver.computeDefaultFolderNotePath(folder));
            const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!existingFile) {
              const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, folder.name);
              await this.app.vault.create(targetPath, template);
              createdCount++;
            }
          }
        }
      }

      // Step 3: Rebuild hierarchy map now that folder notes exist
      const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
      this.notifyHierarchyUpdated(hierarchy);

      // Step 4: Write wikilinks to every folder note that exists
      for (const [, node] of hierarchy.entries()) {
        if (!node.indexFilePath) continue;

        const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
        if (file instanceof TFile) {
          const modified = await this.generator.updateFileContent(file, node);
          if (modified) updatedCount++;
        }
      }

      // Step 5: Write wikilinks to any custom connected files (folder -> file)
      if (this.settings.folderToFileConnections) {
        for (const conn of this.settings.folderToFileConnections) {
          const folderNode = hierarchy.get(conn.folderPath);
          if (folderNode) {
            const targetFile = this.app.vault.getAbstractFileByPath(conn.filePath);
            if (targetFile instanceof TFile) {
              const modified = await this.generator.updateFileContent(targetFile, folderNode);
              if (modified) updatedCount++;
            }
          }
        }
      }

      if (showNotice) {
        new Notice(
          `GraphWay: Complete! Updated ${updatedCount} note(s)${
            createdCount > 0 ? `, created ${createdCount} new index note(s)` : ''
          }.`
        );
      }
    } catch (err) {
      console.error('GraphWay: Error during generateAll', err);
      new Notice(`GraphWay Error: Failed to generate links. Check console for details.`);
    } finally {
      this.isSyncing = false;
    }

    return { updatedCount, createdCount };
  }

  /**
   * Explicitly creates a missing folder note for a folder, populates it, and syncs
   */
  public async createFolderNoteForFolder(folder: TFolder): Promise<TFile | null> {
    const isRoot = folder.path === '/' || folder.isRoot() || folder.path === '';
    // Un-mark folder as unindexed
    if (this.settings.unindexedFolderPaths) {
      this.settings.unindexedFolderPaths = this.settings.unindexedFolderPaths.filter(
        p => p !== folder.path && (!isRoot || (p !== '/' && p !== ''))
      );
    }

    let targetPath = '';

    if (this.settings.customFolderNotes && this.settings.customFolderNotes[folder.path]) {
      targetPath = this.settings.customFolderNotes[folder.path];
    } else if (isRoot) {
      targetPath = this.settings.homepageNotePath || 'Home.md';
      if (!targetPath.endsWith('.md')) targetPath += '.md';
    } else {
      targetPath = this.resolver.computeDefaultFolderNotePath(folder);
    }

    targetPath = normalizePath(targetPath);
    let file = this.app.vault.getAbstractFileByPath(targetPath);

    if (!file) {
      const title =
        folder.name ||
        (this.settings.homepageNotePath ? this.settings.homepageNotePath.replace(/\.md$/, '') : 'Homepage');
      const template = this.settings.defaultTemplate.replace(/\{\{title\}\}/g, title);
      try {
        file = await this.app.vault.create(targetPath, template);
        new Notice(`GraphWay: Created index note "${(file as TFile).name}"`);
      } catch (err) {
        console.error('GraphWay: Failed to create index note', err);
        new Notice(`GraphWay: Failed to create "${targetPath}"`);
        return null;
      }
    }

    if (file instanceof TFile) {
      await this.syncExistingIndices();
      return file;
    }

    return null;
  }

  /**
   * Un-indexes a folder:
   * Strips the GraphWay block from the index note,
   * Marks folder as unindexed,
   * Cleans homepage / custom folder notes if applicable,
   * Re-syncs remaining indices.
   */
  public async detachFolderNote(folderPath: string, indexFilePath?: string | null): Promise<boolean> {
    const isRoot = folderPath === '/' || folderPath === '';

    if (indexFilePath) {
      const file = this.app.vault.getAbstractFileByPath(indexFilePath);
      if (file instanceof TFile) {
        await this.generator.removeBlockFromFile(file);
      }
    }

    if (!this.settings.unindexedFolderPaths) {
      this.settings.unindexedFolderPaths = [];
    }
    if (!this.settings.unindexedFolderPaths.includes(folderPath)) {
      this.settings.unindexedFolderPaths.push(folderPath);
    }
    if (isRoot) {
      if (!this.settings.unindexedFolderPaths.includes('/')) this.settings.unindexedFolderPaths.push('/');
      if (!this.settings.unindexedFolderPaths.includes('')) this.settings.unindexedFolderPaths.push('');
      this.settings.homepageNotePath = '';
    }

    if (this.settings.customFolderNotes && this.settings.customFolderNotes[folderPath]) {
      delete this.settings.customFolderNotes[folderPath];
    }

    await this.syncExistingIndices();
    return true;
  }

  /**
   * Updates only a specific folder note
   */
  public async updateFolder(folder: TFolder, showNotice = false): Promise<boolean> {
    if (this.isSyncing) return false;

    const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
    const node = hierarchy.get(folder.path);
    if (!node || !node.indexFilePath) return false;

    const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
    if (file instanceof TFile) {
      this.isSyncing = true;
      try {
        const modified = await this.generator.updateFileContent(file, node);
        if (showNotice && modified) {
          new Notice(`GraphWay: Updated "${file.basename}".`);
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
  public triggerDebouncedSync(): void {
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
  public async syncExistingIndices(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
      this.notifyHierarchyUpdated(hierarchy);

      for (const [, node] of hierarchy.entries()) {
        if (!node.indexFilePath) continue;
        const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
        if (file instanceof TFile) {
          await this.generator.updateFileContent(file, node);
        }
      }

      // Also sync custom connected files (folder -> file)
      if (this.settings.folderToFileConnections) {
        for (const conn of this.settings.folderToFileConnections) {
          const folderNode = hierarchy.get(conn.folderPath);
          if (folderNode) {
            const targetFile = this.app.vault.getAbstractFileByPath(conn.filePath);
            if (targetFile instanceof TFile) {
              await this.generator.updateFileContent(targetFile, folderNode);
            }
          }
        }
      }
    } catch (err) {
      console.error('GraphWay: Debounced sync error', err);
    } finally {
      this.isSyncing = false;
    }
  }
}

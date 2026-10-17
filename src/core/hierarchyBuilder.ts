import { App, TFolder, TFile } from 'obsidian';
import { GraphWaySettings, FolderHierarchyNode, UnindexedFolderTree } from '../types';
import { FolderResolver } from './folderResolver';

export class HierarchyBuilder {
  private app: App;
  private resolver: FolderResolver;
  private settings: GraphWaySettings;

  constructor(app: App, resolver: FolderResolver, settings: GraphWaySettings) {
    this.app = app;
    this.resolver = resolver;
    this.settings = settings;
  }

  public updateSettings(settings: GraphWaySettings): void {
    this.settings = settings;
    this.resolver.updateSettings(settings);
  }

  /**
   * Scans the vault and builds a comprehensive hierarchy map of all folders
   */
  public buildVaultHierarchy(): Map<string, FolderHierarchyNode> {
    const hierarchy = new Map<string, FolderHierarchyNode>();
    const rootFolder = this.app.vault.getRoot();

    this.processFolder(rootFolder, 0, hierarchy);

    return hierarchy;
  }

  public isEdgeConnected(fromPath: string, toPath: string): boolean {
    const edgeKey = `${fromPath}->${toPath}`;
    if (this.settings.disconnectedEdges && this.settings.disconnectedEdges.includes(edgeKey)) {
      return false;
    }
    return true;
  }

  /**
   * Recursively builds an unindexed subtree for a connected child folder without an index note
   */
  private buildUnindexedFolderTree(folder: TFolder): UnindexedFolderTree {
    const directFiles: string[] = [];
    const childTrees: UnindexedFolderTree[] = [];

    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === 'md') {
        if (!this.hasExcludedTag(child)) {
          directFiles.push(child.path);
        }
      } else if (child instanceof TFolder) {
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
  private processFolder(
    folder: TFolder,
    depth: number,
    hierarchy: Map<string, FolderHierarchyNode>
  ): void {
    if (this.resolver.isFolderExcluded(folder.path)) {
      return;
    }

    let folderNote: TFile | null = null;
    let folderDisplayName = folder.name || 'Root';

    const isRoot = folder.path === '/' || folder.isRoot() || folder.path === '';
    const isExplicitlyUnindexed = Boolean(
      this.settings.unindexedFolderPaths &&
        (this.settings.unindexedFolderPaths.includes(folder.path) ||
          (isRoot && (this.settings.unindexedFolderPaths.includes('/') || this.settings.unindexedFolderPaths.includes(''))))
    );

    if (isRoot) {
      if (!isExplicitlyUnindexed && this.settings.homepageNotePath) {
        const hp = this.app.vault.getAbstractFileByPath(this.settings.homepageNotePath);
        if (hp instanceof TFile) {
          folderNote = hp;
          folderDisplayName = hp.basename || 'Homepage';
        }
      }
    } else if (!isExplicitlyUnindexed) {
      folderNote = this.resolver.findFolderNote(folder);
    }

    const directFiles: string[] = [];
    const childFolders: TFolder[] = [];

    for (const child of folder.children) {
      if (child instanceof TFile) {
        if (child.extension === 'md') {
          // If this file is the folder's own index note, do not include it in its own list
          if (folderNote && child.path === folderNote.path) {
            continue;
          }

          // Check excluded tags
          if (this.hasExcludedTag(child)) {
            continue;
          }

          directFiles.push(child.path);
        }
      } else if (child instanceof TFolder) {
        if (!this.resolver.isFolderExcluded(child.path)) {
          childFolders.push(child);
        }
      }
    }

    const node: FolderHierarchyNode = {
      folderPath: folder.path,
      folderName: isRoot ? (folderNote ? `🏠 ${folderDisplayName}` : 'Root') : folder.name,
      depth,
      indexFilePath: folderNote ? folderNote.path : null,
      hasIndex: folderNote !== null,
      directFiles,
      indexedChildFolders: [],
      unindexedTrees: [],
      allConnectedChildPaths: [],
      disconnectedChildPaths: []
    };

    // Include custom folder edges originating from this folder
    const allChildFolderCandidates: TFolder[] = [...childFolders];
    if (this.settings.customFolderEdges) {
      for (const customEdge of this.settings.customFolderEdges) {
        if (customEdge.from === folder.path) {
          const target = this.app.vault.getAbstractFileByPath(customEdge.to);
          if (target instanceof TFolder && !allChildFolderCandidates.some(f => f.path === target.path)) {
            allChildFolderCandidates.push(target);
          }
        }
      }
    }

    // Classify child folders into connected vs disconnected, and indexed vs unindexed
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

    // Recursively process child folders
    for (const childFolder of childFolders) {
      this.processFolder(childFolder, depth + 1, hierarchy);
    }
  }

  /**
   * Checks if a file contains any tag from the excludedTags setting
   */
  private hasExcludedTag(file: TFile): boolean {
    if (!this.settings.excludedTags || this.settings.excludedTags.length === 0) {
      return false;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return false;

    const fileTags: string[] = [];
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
      } else if (typeof fmTags === 'string') {
        fileTags.push(fmTags.toLowerCase());
      }
    }

    for (const ex of this.settings.excludedTags) {
      const cleanEx = ex.startsWith('#') ? ex.toLowerCase() : `#${ex.toLowerCase()}`;
      if (fileTags.some(t => t === cleanEx || t.startsWith(`${cleanEx}/`))) {
        return true;
      }
    }

    return false;
  }
}

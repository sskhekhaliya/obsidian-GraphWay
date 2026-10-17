import { TFolder, TFile, Vault } from 'obsidian';
import { GraphWaySettings } from '../types';

export class FolderResolver {
  private vault: Vault;
  private settings: GraphWaySettings;

  constructor(vault: Vault, settings: GraphWaySettings) {
    this.vault = vault;
    this.settings = settings;
  }

  public updateSettings(settings: GraphWaySettings): void {
    this.settings = settings;
  }

  /**
   * Cleans leading number prefixes like "01 - ", "001_", "1. " from a string
   */
  public static stripLeadingNumbers(str: string): string {
    return str.replace(/^(?:\d+[\s\-_.]+)+/, '').trim();
  }

  /**
   * Tests whether a given file matches the folder note criteria for the specified folder.
   */
  public isFolderNoteFor(file: TFile, folder: TFolder): boolean {
    if (file.extension !== 'md') return false;

    const folderName = folder.name;
    const fileBasename = file.basename;

    // Check if the file is inside the folder or sibling
    const isInside = file.parent?.path === folder.path;
    const isSibling = file.parent?.path === folder.parent?.path;

    if (this.settings.folderNoteInsideFolder && !isInside) {
      return false;
    }
    if (!this.settings.folderNoteInsideFolder && !isSibling) {
      return false;
    }

    switch (this.settings.folderNoteStrategy) {
      case 'same-name':
        return fileBasename.toLowerCase() === folderName.toLowerCase();

      case 'strip-numbers': {
        const cleanFolder = FolderResolver.stripLeadingNumbers(folderName).toLowerCase();
        const cleanFile = FolderResolver.stripLeadingNumbers(fileBasename).toLowerCase();
        return (
          fileBasename.toLowerCase() === folderName.toLowerCase() ||
          cleanFolder === cleanFile ||
          cleanFolder === fileBasename.toLowerCase()
        );
      }

      case 'suffix': {
        const suffix = this.settings.suffixString || '---';
        const expectedWithSuffix = `${folderName}${suffix}`.toLowerCase();
        const cleanFolder = FolderResolver.stripLeadingNumbers(folderName).toLowerCase();
        const cleanFile = FolderResolver.stripLeadingNumbers(fileBasename).toLowerCase();
        const cleanExpectedWithSuffix = `${cleanFolder}${suffix}`.toLowerCase();

        return (
          fileBasename.toLowerCase() === expectedWithSuffix ||
          fileBasename.toLowerCase() === folderName.toLowerCase() ||
          cleanFile === cleanExpectedWithSuffix ||
          cleanFile === cleanFolder
        );
      }

      case 'index': {
        const lower = fileBasename.toLowerCase();
        return (
          lower === 'index' ||
          lower === '_index' ||
          lower === 'readme' ||
          lower === folderName.toLowerCase()
        );
      }

      case 'custom-regex': {
        try {
          // If regex pattern contains {{folder}}, replace it with folderName
          let patternStr = this.settings.customRegex;
          if (patternStr.includes('{{folder}}')) {
            const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patternStr = patternStr.replace(/\{\{folder\}\}/g, escapedFolder);
          }
          const regex = new RegExp(patternStr, 'i');
          return regex.test(fileBasename);
        } catch (e) {
          console.warn('GraphWay: Invalid custom regex pattern', e);
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
  public findFolderNote(folder: TFolder): TFile | null {
    const isRoot = folder.path === '/' || folder.isRoot() || folder.path === '';
    if (this.settings.unindexedFolderPaths) {
      if (
        this.settings.unindexedFolderPaths.includes(folder.path) ||
        (isRoot && (this.settings.unindexedFolderPaths.includes('/') || this.settings.unindexedFolderPaths.includes('')))
      ) {
        return null;
      }
    }

    // 1. Check custom explicitly assigned folder index note
    if (this.settings.customFolderNotes && this.settings.customFolderNotes[folder.path]) {
      const customPath = this.settings.customFolderNotes[folder.path];
      const customFile = this.vault.getAbstractFileByPath(customPath);
      if (customFile instanceof TFile) {
        return customFile;
      }
    }

    // 2. If inside folder, check children of folder
    if (this.settings.folderNoteInsideFolder) {
      for (const child of folder.children) {
        if (child instanceof TFile && this.isFolderNoteFor(child, folder)) {
          return child;
        }
      }
    } else {
      // Sibling: check parent's children
      const parent = folder.parent;
      if (parent) {
        for (const sibling of parent.children) {
          if (sibling instanceof TFile && this.isFolderNoteFor(sibling, folder)) {
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
  public computeDefaultFolderNotePath(folder: TFolder): string {
    let noteName = folder.name;

    switch (this.settings.folderNoteStrategy) {
      case 'strip-numbers':
        noteName = FolderResolver.stripLeadingNumbers(folder.name) || folder.name;
        break;
      case 'suffix':
        noteName = `${folder.name}${this.settings.suffixString || '---'}`;
        break;
      case 'index':
        noteName = 'index';
        break;
      case 'same-name':
      default:
        noteName = folder.name;
        break;
    }

    if (this.settings.folderNoteInsideFolder) {
      return folder.path ? `${folder.path}/${noteName}.md` : `${noteName}.md`;
    } else {
      const parentPath = folder.parent?.path ? `${folder.parent.path}/` : '';
      return `${parentPath}${noteName}.md`;
    }
  }

  /**
   * Checks if a folder path is in the excluded list.
   */
  public isFolderExcluded(folderPath: string): boolean {
    const segments = folderPath.split('/');
    for (const seg of segments) {
      if (this.settings.excludedFolders.some(ex => ex.toLowerCase() === seg.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
}

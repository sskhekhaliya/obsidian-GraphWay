export type FolderNoteNamingStrategy =
  | 'same-name'
  | 'strip-numbers'
  | 'suffix'
  | 'index'
  | 'custom-regex';

export type SortOrder = 'alphabetical' | 'folders-first' | 'files-first';

export interface GraphWaySettings {
  folderNoteStrategy: FolderNoteNamingStrategy;
  customRegex: string; // e.g. "^(?:\d+[\s\-_]+)?(?<name>.+?)(?:---)?$"
  suffixString: string; // e.g. "---"
  createMissingFolderNotes: boolean;
  folderNoteInsideFolder: boolean; // true = Folder/Folder.md; false = Folder.md sibling to Folder/
  defaultTemplate: string;
  beginMarker: string;
  endMarker: string;
  bubbleUpOrphans: boolean;
  excludedFolders: string[];
  excludedTags: string[];
  autoUpdateOnVaultChange: boolean;
  debounceMs: number;
  sortOrder: SortOrder;
  // Top-level Homepage note path (e.g. "Home.md", "Dashboard.md")
  homepageNotePath: string;
  // Disconnected folder edges (format: "fromFolderPath->toFolderPath")
  disconnectedEdges: string[];
  // Custom manual folder edges
  customFolderEdges: { from: string; to: string }[];
  // Folder-to-File connections: any folder connected to any file to render that folder inside the file
  folderToFileConnections: { folderPath: string; filePath: string }[];
  // Custom manual links: maps a filePath to a specific target folder path
  customLinkOverrides: Record<string, string>;
  // Saved canvas node positions: key is folderPath
  nodePositions: Record<string, { x: number; y: number }>;
}

export const DEFAULT_SETTINGS: GraphWaySettings = {
  folderNoteStrategy: 'same-name',
  customRegex: '^(?:\\d+[\\s\\-_]+)?(?<name>.+?)(?:---)?$',
  suffixString: '---',
  createMissingFolderNotes: true,
  folderNoteInsideFolder: true,
  defaultTemplate: '# {{title}}\n\n%% Begin GraphWay %%\n%% End GraphWay %%\n',
  beginMarker: '%% Begin GraphWay %%',
  endMarker: '%% End GraphWay %%',
  bubbleUpOrphans: true,
  excludedFolders: ['.trash', '.obsidian', 'templates', 'attachments', 'assets'],
  excludedTags: ['#archive', '#draft'],
  autoUpdateOnVaultChange: true,
  debounceMs: 500,
  sortOrder: 'folders-first',
  homepageNotePath: '',
  disconnectedEdges: [],
  customFolderEdges: [],
  folderToFileConnections: [],
  customLinkOverrides: {},
  nodePositions: {}
};

export interface UnindexedFolderTree {
  folderPath: string;
  folderName: string;
  files: string[];
  childTrees: UnindexedFolderTree[];
}

export interface FolderHierarchyNode {
  folderPath: string;
  folderName: string;
  depth: number;
  indexFilePath: string | null;
  hasIndex: boolean;
  // Files directly inside this folder (excluding the folder note itself)
  directFiles: string[];
  // Connected child folders that have their own index note
  indexedChildFolders: {
    folderPath: string;
    indexFilePath: string;
    folderName: string;
  }[];
  // Connected child folders that DO NOT have an index note (rendered hierarchically)
  unindexedTrees: UnindexedFolderTree[];
  // All directly connected child folders (both indexed & unindexed) for canvas wiring
  allConnectedChildPaths: string[];
  // Child folders that have been disconnected from this parent
  disconnectedChildPaths: string[];
}

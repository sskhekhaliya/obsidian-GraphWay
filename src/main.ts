import { Plugin, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { GraphWaySettings, DEFAULT_SETTINGS } from './types';
import { FolderResolver } from './core/folderResolver';
import { HierarchyBuilder } from './core/hierarchyBuilder';
import { MarkdownGenerator } from './core/markdownGenerator';
import { VaultSynchronizer } from './core/vaultSynchronizer';
import { GraphWaySettingsTab } from './settings/settingsTab';
import { GraphWayView, GRAPHWAY_VIEW_TYPE } from './canvas-ui/GraphWayView';

export default class GraphWayPlugin extends Plugin {
  public settings: GraphWaySettings = DEFAULT_SETTINGS;
  public resolver!: FolderResolver;
  public hierarchyBuilder!: HierarchyBuilder;
  public generator!: MarkdownGenerator;
  public synchronizer!: VaultSynchronizer;

  public async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize core services
    this.resolver = new FolderResolver(this.app.vault, this.settings);
    this.hierarchyBuilder = new HierarchyBuilder(this.app, this.resolver, this.settings);
    this.generator = new MarkdownGenerator(this.app, this.settings);
    this.synchronizer = new VaultSynchronizer(
      this.app,
      this.settings,
      this.resolver,
      this.hierarchyBuilder,
      this.generator
    );

    // Register Canvas ItemView
    this.registerView(
      GRAPHWAY_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new GraphWayView(
          leaf,
          this.synchronizer,
          this.hierarchyBuilder,
          this.settings,
          () => this.saveSettings()
        )
    );

    // Ribbon Icon
    this.addRibbonIcon('network', 'Open GraphWay Canvas', () => {
      this.activateView();
    });

    // Commands
    this.addCommand({
      id: 'graphway-open-canvas',
      name: 'Open GraphWay Canvas Manager',
      callback: () => {
        this.activateView();
      }
    });

    this.addCommand({
      id: 'graphway-generate-all',
      name: 'Generate All Vault Folder Notes (MOCs)',
      callback: async () => {
        await this.synchronizer.generateAll(true);
      }
    });

    this.addCommand({
      id: 'graphway-update-current',
      name: 'Update GraphWay Block for Current Note Folder',
      checkCallback: (checking: boolean) => {
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
      id: 'graphway-create-current',
      name: 'Create Missing Folder Note for Active Folder',
      checkCallback: (checking: boolean) => {
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

    // Global click listener for rendered GraphWay cards and pills
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      const card = target.closest('.graphway-card') as HTMLElement;
      if (card) {
        const href = card.getAttribute('data-href');
        if (href) {
          evt.preventDefault();
          evt.stopPropagation();
          this.app.workspace.openLinkText(href, '', evt.ctrlKey || evt.metaKey);
        }
      }
    });

    // Hover preview support for rendered GraphWay cards and pills
    this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      const card = target.closest('.graphway-card') as HTMLElement;
      if (card && (evt.ctrlKey || evt.metaKey)) {
        const href = card.getAttribute('data-href');
        if (href) {
          this.app.workspace.trigger('hover-link', {
            event: evt,
            source: 'graphway',
            hoverParent: card,
            targetEl: card,
            linktext: href
          });
        }
      }
    });

    // Settings Tab
    this.addSettingTab(new GraphWaySettingsTab(this.app, this));

    // Vault Event Listeners for real-time auto-sync
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.synchronizer.triggerDebouncedSync();
        } else if (file instanceof TFolder) {
          this.synchronizer.triggerDebouncedSync();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', () => {
        this.synchronizer.triggerDebouncedSync();
      })
    );

    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.synchronizer.triggerDebouncedSync();
      })
    );
  }

  public onunload(): void {
    this.app.workspace.detachLeavesOfType(GRAPHWAY_VIEW_TYPE);
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.synchronizer) {
      this.synchronizer.updateSettings(this.settings);
    }
  }

  public async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const leaves = workspace.getLeavesOfType(GRAPHWAY_VIEW_TYPE);
    if (leaves.length > 0) {
      const existing = leaves[0];
      // If the view was previously docked in a sidebar, detach it so it opens as a full page tab
      if (existing.getRoot() !== workspace.rootSplit) {
        existing.detach();
      } else {
        leaf = existing;
      }
    }

    if (!leaf) {
      const activeLeaf = workspace.getMostRecentLeaf();
      if (activeLeaf && activeLeaf.getViewState().type === 'empty') {
        leaf = activeLeaf;
      } else {
        leaf = workspace.getLeaf('tab');
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
}

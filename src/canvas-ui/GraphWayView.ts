import { ItemView, WorkspaceLeaf } from 'obsidian';
import { CanvasRenderer } from './canvasRenderer';
import { VaultSynchronizer } from '../core/vaultSynchronizer';
import { HierarchyBuilder } from '../core/hierarchyBuilder';
import { GraphWaySettings, FolderHierarchyNode } from '../types';

export const GRAPHWAY_VIEW_TYPE = 'graphway-canvas-view';

export class GraphWayView extends ItemView {
  private synchronizer: VaultSynchronizer;
  private hierarchyBuilder: HierarchyBuilder;
  private settings: GraphWaySettings;
  private onSettingsChange: () => Promise<void>;
  private renderer: CanvasRenderer | null = null;
  private hierarchyCallback: ((h: Map<string, FolderHierarchyNode>) => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    synchronizer: VaultSynchronizer,
    hierarchyBuilder: HierarchyBuilder,
    settings: GraphWaySettings,
    onSettingsChange: () => Promise<void>
  ) {
    super(leaf);
    this.synchronizer = synchronizer;
    this.hierarchyBuilder = hierarchyBuilder;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
  }

  public getViewType(): string {
    return GRAPHWAY_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return 'GraphWay Canvas';
  }

  public getIcon(): string {
    return 'network';
  }

  public async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();

    this.renderer = new CanvasRenderer(
      container,
      this.app,
      this.settings,
      this.synchronizer,
      this.onSettingsChange
    );

    // Initial hierarchy scan
    const hierarchy = this.hierarchyBuilder.buildVaultHierarchy();
    this.renderer.updateData(hierarchy);

    // Listen to hierarchy changes
    this.hierarchyCallback = (updatedHierarchy) => {
      if (this.renderer) {
        this.renderer.updateData(updatedHierarchy);
      }
    };
    this.synchronizer.registerHierarchyCallback(this.hierarchyCallback);
  }

  public async onClose(): Promise<void> {
    if (this.hierarchyCallback) {
      this.synchronizer.unregisterHierarchyCallback(this.hierarchyCallback);
      this.hierarchyCallback = null;
    }
    this.renderer = null;
  }
}

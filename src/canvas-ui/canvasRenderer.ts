import { App, TFolder, TFile, Notice, Menu } from 'obsidian';
import { GraphWaySettings, FolderHierarchyNode, UnindexedFolderTree } from '../types';
import { VaultSynchronizer } from '../core/vaultSynchronizer';

export class CanvasRenderer {
  private containerEl: HTMLElement;
  private app: App;
  private settings: GraphWaySettings;
  private synchronizer: VaultSynchronizer;
  private onSettingsChange: () => Promise<void>;

  // Canvas State
  private panX = 80;
  private panY = 80;
  private zoom = 1;
  private isPanning = false;
  private startPanX = 0;
  private startPanY = 0;

  // Multi-Node Selection State
  private selectedNodeIds: Set<string> = new Set();
  private selectedInitialPositions: Map<string, { x: number; y: number }> = new Map();
  private isBoxSelecting = false;
  private boxSelectStart = { x: 0, y: 0 };
  private selectionBoxEl!: HTMLElement;

  // Node Dragging State
  private isDraggingNode = false;
  private draggedNodeId: string | null = null;
  private nodeDragStartX = 0;
  private nodeDragStartY = 0;

  // Connecting Wires State
  private isConnecting = false;
  private connectionStart: {
    nodeId: string;
    folderPath: string;
    filePath?: string;
    type: 'out' | 'in';
    x: number;
    y: number;
  } | null = null;
  private tempMousePos = { x: 0, y: 0 };

  // DOM Elements
  private canvasWrapper!: HTMLElement;
  private svgLayer!: SVGSVGElement;
  private tempPathEl!: SVGPathElement;
  private nodesContainer!: HTMLElement;
  private searchInput!: HTMLInputElement;

  // Data cache
  private hierarchy: Map<string, FolderHierarchyNode> = new Map();
  private filterText = '';

  constructor(
    containerEl: HTMLElement,
    app: App,
    settings: GraphWaySettings,
    synchronizer: VaultSynchronizer,
    onSettingsChange: () => Promise<void>
  ) {
    this.containerEl = containerEl;
    this.app = app;
    this.settings = settings;
    this.synchronizer = synchronizer;
    this.onSettingsChange = onSettingsChange;

    this.buildDOM();
    this.attachEvents();
  }

  public updateData(hierarchy: Map<string, FolderHierarchyNode>): void {
    this.hierarchy = hierarchy;
    this.render();
  }

  private buildDOM(): void {
    this.containerEl.empty();
    this.containerEl.addClass('graphway-canvas-root');

    // 1. Top Toolbar (Blender / ComfyUI Header style)
    const toolbar = this.containerEl.createDiv({ cls: 'graphway-toolbar' });

    // Logo & Stats
    const brand = toolbar.createDiv({ cls: 'graphway-brand' });
    brand.createSpan({ text: '⚡ GraphWay', cls: 'graphway-title' });

    // Action Buttons
    const actions = toolbar.createDiv({ cls: 'graphway-actions' });

    const btnGenerate = actions.createEl('button', {
      cls: 'graphway-btn graphway-btn-primary',
      text: '⚡ Generate All Vault'
    });
    btnGenerate.onclick = async () => {
      btnGenerate.disabled = true;
      btnGenerate.setText('⏳ Generating...');
      await this.synchronizer.generateAll(true);
      btnGenerate.disabled = false;
      btnGenerate.setText('⚡ Generate All Vault');
      this.render();
    };

    const btnLayout = actions.createEl('button', {
      cls: 'graphway-btn',
      text: '📐 Auto-Layout'
    });
    btnLayout.onclick = () => {
      this.autoLayoutNodes();
    };

    const btnResetView = actions.createEl('button', {
      cls: 'graphway-btn',
      text: '🎯 Center View'
    });
    btnResetView.onclick = () => {
      this.panX = 80;
      this.panY = 80;
      this.zoom = 1;
      this.updateTransform();
    };

    // Search filter
    const searchWrapper = toolbar.createDiv({ cls: 'graphway-search-wrap' });
    this.searchInput = searchWrapper.createEl('input', {
      cls: 'graphway-search-input',
      type: 'text',
      placeholder: '🔍 Filter folders...'
    });
    this.searchInput.oninput = () => {
      this.filterText = this.searchInput.value.toLowerCase().trim();
      this.render();
    };

    // 2. Main Canvas Viewport
    const viewport = this.containerEl.createDiv({ cls: 'graphway-viewport' });

    // Selection box for marquee multi-select
    this.selectionBoxEl = viewport.createDiv({ cls: 'graphway-selection-box' });
    this.selectionBoxEl.style.display = 'none';

    // Background dot-grid
    this.canvasWrapper = viewport.createDiv({ cls: 'graphway-canvas-content' });

    // SVG Layer for Bezier Wire Connections
    this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgLayer.classList.add('graphway-svg-layer');
    this.canvasWrapper.appendChild(this.svgLayer);

    // Temp bezier path for dragging connections
    this.tempPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.tempPathEl.classList.add('graphway-wire-temp');
    this.tempPathEl.style.display = 'none';
    this.svgLayer.appendChild(this.tempPathEl);

    // Nodes Container (DOM Cards for HTML flexibility)
    this.nodesContainer = this.canvasWrapper.createDiv({ cls: 'graphway-nodes-layer' });

    this.updateTransform();
  }

  private updateTransform(): void {
    const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.canvasWrapper.style.transform = transform;
  }

  private updateSelectionStyles(): void {
    const allNodeEls = this.nodesContainer.querySelectorAll('.graphway-node-card');
    allNodeEls.forEach(el => {
      const folderPath = el.getAttribute('data-folder');
      if (folderPath && this.selectedNodeIds.has(folderPath)) {
        el.addClass('graphway-node-selected');
      } else {
        el.removeClass('graphway-node-selected');
      }
    });
  }

  private attachEvents(): void {
    const viewport = this.containerEl.querySelector('.graphway-viewport') as HTMLElement;
    if (!viewport) return;

    // Pan with mouse drag on background OR Box Select with Shift
    viewport.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === viewport || e.target === this.canvasWrapper || e.target === this.svgLayer) {
        if (e.shiftKey) {
          // Marquee / Box Selection
          this.isBoxSelecting = true;
          const rect = viewport.getBoundingClientRect();
          this.boxSelectStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          this.selectionBoxEl.style.left = `${this.boxSelectStart.x}px`;
          this.selectionBoxEl.style.top = `${this.boxSelectStart.y}px`;
          this.selectionBoxEl.style.width = '0px';
          this.selectionBoxEl.style.height = '0px';
          this.selectionBoxEl.style.display = 'block';
        } else {
          // Pan
          this.isPanning = true;
          this.startPanX = e.clientX - this.panX;
          this.startPanY = e.clientY - this.panY;
          viewport.style.cursor = 'grabbing';

          // Clear selection if clicking empty background without Shift
          if (this.selectedNodeIds.size > 0) {
            this.selectedNodeIds.clear();
            this.updateSelectionStyles();
          }
        }
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      // Panning
      if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.updateTransform();
        return;
      }

      // Box Selecting
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

        const allNodeEls = this.nodesContainer.querySelectorAll('.graphway-node-card');
        allNodeEls.forEach(el => {
          const folderPath = el.getAttribute('data-folder');
          if (!folderPath) return;

          const nRect = el.getBoundingClientRect();
          const nodeRelative = {
            left: nRect.left - rect.left,
            top: nRect.top - rect.top,
            right: nRect.right - rect.left,
            bottom: nRect.bottom - rect.top
          };

          const intersects = !(
            boxRect.right < nodeRelative.left ||
            boxRect.left > nodeRelative.right ||
            boxRect.bottom < nodeRelative.top ||
            boxRect.top > nodeRelative.bottom
          );

          if (intersects) {
            this.selectedNodeIds.add(folderPath);
          }
        });

        this.updateSelectionStyles();
        return;
      }

      // Dragging Nodes (Multi-move all selected nodes)
      if (this.isDraggingNode && this.draggedNodeId) {
        const dx = (e.clientX - this.nodeDragStartX) / this.zoom;
        const dy = (e.clientY - this.nodeDragStartY) / this.zoom;

        for (const [id, initPos] of this.selectedInitialPositions.entries()) {
          const newX = initPos.x + dx;
          const newY = initPos.y + dy;
          this.settings.nodePositions[id] = { x: newX, y: newY };
          const nodeEl = this.nodesContainer.querySelector(
            `[data-folder="${CSS.escape(id)}"]`
          ) as HTMLElement;
          if (nodeEl) {
            nodeEl.style.left = `${newX}px`;
            nodeEl.style.top = `${newY}px`;
          }
        }
        this.renderWires();
        return;
      }

      // Wiring connection
      if (this.isConnecting && this.connectionStart) {
        const rect = this.canvasWrapper.getBoundingClientRect();
        this.tempMousePos = {
          x: (e.clientX - rect.left) / this.zoom,
          y: (e.clientY - rect.top) / this.zoom
        };
        this.updateTempWire();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        viewport.style.cursor = 'default';
      }
      if (this.isBoxSelecting) {
        this.isBoxSelecting = false;
        this.selectionBoxEl.style.display = 'none';
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
        this.tempPathEl.style.display = 'none';
      }
    });

    // Keyboard Shortcuts: Ctrl/Cmd+A to select all, Escape to deselect
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.containerEl.isShown()) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selectedNodeIds.clear();
        for (const [folderPath] of this.hierarchy.entries()) {
          if (folderPath !== '/' || this.settings.homepageNotePath) {
            this.selectedNodeIds.add(folderPath);
          }
        }
        this.updateSelectionStyles();
      } else if (e.key === 'Escape') {
        if (this.selectedNodeIds.size > 0) {
          this.selectedNodeIds.clear();
          this.updateSelectionStyles();
        }
      }
    });

    // Zoom on wheel
    viewport.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(0.2, this.zoom * zoomFactor), 2.5);

      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - ((mouseX - this.panX) * newZoom) / this.zoom;
      this.panY = mouseY - ((mouseY - this.panY) * newZoom) / this.zoom;
      this.zoom = newZoom;

      this.updateTransform();
    }, { passive: false });
  }

  /**
   * Auto-Layout arranges folder nodes into neat left-to-right hierarchy columns
   */
  public autoLayoutNodes(): void {
    if (this.hierarchy.size === 0) return;

    const columnXSpacing = 380;
    const rowYSpacing = 30;
    const hasHomepage = Boolean(this.settings.homepageNotePath);

    // Group by depth
    const depthMap = new Map<number, FolderHierarchyNode[]>();
    for (const [, node] of this.hierarchy.entries()) {
      if (node.folderPath === '/' && !hasHomepage) continue;
      const depth = node.depth;
      if (!depthMap.has(depth)) depthMap.set(depth, []);
      depthMap.get(depth)!.push(node);
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
    new Notice('GraphWay: Canvas layout re-aligned.');
  }

  /**
   * Render nodes and bezier connection wires
   */
  public render(): void {
    this.nodesContainer.empty();

    if (this.hierarchy.size === 0) {
      const emptyMsg = this.nodesContainer.createDiv({ cls: 'graphway-empty-msg' });
      emptyMsg.setText('No folders found or all excluded. Click "Generate All Vault" or check settings.');
      return;
    }

    const hasHomepage = Boolean(this.settings.homepageNotePath);

    // Render nodes
    for (const [folderPath, node] of this.hierarchy.entries()) {
      if (folderPath === '/' && !hasHomepage) continue;

      if (this.filterText && !node.folderName.toLowerCase().includes(this.filterText)) {
        continue;
      }

      this.renderFolderNode(node);
    }

    // Render wires after DOM coordinates settle
    window.requestAnimationFrame(() => {
      this.renderWires();
    });
  }

  private renderFolderNode(node: FolderHierarchyNode): void {
    const isHomepage =
      node.folderPath === '/' ||
      (Boolean(this.settings.homepageNotePath) && node.indexFilePath === this.settings.homepageNotePath);

    const defaultX = node.depth * 360 + 40;
    const pos = this.settings.nodePositions[node.folderPath] || {
      x: defaultX,
      y: 40 + Math.random() * 200
    };

    const isSelected = this.selectedNodeIds.has(node.folderPath);
    const card = this.nodesContainer.createDiv({
      cls: `graphway-node-card ${isHomepage ? 'graphway-node-homepage' : ''} ${
        isSelected ? 'graphway-node-selected' : ''
      }`
    });
    card.setAttribute('data-folder', node.folderPath);
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;

    // 1. Input Socket (Left side) - skip for homepage since it has no parent
    if (!isHomepage) {
      const inSocket = card.createDiv({ cls: 'graphway-socket graphway-socket-in' });
      inSocket.title = `Input socket: Connect parent folder to ${node.folderName}`;
      inSocket.setAttribute('data-socket-in', node.folderPath);

      inSocket.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (this.isConnecting && this.connectionStart) {
          this.completeConnection(this.connectionStart, {
            folderPath: node.folderPath,
            type: 'in'
          });
        }
      });
    }

    // 2. Node Header
    const header = card.createDiv({ cls: 'graphway-node-header' });

    // Drag handle & multi-select
    header.addEventListener('mousedown', (e: MouseEvent) => {
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

      // Cache starting positions for all currently selected nodes
      this.selectedInitialPositions.clear();
      for (const id of this.selectedNodeIds) {
        const p = this.settings.nodePositions[id] || pos;
        this.selectedInitialPositions.set(id, { ...p });
      }
    });

    const titleGroup = header.createDiv({ cls: 'graphway-node-title-group' });
    const titleRow = titleGroup.createDiv({ cls: 'graphway-node-title-row' });
    titleRow.createSpan({ text: isHomepage ? '🏠 ' : '📁 ', cls: 'graphway-node-icon' });
    titleRow.createSpan({ text: node.folderName, cls: 'graphway-node-title' });

    // Index file name below top folder name
    const indexFileName = node.indexFilePath ? node.indexFilePath.split('/').pop() : null;
    if (indexFileName) {
      const subTitle = titleGroup.createDiv({
        cls: 'graphway-node-index-subtitle',
        text: `📄 ${indexFileName}`
      });
      subTitle.title = `Index note: ${node.indexFilePath}\nClick to open\nRight-click for options`;
      subTitle.onclick = (e) => {
        e.stopPropagation();
        const f = this.app.vault.getAbstractFileByPath(node.indexFilePath!);
        if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
      };
      subTitle.oncontextmenu = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem((item) => {
          item
            .setTitle(`Open "${indexFileName}"`)
            .setIcon('document')
            .onClick(() => {
              const f = this.app.vault.getAbstractFileByPath(node.indexFilePath!);
              if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
            });
        });
        if (this.settings.customFolderNotes && this.settings.customFolderNotes[node.folderPath]) {
          menu.addItem((item) => {
            item
              .setTitle('Unset Custom Index Assignment')
              .setIcon('cross')
              .onClick(async () => {
                await this.unsetFolderIndex(node.folderPath);
              });
          });
        }
        menu.showAtMouseEvent(e);
      };
    } else {
      const noIndexBtn = titleGroup.createDiv({
        cls: 'graphway-node-no-index',
        text: '⚠️ No index (Click to create)'
      });
      noIndexBtn.title = 'Click to create folder index note';
      noIndexBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.handleCreateOrOpenIndex(node);
      };
    }

    const isFilesHidden = Boolean(
      this.settings.foldersHidingDirectFiles &&
      this.settings.foldersHidingDirectFiles.includes(node.folderPath)
    );

    const headerActions = header.createDiv({ cls: 'graphway-node-header-actions' });

    // File visibility toggle button (to include or exclude direct files in this folder's index note)
    if (node.hasIndex || node.directFiles.length > 0) {
      const eyeBtn = headerActions.createSpan({
        cls: `graphway-file-toggle ${isFilesHidden ? 'graphway-file-toggle-off' : 'graphway-file-toggle-on'}`
      });
      eyeBtn.createSpan({ text: isFilesHidden ? '🚫' : '👁️', cls: 'graphway-toggle-icon' });
      eyeBtn.createSpan({ text: 'Files', cls: 'graphway-toggle-label' });
      eyeBtn.title = isFilesHidden
        ? `Direct files are HIDDEN in "${node.folderName}" index note.\nClick to render files inside index note.`
        : `Direct files are RENDERED in "${node.folderName}" index note.\nClick to hide files from index note.`;

      eyeBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!this.settings.foldersHidingDirectFiles) {
          this.settings.foldersHidingDirectFiles = [];
        }
        if (isFilesHidden) {
          this.settings.foldersHidingDirectFiles = this.settings.foldersHidingDirectFiles.filter(
            p => p !== node.folderPath
          );
          new Notice(`GraphWay: Now rendering direct files in "${node.folderName}" index note.`);
        } else {
          this.settings.foldersHidingDirectFiles.push(node.folderPath);
          new Notice(`GraphWay: Direct files hidden from "${node.folderName}" index note.`);
        }
        await this.onSettingsChange();
        await this.synchronizer.syncExistingIndices();
        this.render();
      };
    }

    const badge = headerActions.createSpan({
      cls: `graphway-badge ${
        isHomepage
          ? 'graphway-badge-homepage'
          : node.hasIndex
          ? 'graphway-badge-ok'
          : 'graphway-badge-warn'
      }`,
      text: isHomepage ? '🏠 HOMEPAGE' : node.hasIndex ? 'INDEXED' : 'NO INDEX'
    });
    badge.title = node.hasIndex
      ? `Folder Note: ${node.indexFilePath}\nClick to open`
      : 'Click to create folder index note';

    badge.onclick = async (e) => {
      e.stopPropagation();
      await this.handleCreateOrOpenIndex(node);
    };


    // 3. Node Body (Files and Links list - mirrors exactly what is generated in %% Begin GraphWay %%)
    const body = card.createDiv({ cls: 'graphway-node-body' });

    // Helper: render connected indexed child folders
    const renderIndexedChildFolders = () => {
      for (const child of node.indexedChildFolders) {
        const itemRow = body.createDiv({ cls: 'graphway-item-row graphway-child-folder-row' });
        itemRow.createSpan({ text: '📁', cls: 'graphway-item-icon' });
        const nameSpan = itemRow.createSpan({
          text: child.folderName,
          cls: 'graphway-item-name graphway-child-folder-name'
        });
        nameSpan.title = `Child folder: ${child.folderPath}\nClick to pan canvas to this folder`;
        nameSpan.onclick = () => {
          this.centerOnFolder(child.folderPath);
        };

        const openBtn = itemRow.createSpan({ text: '📄', cls: 'graphway-mini-open' });
        openBtn.title = `Open index note: ${child.indexFilePath.split('/').pop()}`;
        openBtn.onclick = (e) => {
          e.stopPropagation();
          const f = this.app.vault.getAbstractFileByPath(child.indexFilePath);
          if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
        };
      }
    };

    // Helper: render connected unindexed subfolders hierarchically
    const renderUnindexedTrees = () => {
      const renderTreeInCard = (tree: UnindexedFolderTree, container: HTMLElement, indent: number) => {
        const fRow = container.createDiv({ cls: 'graphway-item-row' });
        fRow.style.paddingLeft = `${4 + indent * 10}px`;
        fRow.createSpan({ text: '📁', cls: 'graphway-item-icon' });
        fRow.createSpan({ text: tree.folderName, cls: 'graphway-item-name graphway-unindexed-name' });

        for (const filePath of tree.files) {
          const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath;
          const itemRow = container.createDiv({ cls: 'graphway-item-row' });
          itemRow.setAttribute('data-filepath', filePath);
          itemRow.style.paddingLeft = `${14 + indent * 10}px`;
          itemRow.createSpan({ text: '↳ 📄', cls: 'graphway-item-icon' });
          const nameSpan = itemRow.createSpan({ text: fileName, cls: 'graphway-item-name' });
          nameSpan.onclick = () => {
            const f = this.app.vault.getAbstractFileByPath(filePath);
            if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
          };

          itemRow.oncontextmenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = new Menu();
            menu.addItem((item) => {
              item
                .setTitle(`⭐ Make "${fileName}" the Index Note for "${tree.folderName}"`)
                .setIcon('star')
                .onClick(async () => {
                  await this.setFileAsFolderIndex(tree.folderPath, filePath);
                });
            });
            menu.addItem((item) => {
              item
                .setTitle(`Open "${fileName}"`)
                .setIcon('document')
                .onClick(() => {
                  const f = this.app.vault.getAbstractFileByPath(filePath);
                  if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
                });
            });
            menu.showAtMouseEvent(e);
          };

          // File input socket to connect a folder into this file
          const fileInSocket = itemRow.createDiv({ cls: 'graphway-socket graphway-socket-item-in' });
          fileInSocket.title = 'Input socket: Connect any folder to this file to render that folder inside this note';
          fileInSocket.setAttribute('data-socket-file-in', filePath);

          fileInSocket.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            if (this.isConnecting && this.connectionStart) {
              this.completeConnection(this.connectionStart, {
                folderPath: node.folderPath,
                filePath,
                type: 'in'
              });
            }
          });

          fileInSocket.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startWiring(node.folderPath, filePath, 'in', fileInSocket);
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

    // Helper: render direct markdown files
    const renderDirectFiles = () => {
      if (isFilesHidden) {
        if (node.directFiles.length > 0) {
          const itemRow = body.createDiv({ cls: 'graphway-item-row graphway-files-hidden-row' });
          itemRow.createSpan({ text: '🚫', cls: 'graphway-item-icon' });
          const nameSpan = itemRow.createSpan({
            text: `${node.directFiles.length} direct file(s) hidden from index`,
            cls: 'graphway-item-name graphway-files-hidden-label'
          });
          nameSpan.title = 'Click to show direct files in index note';
          nameSpan.onclick = async () => {
            this.settings.foldersHidingDirectFiles = (this.settings.foldersHidingDirectFiles || []).filter(
              p => p !== node.folderPath
            );
            await this.onSettingsChange();
            new Notice(`GraphWay: Now rendering direct files in "${node.folderName}" index note.`);
            await this.synchronizer.syncExistingIndices();
            this.render();
          };
        }
        return;
      }

      for (const filePath of node.directFiles) {
        const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath;
        const itemRow = body.createDiv({ cls: 'graphway-item-row' });
        itemRow.setAttribute('data-filepath', filePath);

        itemRow.createSpan({ text: '📄', cls: 'graphway-item-icon' });
        const nameSpan = itemRow.createSpan({ text: fileName, cls: 'graphway-item-name' });
        nameSpan.onclick = () => {
          const f = this.app.vault.getAbstractFileByPath(filePath);
          if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
        };

        itemRow.oncontextmenu = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const menu = new Menu();
          menu.addItem((item) => {
            item
              .setTitle(`⭐ Make "${fileName}" the Folder Index Note`)
              .setIcon('star')
              .onClick(async () => {
                await this.setFileAsFolderIndex(node.folderPath, filePath);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle(`Open "${fileName}"`)
              .setIcon('document')
              .onClick(() => {
                const f = this.app.vault.getAbstractFileByPath(filePath);
                if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
              });
          });
          menu.showAtMouseEvent(e);
        };

        // File input socket to connect a folder into this file
        const fileInSocket = itemRow.createDiv({ cls: 'graphway-socket graphway-socket-item-in' });
        fileInSocket.title = 'Input socket: Connect any folder to this file to render that folder inside this note';
        fileInSocket.setAttribute('data-socket-file-in', filePath);

        fileInSocket.addEventListener('mouseup', (e) => {
          e.stopPropagation();
          if (this.isConnecting && this.connectionStart) {
            this.completeConnection(this.connectionStart, {
              folderPath: node.folderPath,
              filePath,
              type: 'in'
            });
          }
        });

        fileInSocket.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.startWiring(node.folderPath, filePath, 'in', fileInSocket);
        });
      }
    };

    // Order items according to sortOrder setting
    if (this.settings.sortOrder === 'folders-first') {
      renderIndexedChildFolders();
      renderUnindexedTrees();
      renderDirectFiles();
    } else if (this.settings.sortOrder === 'files-first') {
      renderDirectFiles();
      renderIndexedChildFolders();
      renderUnindexedTrees();
    } else {
      renderIndexedChildFolders();
      renderUnindexedTrees();
      renderDirectFiles();
    }

    const hasAnyContent =
      node.indexedChildFolders.length > 0 ||
      node.unindexedTrees.length > 0 ||
      node.directFiles.length > 0;

    if (!hasAnyContent) {
      body.createDiv({ cls: 'graphway-empty-note', text: '*(No child notes or folders)*' });
    }

    // 4. Output Socket (Right side) for child folders
    const outSocket = card.createDiv({ cls: 'graphway-socket graphway-socket-out' });
    outSocket.title = `Output socket: Drag wire to connect child folders to ${node.folderName}`;
    outSocket.setAttribute('data-socket-out', node.folderPath);

    outSocket.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.startWiring(node.folderPath, undefined, 'out', outSocket);
    });
  }

  private startWiring(
    folderPath: string,
    filePath: string | undefined,
    type: 'out' | 'in',
    socketEl: HTMLElement
  ): void {
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
    this.tempPathEl.style.display = 'block';
  }

  private updateTempWire(): void {
    if (!this.connectionStart) return;
    const p1 = this.connectionStart;
    const p2 = this.tempMousePos;

    const d = this.calculateCubicBezier(p1.x, p1.y, p2.x, p2.y);
    this.tempPathEl.setAttribute('d', d);
  }

  private async completeConnection(
    source: NonNullable<typeof this.connectionStart>,
    target: { folderPath: string; filePath?: string; type: 'in' | 'out' }
  ): Promise<void> {
    // 1. Connecting a Folder <-> File (any direction)
    const isFolderToFile = (!source.filePath && target.filePath) || (source.filePath && !target.filePath);
    if (isFolderToFile) {
      const folderPath = source.filePath ? target.folderPath : source.folderPath;
      const filePath = (source.filePath || target.filePath)!;

      if (!this.settings.folderToFileConnections) {
        this.settings.folderToFileConnections = [];
      }
      if (!this.settings.folderToFileConnections.some(c => c.folderPath === folderPath && c.filePath === filePath)) {
        this.settings.folderToFileConnections.push({ folderPath, filePath });
      }

      await this.onSettingsChange();
      const fileName = filePath.split('/').pop() || filePath;
      const folderNode = this.hierarchy.get(folderPath);
      new Notice(`GraphWay: Connected folder "${folderNode?.folderName || folderPath}" to "${fileName}". Note will render this folder!`);
      await this.synchronizer.syncExistingIndices();
      this.render();
      return;
    }

    // 3. Folder -> Folder
    const parentPath = source.folderPath;
    const childPath = target.folderPath;

    if (parentPath === childPath) {
      new Notice('GraphWay: Cannot connect a folder to itself.');
      return;
    }

    const edgeKey = `${parentPath}->${childPath}`;

    // 1. If it was disconnected, remove it from disconnectedEdges
    if (this.settings.disconnectedEdges) {
      this.settings.disconnectedEdges = this.settings.disconnectedEdges.filter(k => k !== edgeKey);
    }

    // 2. Add to customFolderEdges if it is a manual connection
    if (!this.settings.customFolderEdges) {
      this.settings.customFolderEdges = [];
    }
    if (!this.settings.customFolderEdges.some(e => e.from === parentPath && e.to === childPath)) {
      this.settings.customFolderEdges.push({ from: parentPath, to: childPath });
    }

    await this.onSettingsChange();
    new Notice(`GraphWay: Connected "${parentPath}" → "${childPath}"`);
    await this.synchronizer.syncExistingIndices();
    this.render();
  }

  /**
   * Renders the glowing cubic bezier wires between connected nodes
   */
  private renderWires(): void {
    // Clear old wires, keeping tempPathEl
    while (this.svgLayer.childNodes.length > 1) {
      if (this.svgLayer.firstChild !== this.tempPathEl) {
        this.svgLayer.removeChild(this.svgLayer.firstChild!);
      } else if (this.svgLayer.lastChild !== this.tempPathEl) {
        this.svgLayer.removeChild(this.svgLayer.lastChild!);
      } else {
        break;
      }
    }

    const canvasRect = this.canvasWrapper.getBoundingClientRect();

    // 1. Hierarchy wires: Parent Folder -> All Connected Child Folders
    for (const [folderPath, node] of this.hierarchy.entries()) {
      const parentOutSocket = this.nodesContainer.querySelector(
        `[data-folder="${CSS.escape(folderPath)}"] .graphway-socket-out`
      ) as HTMLElement;
      if (!parentOutSocket) continue;

      const pRect = parentOutSocket.getBoundingClientRect();
      const x1 = (pRect.left + pRect.width / 2 - canvasRect.left) / this.zoom;
      const y1 = (pRect.top + pRect.height / 2 - canvasRect.top) / this.zoom;

      for (const childPath of node.allConnectedChildPaths) {
        const childInSocket = this.nodesContainer.querySelector(
          `[data-folder="${CSS.escape(childPath)}"] .graphway-socket-in`
        ) as HTMLElement;
        if (!childInSocket) continue;

        const cRect = childInSocket.getBoundingClientRect();
        const x2 = (cRect.left + cRect.width / 2 - canvasRect.left) / this.zoom;
        const y2 = (cRect.top + cRect.height / 2 - canvasRect.top) / this.zoom;

        const childNode = this.hierarchy.get(childPath);
        const isChildIndexed = childNode ? childNode.hasIndex : false;

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.classList.add(
          'graphway-wire',
          isChildIndexed ? 'graphway-wire-indexed' : 'graphway-wire-unindexed'
        );
        pathEl.setAttribute('d', this.calculateCubicBezier(x1, y1, x2, y2));

        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleEl.textContent = `Connected: ${node.folderName} → ${childNode?.folderName || childPath} (${
          isChildIndexed ? 'Indexed' : 'Unindexed Bubble'
        })\nClick wire to disconnect`;
        pathEl.appendChild(titleEl);

        // Click to disconnect wire
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
              ed => !(ed.from === folderPath && ed.to === childPath)
            );
          }
          await this.onSettingsChange();
          new Notice(
            `GraphWay: Disconnected "${childNode?.folderName || childPath}" from "${node.folderName}"`
          );
          await this.synchronizer.syncExistingIndices();
          this.render();
        };

        this.svgLayer.appendChild(pathEl);
      }
    }

    // 2. Folder -> File wires (any folder connected to any file to render that folder inside that note)
    if (this.settings.folderToFileConnections) {
      for (const conn of this.settings.folderToFileConnections) {
        const folderOutSocket = this.nodesContainer.querySelector(
          `[data-folder="${CSS.escape(conn.folderPath)}"] .graphway-socket-out`
        ) as HTMLElement;
        const fileInSocket = this.nodesContainer.querySelector(
          `[data-socket-file-in="${CSS.escape(conn.filePath)}"]`
        ) as HTMLElement;

        if (folderOutSocket && fileInSocket) {
          const foRect = folderOutSocket.getBoundingClientRect();
          const fiRect = fileInSocket.getBoundingClientRect();

          const x1 = (foRect.left + foRect.width / 2 - canvasRect.left) / this.zoom;
          const y1 = (foRect.top + foRect.height / 2 - canvasRect.top) / this.zoom;
          const x2 = (fiRect.left + fiRect.width / 2 - canvasRect.left) / this.zoom;
          const y2 = (fiRect.top + fiRect.height / 2 - canvasRect.top) / this.zoom;

          const folderNode = this.hierarchy.get(conn.folderPath);
          const fileName = conn.filePath.split('/').pop() || conn.filePath;

          const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pathEl.classList.add('graphway-wire', 'graphway-wire-folder-to-file');
          pathEl.setAttribute('d', this.calculateCubicBezier(x1, y1, x2, y2));

          const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          titleEl.textContent = `Folder "${folderNode?.folderName || conn.folderPath}" renders inside note "${fileName}"\nClick wire to disconnect`;
          pathEl.appendChild(titleEl);

          pathEl.onclick = async (e) => {
            e.stopPropagation();
            this.settings.folderToFileConnections = this.settings.folderToFileConnections.filter(
              c => !(c.folderPath === conn.folderPath && c.filePath === conn.filePath)
            );
            await this.onSettingsChange();
            new Notice(
              `GraphWay: Disconnected folder "${folderNode?.folderName || conn.folderPath}" from note "${fileName}"`
            );
            await this.synchronizer.syncExistingIndices();
            this.render();
          };

          this.svgLayer.appendChild(pathEl);
        }
      }
    }

    // 3. Custom override wires
    for (const [filePath, targetFolder] of Object.entries(this.settings.customLinkOverrides)) {
      const targetInSocket = this.nodesContainer.querySelector(
        `[data-folder="${CSS.escape(targetFolder)}"] .graphway-socket-in`
      ) as HTMLElement;
      if (!targetInSocket) continue;

      const tRect = targetInSocket.getBoundingClientRect();
      const x2 = (tRect.left + tRect.width / 2 - canvasRect.left) / this.zoom;
      const y2 = (tRect.top + tRect.height / 2 - canvasRect.top) / this.zoom;

      // Find file row source
      const fileRow = this.nodesContainer.querySelector(`[data-filepath="${CSS.escape(filePath)}"]`) as HTMLElement;
      if (fileRow) {
        const fRect = fileRow.getBoundingClientRect();
        const x1 = (fRect.right - canvasRect.left) / this.zoom;
        const y1 = (fRect.top + fRect.height / 2 - canvasRect.top) / this.zoom;

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.classList.add('graphway-wire', 'graphway-wire-custom');
        pathEl.setAttribute('d', this.calculateCubicBezier(x1, y1, x2, y2));
        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleEl.textContent = 'Custom Link Override (Click to remove)';
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
  private calculateCubicBezier(x1: number, y1: number, x2: number, y2: number): string {
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
  private centerOnFolder(folderPath: string): void {
    const pos = this.settings.nodePositions[folderPath];
    if (pos) {
      const viewport = this.containerEl.querySelector('.graphway-viewport') as HTMLElement;
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
  private async handleCreateOrOpenIndex(node: FolderHierarchyNode): Promise<void> {
    if (node.hasIndex && node.indexFilePath) {
      const file = this.app.vault.getAbstractFileByPath(node.indexFilePath);
      if (file instanceof TFile) {
        this.app.workspace.getLeaf().openFile(file);
      }
      return;
    }

    let folder: TFolder | null = null;
    if (node.folderPath === '/' || node.folderPath === '') {
      folder = this.app.vault.getRoot();
    } else {
      const abstractFolder = this.app.vault.getAbstractFileByPath(node.folderPath);
      if (abstractFolder instanceof TFolder) {
        folder = abstractFolder;
      }
    }

    if (folder) {
      const newFile = await this.synchronizer.createFolderNoteForFolder(folder);
      if (newFile) {
        if ((node.folderPath === '/' || node.folderPath === '') && !this.settings.homepageNotePath) {
          this.settings.homepageNotePath = newFile.path;
          await this.onSettingsChange();
        }
        const hierarchy = this.synchronizer.getHierarchyBuilder().buildVaultHierarchy();
        this.updateData(hierarchy);
        this.app.workspace.getLeaf().openFile(newFile);
      }
    }
  }

  /**
   * Assigns a specific file as the custom index note for a folder
   */
  private async setFileAsFolderIndex(folderPath: string, filePath: string): Promise<void> {
    if (!this.settings.customFolderNotes) {
      this.settings.customFolderNotes = {};
    }
    this.settings.customFolderNotes[folderPath] = filePath;
    await this.onSettingsChange();

    const file = this.app.vault.getAbstractFileByPath(filePath);
    let folderName = folderPath.split('/').pop() || folderPath;

    let folder: TFolder | null = null;
    if (folderPath === '/' || folderPath === '') {
      folder = this.app.vault.getRoot();
    } else {
      const f = this.app.vault.getAbstractFileByPath(folderPath);
      if (f instanceof TFolder) folder = f;
    }

    if (file instanceof TFile && folder) {
      folderName = folder.name || folderName;
      await this.synchronizer.updateFolder(folder, false);
      await this.synchronizer.syncExistingIndices();
      new Notice(`GraphWay: Set "${file.name}" as index note for "${folderName}".`);
      const hierarchy = this.synchronizer.getHierarchyBuilder().buildVaultHierarchy();
      this.updateData(hierarchy);
    }
  }

  /**
   * Unsets any custom index note assigned to this folder
   */
  private async unsetFolderIndex(folderPath: string): Promise<void> {
    if (this.settings.customFolderNotes && this.settings.customFolderNotes[folderPath]) {
      delete this.settings.customFolderNotes[folderPath];
      await this.onSettingsChange();
      await this.synchronizer.syncExistingIndices();
      new Notice('GraphWay: Unset custom index note assignment.');
      const hierarchy = this.synchronizer.getHierarchyBuilder().buildVaultHierarchy();
      this.updateData(hierarchy);
    }
  }
}



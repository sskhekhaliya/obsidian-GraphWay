import { App, PluginSettingTab, Setting } from 'obsidian';
import type GraphWayPlugin from '../main';
import { FolderNoteNamingStrategy, SortOrder } from '../types';
import { FileSuggest } from '../ui/fileSuggest';

export class GraphWaySettingsTab extends PluginSettingTab {
  private plugin: GraphWayPlugin;

  constructor(app: App, plugin: GraphWayPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '⚡ GraphWay Settings' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Configure how folder notes are detected, structured, and automatically linked to build your Graph View hierarchy.'
    });

    // 0. Top-Level Homepage Note
    new Setting(containerEl)
      .setName('Top-Level Homepage Note')
      .setDesc('The central root/homepage note that links all top-level folders and appears as the Root node on the GraphWay Canvas (e.g. "Home.md", "Dashboard.md").')
      .addText(text => {
        text
          .setPlaceholder('Home.md')
          .setValue(this.plugin.settings.homepageNotePath)
          .onChange(async val => {
            this.plugin.settings.homepageNotePath = val.trim();
            await this.plugin.saveSettings();
          });
        new FileSuggest(this.app, text.inputEl);
      });

    // 1. Folder Note Strategy
    new Setting(containerEl)
      .setName('Folder Note Naming Strategy')
      .setDesc('How GraphWay matches or creates index notes representing folders.')
      .addDropdown(drop => {
        drop
          .addOption('same-name', 'Same name as folder (e.g. Projects/Projects.md)')
          .addOption('strip-numbers', 'Strip numbers (e.g. "01 - Work" matches "Work.md")')
          .addOption('suffix', 'Suffix notation (e.g. Folder/Folder---.md)')
          .addOption('index', 'Standard index (e.g. Folder/index.md)')
          .addOption('custom-regex', 'Custom Regex pattern')
          .setValue(this.plugin.settings.folderNoteStrategy)
          .onChange(async (val: string) => {
            this.plugin.settings.folderNoteStrategy = val as FolderNoteNamingStrategy;
            await this.plugin.saveSettings();
            this.display(); // re-render to toggle conditional fields
          });
      });

    // Custom Regex Field
    if (this.plugin.settings.folderNoteStrategy === 'custom-regex') {
      new Setting(containerEl)
        .setName('Custom Matching Regex')
        .setDesc('Regex tested against note file names. You can use {{folder}} as a placeholder for the folder name.')
        .addText(text => {
          text
            .setPlaceholder('^(?:\\d+[\\s\\-_]+)?{{folder}}(?:---)?$')
            .setValue(this.plugin.settings.customRegex)
            .onChange(async val => {
              this.plugin.settings.customRegex = val.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    // Suffix Field
    if (this.plugin.settings.folderNoteStrategy === 'suffix') {
      new Setting(containerEl)
        .setName('Suffix String')
        .setDesc('Suffix appended to folder name (e.g. "---").')
        .addText(text => {
          text
            .setPlaceholder('---')
            .setValue(this.plugin.settings.suffixString)
            .onChange(async val => {
              this.plugin.settings.suffixString = val.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    // Inside folder vs Sibling
    new Setting(containerEl)
      .setName('Folder Note Placement')
      .setDesc('Place folder notes inside the folder (Folder/Folder.md) or as a sibling outside (Folder.md).')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.folderNoteInsideFolder)
          .onChange(async val => {
            this.plugin.settings.folderNoteInsideFolder = val;
            await this.plugin.saveSettings();
          });
      });

    // Auto-create missing notes
    new Setting(containerEl)
      .setName('Auto-Create Missing Folder Notes')
      .setDesc('When running "Generate All", automatically create missing index notes for folders that lack them.')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.createMissingFolderNotes)
          .onChange(async val => {
            this.plugin.settings.createMissingFolderNotes = val;
            await this.plugin.saveSettings();
          });
      });

    // Bubble-up rule
    new Setting(containerEl)
      .setName('Bubble Up Unindexed Subfolder Notes')
      .setDesc('If a subfolder does not have an index note, its files bubble up to the nearest parent index note.')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.bubbleUpOrphans)
          .onChange(async val => {
            this.plugin.settings.bubbleUpOrphans = val;
            await this.plugin.saveSettings();
          });
      });

    // Sorting order
    new Setting(containerEl)
      .setName('List Item Sorting')
      .setDesc('How links are grouped inside the generated GraphWay block.')
      .addDropdown(drop => {
        drop
          .addOption('folders-first', 'Subfolders first, then files')
          .addOption('files-first', 'Files first, then subfolders')
          .addOption('alphabetical', 'Alphabetical (combined)')
          .setValue(this.plugin.settings.sortOrder)
          .onChange(async (val: string) => {
            this.plugin.settings.sortOrder = val as SortOrder;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl('h3', { text: '⚡ Exclusions & Triggers' });

    // Excluded Folders
    new Setting(containerEl)
      .setName('Excluded Folders')
      .setDesc('Comma-separated list of folder names to ignore (e.g. .trash, templates, assets).')
      .addText(text => {
        text
          .setPlaceholder('.trash, templates, assets')
          .setValue(this.plugin.settings.excludedFolders.join(', '))
          .onChange(async val => {
            this.plugin.settings.excludedFolders = val
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.plugin.saveSettings();
          });
      });

    // Excluded Tags
    new Setting(containerEl)
      .setName('Excluded Tags')
      .setDesc('Notes with these tags will be omitted from generated MOCs (comma-separated, e.g. #archive, #draft).')
      .addText(text => {
        text
          .setPlaceholder('#archive, #draft')
          .setValue(this.plugin.settings.excludedTags.join(', '))
          .onChange(async val => {
            this.plugin.settings.excludedTags = val
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.plugin.saveSettings();
          });
      });

    // Auto-update toggle
    new Setting(containerEl)
      .setName('Auto-Update on Vault Changes')
      .setDesc('Automatically update affected folder notes when files are created, renamed, or moved.')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.autoUpdateOnVaultChange)
          .onChange(async val => {
            this.plugin.settings.autoUpdateOnVaultChange = val;
            await this.plugin.saveSettings();
          });
      });

    // Markers
    containerEl.createEl('h3', { text: '⚡ Block Markers' });

    new Setting(containerEl)
      .setName('Begin Marker')
      .setDesc('Markdown comment marking the start of the auto-generated section.')
      .addText(text => {
        text
          .setValue(this.plugin.settings.beginMarker)
          .onChange(async val => {
            this.plugin.settings.beginMarker = val.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('End Marker')
      .setDesc('Markdown comment marking the end of the auto-generated section.')
      .addText(text => {
        text
          .setValue(this.plugin.settings.endMarker)
          .onChange(async val => {
            this.plugin.settings.endMarker = val.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}

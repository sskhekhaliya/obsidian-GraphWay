import { AbstractInputSuggest, App, TFile } from 'obsidian';

export class FileSuggest extends AbstractInputSuggest<TFile> {
  private inputEl: HTMLInputElement;

  constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
    this.inputEl = textInputEl;
  }

  protected getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase().trim();
    const markdownFiles = this.app.vault.getMarkdownFiles();

    if (!lowerQuery) {
      return markdownFiles.slice(0, 30);
    }

    return markdownFiles
      .filter((file) => file.path.toLowerCase().includes(lowerQuery))
      .slice(0, 30);
  }

  public renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createEl('div', { text: file.path, cls: 'graphway-suggest-item' });
  }

  public selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
  }
}

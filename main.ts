import { App, Plugin, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import { PromptView } from './promptView';

export class PromptManagerPlugin extends Plugin {
    settings: { promptFolderPath: string };

    async onload() {
        await this.loadSettings();

        this.registerView('prompt-manager', (leaf) => new PromptView(leaf, this));

        this.addCommand({
            id: 'show-prompt-view',
            name: 'Show Prompt Manager',
            callback: () => {
                this.activateView();
            }
        });

        this.addSettingTab(new PromptManagerSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, { promptFolderPath: 'prompts' }, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType('prompt-manager')[0];
        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (newLeaf) {
                leaf = newLeaf;
                await leaf.setViewState({ type: 'prompt-manager', active: true });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async createPrompt(name: string, content: string = "") {
        const folderPath = normalizePath(this.settings.promptFolderPath);
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }
        const filePath = normalizePath(`${folderPath}/${name}.md`);
        await this.app.vault.create(filePath, content);
    }

    async getPrompts() {
        const folderPath = normalizePath(this.settings.promptFolderPath);
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            return [];
        }
        return this.app.vault.getFiles().filter(file => file.parent && file.parent.path === folder.path && file.extension === 'md');
    }
}

class PromptManagerSettingTab extends PluginSettingTab {
    plugin: PromptManagerPlugin;

    constructor(app: App, plugin: PromptManagerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Prompts Folder Path')
            .setDesc('Select the folder where prompts are stored.')
            .addText(text => text
                .setValue(this.plugin.settings.promptFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.promptFolderPath = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
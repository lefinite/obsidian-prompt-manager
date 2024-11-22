import { ItemView, WorkspaceLeaf, TFile, App, Modal, Notice, Vault, TAbstractFile, TFolder } from 'obsidian';
import { PromptManagerPlugin } from './main';

export const VIEW_TYPE_PROMPT = 'prompt-manager-view';

interface PromptData {
    name: string;
    version: string;
    details: string;
    fullContent: string;
    file: TFile;
}

export class PromptView extends ItemView {
    plugin: PromptManagerPlugin;
    prompts: PromptData[] = [];
    viewType: 'board' | 'list' = 'list'; // 默认为列表视图
    containerEl: HTMLElement;
    searchInput?: HTMLInputElement;
    refreshButton?: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, plugin: PromptManagerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_PROMPT;
    }

    getDisplayText(): string {
        return 'Prompt Manager';
    }

    async onOpen() {
        this.containerEl.empty();
        this.containerEl.classList.add('prompt-manager-view');

        // 创建搜索和刷新的容器
        const topContainer = this.containerEl.createDiv('top-container');

        // 添加搜索框
        this.searchInput = topContainer.createEl('input', { cls: 'prompt-search-input' });
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search prompts...';
        this.searchInput.addEventListener('input', () => {
            this.filterPrompts(this.searchInput!.value.toLowerCase());
        });

        // 添加刷新按钮
        this.refreshButton = topContainer.createEl('button', { cls: 'prompt-refresh-btn' });
        this.refreshButton.setText('🔄 Refresh');
        this.refreshButton.onclick = async () => {
            await this.refresh();
            this.render();
        };

        // 添加新建按钮
        const newButton = topContainer.createEl('button', { cls: 'prompt-new-btn' });
        newButton.setText('New Prompt');
        newButton.onclick = () => this.showNewPromptModal();

        // 切换视图按钮
        const toggleViewButton = topContainer.createEl('button', { cls: 'prompt-toggle-view-btn' });
        toggleViewButton.setText(this.viewType === 'board' ? 'List View' : 'Board View');
        toggleViewButton.onclick = () => {
            this.viewType = this.viewType === 'board' ? 'list' : 'board';
            toggleViewButton.setText(this.viewType === 'board' ? 'List View' : 'Board View');
            this.render();
        };

        await this.refresh();
        this.render();
    }

    private render() {
        // 清除之前的内容，保留顶部容器
        const topContainer = this.containerEl.querySelector('.top-container');
        this.containerEl.empty();
        this.containerEl.appendChild(topContainer!);

        const content = this.containerEl.createDiv('prompt-content');

        if (this.viewType === 'list') {
            this.renderList(content);
        } else {
            this.renderBoard(content);
        }
    }

    async refresh() {
        const promptFolderPath = this.plugin.settings.promptFolderPath;
        if (!promptFolderPath) {
            new Notice('Please select a prompts folder in the plugin settings.');
            return;
        }
    
        const folder = this.app.vault.getAbstractFileByPath(promptFolderPath);
        if (!folder || !(folder instanceof TFolder)) {
            new Notice('Invalid prompts folder selected.');
            return;
        }
    
        const files = this.app.vault.getFiles().filter(file => file.parent && file.parent.path === folder.path);
        const mdFiles = files.filter((file: TFile) => file.extension === 'md');
    
        this.prompts = await Promise.all(
            mdFiles.map(async (file: TFile) => {
                const content = await this.app.vault.read(file);
                const { version, details, fullContent } = this.extractPromptData(content);
    
                return {
                    name: file.basename,
                    version,
                    details,
                    fullContent,
                    file
                };
            })
        );

        // 按版本号降序排序
        this.prompts.sort((a, b) => {
            const versionA = parseFloat(a.version);
            const versionB = parseFloat(b.version);
            return versionB - versionA;
        });
    }

    private extractPromptData(content: string): { version: string, details: string, fullContent: string } {
        // 匹配所有的 Version 标题
        const versionMatches = Array.from(content.matchAll(/### Version\s+(\d+(?:\.\d+)?)\n([\s\S]*?)(?=### Version|\z)/g));

        // 如果没有找到版本，返回默认值
        if (versionMatches.length === 0) {
            return { version: '0.0', details: content.trim(), fullContent: content };
        }

        // 取最后一个版本（数组的最后一个元素）
        const lastVersion = versionMatches[versionMatches.length - 1];
        const version = lastVersion[1]; // 版本号
        const versionContent = lastVersion[2].trim(); // 版本内容

        // 查找所有版本的内容
        const fullContent = versionMatches.map(v => `### Version ${v[1]}\n${v[2]}`).join('\n\n');

        return {
            version,
            details: versionContent,
            fullContent
        };
    }

    private renderList(container: HTMLElement) {
        const list = container.createEl('table', 'prompt-list-table');
        
        const header = list.createEl('thead').createEl('tr');
        header.createEl('th').setText('Name');
        header.createEl('th').setText('Version');
        header.createEl('th').setText('Actions');

        const body = list.createEl('tbody');
        this.prompts.forEach(prompt => {
            const row = body.createEl('tr');
            row.createEl('td').setText(prompt.name);
            row.createEl('td').setText(prompt.version);
            
            const actionsTd = row.createEl('td');
            
            // 编辑按钮
            const editBtn = actionsTd.createEl('button', { cls: 'prompt-edit-btn' });
            editBtn.setText('Edit');
            editBtn.onclick = () => this.openPrompt(prompt.file);

            // 复制按钮
            const copyBtn = actionsTd.createEl('button', { cls: 'prompt-copy-btn' });
            copyBtn.setText('Copy');
            copyBtn.onclick = () => {
                // 复制最新版本的内容
                navigator.clipboard.writeText(prompt.details)
                    .then(() => {
                        new Notice(`Copied prompt version ${prompt.version} content`);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        new Notice('Failed to copy content');
                    });
            };
        });
    }

    private renderBoard(container: HTMLElement) {
        const board = container.createDiv('prompt-board');
        this.prompts.forEach(prompt => {
            const card = board.createDiv('prompt-card');
            
            const header = card.createDiv('prompt-header');
            header.createEl('h3').setText(prompt.name);
            
            const versionSpan = header.createEl('span', { cls: 'prompt-version' });
            versionSpan.setText(`v${prompt.version}`);

            const details = card.createDiv('prompt-details');
            details.setText(prompt.details);

            // 增加复制按钮
            const copyBtn = card.createEl('button', { cls: 'prompt-copy-btn' });
            copyBtn.setText('Copy');
            copyBtn.onclick = (e) => {
                e.stopPropagation(); // 防止触发card的点击事件
                navigator.clipboard.writeText(prompt.details)
                    .then(() => {
                        new Notice(`Copied prompt version ${prompt.version} content`);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        new Notice('Failed to copy content');
                    });
            };

            card.onclick = () => this.openPrompt(prompt.file);
        });
    }

    private filterPrompts(searchTerm: string) {
        const items = this.containerEl.querySelectorAll(
            this.viewType === 'board' ? '.prompt-card' : '.prompt-list-table tbody tr'
        );
        
        items.forEach((item: HTMLElement) => {
            const text = item.textContent?.toLowerCase() || '';
            item.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    }

    private async showNewPromptModal() {
        const modal = new NewPromptModal(this.app, async (name) => {
            if (name) {
                const promptFolderPath = this.plugin.settings.promptFolderPath;
                if (!promptFolderPath) {
                    new Notice('Please select a prompts folder in the plugin settings.');
                    return;
                }
    
                const folder = this.app.vault.getAbstractFileByPath(promptFolderPath);
                if (!folder || !(folder instanceof TFolder)) {
                    new Notice('Invalid prompts folder selected.');
                    return;
                }
                const content = `### Version 1.0\n\nNew prompt content`;
                const file = await this.app.vault.create(name + '.md', content);
                await this.refresh();
                this.render();
            }
        });
        modal.open();
    }

    private async openPrompt(file: TFile) {
        const leaf = this.app.workspace.getLeaf();
        if (leaf) {
            await leaf.openFile(file);
        }
    }
}

class NewPromptModal extends Modal {
    private result: string;
    private onSubmit: (name: string) => void;

    constructor(app: App, onSubmit: (name: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2').setText('Create New Prompt');

        const input = contentEl.createEl('input', { cls: 'prompt-name-input' });
        input.type = 'text';
        input.placeholder = 'Enter prompt name';
        input.autofocus = true;

        const buttonContainer = contentEl.createDiv('button-container');
        
        const submitButton = buttonContainer.createEl('button', { cls: 'prompt-submit-btn' });
        submitButton.setText('Create');
        submitButton.onclick = () => {
            this.onSubmit(input.value);
            this.close();
        };

        const cancelButton = buttonContainer.createEl('button', { cls: 'prompt-cancel-btn' });
        cancelButton.setText('Cancel');
        cancelButton.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
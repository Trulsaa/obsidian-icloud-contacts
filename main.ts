import {
	App,
	DataWriteOptions,
	Notice,
	OpenViewState,
	Plugin,
	TFile,
	normalizePath,
} from "obsidian";
import ICloudContactsApi, {
	ICloudVCard,
	OnlyRequiredFromObsidianApi,
} from "src/ICloudContactsApi";
import { fetchContacts } from "src/iCloudClient";
import {
	DEFAULT_SETTINGS,
	ICloudContactsSettings,
	SettingTab,
} from "./src/SettingTab";

function showNotice(message: string, duration: number) {
	const notice = new Notice(message, duration);
	return {
		setMessage: (message: string) => {
			notice.setMessage(message);
		},
		hide: () => notice.hide(),
	};
}

function createObsidianApiWrapper(app: App): OnlyRequiredFromObsidianApi {
	return {
		normalizePath: normalizePath,
		app: {
			fileManager: {
				processFrontMatter: (
					file: TFile,
					fn: (frontmatter: any) => void,
				) => app.fileManager.processFrontMatter(file, fn),
				renameFile: (file: TFile, newPath: string) =>
					app.fileManager.renameFile(file, newPath),
			},
			vault: {
				adapter: {
					list: (normalizedPath: string) =>
						app.vault.adapter.list(normalizedPath),
					exists: (normalizedPath: string, sensitive: boolean) =>
						app.vault.adapter.exists(normalizedPath, sensitive),
				},
				append: (
					file: TFile,
					data: string,
					_options?: DataWriteOptions,
				) => app.vault.append(file, data),
				create: (
					path: string,
					data: string,
					_options?: DataWriteOptions,
				) => app.vault.create(path, data),
				createFolder: (path: string) => app.vault.createFolder(path),
				getFileByPath: (path: string) => app.vault.getFileByPath(path),
				getFolderByPath: (path: string) =>
					app.vault.getFolderByPath(path),
				process: (
					file: TFile,
					fn: (data: string) => string,
					_options?: DataWriteOptions,
				) => app.vault.process(file, fn),
			},
			workspace: {
				getLeaf: () => ({
					openFile: (file: TFile, _openState?: OpenViewState) =>
						app.workspace.getLeaf().openFile(file),
				}),
			},
			metadataCache: {
				getCache: (path: string) => app.metadataCache.getCache(path),
			},
		},
	};
}

export default class ICloudContacts extends Plugin {
	settings: ICloudContactsSettings;
	private api: ICloudContactsApi;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);

		this.api = new ICloudContactsApi(
			createObsidianApiWrapper(this.app),
			this.settings,
			fetchContacts,
			showNotice,
		);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "update-contacts",
			name: "Update Contacts",
			callback: async () => {
				const { updateData, usedSettings } =
					await this.api.updateContacts();
				await this.saveRunData(updateData, usedSettings);
			},
		});

		this.addCommand({
			id: "update-all-contacts",
			name: "Update all Contacts",
			callback: async () => {
				const { updateData, usedSettings } =
					await this.api.updateContacts({
						rewriteAll: true,
					});
				await this.saveRunData(updateData, usedSettings);
			},
		});

		this.addRibbonIcon("sync", "Update Contacts", () =>
			this.api.updateContacts(),
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	private async saveRunData(
		updateData: ICloudVCard[],
		usedSettings: ICloudContactsSettings,
	) {
		this.settings.previousUpdateData = updateData;
		delete usedSettings.previousUpdateData;
		delete usedSettings.previousUpdateSettings;
		this.settings.previousUpdateSettings = usedSettings;
		await this.saveSettings();
	}

	onunload() {}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

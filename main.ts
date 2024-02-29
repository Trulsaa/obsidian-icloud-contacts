import { Notice, Plugin, normalizePath, parseYaml } from "obsidian";
import ICloudContactsApi from "src/ICloudContactsApi";
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
			this.app,
			this.settings,
			fetchContacts,
			showNotice,
			normalizePath,
			parseYaml,
		);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "update-contacts",
			name: "Update Contacts",
			callback: () => this.api.updateContacts(),
		});

		this.addCommand({
			id: "update-all-contacts",
			name: "Update all Contacts",
			callback: () => this.api.updateContacts({ rewriteAll: true }),
		});

		this.addRibbonIcon("sync", "Update Contacts", () =>
			this.api.updateContacts(),
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
